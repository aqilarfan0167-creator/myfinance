/**
 * Safety net for app updates: if the stored database is older than this app's schema, copy every store
 * (raw, before Dexie runs any upgrade) into a separate database "myfinance-preupgrade". Restorable from Backup & Restore.
 */
import { SCHEMA_VERSION } from './db';
const SNAP_DB = 'myfinance-preupgrade';

function req<T>(r: IDBRequest<T>) { return new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function openSnapDb() {
  return new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(SNAP_DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export interface PreUpgradeSnapshot { id: string; at: string; fromVersion: number; toVersion: number; stores: Record<string, unknown[]> }

export async function snapshotBeforeUpgrade(dbName = 'myfinance'): Promise<PreUpgradeSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  const existing = (await indexedDB.databases?.())?.find((d) => d.name === dbName);
  if (typeof indexedDB.databases === 'function' && !existing) return null; // first run
  const raw = await new Promise<IDBDatabase | null>((res) => {
    const r = indexedDB.open(dbName); // no version → opens current without upgrading
    r.onupgradeneeded = () => { r.transaction?.abort(); res(null); }; // DB didn't exist – don't create it
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  });
  if (!raw) return null;
  const from = Math.round(raw.version / 10); // Dexie stores version × 10
  if (from >= SCHEMA_VERSION || from === 0) { raw.close(); return null; }
  const names = [...raw.objectStoreNames].filter((n) => n !== 'files'); // file blobs are untouched by upgrades
  const stores: Record<string, unknown[]> = {};
  const tx = raw.transaction(names, 'readonly');
  for (const n of names) stores[n] = await req(tx.objectStore(n).getAll());
  raw.close();
  const snap: PreUpgradeSnapshot = { id: new Date().toISOString(), at: new Date().toISOString(), fromVersion: from, toVersion: SCHEMA_VERSION, stores };
  const s = await openSnapDb();
  const all = await req(s.transaction('snapshots').objectStore('snapshots').getAllKeys());
  const w = s.transaction('snapshots', 'readwrite'); const st = w.objectStore('snapshots');
  st.put(snap); for (const k of (all as string[]).sort().slice(0, Math.max(0, all.length - 2))) st.delete(k); // keep last 3
  await new Promise((res, rej) => { w.oncomplete = res; w.onerror = () => rej(w.error); });
  s.close();
  return snap;
}
export async function listPreUpgradeSnapshots(): Promise<PreUpgradeSnapshot[]> {
  try { const s = await openSnapDb(); const all = await req(s.transaction('snapshots').objectStore('snapshots').getAll()) as PreUpgradeSnapshot[]; s.close(); return all.sort((a, b) => b.at.localeCompare(a.at)); } catch { return []; }
}
