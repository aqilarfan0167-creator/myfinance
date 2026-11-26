/**
 * Cloud sync engine (transport-agnostic; Supabase adapter in ./supabaseRemote).
 *
 * - Pull first: remote rows newer than ours win (last-writer-wins on updatedAt); our newer edits are kept and pushed.
 * - Push: records whose content hash changed since last sync. The server only accepts a row if it is newer than what it has.
 * - Deletes: records we synced before but no longer have locally become tombstones (catches every hard-delete path).
 * - Files: originals, edited copies and thumbnails go to private storage under <userId>/<attachmentId>/.
 * - Remote rows from a newer app schema stop the sync (nothing applied) until the app is updated.
 */
import type { MyFinanceDB } from '@/db/db';
import { SCHEMA_VERSION } from '@/db/db';
import { TABLES } from '@/db/backup';

export const SYNC_TABLES = TABLES as readonly string[];
export interface RemoteRow { table: string; id: string; data: Record<string, unknown> | null; updatedAt: string; deleted: boolean; seq: number; schema: number }
export type PushRow = Omit<RemoteRow, 'seq'>;
export interface Remote {
  userId: string;
  pull(afterSeq: number, limit: number): Promise<RemoteRow[]>;
  push(rows: PushRow[]): Promise<void>;
  putFile(path: string, blob: Blob): Promise<void>;
  getFile(path: string): Promise<Blob | null>;
  removeFiles(paths: string[]): Promise<void>;
}
export interface SyncResult { pulled: number; pushed: number; deletedLocal: number; deletedRemote: number; conflicts: number; filesUp: number; filesDown: number; at: string }
export class SchemaTooNewError extends Error { constructor(public remote: number) { super(`Your cloud data was saved by a newer version of MyFinance (schema ${remote}). Update this app before syncing.`); } }

