import { db, APP_VERSION, SCHEMA_VERSION } from './db';
import type { Account, Category, Settings, Transaction, SalaryRecord, OTEntry, Commitment, Occurrence, RecurringRule, Budget, Goal, GoalEntry, Task, Attachment, Receipt } from './types';
import { defaultSettings, defaultSalaryProfile } from './db';
import { uid } from '@/lib/cn';

export interface BackupFile {
  app: 'MyFinance'; appVersion: string; schemaVersion: number; exportedAt: string;
  data: { accounts: Account[]; transactions: Transaction[]; categories: Category[]; settings: Settings[]; salaries: SalaryRecord[]; otEntries: OTEntry[]; commitments: Commitment[]; occurrences: Occurrence[]; recurring: RecurringRule[]; budgets: Budget[]; goals: Goal[]; goalEntries: GoalEntry[]; tasks: Task[]; attachments: Attachment[]; receipts: Receipt[] };
}
export interface SnapshotInfo { id: string; at: string; reason: string; counts: Record<string, number> }

export const TABLES = ['accounts', 'transactions', 'categories', 'settings', 'salaries', 'otEntries', 'commitments', 'occurrences', 'recurring', 'budgets', 'goals', 'goalEntries', 'tasks', 'attachments', 'receipts'] as const;
const V1_TABLES = ['accounts', 'transactions', 'categories', 'settings'] as const;

export async function exportAll(): Promise<BackupFile> {
  return db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    const data = {} as BackupFile['data'];
    for (const t of TABLES) (data as Record<string, unknown>)[t] = await db.table(t).toArray();
    return { app: 'MyFinance', appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
  });
}

export function validateBackup(o: unknown): { ok: boolean; errors: string[]; file?: BackupFile } {
  const e: string[] = [];
  const f = o as BackupFile;
  if (!f || typeof f !== 'object' || f.app !== 'MyFinance') return { ok: false, errors: ['Not a MyFinance backup file.'] };
  if (typeof f.schemaVersion !== 'number') e.push('Missing schema version.');
  if (f.schemaVersion > SCHEMA_VERSION) e.push(`Backup is from a newer app version (schema ${f.schemaVersion}). Please update the app first.`);
  for (const t of V1_TABLES) if (!Array.isArray(f.data?.[t])) e.push(`Missing table: ${t}`);
  if (!e.length) {
    for (const t of TABLES) if (f.data[t] != null && !Array.isArray(f.data[t])) e.push(`Invalid table: ${t}`);
    const idOk = (r: { id?: unknown }) => typeof r.id === 'string' && r.id.length > 0;
    for (const t of TABLES) if (!((f.data[t] ?? []) as { id?: unknown }[]).every(idOk)) e.push(`Invalid record IDs in ${t}.`);
    const bad = f.data.transactions.filter((x) => !Number.isInteger(x.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(x.date));
    if (bad.length) e.push(`${bad.length} transaction(s) have invalid amount/date.`);
    const accIds = new Set(f.data.accounts.map((a) => a.id));
    const orphan = f.data.transactions.filter((x) => (x.accountId && !accIds.has(x.accountId)) || (x.toAccountId && !accIds.has(x.toAccountId)));
    if (orphan.length) e.push(`${orphan.length} transaction(s) reference missing accounts.`);
  }
  return { ok: !e.length, errors: e, file: e.length ? undefined : migrateBackup(f) };
}

/** Upgrade older backup formats to the current schema (non-destructive). */
export function migrateBackup(f: BackupFile): BackupFile {
  const data = { ...f.data };
  // v1 → v2/v3: new tables start empty; settings gain a salary profile.
  for (const t of TABLES) if (!Array.isArray(data[t])) (data as Record<string, unknown>)[t] = [];
  data.settings = data.settings.map((s) => ({ ...defaultSettings(), ...s, salaryProfile: s.salaryProfile ?? defaultSalaryProfile() }));
  return { ...f, data, schemaVersion: SCHEMA_VERSION };
}

export function previewRestore(f: BackupFile, current: BackupFile, mode: 'merge' | 'replace') {
  return TABLES.map((t) => {
    const cur = new Map((current.data[t] as { id: string; updatedAt?: string }[]).map((r) => [r.id, r]));
    let add = 0, update = 0, keep = 0;
    for (const r of f.data[t] as { id: string; updatedAt?: string }[]) {
      const c = cur.get(r.id);
      if (!c) add++; else if (mode === 'replace' || (r.updatedAt ?? '') > (c.updatedAt ?? '')) update++; else keep++;
    }
    const inc = new Set((f.data[t] as { id: string }[]).map((r) => r.id));
    const remove = mode === 'replace' ? [...cur.keys()].filter((id) => !inc.has(id)).length : 0;
    return { table: t, incoming: (f.data[t] ?? []).length, add, update, keep, remove };
  });
}

/** Saves a local snapshot of current data (kept in IndexedDB; last 5). */
export async function snapshot(reason: string): Promise<SnapshotInfo> {
  const data = await exportAll();
  const info: SnapshotInfo = { id: uid(), at: data.exportedAt, reason, counts: Object.fromEntries(TABLES.map((t) => [t, data.data[t].length])) };
  await db.transaction('rw', db.meta, async () => {
    const hist = ((await db.meta.get('snapshots'))?.value as SnapshotInfo[] | undefined) ?? [];
    const next = [info, ...hist];
    for (const old of next.slice(5)) await db.meta.delete('snapshot:' + old.id);
    await db.meta.put({ key: 'snapshot:' + info.id, value: data });
    await db.meta.put({ key: 'snapshots', value: next.slice(0, 5) });
  });
  return info;
}
export async function listSnapshots(): Promise<SnapshotInfo[]> { return ((await db.meta.get('snapshots'))?.value as SnapshotInfo[]) ?? []; }
export async function getSnapshot(id: string) { return (await db.meta.get('snapshot:' + id))?.value as BackupFile | undefined; }

/** Restore atomically. Always snapshots current data first. */
export async function restore(f: BackupFile, mode: 'merge' | 'replace') {
  await snapshot(`Before ${mode} restore`);
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.audit], async () => {
    for (const t of TABLES) {
      const table = db.table(t);
      if (mode === 'replace') { await table.clear(); await table.bulkPut(f.data[t]); continue; }
      const existing = new Map((await table.toArray()).map((r: { id: string; updatedAt?: string }) => [r.id, r]));
      const put = ((f.data[t] ?? []) as { id: string; updatedAt?: string }[]).filter((r) => { const c = existing.get(r.id); return !c || (r.updatedAt ?? '') > (c.updatedAt ?? ''); });
      await table.bulkPut(put);
    }
    if (!(await db.settings.get('app'))) await db.settings.put(defaultSettings());
    await db.audit.add({ id: uid(), at: new Date().toISOString(), entity: 'database', entityId: '*', action: 'import', after: { mode, from: f.exportedAt } });
  });
}

/** Daily automatic local snapshot. */
export async function autoBackupIfDue() {
  const last = (await db.meta.get('lastAutoBackup'))?.value as string | undefined;
  if (last && Date.now() - Date.parse(last) < 86400000) return;
  if (!(await db.transactions.count()) && !(await db.accounts.count())) return;
  await snapshot('Automatic daily snapshot');
  await db.meta.put({ key: 'lastAutoBackup', value: new Date().toISOString() });
}
