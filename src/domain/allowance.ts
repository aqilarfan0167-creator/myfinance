import { isLiability, type Account, type Transaction } from '@/db/types';
import { addDays } from '@/lib/date';
import { dailyAllowance } from './ledger';
import { unpaidLiquidCommitments, type OccView } from './commitments';
import { reservedForGoals, type GoalView } from './planning';
import type { Cents } from '@/lib/money';

/**
 * "Safe to spend": available liquid money minus what is already promised before the next payday
 * (unpaid bills, planned expenses/repayments, goal money and planned savings), spread over the days left.
 * Card-paid items don't reduce liquid cash; expected salary is never counted. No double counting of goal transfers.
 */
export function computeAllowance(p: { available: Cents; accounts: Account[]; txns: Transaction[]; occ: OccView[]; goals: GoalView[]; today: string; payDay: number }) {
  const np = dailyAllowance({ available: 0, today: p.today, payDay: p.payDay }).nextPayday;
  const beforePay = addDays(np, -1);
  const acc = new Map(p.accounts.map((a) => [a.id, a]));
  const type = (id: string | null) => (id ? acc.get(id)?.type : undefined);
  const exp = p.txns.filter((x) => !x.deletedAt && x.status === 'expected' && x.date <= beforePay && !isLiability(type(x.accountId)));
  const planned = exp.filter((x) => x.type === 'expense' || x.type === 'debt_repayment').reduce((a, x) => a + x.amount, 0);
  const goalRes = reservedForGoals(p.goals, p.accounts);
  const plannedTransfers = exp.filter((x) => x.type === 'transfer' && ['savings', 'investment'].includes(type(x.toAccountId) ?? '') && type(x.accountId) !== 'savings' && !goalRes.accountIds.has(x.toAccountId ?? '')).reduce((a, x) => a + x.amount + x.fee, 0);
  const allowance = dailyAllowance({ available: p.available, today: p.today, payDay: p.payDay, unpaidCommitments: unpaidLiquidCommitments(p.occ, p.accounts, beforePay), plannedEssentials: planned, reserved: goalRes.total + plannedTransfers });
  return { ...allowance, goalHeld: goalRes.held, goalMonthly: goalRes.monthly, plannedTransfers };
}