/** cyrb53 – fast 53-bit string hash (change detection only, not security). */
export function hash(v: unknown): string {
  const str = JSON.stringify(v); let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
type Rec = Record<string, unknown> & { id: string; updatedAt?: string; createdAt?: string; deletedAt?: string | null };
const stampOf = (r: Rec | undefined) => (r?.updatedAt ?? r?.createdAt ?? '') as string;
const key = (t: string, id: string) => `${t}:${id}`;
const PARTS = ['original', 'processed', 'thumb'] as const;
let running: Promise<SyncResult> | null = null;

export function syncOnce(db: MyFinanceDB, remote: Remote, now: () => string = () => new Date().toISOString()): Promise<SyncResult> {
  if (!running) running = doSync(db, remote, now).finally(() => { running = null; });
  return running;
}

async function doSync(db: MyFinanceDB, remote: Remote, now: () => string): Promise<SyncResult> {
  const res: SyncResult = { pulled: 0, pushed: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, filesUp: 0, filesDown: 0, at: now() };
  const tables = SYNC_TABLES.map((t) => db.table(t));

  // ---------- PULL ----------
  let cursor = ((await db.meta.get('sync:cursor'))?.value as number) ?? 0;
  for (;;) {
    const rows = await remote.pull(cursor, 500);
    if (!rows.length) break;
    const tooNew = rows.find((r) => r.schema > SCHEMA_VERSION); if (tooNew) throw new SchemaTooNewError(tooNew.schema);
    await db.transaction('rw', [...tables, db.syncState, db.files, db.meta], async () => {
      for (const r of rows) {
        if (!SYNC_TABLES.includes(r.table) || typeof r.id !== 'string' || !r.id) continue;
        const tbl = db.table(r.table); const k = key(r.table, r.id);
        const local = (await tbl.get(r.id)) as Rec | undefined; const st = await db.syncState.get(k);
        // Our own earlier push coming back (the cursor can't know our rows' seq) – nothing new.
        if (st && st.stamp === r.updatedAt && (r.deleted ? false : st.hash === hash(r.data))) continue;
        const changed = !!local && hash(local) !== (st ? st.hash : hash(r.data));
        // A local edit made since the last sync counts as "now" if its timestamp wasn't bumped.
        // A record never synced before only wins with a real, newer timestamp (a fresh install must not override the cloud).
        const localStamp = changed && st ? (stampOf(local) > st.stamp ? stampOf(local) : now()) : stampOf(local);
        if (r.deleted) {
          if (!local) { await db.syncState.delete(k); continue; }
          if (changed && localStamp > r.updatedAt) { res.conflicts++; continue; } // our newer edit beats the delete
          await tbl.delete(r.id); if (r.table === 'attachments') await db.files.delete(r.id);
          await db.syncState.delete(k); res.deletedLocal++; continue;
        }
        if (!r.data || (r.data as Rec).id !== r.id) continue; // malformed – ignore
        if (local && changed) { res.conflicts++; if (localStamp > r.updatedAt) continue; } // local newer → keep & push later
        if (!local || changed || hash(local) !== hash(r.data)) { await tbl.put(r.data); res.pulled++; }
        await db.syncState.put({ key: k, table: r.table, id: r.id, hash: hash(r.data), stamp: r.updatedAt });
      }
      cursor = Math.max(cursor, ...rows.map((r) => r.seq));
      await db.meta.put({ key: 'sync:cursor', value: cursor });
    });
    if (rows.length < 500) break;
  }

  // ---------- PUSH ----------
  const states = new Map((await db.syncState.toArray()).map((s) => [s.key, s]));
  const out: { row: PushRow; st: { key: string; table: string; id: string; hash: string; stamp: string } | null }[] = [];
  for (const t of SYNC_TABLES) {
    const recs = (await db.table(t).toArray()) as Rec[]; const ids = new Set<string>();
    for (const rec of recs) {
      ids.add(rec.id); const k = key(t, rec.id); const st = states.get(k); const h = hash(rec);
      if (st && st.hash === h) continue;
      const s = stampOf(rec); const stamp = s && (!st || s > st.stamp) ? s : now(); // content changed without a newer timestamp → use now
      out.push({ row: { table: t, id: rec.id, data: rec, updatedAt: stamp, deleted: false, schema: SCHEMA_VERSION }, st: { key: k, table: t, id: rec.id, hash: h, stamp } });
    }
    for (const st of states.values()) if (st.table === t && !ids.has(st.id)) out.push({ row: { table: t, id: st.id, data: null, updatedAt: now(), deleted: true, schema: SCHEMA_VERSION }, st: null });
  }
  for (let i = 0; i < out.length; i += 200) {
    const chunk = out.slice(i, i + 200);
    await remote.push(chunk.map((c) => c.row));
    await db.transaction('rw', db.syncState, async () => {
      for (const c of chunk) {
        if (c.st) await db.syncState.put(c.st); else await db.syncState.delete(key(c.row.table, c.row.id));
        if (c.row.deleted) res.deletedRemote++; else res.pushed++;
      }
    });
  }

  // ---------- FILES ----------
  const atts = (await db.attachments.toArray()) as unknown as Rec[];
  for (const a of atts) {
    const fk = `file:${a.id}`; const st = await db.syncState.get(fk); const base = `${remote.userId}/${a.id}`;
    if (a.deletedAt) { if (st) { await remote.removeFiles(PARTS.map((p) => `${base}/${p}`)); await db.syncState.delete(fk); } continue; }
    const f = await db.files.get(a.id);
    if (f) {
      const sig = hash(PARTS.map((p) => (p === 'original' ? f.blob : f[p])?.size ?? 0));
      if (st?.hash === sig) continue;
      for (const p of PARTS) { const b = p === 'original' ? f.blob : f[p]; if (b) await remote.putFile(`${base}/${p}`, b); }
      await db.syncState.put({ key: fk, table: 'files', id: a.id, hash: sig, stamp: now() }); res.filesUp++;
    } else {
      const original = await remote.getFile(`${base}/original`); if (!original) continue;
      const [processed, thumb] = await Promise.all([remote.getFile(`${base}/processed`), remote.getFile(`${base}/thumb`)]);
      await db.files.put({ id: a.id, blob: original, processed, thumb });
      await db.syncState.put({ key: fk, table: 'files', id: a.id, hash: hash(PARTS.map((p) => ({ original, processed, thumb })[p]?.size ?? 0)), stamp: now() }); res.filesDown++;
    }
  }
  await db.meta.put({ key: 'sync:last', value: res });
  return res;
}

/** Forget all sync bookkeeping (e.g. after replacing this device's data with cloud data). */
export async function resetSyncState(db: MyFinanceDB) { await db.syncState.clear(); await db.meta.delete('sync:cursor'); }
