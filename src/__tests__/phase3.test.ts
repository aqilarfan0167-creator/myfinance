import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { saveAccount, saveTransaction, blankTxn } from '@/db/repo';
import { setBudget, copyBudgets, saveGoal, addGoalEntry, deleteGoalEntry, saveTask, setTaskStatus, recordLiabilityCharge, suggestedInterest, type GoalInput } from '@/db/planningRepo';
import { reducingInstalment, flatInstalment, project, cardMinimumPayment } from '@/domain/loan';
import { budgetLevel, budgetLines, goalViews, reservedForGoals, simulate, nextTaskDate } from '@/domain/planning';
import { cardStatus, lastStatementDate, dueDateAfter } from '@/domain/cards';
import { computeBalances, computePosition, summarize } from '@/domain/ledger';

const A = (o = {}) => saveAccount({ name: 'Bank', type: 'bank', openingBalance: 1000000, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, ...o });
const goal = (o: Partial<GoalInput> = {}): GoalInput => ({ name: 'Emergency', type: 'emergency', target: 1000000, targetDate: '2027-11-25', startingAmount: 100000, monthlyContribution: 50000, linkedAccountId: null, priority: 1, status: 'active', color: '#9333ea', reserveMonthly: true, remarks: '', ...o });

describe('loan maths', () => {
  it('instalments & projections', () => {
    expect(reducingInstalment(10000000, 4, 360)).toBe(47742);          // RM100k, 4%, 30y ≈ RM477.42
    expect(flatInstalment(9000000, 3, 108)).toBe(105833);              // RM90k car, 3% flat, 9y ≈ RM1,058.33
    const base = project({ balance: 1000000, annualRatePct: 6, payment: 100000, rateType: 'reducing', startDate: '2026-12-01' });
    expect(base.feasible).toBe(true); expect(base.months).toBe(11); expect(base.rows.at(-1)!.balance).toBe(0);
    const extra = project({ balance: 1000000, annualRatePct: 6, payment: 100000, rateType: 'reducing', startDate: '2026-12-01', extraMonthly: 50000 });
    expect(extra.months).toBeLessThan(base.months); expect(extra.totalInterest).toBeLessThan(base.totalInterest);
    expect(project({ balance: 1000000, annualRatePct: 12, payment: 10000, rateType: 'reducing', startDate: '2026-12-01' }).feasible).toBe(false); // payment ≤ interest
    const flat = project({ balance: 300000, annualRatePct: 3, payment: 100000, rateType: 'flat', startDate: '2026-12-01' });
    expect(flat.months).toBe(3); expect(flat.totalInterest).toBe(0);
    expect(cardMinimumPayment(50000)).toBe(5000); expect(cardMinimumPayment(300000)).toBe(15000); expect(cardMinimumPayment(3000)).toBe(3000);
    expect(suggestedInterest(1200000, 5)).toBe(5000);
  });
  it('card statement dates', () => {
    expect(lastStatementDate('2026-11-25', 15)).toBe('2026-11-15');
    expect(lastStatementDate('2026-11-10', 15)).toBe('2026-10-15');
    expect(lastStatementDate('2026-03-02', 31)).toBe('2026-02-28');
    expect(dueDateAfter('2026-11-15', 5)).toBe('2026-12-05');
    expect(dueDateAfter('2026-11-05', 25)).toBe('2026-11-25');
  });
  it('budget levels', () => {
    expect(budgetLevel(69, 100)).toBe('ok'); expect(budgetLevel(70, 100)).toBe('warn'); expect(budgetLevel(99, 100)).toBe('warn'); expect(budgetLevel(100, 100)).toBe('over');
    expect(nextTaskDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('simulator never double counts and is pure', () => {
    const b = { income: 500000, expenses: 250000, commitments: 120000, debtPayments: 80000, savings: 50000, liquid: 2000000, months: 3 };
    const before = simulate(b, [], reducingInstalment);
    expect(before.cashFlow).toBe(500000 - 250000 - 80000);
    const after = simulate(b, [{ kind: 'salary', label: '', monthly: 50000 }, { kind: 'car', label: '', price: 9000000, downPayment: 900000, ratePct: 3, months: 108, running: 40000 }],
      (p, r, m, t) => (t === 'flat' ? flatInstalment(p, r, m) : reducingInstalment(p, r, m)));
    expect(after.income).toBe(550000); expect(after.debt).toBe(80000 + flatInstalment(8100000, 3, 108)); expect(after.oneOff).toBe(900000); expect(after.liquidAfter).toBe(1100000);
    expect(b.income).toBe(500000);
  });
});

describe('phase 3 flows', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('budgets: spent from ledger, copy is idempotent', async () => {
    const bank = await A();
    await setBudget('2026-11', 'exp-food', 50000);
    await setBudget('2026-11', 'exp-shopping', 10000);
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-05', amount: 40000, accountId: bank, categoryId: 'exp-food' });
    await saveTransaction({ ...blankTxn('refund'), date: '2026-11-06', amount: 5000, accountId: bank, categoryId: 'exp-food' });
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-07', amount: 12000, accountId: bank, categoryId: 'exp-shopping' });
    const s = summarize(await db.transactions.toArray(), await db.accounts.toArray(), { from: '2026-11-01', to: '2026-11-30' });
    const lines = budgetLines(await db.budgets.toArray(), s.byCategory, '2026-11');
    expect(lines.find((l) => l.categoryId === 'exp-food')).toMatchObject({ spent: 35000, remaining: 15000, level: 'warn' });
    expect(lines.find((l) => l.categoryId === 'exp-shopping')!.level).toBe('over');
    expect(await copyBudgets('2026-11', '2026-12')).toBe(2);
    expect(await copyBudgets('2026-11', '2026-12')).toBe(0);
    expect(await db.budgets.where('month').equals('2026-12').count()).toBe(2);
    await setBudget('2026-12', 'exp-food', null);
    expect(await db.budgets.where('month').equals('2026-12').count()).toBe(1);
  });

  it('goals: contributions create transfers (not expenses), reserve in allowance, delete removes transfer', async () => {
    const bank = await A(); const asb = await A({ name: 'ASB', type: 'savings', openingBalance: 0, includeInAvailable: false });
    const gid = await saveGoal(goal({ linkedAccountId: asb }));
    const e1 = await addGoalEntry(gid, { date: '2026-11-20', amount: 30000, accountId: bank, note: '' });
    await addGoalEntry(gid, { date: '2026-11-21', amount: -10000, accountId: null, note: 'emergency' });
    const txns = await db.transactions.toArray();
    expect(txns).toHaveLength(1); expect(txns[0].type).toBe('transfer');
    const s = summarize(txns, await db.accounts.toArray(), { from: '2026-11-01', to: '2026-11-30' });
    expect(s.expenses).toBe(0); expect(s.savingsTransfers).toBe(30000);
    let v = goalViews(await db.goals.toArray(), await db.goalEntries.toArray(), '2026-11-25')[0];
    expect(v.saved).toBe(100000 + 30000 - 10000); expect(v.thisMonth).toBe(30000);
    expect(v.requiredMonthly).toBe(Math.ceil((1000000 - 120000) / 12));
    const r = reservedForGoals([v], await db.accounts.toArray());
    expect(r.held).toBe(0); expect(r.monthly).toBe(20000);              // ASB not in available; 500−300 still to set aside
    await deleteGoalEntry(e1);
    expect((await db.transactions.toArray())[0].deletedAt).toBeTruthy();
    v = goalViews(await db.goals.toArray(), await db.goalEntries.toArray(), '2026-11-25')[0];
    expect(v.saved).toBe(90000);
    // goal money kept in a spendable account is reserved
    const g2 = await saveGoal(goal({ name: 'Travel', linkedAccountId: bank, startingAmount: 70000, reserveMonthly: false }));
    const v2 = goalViews(await db.goals.toArray(), await db.goalEntries.toArray(), '2026-11-25').find((x) => x.id === g2)!;
    expect(reservedForGoals([v2], await db.accounts.toArray()).held).toBe(70000);
  });

  it('loans & cards: charges are expenses, repayments settle liabilities, cash flow not double counted', async () => {
    const bank = await A();
    const loan = await A({ name: 'Car loan', type: 'loan', openingBalance: -5000000, includeInAvailable: false, loan: { lender: 'Maybank', loanType: 'car', originalAmount: 8000000, annualRate: 3, rateType: 'reducing', instalment: 100000, targetDate: null } });
    const cc = await A({ name: 'Visa', type: 'credit_card', openingBalance: 0, includeInAvailable: false, creditLimit: 500000, statementDay: 15, dueDay: 5 });
    await recordLiabilityCharge(loan, { amount: 12500, date: '2026-11-01' });
    await saveTransaction({ ...blankTxn('debt_repayment'), date: '2026-11-02', amount: 100000, accountId: bank, toAccountId: loan });
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-10', amount: 60000, accountId: cc, categoryId: 'exp-shopping' });
    await recordLiabilityCharge(cc, { amount: 1000, date: '2026-11-12', name: 'Late fee' });
    await saveTransaction({ ...blankTxn('debt_repayment'), date: '2026-11-20', amount: 20000, accountId: bank, toAccountId: cc });
    const [accs, txns] = [await db.accounts.toArray(), await db.transactions.toArray()];
    const bal = computeBalances(accs, txns);
    expect(bal.get(loan)).toBe(-5000000 - 12500 + 100000);
    expect(bal.get(cc)).toBe(-60000 - 1000 + 20000);
    const pos = computePosition(accs, bal);
    expect(pos.loanDebt).toBe(4912500); expect(pos.creditDebt).toBe(41000);
    expect(pos.total).toBe(bal.get(bank)); expect(pos.available).toBe(bal.get(bank));
    expect(pos.netWorth).toBe(bal.get(bank)! - 4912500 - 41000);
    const s = summarize(txns, accs, { from: '2026-11-01', to: '2026-11-30' });
    expect(s.expenses).toBe(12500 + 60000 + 1000);
    expect(s.debtRepayments).toBe(100000); expect(s.cardRepayments).toBe(20000); expect(s.loanCharges).toBe(12500);
    expect(s.cashFlow).toBe(0 - 73500 - 100000 + 12500);          // = −(card spend & fee) − loan instalment
    const st = cardStatus(accs.find((a) => a.id === cc)!, accs, txns, '2026-11-25');
    expect(st).toMatchObject({ statementDate: '2026-11-15', dueDate: '2026-12-05', statementBalance: 61000, paidSinceStatement: 20000, remainingDue: 41000, used: 41000, available: 459000 });
    expect(st.minimumDue).toBe(0);                                  // min 5000 already covered by 20000 payment
  });

  it('recurring tasks create the next one exactly once', async () => {
    const id = await saveTask({ name: 'Pay road tax', category: 'Vehicle', dueDate: '2026-11-30', priority: 'high', recurrence: 'yearly', status: 'pending', remarks: '' });
    await setTaskStatus(id, 'done'); await setTaskStatus(id, 'pending'); await setTaskStatus(id, 'done');
    const all = await db.tasks.toArray();
    expect(all).toHaveLength(2); expect(all.find((t) => t.id !== id)!.dueDate).toBe('2027-11-30');
  });
});
