import { db } from './db';
import type { Goal, GoalEntry, Task } from './types';
import { blankTxn, deleteTransaction, saveTransaction, ValidationError } from './repo';
import { uid } from '@/lib/cn';
import { todayKL } from '@/lib/date';
import { budgetId, nextTaskDate } from '@/domain/planning';

const now = () => new Date().toISOString();
const audit = (entity: string, entityId: string, action: 'create' | 'update' | 'delete', before?: unknown, after?: unknown) =>
  db.audit.add({ id: uid(), at: now(), entity, entityId, action, before, after });
const isDate = (s: string | null | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ---------------- Budgets ---------------- */
export async function setBudget(month: string, categoryId: string, amount: number | null) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError(['Invalid month.']);
  if (amount != null && (!Number.isInteger(amount) || amount < 0)) throw new ValidationError(['Budget must be zero or more.']);
  const id = budgetId(month, categoryId);
  await db.transaction('rw', db.budgets, db.audit, async () => {
    const before = await db.budgets.get(id);
    if (amount == null) { if (before) { await db.budgets.delete(id); await audit('budget', id, 'delete', before); } return; }
    const after = { id, month, categoryId, amount, createdAt: before?.createdAt ?? now(), updatedAt: now() };
    await db.budgets.put(after); await audit('budget', id, before ? 'update' : 'create', before, after);
  });
}
/** Copies budgets; existing ones are kept unless overwrite. Deterministic IDs make it safe to run twice. */
export async function copyBudgets(from: string, to: string, overwrite = false): Promise<number> {
  return db.transaction('rw', db.budgets, db.audit, async () => {
    const src = await db.budgets.where('month').equals(from).toArray();
    let n = 0;
    for (const b of src) {
      const id = budgetId(to, b.categoryId);
      if (!overwrite && (await db.budgets.get(id))) continue;
      await db.budgets.put({ id, month: to, categoryId: b.categoryId, amount: b.amount, createdAt: now(), updatedAt: now() }); n++;
    }
    await audit('budget', to, 'create', undefined, { copiedFrom: from, count: n });
    return n;
  });
}

