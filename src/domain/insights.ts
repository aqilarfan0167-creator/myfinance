import type { Account, Budget, Category, Commitment, Transaction } from '@/db/types';

import { formatRM } from '@/lib/money';
import { addDays, addMonths, daysInMonth, fmtMonth, monthEnd, monthStart } from '@/lib/date';
import { summarize } from './ledger';
import { budgetLines, type GoalView } from './planning';
import { normMerchant } from './receipt';

export interface Insight { id: string; kind: 'trend' | 'top' | 'unusual' | 'frequent' | 'budget' | 'savings' | 'subscription'; severity: 'good' | 'info' | 'warning' | 'alert'; title: string; detail: string; link?: string; value?: number }
export interface InsightInput { txns: Transaction[]; accounts: Account[]; cats: Category[]; budgets: Budget[]; goals: GoalView[]; commitments: Commitment[]; today: string }
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** All insights come from recorded data; nothing is estimated without saying so. */
export function buildInsights(d: InsightInput): Insight[] {
  const out: Insight[] = []; const { today } = d;
  const S = (from: string, to: string) => summarize(d.txns, d.accounts, { from, to });
  const name = (id: string) => d.cats.find((c) => c.id === id)?.name ?? 'Uncategorised';
  const ms = monthStart(today); const day = Number(today.slice(8)); const [y, m] = today.split('-').map(Number); const dim = daysInMonth(y, m);
  const first = d.txns.filter((t) => !t.deletedAt && t.status === 'actual').reduce((a, t) => (t.date < a ? t.date : a), today);
  const fullMonths = [1, 2, 3].map((i) => addMonths(ms, -i)).filter((mm) => monthEnd(mm) >= first && mm >= monthStart(first));
  if (!d.txns.some((t) => !t.deletedAt && t.status === 'actual')) return [{ id: 'empty', kind: 'trend', severity: 'info', title: 'Not enough data yet', detail: 'Record income and expenses for a few weeks to see insights.' }];

  // 1. Spending trend: month-to-date vs the same days of previous months (fair comparison)
  const mtd = S(ms, today);
  const sameDays = fullMonths.map((mm) => { const [yy, m2] = mm.split('-').map(Number); return S(mm, addDays(mm, Math.min(day, daysInMonth(yy, m2)) - 1)); });
  if (sameDays.length) {
    const avg = sameDays.reduce((a, s) => a + s.netExpenses, 0) / sameDays.length;
    if (avg > 0) {
      const ch = (mtd.netExpenses - avg) / avg;
      out.push({ id: 'trend', kind: 'trend', severity: ch > 0.15 ? 'warning' : ch < -0.1 ? 'good' : 'info', value: ch,
        title: ch > 0.15 ? `Spending is ${pct(ch)} higher than usual` : ch < -0.1 ? `Spending is ${pct(-ch)} lower than usual` : 'Spending is in line with previous months',
        detail: `${formatRM(mtd.netExpenses)} spent in the first ${day} day(s) of ${fmtMonth(ms.slice(0, 7))}, vs an average of ${formatRM(Math.round(avg))} for the same days of the last ${sameDays.length} month(s).`, link: '/reports' });
    }
    // projection, clearly labelled
    if (day >= 7 && day < dim) out.push({ id: 'projection', kind: 'trend', severity: 'info', title: `At this pace: about ${formatRM(Math.round((mtd.netExpenses / day) * dim))} this month`, detail: `Simple projection: ${formatRM(mtd.netExpenses)} so far ÷ ${day} days × ${dim} days. Bills due later in the month may change this.` });
  }

  // 2. Top categories & merchants (last 30 days)
  const l30 = S(addDays(today, -29), today);
  if (l30.byCategory.length) { const top = l30.byCategory.slice(0, 3); out.push({ id: 'topcat', kind: 'top', severity: 'info', title: `Top spending: ${name(top[0].categoryId)}`, detail: `Last 30 days: ${top.map((c) => `${name(c.categoryId)} ${formatRM(c.amount)} (${pct(c.amount / Math.max(1, l30.netExpenses))})`).join(', ')}.`, link: '/expenses' }); }
  if (l30.merchants.length) { const t = l30.merchants.slice(0, 3); out.push({ id: 'topmerchant', kind: 'top', severity: 'info', title: `Most spent at ${t[0].merchant}`, detail: t.map((x) => `${x.merchant}: ${formatRM(x.amount)} over ${x.count} visit(s)`).join(' · ') + ' (last 30 days).' }); }

  // 3. Unusual increases per category (month-to-date vs same days avg); ignore small amounts
  if (sameDays.length >= 1) {
    const avgCat = new Map<string, number>();
    for (const s of sameDays) for (const c of s.byCategory) avgCat.set(c.categoryId, (avgCat.get(c.categoryId) ?? 0) + c.amount / sameDays.length);
    for (const c of mtd.byCategory) {
      const a = avgCat.get(c.categoryId) ?? 0;
      if (c.amount >= 5000 && c.amount > a * 1.5 && c.amount - a >= 5000)
        out.push({ id: `unusual:${c.categoryId}`, kind: 'unusual', severity: 'warning', title: `${name(c.categoryId)} up ${a ? pct((c.amount - a) / a) : 'sharply'}`, detail: `${formatRM(c.amount)} so far this month vs ${formatRM(Math.round(a))} usually by day ${day}.`, link: '/expenses' });
    }
  }

  // 4. Frequent small purchases (≥ 6 in 30 days at the same merchant)
  const freq = new Map<string, { n: number; total: number; label: string }>();
  for (const t of d.txns) if (!t.deletedAt && t.status === 'actual' && t.type === 'expense' && t.date >= addDays(today, -29) && t.date <= today) {
    const k = normMerchant(t.merchant || t.name); if (!k) continue; const e = freq.get(k) ?? { n: 0, total: 0, label: t.merchant || t.name }; e.n++; e.total += t.amount; freq.set(k, e);
  }
  for (const [k, e] of [...freq].sort((a, b) => b[1].n - a[1].n).slice(0, 3)) if (e.n >= 6)
    out.push({ id: `freq:${k}`, kind: 'frequent', severity: 'info', title: `${e.n} purchases at ${e.label} in 30 days`, detail: `Total ${formatRM(e.total)} (average ${formatRM(Math.round(e.total / e.n))} each). Small, frequent spending adds up – about ${formatRM(Math.round((e.total / 30) * 365))} a year at this rate.` });

  // 5. Budgets: over, near limit, or on pace to overspend
  for (const l of budgetLines(d.budgets, mtd.byCategory, today.slice(0, 7))) {
    const pace = day < dim ? (l.spent / day) * dim : l.spent;
    if (l.level === 'over') out.push({ id: `budget:${l.categoryId}`, kind: 'budget', severity: 'alert', title: `${name(l.categoryId)} budget exceeded`, detail: `${formatRM(l.spent)} of ${formatRM(l.allocated)} (${pct(l.pct)}).`, link: '/budget' });
    else if (l.level === 'warn') out.push({ id: `budget:${l.categoryId}`, kind: 'budget', severity: 'warning', title: `${name(l.categoryId)} budget at ${pct(l.pct)}`, detail: `${formatRM(l.remaining)} left for ${dim - day + 1} day(s).`, link: '/budget' });
    else if (day >= 7 && l.allocated > 0 && pace > l.allocated * 1.1) out.push({ id: `pace:${l.categoryId}`, kind: 'budget', severity: 'warning', title: `${name(l.categoryId)} on pace to overspend`, detail: `At the current rate you'd spend about ${formatRM(Math.round(pace))} against a ${formatRM(l.allocated)} budget.`, link: '/budget' });
  }

  // 6. Savings performance
  if (fullMonths.length) {
    const lm = S(fullMonths[0], monthEnd(fullMonths[0]));
    if (lm.income > 0) out.push({ id: 'saverate', kind: 'savings', severity: lm.savingsRate >= 0.2 ? 'good' : lm.savingsRate < 0 ? 'alert' : lm.savingsRate < 0.1 ? 'warning' : 'info', value: lm.savingsRate,
      title: `Saved ${pct(Math.max(-9.99, lm.savingsRate))} of income in ${fmtMonth(fullMonths[0].slice(0, 7))}`, detail: `Cash flow ${formatRM(lm.cashFlow)} from income ${formatRM(lm.income)}. A common guideline is to save at least 10–20%.`, link: '/reports' });
    const avgExp = fullMonths.reduce((a, mm) => a + S(mm, monthEnd(mm)).netExpenses, 0) / fullMonths.length;
    const ef = d.goals.find((g) => g.type === 'emergency' && g.status === 'active');
    if (ef && avgExp > 0) { const months = ef.saved / avgExp; out.push({ id: 'emergency', kind: 'savings', severity: months >= 6 ? 'good' : months >= 3 ? 'info' : 'warning', title: `Emergency fund covers ${months.toFixed(1)} month(s)`, detail: `${formatRM(ef.saved)} saved vs average monthly spending of ${formatRM(Math.round(avgExp))}. 3–6 months is commonly recommended.`, link: '/savings' }); }
  }
  for (const g of d.goals) if (g.status === 'active' && g.onTrack === false) out.push({ id: `goal:${g.id}`, kind: 'savings', severity: 'warning', title: `${g.name} is behind schedule`, detail: `Needs ${formatRM(g.requiredMonthly ?? 0)}/month to reach ${formatRM(g.target)} on time; plan is ${formatRM(g.monthlyContribution)}/month.`, link: '/savings' });

  // 7. Possible untracked subscriptions: same merchant & amount in ≥ 2 of the last 3 months, not a commitment
  const active = d.commitments.filter((c) => !c.deletedAt);
  const tracked = (t: Transaction) => { const m = normMerchant(t.merchant || t.name);
    return active.some((c) => { const n = normMerchant(c.name); return (n.length >= 3 && (m.includes(n) || n.includes(m))) || (c.categoryId && c.categoryId === t.categoryId && Math.abs(c.amount - t.amount) <= c.amount * 0.1); }); };
  const byKey = new Map<string, Set<string>>(); const lastTxn = new Map<string, Transaction>();
  for (const t of d.txns) if (!t.deletedAt && t.status === 'actual' && t.type === 'expense' && t.date >= addMonths(ms, -3) && !t.recurringId && !t.related.some((r) => r.kind === 'occurrence')) {
    const k = `${normMerchant(t.merchant || t.name)}|${t.amount}`; const s = byKey.get(k) ?? new Set(); s.add(t.date.slice(0, 7)); byKey.set(k, s); lastTxn.set(k, t);
  }
  for (const [k, months] of byKey) { const [mk] = k.split('|'); const t = lastTxn.get(k)!;
    if (months.size >= 3 && mk && !tracked(t) && !/LUNCH|PETROL|GROCER/i.test(t.name)) out.push({ id: `sub:${k}`, kind: 'subscription', severity: 'info', title: `Recurring payment: ${t.merchant || t.name}`, detail: `${formatRM(t.amount)} every month for ${months.size} months. Add it as a commitment to get reminders and include it in your allowance.`, link: '/commitments' }); }

  const order = { alert: 0, warning: 1, good: 2, info: 3 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
