import { liveQuery } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/db';
import { computeBalances, computePosition, categoryMap } from '@/domain/ledger';

/**
 * Shared live queries: ONE IndexedDB read per table per change for the whole app, however many components use it.
 * (Separate per-component queries multiplied full-table scans – ~10 s with 50k transactions.) Kept warm for the app's lifetime.
 */
const shared = new Map<string, { value: unknown; ready: boolean; subs: Set<(v: unknown) => void> }>();
function useShared<T>(key: string, query: () => Promise<T>): T | undefined {
  let e = shared.get(key);
  if (!e) {
    const entry = { value: undefined as unknown, ready: false, subs: new Set<(v: unknown) => void>() };
    shared.set(key, entry); e = entry;
    liveQuery(query).subscribe({ next: (v) => { entry.value = v; entry.ready = true; entry.subs.forEach((f) => f(v)); }, error: (err) => console.error('live query failed', key, err) });
  }
  const [v, setV] = useState<T | undefined>(e.ready ? (e.value as T) : undefined);
  useEffect(() => { const entry = shared.get(key)!; const f = (x: unknown) => setV(x as T); entry.subs.add(f); if (entry.ready) setV(entry.value as T); return () => { entry.subs.delete(f); }; }, [key]);
  return v;
}
/** For tests / after wiping the database. */
export const resetSharedQueries = () => shared.clear();

export const useSettings = () => useShared('settings', () => db.settings.get('app'));
export const useAccounts = () => useShared('accounts', () => db.accounts.filter((x) => !x.deletedAt).toArray());
export const useTransactions = () => useShared('transactions', () => db.transactions.toArray());
export const useCategories = () => useShared('categories', () => db.categories.toArray());

/** Everything the dashboard/forms need; recomputed live whenever any record changes. */
export function useFinance() {
  const accounts = useAccounts(); const txns = useTransactions(); const cats = useCategories(); const settings = useSettings();
  return useMemo(() => {
    if (!accounts || !txns || !cats || !settings) return null;
    const balances = computeBalances(accounts, txns);
    return { accounts, txns, cats, settings, balances, position: computePosition(accounts, balances), catMap: categoryMap(cats), accMap: new Map(accounts.map((a) => [a.id, a])) };
  }, [accounts, txns, cats, settings]);
}
export type Finance = NonNullable<ReturnType<typeof useFinance>>;

/* ---------------- Phase 2 ---------------- */
import { buildOccViews } from '@/domain/commitments';
import { todayKL } from '@/lib/date';
export const useSalaries = () => useShared('salaries', () => db.salaries.filter((x) => !x.deletedAt).toArray());
export const useOT = () => useShared('ot', () => db.otEntries.filter((x) => !x.deletedAt).toArray());
export const useRules = () => useShared('rules', () => db.recurring.filter((x) => !x.deletedAt).toArray());
export function useCommitments() {
  const commitments = useShared('commitments', () => db.commitments.filter((x) => !x.deletedAt).toArray());
  const occ = useShared('occurrences', () => db.occurrences.toArray());
  const txns = useTransactions();
  return useMemo(() => (commitments && occ && txns ? { commitments, views: buildOccViews(occ, commitments, txns, todayKL()) } : null), [commitments, occ, txns]);
}

/* ---------------- Phase 3 ---------------- */
import { goalViews } from '@/domain/planning';
export const useBudgets = () => useShared('budgets', () => db.budgets.toArray());
export const useTasks = () => useShared('tasks', () => db.tasks.filter((x) => !x.deletedAt).toArray());
export function useGoals() {
  const goals = useShared('goals', () => db.goals.filter((x) => !x.deletedAt).toArray());
  const entries = useShared('goalEntries', () => db.goalEntries.filter((x) => !x.deletedAt).toArray());
  return useMemo(() => (goals && entries ? { views: goalViews(goals, entries, todayKL()), entries } : null), [goals, entries]);
}

/* ---------------- Phase 4 ---------------- */
export const useReceipts = () => useShared('receipts', () => db.receipts.filter((r) => !r.deletedAt).toArray());
export const useReceipt = (id: string | null) => useLiveQuery(() => (id ? db.receipts.get(id) : undefined), [id]);
export const useAttachment = (id: string | null | undefined) => useLiveQuery(() => (id ? db.attachments.get(id) : undefined), [id]);
export const useAttachments = (ids: string[]) => useLiveQuery(() => db.attachments.bulkGet(ids).then((x) => x.filter((a): a is NonNullable<typeof a> => !!a && !a.deletedAt)), [ids.join(',')]);
/** Object URL for a stored file (original, processed or thumbnail), revoked automatically. */
export function useFileUrl(id: string | null | undefined, which: 'thumb' | 'display' | 'original' = 'display') {
  const file = useLiveQuery(() => (id ? db.files.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const blob = which === 'thumb' ? file.thumb : which === 'original' ? file.blob : file.processed ?? file.blob;
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u);
  }, [file, which]);
  return { url, file, missing: file === undefined && !!id };
}
