import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useBudgets, useCommitments, useFinance, useGoals, useOT, useReceipts, useSalaries } from './useData';
import type { ReportInput } from '@/domain/report';
import { todayKL } from '@/lib/date';

/** Everything reports and insights need, kept live. */
export function useReportInput(): (ReportInput & { finance: NonNullable<ReturnType<typeof useFinance>>; commitments: NonNullable<ReturnType<typeof useCommitments>>['commitments'] }) | null {
  const f = useFinance(); const cm = useCommitments(); const g = useGoals(); const sal = useSalaries(); const ot = useOT(); const budgets = useBudgets(); const receipts = useReceipts();
  const goalEntries = useLiveQuery(() => db.goalEntries.toArray(), []);
  return useMemo(() => {
    if (!f || !cm || !g || !sal || !ot || !budgets || !receipts || !goalEntries) return null;
    return { finance: f, commitments: cm.commitments, accounts: f.accounts, txns: f.txns, cats: f.cats, occ: cm.views, goals: g.views, goalEntries, salaries: sal, ot, budgets, receipts, today: todayKL() };
  }, [f, cm, g, sal, ot, budgets, receipts, goalEntries]);
}
