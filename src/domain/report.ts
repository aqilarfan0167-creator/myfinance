import type { Account, Budget, Category, OTEntry, Receipt, SalaryRecord, Transaction, GoalEntry } from '@/db/types';
import type { Cents } from '@/lib/money';
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, monthEnd, monthStart } from '@/lib/date';
import { computeBalances, computePosition, summarize, type Summary } from './ledger';
import { budgetLines } from './planning';
import type { OccView } from './commitments';
import type { GoalView } from './planning';

export type PeriodKind = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export interface Range { from: string; to: string; label: string }

const mondayOf = (d: string) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
export function periodRange(kind: PeriodKind, anchor: string, custom?: { from: string; to: string }): Range {
  switch (kind) {
    case 'daily': return { from: anchor, to: anchor, label: fmtDate(anchor) };
    case 'weekly': { const f = mondayOf(anchor); return { from: f, to: addDays(f, 6), label: `Week ${fmtDate(f)} – ${fmtDate(addDays(f, 6))}` }; }
    case 'monthly': return { from: monthStart(anchor), to: monthEnd(anchor), label: fmtMonth(anchor.slice(0, 7)) };
    case 'yearly': return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31`, label: anchor.slice(0, 4) };
    default: { const c = custom ?? { from: anchor, to: anchor }; const [f, t] = c.from <= c.to ? [c.from, c.to] : [c.to, c.from]; return { from: f, to: t, label: `${fmtDate(f)} – ${fmtDate(t)}` }; }
  }
}
/** The comparison period: previous day/week/month/year, or the same number of days immediately before a custom range. */
export function previousRange(kind: PeriodKind, r: Range): Range {
  if (kind === 'monthly') return periodRange('monthly', addMonths(r.from, -1));
  if (kind === 'yearly') return periodRange('yearly', `${Number(r.from.slice(0, 4)) - 1}-01-01`);
  const len = daysBetween(r.from, r.to) + 1; const to = addDays(r.from, -1); const from = addDays(to, -(len - 1));
  return { from, to, label: kind === 'custom' ? `${fmtDate(from)} – ${fmtDate(to)}` : periodRange(kind, from).label };
}
export function shiftAnchor(kind: PeriodKind, anchor: string, n: number) {
  return kind === 'daily' ? addDays(anchor, n) : kind === 'weekly' ? addDays(anchor, 7 * n) : kind === 'monthly' ? addMonths(monthStart(anchor), n) : kind === 'yearly' ? `${Number(anchor.slice(0, 4)) + n}-01-01` : anchor;
}
export const pctChange = (cur: number, prev: number): number | null => (prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / Math.abs(prev));

export interface ReportInput {
  accounts: Account[]; txns: Transaction[]; cats: Category[]; occ: OccView[]; goals: GoalView[]; goalEntries: GoalEntry[];
  salaries: SalaryRecord[]; ot: OTEntry[]; budgets: Budget[]; receipts: Receipt[]; today: string;
}
export interface CatRow { categoryId: string; name: string; amount: Cents; prev: Cents; change: number | null; share: number }
export interface Report {
  kind: PeriodKind; range: Range; prevRange: Range; generatedAt: string;
  cur: Summary; prev: Summary;
  totals: { key: string; label: string; cur: number; prev: number; change: number | null; kind: 'money' | 'pct'; goodUp: boolean }[];
  expenseCats: CatRow[]; incomeCats: CatRow[];
  merchants: { merchant: string; amount: Cents; count: number }[];
  needsWants: { needs: Cents; wants: Cents; unclassified: Cents };
  series: { label: string; income: Cents; expenses: Cents; net: Cents }[];
  accounts: { id: string; name: string; type: string; start: Cents; end: Cents; change: Cents; openedInPeriod: boolean }[];
  position: { start: ReturnType<typeof computePosition>; end: ReturnType<typeof computePosition> };
  commitments: { total: Cents; paid: Cents; outstanding: Cents; items: { name: string; due: string; amount: Cents; paid: Cents; status: string }[] };
  savings: { contributed: Cents; withdrawn: Cents; transfers: Cents; goals: { name: string; saved: Cents; target: Cents; progress: number }[] };
  salary: { records: { month: string; company: string; gross: Cents; expectedNet: Cents; actualNet: Cents | null; status: string }[]; otHours: number; otAmount: Cents; otEntries: number };
  budgets: { month: string; lines: { categoryId: string; name: string; allocated: Cents; spent: Cents; remaining: Cents; pct: number; level: string }[]; allocated: Cents; spent: Cents } [];
  receipts: { recorded: number; recordedTotal: Cents; pending: number; topMerchants: { merchant: string; count: number; total: Cents }[] };
  transactions: Transaction[]; // in range, not deleted, actual, sorted
  notes: string[];
}

export function buildReport(d: ReportInput, kind: PeriodKind, range: Range): Report {
  const prevRange = previousRange(kind, range);
  const cur = summarize(d.txns, d.accounts, range); const prev = summarize(d.txns, d.accounts, prevRange);
  const catName = new Map(d.cats.map((c) => [c.id, c.name]));
  const name = (id: string) => catName.get(id) ?? 'Uncategorised';
  const rows = (c: { categoryId: string; amount: number }[], p: { categoryId: string; amount: number }[], total: number): CatRow[] => {
    const pm = new Map(p.map((x) => [x.categoryId, x.amount])); const ids = new Set([...c.map((x) => x.categoryId), ...p.map((x) => x.categoryId)]);
    return [...ids].map((id) => { const amount = c.find((x) => x.categoryId === id)?.amount ?? 0; const pv = pm.get(id) ?? 0; return { categoryId: id, name: name(id), amount, prev: pv, change: pctChange(amount, pv), share: total > 0 ? amount / total : 0 }; })
      .filter((x) => x.amount !== 0 || x.prev !== 0).sort((a, b) => b.amount - a.amount);
  };
  const T = (key: string, label: string, c: number, p: number, goodUp: boolean, kind: 'money' | 'pct' = 'money') => ({ key, label, cur: c, prev: p, change: kind === 'pct' ? c - p : pctChange(c, p), kind, goodUp });

  // Series granularity follows the period length
  const len = daysBetween(range.from, range.to) + 1;
  const buckets: { label: string; from: string; to: string }[] = [];
  if (len <= 31) for (let i = 0; i < len; i++) { const x = addDays(range.from, i); buckets.push({ label: fmtDate(x).slice(0, 5), from: x, to: x }); }
  else if (len <= 120) for (let s = range.from; s <= range.to; s = addDays(s, 7)) { const e = addDays(s, 6) < range.to ? addDays(s, 6) : range.to; buckets.push({ label: fmtDate(s).slice(0, 5), from: s, to: e }); }
  else for (let s = monthStart(range.from); s <= range.to; s = addMonths(s, 1)) buckets.push({ label: fmtMonth(s.slice(0, 7)), from: s < range.from ? range.from : s, to: monthEnd(s) > range.to ? range.to : monthEnd(s) });
  const series = buckets.map((b) => { const s = summarize(d.txns, d.accounts, b); return { label: b.label, income: s.income, expenses: s.netExpenses, net: s.income - s.netExpenses }; });

  const startDate = addDays(range.from, -1);
  const balEnd = computeBalances(d.accounts, d.txns, range.to);
  // Accounts added during the period start at their opening balance, so "change" reflects activity, not the act of adding an account.
  const inScope = d.accounts.filter((a) => !a.deletedAt && a.openingDate <= range.to);
  const balStart = computeBalances(d.accounts, d.txns, startDate);
  for (const a of inScope) if (a.openingDate > startDate) balStart.set(a.id, a.openingBalance);
  const accounts = inScope.map((a) => {
    const start = balStart.get(a.id) ?? 0; const end = balEnd.get(a.id) ?? 0;
    return { id: a.id, name: a.name, type: a.type, start, end, change: end - start, openedInPeriod: a.openingDate > startDate };
  });

  const occIn = d.occ.filter((o) => o.dueDate >= range.from && o.dueDate <= range.to && o.status !== 'skipped');
  const commitments = { total: occIn.reduce((a, o) => a + o.amount, 0), paid: occIn.reduce((a, o) => a + Math.min(o.paid, o.amount), 0), outstanding: occIn.reduce((a, o) => a + o.remaining, 0),
    items: occIn.map((o) => ({ name: o.commitment.name, due: o.dueDate, amount: o.amount, paid: o.paid, status: o.status })) };

  const ge = d.goalEntries.filter((e) => !e.deletedAt && e.date >= range.from && e.date <= range.to);
  const savings = { contributed: ge.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0), withdrawn: -ge.filter((e) => e.amount < 0).reduce((a, e) => a + e.amount, 0), transfers: cur.savingsTransfers,
    goals: d.goals.filter((g) => g.status === 'active').map((g) => ({ name: g.name, saved: g.saved, target: g.target, progress: g.progress })) };

  const fromM = range.from.slice(0, 7), toM = range.to.slice(0, 7);
  const otIn = d.ot.filter((o) => !o.deletedAt && o.approval !== 'rejected' && o.date >= range.from && o.date <= range.to);
  const salary = { records: d.salaries.filter((s) => !s.deletedAt && s.month >= fromM && s.month <= toM).sort((a, b) => a.month.localeCompare(b.month))
      .map((s) => ({ month: s.month, company: s.company, gross: s.gross, expectedNet: s.expectedNet, actualNet: s.actualNet, status: s.status })),
    otHours: Math.round(otIn.reduce((a, o) => a + o.hours, 0) * 100) / 100, otAmount: otIn.reduce((a, o) => a + o.amount, 0), otEntries: otIn.length };

  // Budget performance for every month that overlaps the period (spent = whole month, as budgets are monthly)
  const months: string[] = []; for (let m = monthStart(range.from); m <= range.to; m = addMonths(m, 1)) months.push(m.slice(0, 7));
  const budgets = months.map((m) => {
    const s = summarize(d.txns, d.accounts, { from: `${m}-01`, to: monthEnd(`${m}-01`) });
    const lines = budgetLines(d.budgets, s.byCategory, m).map((l) => ({ ...l, name: name(l.categoryId) }));
    return { month: m, lines, allocated: lines.reduce((a, l) => a + l.allocated, 0), spent: lines.reduce((a, l) => a + l.spent, 0) };
  }).filter((b) => b.lines.length);

  const recIn = d.receipts.filter((r) => !r.deletedAt && r.date && r.date >= range.from && r.date <= range.to);
  const recorded = recIn.filter((r) => r.status === 'recorded');
  const rm = new Map<string, { count: number; total: number }>();
  for (const r of recorded) { const e = rm.get(r.merchant) ?? { count: 0, total: 0 }; e.count++; e.total += r.total ?? 0; rm.set(r.merchant, e); }
  const receipts = { recorded: recorded.length, recordedTotal: recorded.reduce((a, r) => a + (r.total ?? 0), 0), pending: d.receipts.filter((r) => !r.deletedAt && ['review', 'draft', 'duplicate', 'failed'].includes(r.status)).length,
    topMerchants: [...rm].map(([merchant, v]) => ({ merchant, ...v })).sort((a, b) => b.total - a.total).slice(0, 10) };

  const posStart = computePosition(inScope, balStart), posEnd = computePosition(inScope, balEnd);
  const transactions = d.txns.filter((t) => !t.deletedAt && t.status === 'actual' && t.date >= range.from && t.date <= range.to).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const notes = ['Internal transfers between your own accounts and credit-card repayments are excluded from income and expenses (transfer fees are included).'];
  if (accounts.some((a) => a.openedInPeriod)) notes.push('Accounts added during this period are shown from their opening balance.');
  if (range.to > d.today) notes.push(`The period ends after today (${fmtDate(d.today)}); figures are to date.`);

  return {
    kind, range, prevRange, generatedAt: new Date().toISOString(), cur, prev,
    totals: [
      T('income', 'Income', cur.income, prev.income, true), T('expenses', 'Expenses (net of refunds)', cur.netExpenses, prev.netExpenses, false),
      T('debt', 'Loan repayments', cur.debtRepayments, prev.debtRepayments, false), T('cards', 'Credit card repayments', cur.cardRepayments, prev.cardRepayments, false),
      T('cashflow', 'Cash flow', cur.cashFlow, prev.cashFlow, true), T('savings', 'Moved to savings', cur.savingsTransfers, prev.savingsTransfers, true),
      T('rate', 'Savings rate', cur.savingsRate, prev.savingsRate, true, 'pct'),
    ],
    expenseCats: rows(cur.byCategory, prev.byCategory, cur.netExpenses), incomeCats: rows(cur.incomeByCategory, prev.incomeByCategory, cur.income),
    merchants: cur.merchants.slice(0, 15), needsWants: { needs: cur.needs, wants: cur.wants, unclassified: cur.unclassified }, series,
    accounts, position: { start: posStart, end: posEnd }, commitments, savings, salary, budgets, receipts, transactions, notes,
  };
}
