import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { saveAccount, saveTransaction, blankTxn, deleteTransaction } from '@/db/repo';
import { saveCommitment, generateOccurrences, payOccurrence, linkTransaction, saveRule, generateRecurring, recTxnId, updateOccurrence } from '@/db/commitmentRepo';
import { saveSalary, confirmSalaryReceived, saveOT, salaryTxnId, type SalaryInput } from '@/db/salaryRepo';
import { scheduleDates } from '@/domain/schedule';
import { otHours, hourlyRate, otAmount, estimateEPF, estimateSOCSO, estimateEIS, salaryTotals } from '@/domain/salary';
import { buildOccViews, unpaidLiquidCommitments } from '@/domain/commitments';
import { computeBalances, summarize } from '@/domain/ledger';
import { validateBackup, exportAll } from '@/db/backup';

const A = (o = {}) => saveAccount({ name: 'Bank', type: 'bank', openingBalance: 500000, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, ...o });
const salary = (o: Partial<SalaryInput> = {}): SalaryInput => ({ month: '2026-11', company: 'ABC', basic: 300000, allowances: [{ name: 'Travel', amount: 20000 }], bonus: 0, claims: 5000, incentives: 0, otAuto: true, ot: 0, epf: 35200, socso: 1625, eis: 650, pcb: 0, unpaidLeave: 0, otherDeductions: [], actualNet: null, expectedPayDate: '2026-11-25', paymentDate: null, accountId: null, remarks: '', attachmentIds: [], ...o });

