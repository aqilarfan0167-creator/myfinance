import { isLiability, type Account, type Category, type Transaction } from '@/db/types';
import type { Cents } from '@/lib/money';
import { FEE_CATEGORY_ID } from '@/db/seed';
import { daysBetween, nextPayday } from '@/lib/date';

export const isLive = (t: Transaction) => !t.deletedAt && t.status === 'actual';

/** Balance effects of one transaction on accounts. Internal transfers net to zero (except fees). */
export function txnEffects(t: Transaction): { accountId: string; delta: Cents }[] {
  if (!isLive(t)) return [];
  const out: { accountId: string; delta: Cents }[] = [];
  const add = (id: string | null, d: Cents) => { if (id) out.push({ accountId: id, delta: d }); };
  switch (t.type) {
    case 'income':
    case 'refund': add(t.accountId, t.amount); break;
    case 'expense': add(t.accountId, -t.amount); break;
    case 'transfer': add(t.accountId, -(t.amount + (t.fee || 0))); add(t.toAccountId, t.amount); break;
    case 'debt_repayment': add(t.accountId, -t.amount); add(t.toAccountId, t.amount); break;
    case 'adjustment': add(t.accountId, t.amount); break;
  }
  return out;
}

/** Balance = opening balance + effects of live transactions dated on/after the opening date. */
export function computeBalances(accounts: Account[], txns: Transaction[], asOf?: string): Map<string, Cents> {
  const bal = new Map<string, Cents>();
  const open = new Map<string, string>();
  for (const a of accounts) { if (a.deletedAt || (asOf && a.openingDate > asOf)) continue; bal.set(a.id, a.openingBalance); open.set(a.id, a.openingDate); }
  for (const t of txns) {
    if (asOf && t.date > asOf) continue;
    for (const e of txnEffects(t)) {
      const od = open.get(e.accountId);
      if (od === undefined || t.date < od) continue;
      bal.set(e.accountId, (bal.get(e.accountId) ?? 0) + e.delta);
    }
  }
  return bal;
}

export interface Position { total: Cents; available: Cents; assets: Cents; liabilities: Cents; netWorth: Cents; creditDebt: Cents; loanDebt: Cents; lowBalance: Account[] }

export function computePosition(accounts: Account[], bal: Map<string, Cents>, extraLiabilities: Cents = 0): Position {
  let total = 0, available = 0, assets = 0, liabilities = 0, creditDebt = 0, loanDebt = 0;
  const lowBalance: Account[] = [];
  for (const a of accounts) {
    if (a.deletedAt || a.status !== 'active') continue;
    const b = bal.get(a.id) ?? 0;
    if (a.type === 'credit_card') { if (b < 0) creditDebt += -b; }
    else if (a.type === 'loan') { if (b < 0) loanDebt += -b; }
    else total += b;
    if (a.includeInAvailable && !isLiability(a.type)) available += b;
    if (a.includeInNetWorth) { if (b >= 0) assets += b; else liabilities += -b; }
    if (a.lowBalanceThreshold != null && !isLiability(a.type) && b < a.lowBalanceThreshold) lowBalance.push(a);
  }
  liabilities += extraLiabilities;
  return { total, available, assets, liabilities, netWorth: assets - liabilities, creditDebt, loanDebt, lowBalance };
}

export interface Summary {
  income: Cents; expenses: Cents; refunds: Cents; netExpenses: Cents; fees: Cents;
  /** Repayments of loans (loan accounts or external lenders). */ debtRepayments: Cents;
  /** Credit card repayments – purchases were already counted as expenses. */ cardRepayments: Cents;
  /** Interest/fees charged onto loan accounts (counted in expenses; paid via repayments). */ loanCharges: Cents; savingsTransfers: Cents; cashFlow: Cents; savingsRate: number;
  expectedIncome: Cents;
  byCategory: { categoryId: string; amount: Cents }[];
  incomeByCategory: { categoryId: string; amount: Cents }[];
  needs: Cents; wants: Cents; unclassified: Cents;
  daily: Map<string, Cents>;
  merchants: { merchant: string; amount: Cents; count: number }[];
}

export interface SummaryFilter { from: string; to: string; accountIds?: string[]; categoryIds?: string[] }