/* ---------------- Goals ---------------- */
export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export async function saveGoal(g: GoalInput, id?: string): Promise<string> {
  const e: string[] = [];
  if (!g.name.trim()) e.push('Goal name is required.');
  if (!Number.isInteger(g.target) || g.target <= 0) e.push('Target amount must be more than zero.');
  if (g.startingAmount < 0 || g.monthlyContribution < 0) e.push('Amounts cannot be negative.');
  if (g.targetDate && !isDate(g.targetDate)) e.push('Invalid target date.');
  if (e.length) throw new ValidationError(e);
  return db.transaction('rw', db.goals, db.audit, async () => {
    if (id) { const before = await db.goals.get(id); if (!before) throw new Error('Goal not found'); const after = { ...before, ...g, updatedAt: now() }; await db.goals.put(after); await audit('goal', id, 'update', before, after); return id; }
    const rec: Goal = { ...g, name: g.name.trim(), id: uid(), createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.goals.add(rec); await audit('goal', rec.id, 'create', undefined, rec); return rec.id;
  });
}
export async function deleteGoal(id: string) {
  await db.transaction('rw', db.goals, db.audit, async () => { const b = await db.goals.get(id); await db.goals.update(id, { deletedAt: now(), updatedAt: now() }); await audit('goal', id, 'delete', b); });
}

/**
 * Contribution (+) or withdrawal (−). If an account is given and differs from the goal's linked account,
 * a real internal transfer is recorded (never an expense). Entry and transfer are saved atomically.
 */
export async function addGoalEntry(goalId: string, p: { date: string; amount: number; accountId: string | null; note: string }): Promise<string> {
  if (!Number.isInteger(p.amount) || p.amount === 0) throw new ValidationError(['Amount must not be zero.']);
  if (!isDate(p.date)) throw new ValidationError(['Date is required.']);
  return db.transaction('rw', [db.goals, db.goalEntries, db.transactions, db.audit, db.settings], async () => {
    const g = await db.goals.get(goalId); if (!g || g.deletedAt) throw new Error('Goal not found');
    let txnId: string | null = null;
    if (p.accountId && g.linkedAccountId && p.accountId !== g.linkedAccountId) {
      const contribution = p.amount > 0;
      txnId = await saveTransaction({ ...blankTxn('transfer'), date: p.date, amount: Math.abs(p.amount), name: `${contribution ? 'Savings' : 'Withdrawal'}: ${g.name}`,
        accountId: contribution ? p.accountId : g.linkedAccountId, toAccountId: contribution ? g.linkedAccountId : p.accountId, remarks: p.note, related: [{ kind: 'goal', id: goalId }] });
    }
    const rec: GoalEntry = { id: uid(), goalId, date: p.date, amount: p.amount, txnId, note: p.note.trim(), createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.goalEntries.add(rec); await audit('goalEntry', rec.id, 'create', undefined, rec);
    return rec.id;
  });
}
export async function deleteGoalEntry(id: string) {
  await db.transaction('rw', db.goalEntries, db.transactions, db.audit, async () => {
    const e = await db.goalEntries.get(id); if (!e) return;
    await db.goalEntries.update(id, { deletedAt: now(), updatedAt: now() }); await audit('goalEntry', id, 'delete', e);
    if (e.txnId) await deleteTransaction(e.txnId);
  });
}

/* ---------------- Tasks ---------------- */
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'seriesId' | 'completedAt'>;
export async function saveTask(t: TaskInput, id?: string): Promise<string> {
  if (!t.name.trim()) throw new ValidationError(['Task name is required.']);
  if (t.dueDate && !isDate(t.dueDate)) throw new ValidationError(['Invalid due date.']);
  if (t.recurrence !== 'none' && !t.dueDate) throw new ValidationError(['Recurring tasks need a due date.']);
  return db.transaction('rw', db.tasks, db.audit, async () => {
    if (id) { const before = await db.tasks.get(id); if (!before) throw new Error('Task not found'); const after = { ...before, ...t, name: t.name.trim(), updatedAt: now() }; await db.tasks.put(after); await audit('task', id, 'update', before, after); return id; }
    const nid = uid();
    const rec: Task = { ...t, name: t.name.trim(), id: nid, seriesId: nid, completedAt: null, createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.tasks.add(rec); await audit('task', nid, 'create', undefined, rec); return nid;
  });
}
/** Completing a recurring task creates the next one once (deterministic ID `${seriesId}:${nextDue}`). */
export async function setTaskStatus(id: string, status: Task['status']) {
  await db.transaction('rw', db.tasks, db.audit, async () => {
    const t = await db.tasks.get(id); if (!t) return;
    await db.tasks.put({ ...t, status, completedAt: status === 'done' ? now() : null, updatedAt: now() });
    await audit('task', id, 'update', t, { status });
    if (status === 'done' && t.recurrence !== 'none' && t.dueDate) {
      const nd = nextTaskDate(t.dueDate, t.recurrence)!; const nid = `${t.seriesId}:${nd}`;
      if (!(await db.tasks.get(nid))) await db.tasks.add({ ...t, id: nid, dueDate: nd, status: 'pending', completedAt: null, createdAt: now(), updatedAt: now(), deletedAt: null });
    }
  });
}
export async function deleteTask(id: string) {
  await db.transaction('rw', db.tasks, db.audit, async () => { const b = await db.tasks.get(id); await db.tasks.update(id, { deletedAt: now(), updatedAt: now() }); await audit('task', id, 'delete', b); });
}

/* ---------------- Loans & cards ---------------- */
/** Interest, late fees or charges added to a loan/credit-card balance – recorded as an expense on that account. */
export async function recordLiabilityCharge(accountId: string, p: { amount: number; date?: string; name?: string; remarks?: string }) {
  return saveTransaction({ ...blankTxn('expense'), date: p.date ?? todayKL(), amount: p.amount, accountId, categoryId: 'exp-loan', needWant: 'need',
    name: p.name || 'Interest / charges', remarks: p.remarks ?? '', related: [{ kind: 'liability_charge', id: accountId }] });
}
/** Suggested monthly interest for reducing-balance loans: balance × rate ÷ 12. */
export const suggestedInterest = (balance: number, ratePct: number) => Math.round((Math.max(0, balance) * ratePct) / 100 / 12);
