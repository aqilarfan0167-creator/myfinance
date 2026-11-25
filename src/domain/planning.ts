import type { Account, Budget, Frequency, Goal, GoalEntry, Task, Transaction } from '@/db/types';
import type { Cents } from '@/lib/money';
import { addMonths, monthStart, monthEnd } from '@/lib/date';
import { nthDate } from './schedule';

/* ---------------- Budgets ---------------- */
export type BudgetLevel = 'ok' | 'warn' | 'over';
/** Green < 70%, orange 70–99%, red ≥ 100%. */
export function budgetLevel(spent: Cents, allocated: Cents): BudgetLevel {
  if (allocated <= 0) return spent > 0 ? 'over' : 'ok';
  const p = spent / allocated;
  return p >= 1 ? 'over' : p >= 0.7 ? 'warn' : 'ok';
}
export const budgetId = (month: string, categoryId: string) => `${month}:${categoryId}`;

export interface BudgetLine { categoryId: string; allocated: Cents; spent: Cents; remaining: Cents; pct: number; level: BudgetLevel }
export function budgetLines(budgets: Budget[], spentByCat: { categoryId: string; amount: Cents }[], month: string): BudgetLine[] {
  const spent = new Map(spentByCat.map((x) => [x.categoryId, x.amount]));
  return budgets.filter((b) => b.month === month).map((b) => {
    const sp = Math.max(0, spent.get(b.categoryId) ?? 0);
    return { categoryId: b.categoryId, allocated: b.amount, spent: sp, remaining: b.amount - sp, pct: b.amount > 0 ? sp / b.amount : sp > 0 ? 1 : 0, level: budgetLevel(sp, b.amount) };
  }).sort((a, b) => b.pct - a.pct);
}

/* ---------------- Goals ---------------- */
export interface GoalView extends Goal { saved: Cents; remaining: Cents; progress: number; thisMonth: Cents; requiredMonthly: Cents | null; etaDate: string | null; monthsLeft: number | null; onTrack: boolean | null }