/** Period totals. Internal transfers are excluded from income & expenses (only their fees count). */
export function summarize(txns: Transaction[], accounts: Account[], f: SummaryFilter): Summary {
  const accType = new Map(accounts.map((a) => [a.id, a.type]));
  const accSet = f.accountIds?.length ? new Set(f.accountIds) : null;
  const catSet = f.categoryIds?.length ? new Set(f.categoryIds) : null;
  const s: Summary = { income: 0, expenses: 0, refunds: 0, netExpenses: 0, fees: 0, debtRepayments: 0, cardRepayments: 0, loanCharges: 0, savingsTransfers: 0, cashFlow: 0, savingsRate: 0, expectedIncome: 0, byCategory: [], incomeByCategory: [], needs: 0, wants: 0, unclassified: 0, daily: new Map(), merchants: [] };
  const cat = new Map<string, Cents>(), icat = new Map<string, Cents>();
  const merch = new Map<string, { amount: Cents; count: number }>();
  const addCat = (m: Map<string, Cents>, id: string | null, v: Cents) => m.set(id ?? 'uncategorised', (m.get(id ?? 'uncategorised') ?? 0) + v);
  const addNW = (nw: Transaction['needWant'], v: Cents) => { if (nw === 'need') s.needs += v; else if (nw === 'want') s.wants += v; else s.unclassified += v; };
  const addDay = (d: string, v: Cents) => s.daily.set(d, (s.daily.get(d) ?? 0) + v);

  for (const t of txns) {
    if (t.deletedAt || t.date < f.from || t.date > f.to) continue;
    if (accSet && !(t.accountId && accSet.has(t.accountId)) && !(t.toAccountId && accSet.has(t.toAccountId))) continue;
    if (catSet && !(t.categoryId && catSet.has(t.categoryId))) continue;
    if (t.status === 'expected') { if (t.type === 'income') s.expectedIncome += t.amount; continue; }
    switch (t.type) {
      case 'income': s.income += t.amount; addCat(icat, t.categoryId, t.amount); break;
      case 'expense': {
        s.expenses += t.amount; addCat(cat, t.categoryId, t.amount);
        if (t.accountId && accType.get(t.accountId) === 'loan') s.loanCharges += t.amount; addNW(t.needWant, t.amount); addDay(t.date, t.amount);
        const m = (t.merchant || t.name).trim();
        if (m) { const e = merch.get(m) ?? { amount: 0, count: 0 }; e.amount += t.amount; e.count++; merch.set(m, e); }
        break;
      }
      case 'refund': s.refunds += t.amount; addCat(cat, t.categoryId, -t.amount); addNW(t.needWant, -t.amount); addDay(t.date, -t.amount); break;
      case 'transfer': {
        if (t.fee) { s.fees += t.fee; addCat(cat, FEE_CATEGORY_ID, t.fee); addNW('need', t.fee); addDay(t.date, t.fee); }
        const toT = t.toAccountId ? accType.get(t.toAccountId) : undefined;
        const fromT = t.accountId ? accType.get(t.accountId) : undefined;
        const isSav = (x?: string) => x === 'savings' || x === 'investment';
        if (isSav(toT) && !isSav(fromT)) s.savingsTransfers += t.amount;
        else if (isSav(fromT) && !isSav(toT)) s.savingsTransfers -= t.amount;
        break;
      }
      case 'debt_repayment':
        if (t.toAccountId && accType.get(t.toAccountId) === 'credit_card') s.cardRepayments += t.amount; else s.debtRepayments += t.amount;
        break;
      case 'adjustment': break;
    }
  }
  s.netExpenses = s.expenses + s.fees - s.refunds;
  // Cash flow: loan charges are paid through repayments, so they're not subtracted twice.
  s.cashFlow = s.income - s.netExpenses - s.debtRepayments + s.loanCharges;
  s.savingsRate = s.income > 0 ? s.cashFlow / s.income : 0;
  s.byCategory = [...cat].map(([categoryId, amount]) => ({ categoryId, amount })).filter((x) => x.amount !== 0).sort((a, b) => b.amount - a.amount);
  s.incomeByCategory = [...icat].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
  s.merchants = [...merch].map(([merchant, v]) => ({ merchant, ...v })).sort((a, b) => b.amount - a.amount);
  return s;
}

export interface Allowance { available: Cents; reserved: Cents; unpaidCommitments: Cents; plannedEssentials: Cents; spendable: Cents; daysLeft: number; perDay: Cents; nextPayday: string; insufficient: boolean }

/**
 * Daily allowance = (available liquid balance − unpaid commitments − reserved savings − planned essentials)
 * ÷ days remaining until payday (today inclusive). Expected salary is never added (no double counting).
 */
export function dailyAllowance(p: { available: Cents; today: string; payDay: number; unpaidCommitments?: Cents; reserved?: Cents; plannedEssentials?: Cents }): Allowance {
  const np = nextPayday(p.today, p.payDay);
  const daysLeft = Math.max(1, daysBetween(p.today, np));
  const unpaid = p.unpaidCommitments ?? 0, reserved = p.reserved ?? 0, planned = p.plannedEssentials ?? 0;
  const spendable = p.available - unpaid - reserved - planned;
  return { available: p.available, reserved, unpaidCommitments: unpaid, plannedEssentials: planned, spendable, daysLeft, perDay: spendable > 0 ? Math.floor(spendable / daysLeft) : 0, nextPayday: np, insufficient: spendable < 0 };
}

export function categoryMap(cats: Category[]) { return new Map(cats.map((c) => [c.id, c])); }
