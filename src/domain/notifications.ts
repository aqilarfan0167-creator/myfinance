import type { Account, AppNotification, NotificationPrefs, Receipt, SalaryRecord, Task, Transaction, Budget, Category } from '@/db/types';
import type { OccView } from './commitments';
import { formatRM } from '@/lib/money';
import { addDays, daysBetween, fmtDate, nextPayday } from '@/lib/date';
import { budgetLines } from './planning';
import { summarize, computeBalances } from './ledger';
import { cardStatus } from './cards';

type N = Omit<AppNotification, 'createdAt' | 'readAt' | 'dismissedAt' | 'resolvedAt'>;
export interface NotifInput { prefs: NotificationPrefs; today: string; payDay: number; occ: OccView[]; accounts: Account[]; txns: Transaction[]; budgets: Budget[]; cats: Category[]; salaries: SalaryRecord[]; tasks: Task[]; receipts: Receipt[]; lastBackup: string | null; firstUse: string | null }

/** Current reminders, each with a deterministic id so the same reminder is never created twice. */
export function computeNotifications(d: NotifInput): N[] {
  const p = d.prefs, t = d.today, out: N[] = [];
  const due = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  for (const o of d.occ) {
    if (o.remaining <= 0 || o.status === 'skipped') continue;
    const days = daysBetween(t, o.dueDate);
    if (days < 0 && p.overdue) out.push({ id: `overdue:${o.id}`, type: 'overdue', severity: 'alert', title: `Overdue: ${o.commitment.name}`, body: `${formatRM(o.remaining)} was due ${fmtDate(o.dueDate)}.`, link: '/commitments' });
    else if (days >= 0 && p.payments.enabled && days <= p.payments.daysBefore) {
      const sub = /subscri|netflix|spotify|astro|youtube|icloud/i.test(o.commitment.name) || o.commitment.categoryId === 'exp-subscriptions';
      if (sub && !p.subscriptions.enabled) continue;
      if (sub && days > p.subscriptions.daysBefore) continue;
      out.push({ id: `due:${o.id}`, type: sub ? 'subscription' : 'payment_due', severity: days <= 1 ? 'warning' : 'info', title: `${sub ? 'Subscription renews' : 'Payment due'} ${due(days)}: ${o.commitment.name}`, body: `${formatRM(o.remaining)} due ${fmtDate(o.dueDate)}.`, link: '/commitments' });
    }
  }
  if (p.payments.enabled) for (const a of d.accounts) if (a.type === 'credit_card' && a.status === 'active' && !a.deletedAt && a.statementDay && a.dueDay) {
    const s = cardStatus(a, d.accounts, d.txns, t);
    if (s.dueDate && s.remainingDue && s.remainingDue > 0) { const days = daysBetween(t, s.dueDate);
      if (days >= 0 && days <= p.payments.daysBefore) out.push({ id: `card:${a.id}:${s.statementDate}`, type: 'card_due', severity: days <= 1 ? 'warning' : 'info', title: `${a.name} payment due ${due(days)}`, body: `Statement balance ${formatRM(s.statementBalance ?? 0)}, still due ${formatRM(s.remainingDue)} (minimum est. ${formatRM(s.minimumDue ?? 0)}).`, link: '/debts' }); }
  }
  if (p.budget.enabled) {
    const m = t.slice(0, 7); const s = summarize(d.txns, d.accounts, { from: `${m}-01`, to: t });
    for (const l of budgetLines(d.budgets, s.byCategory, m)) if (l.pct * 100 >= p.budget.warnAt) {
      const nm = d.cats.find((c) => c.id === l.categoryId)?.name ?? 'Budget'; const over = l.pct >= 1;
      out.push({ id: `budget:${m}:${l.categoryId}:${over ? 'over' : 'warn'}`, type: 'budget', severity: over ? 'alert' : 'warning', title: `${nm} budget ${over ? 'exceeded' : `at ${Math.round(l.pct * 100)}%`}`, body: `${formatRM(l.spent)} of ${formatRM(l.allocated)} spent this month.`, link: '/budget' });
    }
  }
  if (p.lowBalance) { const bal = computeBalances(d.accounts, d.txns);
    for (const a of d.accounts) if (!a.deletedAt && a.status === 'active' && a.lowBalanceThreshold != null && a.type !== 'credit_card' && a.type !== 'loan' && (bal.get(a.id) ?? 0) < a.lowBalanceThreshold)
      out.push({ id: `low:${a.id}:${t}`, type: 'low_balance', severity: 'warning', title: `Low balance: ${a.name}`, body: `${formatRM(bal.get(a.id) ?? 0)} – below your alert level of ${formatRM(a.lowBalanceThreshold)}.`, link: '/accounts' }); }
  if (p.salary) {
    for (const s of d.salaries) if (!s.deletedAt && s.status === 'expected') { const days = daysBetween(t, s.expectedPayDate);
      if (days < 0) out.push({ id: `salary:late:${s.id}`, type: 'salary', severity: 'warning', title: `Salary for ${s.month} not confirmed`, body: `Expected ${formatRM(s.expectedNet)} on ${fmtDate(s.expectedPayDate)}. Confirm it when received.`, link: '/salary' });
      else if (days <= 1) out.push({ id: `salary:soon:${s.id}`, type: 'salary', severity: 'info', title: `Salary expected ${due(days)}`, body: `${formatRM(s.expectedNet)} expected on ${fmtDate(s.expectedPayDate)}.`, link: '/salary' }); }
    const np = nextPayday(addDays(t, -1), d.payDay);
    if (np === t && !d.salaries.some((s) => !s.deletedAt && s.month === t.slice(0, 7))) out.push({ id: `payday:${t}`, type: 'salary', severity: 'info', title: 'Payday today', body: 'Add or confirm this month’s salary record.', link: '/salary' });
  }
  if (p.tasks.enabled) for (const k of d.tasks) if (!k.deletedAt && k.status === 'pending' && k.dueDate) { const days = daysBetween(t, k.dueDate);
    if (days < 0) out.push({ id: `task:overdue:${k.id}`, type: 'task', severity: 'warning', title: `Task overdue: ${k.name}`, body: `Was due ${fmtDate(k.dueDate)}.`, link: '/tasks' });
    else if (days <= p.tasks.daysBefore) out.push({ id: `task:due:${k.id}`, type: 'task', severity: 'info', title: `Task due ${due(days)}: ${k.name}`, body: k.category, link: '/tasks' }); }
  if (p.receipts) { const n = d.receipts.filter((r) => !r.deletedAt && ['review', 'draft', 'duplicate', 'failed'].includes(r.status)).length;
    if (n) out.push({ id: `receipts:${t}`, type: 'receipt', severity: 'info', title: `${n} receipt(s) waiting for review`, body: 'Review and confirm them so your expenses are complete.', link: '/scan' }); }
  if (p.backup.enabled && d.firstUse && daysBetween(d.firstUse, t) >= 3) {
    const since = d.lastBackup ? daysBetween(d.lastBackup.slice(0, 10), t) : null;
    if (since == null || since >= p.backup.everyDays) out.push({ id: `backup:${t.slice(0, 7)}:${Math.floor(Number(t.slice(8)) / p.backup.everyDays)}`, type: 'backup', severity: 'warning', title: since == null ? 'You haven’t downloaded a backup yet' : `Last backup was ${since} days ago`, body: 'Your data lives in this browser. Download a backup to keep it safe.', link: '/backup' });
  }
  return out;
}

/** Merges computed reminders into stored ones: new → added, gone → resolved, dismissed stay dismissed. */
export function mergeNotifications(stored: AppNotification[], current: N[], now: string): { put: AppNotification[]; newOnes: AppNotification[] } {
  const byId = new Map(stored.map((s) => [s.id, s])); const curIds = new Set(current.map((c) => c.id));
  const put: AppNotification[] = [], newOnes: AppNotification[] = [];
  for (const c of current) {
    const s = byId.get(c.id);
    if (!s) { const n = { ...c, createdAt: now, readAt: null, dismissedAt: null, resolvedAt: null }; put.push(n); newOnes.push(n); }
    else if (s.resolvedAt || s.title !== c.title || s.body !== c.body) put.push({ ...s, ...c, resolvedAt: null });
  }
  for (const s of stored) if (!curIds.has(s.id) && !s.resolvedAt) put.push({ ...s, resolvedAt: now });
  return { put, newOnes };
}