export function goalViews(goals: Goal[], entries: GoalEntry[], today: string): GoalView[] {
  const ms = monthStart(today);
  return goals.filter((g) => !g.deletedAt).map((g) => {
    const es = entries.filter((e) => e.goalId === g.id && !e.deletedAt);
    const saved = g.startingAmount + es.reduce((a, e) => a + e.amount, 0);
    const remaining = Math.max(0, g.target - saved);
    const thisMonth = es.filter((e) => e.date >= ms && e.amount > 0).reduce((a, e) => a + e.amount, 0);
    let requiredMonthly: Cents | null = null, onTrack: boolean | null = null;
    if (g.targetDate && remaining > 0) {
      const months = Math.max(1, monthsBetween(today, g.targetDate));
      requiredMonthly = Math.ceil(remaining / months);
      onTrack = g.monthlyContribution >= requiredMonthly;
    }
    const monthsLeft = remaining === 0 ? 0 : g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : null;
    const etaDate = monthsLeft == null ? null : monthsLeft === 0 ? today : addMonths(today, monthsLeft);
    return { ...g, saved, remaining, progress: g.target > 0 ? Math.min(1, saved / g.target) : 0, thisMonth, requiredMonthly, etaDate, monthsLeft, onTrack };
  });
}
export function monthsBetween(from: string, to: string) {
  const [y1, m1] = from.split('-').map(Number), [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * Savings to keep aside in the daily allowance:
 * - goal money held in an account that counts as "available" (earmarked, not spendable), and
 * - the unpaid part of this month's planned contribution (if the goal opts in).
 */
export function reservedForGoals(views: GoalView[], accounts: Account[]): { held: Cents; monthly: Cents; total: Cents; accountIds: Set<string> } {
  const avail = new Set(accounts.filter((a) => a.includeInAvailable && a.status === 'active').map((a) => a.id));
  let held = 0, monthly = 0; const accountIds = new Set<string>();
  for (const g of views) {
    if (g.status !== 'active') continue;
    if (g.linkedAccountId && avail.has(g.linkedAccountId)) held += Math.max(0, g.saved);
    if (g.reserveMonthly && g.remaining > 0) { monthly += Math.min(g.remaining, Math.max(0, g.monthlyContribution - g.thisMonth)); if (g.linkedAccountId) accountIds.add(g.linkedAccountId); }
  }
  return { held, monthly, total: held + monthly, accountIds };
}

/* ---------------- Tasks ---------------- */
export function nextTaskDate(due: string, rec: Task['recurrence']): string | null {
  const f: Record<string, Frequency> = { weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' };
  return rec === 'none' ? null : nthDate(due, f[rec], 1);
}
export const isOverdueTask = (t: Task, today: string) => t.status === 'pending' && !!t.dueDate && t.dueDate < today;

/* ---------------- Simulator (pure – never touches records) ---------------- */
export const MONTHLY_FACTOR: Record<Frequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12 };

/** commitments is informational only – actual expenses already include commitment payments. */
export interface Baseline { income: Cents; expenses: Cents; commitments: Cents; debtPayments: Cents; savings: Cents; liquid: Cents; months: number }
/** Average of the last N complete months from actual records. */
export function baselineFrom(txns: Transaction[], summarizeFn: (from: string, to: string) => { income: Cents; netExpenses: Cents; debtRepayments: Cents; loanCharges: Cents; savingsTransfers: Cents }, today: string, n = 3): Omit<Baseline, 'commitments' | 'liquid'> {
  let income = 0, expenses = 0, debt = 0, savings = 0, used = 0;
  const first = txns.filter((t) => !t.deletedAt && t.status === 'actual').reduce((m, t) => (t.date < m ? t.date : m), today);
  for (let i = 1; i <= n; i++) {
    const ms = addMonths(monthStart(today), -i);
    if (monthEnd(ms) < first) break;
    const s = summarizeFn(ms, monthEnd(ms));
    income += s.income; expenses += s.netExpenses - s.loanCharges; debt += s.debtRepayments; savings += s.savingsTransfers; used++;
  }
  if (!used) return { income: 0, expenses: 0, debtPayments: 0, savings: 0, months: 0 };
  return { income: Math.round(income / used), expenses: Math.round(expenses / used), debtPayments: Math.round(debt / used), savings: Math.round(savings / used), months: used };
}

export type ScenarioItem =
  | { kind: 'salary'; label: string; monthly: Cents }                    // +/- change in monthly income
  | { kind: 'loan'; label: string; principal: Cents; ratePct: number; months: number; rateType: 'reducing' | 'flat' }
  | { kind: 'car'; label: string; price: Cents; downPayment: Cents; ratePct: number; months: number; running: Cents }
  | { kind: 'commitment'; label: string; monthly: Cents }
  | { kind: 'savings'; label: string; monthly: Cents }
  | { kind: 'extra_repayment'; label: string; monthly: Cents };

export interface SimResult { income: Cents; expenses: Cents; debt: Cents; savings: Cents; disposable: Cents; cashFlow: Cents; savingsCapacity: Cents; dsr: number; oneOff: Cents; liquidAfter: Cents }

export function simulate(b: Baseline, items: ScenarioItem[], instalment: (principal: Cents, rate: number, months: number, type: 'reducing' | 'flat') => Cents): SimResult {
  let income = b.income, expenses = b.expenses, debt = b.debtPayments, savings = b.savings, oneOff = 0;
  for (const it of items) {
    switch (it.kind) {
      case 'salary': income += it.monthly; break;
      case 'loan': debt += instalment(it.principal, it.ratePct, it.months, it.rateType); break;
      case 'car': debt += instalment(Math.max(0, it.price - it.downPayment), it.ratePct, it.months, 'flat'); expenses += it.running; oneOff += it.downPayment; break;
      case 'commitment': expenses += it.monthly; break;
      case 'savings': savings += it.monthly; break;
      case 'extra_repayment': debt += it.monthly; break;
    }
  }
  const disposable = income - debt;                 // after fixed obligations
  const cashFlow = income - expenses - debt;        // before savings
  const savingsCapacity = cashFlow - savings;       // left after planned savings
  return { income, expenses, debt, savings, disposable, cashFlow, savingsCapacity, dsr: income > 0 ? debt / income : 0, oneOff, liquidAfter: b.liquid - oneOff };
}

