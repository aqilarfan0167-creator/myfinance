import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '@/db/db';
import { computeBalances, computePosition, categoryMap } from '@/domain/ledger';

export const useSettings = () => useLiveQuery(() => db.settings.get('app'), []);
export const useAccounts = (includeDeleted = false) =>
  useLiveQuery(() => db.accounts.toArray().then((a) => (includeDeleted ? a : a.filter((x) => !x.deletedAt))), [includeDeleted]);
export const useTransactions = () => useLiveQuery(() => db.transactions.toArray(), []);
export const useCategories = () => useLiveQuery(() => db.categories.toArray(), []);

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
export const useSalaries = () => useLiveQuery(() => db.salaries.filter((x) => !x.deletedAt).toArray(), []);
export const useOT = () => useLiveQuery(() => db.otEntries.filter((x) => !x.deletedAt).toArray(), []);
export const useRules = () => useLiveQuery(() => db.recurring.filter((x) => !x.deletedAt).toArray(), []);
export function useCommitments() {
  const commitments = useLiveQuery(() => db.commitments.filter((x) => !x.deletedAt).toArray(), []);
  const occ = useLiveQuery(() => db.occurrences.toArray(), []);
  const txns = useTransactions();
  return useMemo(() => (commitments && occ && txns ? { commitments, views: buildOccViews(occ, commitments, txns, todayKL()) } : null), [commitments, occ, txns]);
}

/* ---------------- Phase 3 ---------------- */
import { goalViews } from '@/domain/planning';
export const useBudgets = () => useLiveQuery(() => db.budgets.toArray(), []);
export const useTasks = () => useLiveQuery(() => db.tasks.filter((x) => !x.deletedAt).toArray(), []);
export function useGoals() {
  const goals = useLiveQuery(() => db.goals.filter((x) => !x.deletedAt).toArray(), []);
  const entries = useLiveQuery(() => db.goalEntries.filter((x) => !x.deletedAt).toArray(), []);
  return useMemo(() => (goals && entries ? { views: goalViews(goals, entries, todayKL()), entries } : null), [goals, entries]);
}

/* ---------------- Phase 4 ---------------- */
import { useEffect, useState } from 'react';
export const useReceipts = () => useLiveQuery(() => db.receipts.filter((r) => !r.deletedAt).toArray(), []);
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