describe('schedule & salary maths', () => {
  it('schedules without month-end drift', () => {
    expect(scheduleDates('2026-01-31', null, 'monthly', '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(scheduleDates('2026-01-01', '2026-01-20', 'weekly', '2026-01-05', '2026-12-31')).toEqual(['2026-01-08', '2026-01-15']);
    expect(scheduleDates('2026-02-15', null, 'quarterly', '2026-01-01', '2026-12-31')).toEqual(['2026-02-15', '2026-05-15', '2026-08-15', '2026-11-15']);
  });
  it('OT hours, rates and statutory estimates', () => {
    expect(otHours('18:00', '21:30', 30)).toBe(3);
    expect(otHours('22:00', '02:00')).toBe(4); // overnight
    const rate = hourlyRate({ basic: 260000, hourlyRateOverride: null, workDaysPerMonth: 26, hoursPerDay: 8 });
    expect(rate).toBe(1250);
    expect(otAmount(3, rate, 1.5)).toBe(5625);
    expect(estimateEPF(300000)).toBe(33000);        // 11% × 3,000 = 330
    expect(estimateEPF(301000)).toBe(33300);        // band upper 3,020 → 332.20 → 333
    expect(estimateEPF(800000)).toBe(88000);
    expect(estimateSOCSO(305000)).toBe(1525);       // band 3,000.01–3,100 → RM15.25
    expect(estimateEIS(305000)).toBe(610);          // RM6.10
    expect(estimateSOCSO(1000000)).toBe(2975);      // capped at RM6,000 band → RM29.75
    expect(estimateEIS(1000000)).toBe(1190);
    const t = salaryTotals({ basic: 300000, allowances: [{ name: 'x', amount: 10000 }], bonus: 0, claims: 0, incentives: 0, ot: 5000, epf: 33000, socso: 1500, eis: 600, pcb: 1000, unpaidLeave: 0, otherDeductions: [{ name: 'loan', amount: 500 }] });
    expect(t).toEqual({ gross: 315000, totalDeductions: 36600, expectedNet: 278400 });
  });
});

describe('phase 2 flows', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('salary: expected income → confirm received exactly once, OT synced', async () => {
    const bank = await A();
    await saveOT({ date: '2026-11-03', start: '18:00', end: '21:00', breakMinutes: 0, dayType: 'normal', multiplier: 1.5, hourlyRate: 1250, reason: '', approval: 'approved', payment: 'unpaid', salaryMonth: '2026-11' });
    const id = await saveSalary(salary());
    let r = (await db.salaries.get(id))!;
    expect(r.ot).toBe(5625);
    expect(r.gross).toBe(300000 + 20000 + 5000 + 5625);
    expect((await db.transactions.get(salaryTxnId(id)))!.status).toBe('expected');
    // adding OT updates the expected salary automatically
    await saveOT({ date: '2026-11-04', start: '18:00', end: '20:00', breakMinutes: 0, dayType: 'rest', multiplier: 2, hourlyRate: 1250, reason: '', approval: 'pending', payment: 'unpaid', salaryMonth: '2026-11' });
    r = (await db.salaries.get(id))!; expect(r.ot).toBe(5625 + 5000);
    await expect(saveSalary(salary())).rejects.toThrow(/already exists/);
    await confirmSalaryReceived(id, { actualNet: 290000, date: '2026-11-25', accountId: bank });
    await confirmSalaryReceived(id, { actualNet: 291000, date: '2026-11-25', accountId: bank }); // re-confirm: no duplicate
    const inc = (await db.transactions.toArray()).filter((t) => t.type === 'income');
    expect(inc).toHaveLength(1); expect(inc[0].amount).toBe(291000); expect(inc[0].status).toBe('actual');
    expect((await db.otEntries.toArray()).every((o) => o.payment === 'paid')).toBe(true);
    const bal = computeBalances(await db.accounts.toArray(), await db.transactions.toArray());
    expect(bal.get(bank)).toBe(500000 + 291000);
  });

  it('commitments: idempotent generation, pay, partial, link, delete payment → unpaid', async () => {
    const bank = await A();
    const cid = await saveCommitment({ name: 'Rent', kind: 'expense', categoryId: 'exp-rental', amount: 90000, startDate: '2026-10-01', endDate: null, frequency: 'monthly', accountId: bank, toAccountId: null, active: true, remarks: '', trackFrom: '2026-10-01' });
    await generateOccurrences('2026-11-25'); await generateOccurrences('2026-11-25');
    const occ = await db.occurrences.where('commitmentId').equals(cid).toArray();
    expect(new Set(occ.map((o) => o.id)).size).toBe(occ.length);
    expect(occ.map((o) => o.dueDate).slice(0, 3)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
    const views = async () => buildOccViews(await db.occurrences.toArray(), await db.commitments.toArray(), await db.transactions.toArray(), '2026-11-25');
    expect((await views())[0].status).toBe('overdue');
    expect((await views())[2].status).toBe('pending');
    expect((await views())[3].status).toBe('upcoming');
    // partial then full
    const p1 = await payOccurrence(`${cid}:2026-10-01`, { amount: 40000, date: '2026-10-02', accountId: bank });
    expect((await views())[0].status).toBe('partial');
    await payOccurrence(`${cid}:2026-10-01`, { amount: 50000, date: '2026-10-03', accountId: bank });
    expect((await views())[0].status).toBe('paid');
    // link an existing transaction to November
    const t = await saveTransaction({ ...blankTxn('expense'), date: '2026-11-01', amount: 90000, accountId: bank, categoryId: 'exp-rental' });
    await linkTransaction(`${cid}:2026-11-01`, t);
    expect((await views())[1].status).toBe('paid');
    // ledger: 3 expenses, rent counted once each
    const s = summarize(await db.transactions.toArray(), await db.accounts.toArray(), { from: '2026-10-01', to: '2026-11-30' });
    expect(s.expenses).toBe(180000);
    // deleting a payment makes it unpaid again
    await deleteTransaction(p1);
    expect((await views())[0].status).toBe('partial');
    // allowance deduction counts only unpaid liquid items due before payday
    expect(unpaidLiquidCommitments(await views(), await db.accounts.toArray(), '2026-12-25')).toBe(40000 + 90000);
    // amount change syncs unpaid future occurrences only; skip works
    await saveCommitment({ name: 'Rent', kind: 'expense', categoryId: 'exp-rental', amount: 95000, startDate: '2026-10-01', endDate: null, frequency: 'monthly', accountId: bank, toAccountId: null, active: true, remarks: '' }, cid);
    await generateOccurrences('2026-11-25');
    const v = await views();
    expect(v.find((x) => x.dueDate === '2026-12-01')!.amount).toBe(95000);
    expect(v.find((x) => x.dueDate === '2026-10-01')!.amount).toBe(90000);
    await updateOccurrence(`${cid}:2026-12-01`, { skipped: true });
    expect((await views()).find((x) => x.dueDate === '2026-12-01')!.status).toBe('skipped');
  });

  it('card commitment pays as debt repayment (not expense)', async () => {
    const bank = await A(); const cc = await A({ name: 'CC', type: 'credit_card', openingBalance: -100000, includeInAvailable: false });
    const cid = await saveCommitment({ name: 'Card bill', kind: 'debt', categoryId: null, amount: 100000, startDate: '2026-11-05', endDate: null, frequency: 'monthly', accountId: bank, toAccountId: cc, active: true, remarks: '', trackFrom: '2026-11-01' });
    await payOccurrence(`${cid}:2026-11-05`, { amount: 100000, date: '2026-11-05', accountId: bank });
    const s = summarize(await db.transactions.toArray(), await db.accounts.toArray(), { from: '2026-11-01', to: '2026-11-30' });
    expect(s.expenses).toBe(0); expect(s.cardRepayments).toBe(100000);
    expect(computeBalances(await db.accounts.toArray(), await db.transactions.toArray()).get(cc)).toBe(0);
  });

  it('recurring: idempotent, auto-post, deleted not recreated', async () => {
    const bank = await A();
    const rid = await saveRule({ name: 'Netflix', template: { type: 'expense', amount: 5500, fee: 0, categoryId: 'exp-subscriptions', accountId: bank, toAccountId: null, merchant: 'Netflix', paymentMethod: 'credit_card', needWant: 'want', remarks: '' }, frequency: 'monthly', startDate: '2026-09-10', endDate: null, autoPost: true, active: true });
    await generateRecurring('2026-11-25'); await generateRecurring('2026-11-25');
    const all = await db.transactions.where('recurringId').equals(rid).toArray();
    expect(all.map((t) => `${t.date}:${t.status}`).sort()).toEqual(['2026-09-10:actual', '2026-10-10:actual', '2026-11-10:actual', '2026-12-10:expected']);
    await deleteTransaction(recTxnId(rid, '2026-10-10'));
    await generateRecurring('2026-11-25');
    expect((await db.transactions.get(recTxnId(rid, '2026-10-10')))!.deletedAt).toBeTruthy();
    await generateRecurring('2026-12-11');
    expect((await db.transactions.get(recTxnId(rid, '2026-12-10')))!.status).toBe('actual');
  });

  it('v1 backups migrate to v2', async () => {
    const f = await exportAll();
    const v1 = { ...f, schemaVersion: 1, data: { accounts: f.data.accounts, transactions: f.data.transactions, categories: f.data.categories, settings: f.data.settings.map(({ salaryProfile: _s, ...r }) => r) } };
    const v = validateBackup(JSON.parse(JSON.stringify(v1)));
    expect(v.ok).toBe(true);
    expect(v.file!.data.commitments).toEqual([]);
    expect(v.file!.data.settings[0].salaryProfile.multipliers.normal).toBe(1.5);
  });
});
