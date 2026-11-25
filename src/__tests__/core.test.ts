import { describe, it, expect, beforeEach } from 'vitest';
import { parseRM, formatRM } from '@/lib/money';
import { parseDMY, nextPayday, fmtDate, addMonths } from '@/lib/date';
import { computeBalances, computePosition, summarize, dailyAllowance } from '@/domain/ledger';
import { db } from '@/db/db';
import { saveAccount, saveTransaction, deleteTransaction, blankTxn, reconcileAccount, confirmExpected, findDuplicates, deleteAccount } from '@/db/repo';
import type { AccountInput } from '@/db/repo';

const acc = (o: Partial<AccountInput>): AccountInput => ({ name: 'A', type: 'bank', openingBalance: 0, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, ...o });

describe('money & dates', () => {
  it('parses RM without float errors', () => {
    expect(parseRM('0.1')).toBe(10); expect(parseRM('1,234.56')).toBe(123456); expect(parseRM('RM 12.3')).toBe(1230);
    expect(parseRM('abc')).toBeNull(); expect(parseRM('1.234')).toBeNull(); expect(parseRM('-5')).toBe(-500);
    expect(formatRM(123456)).toBe('RM 1,234.56'); expect(formatRM(-5)).toBe('-RM 0.05');
  });
  it('handles DD/MM/YYYY and paydays', () => {
    expect(parseDMY('31/12/2026')).toBe('2026-12-31'); expect(parseDMY('31/02/2026')).toBeNull();
    expect(fmtDate('2026-11-05')).toBe('05/11/2026');
    expect(nextPayday('2026-11-24', 25)).toBe('2026-11-25');
    expect(nextPayday('2026-11-25', 25)).toBe('2026-12-25');
    expect(nextPayday('2026-11-26', 25)).toBe('2026-12-25');
    expect(nextPayday('2026-02-10', 31)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('ledger', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('computes balances, transfers, card repayment and summaries correctly', async () => {
    const bank = await saveAccount(acc({ name: 'Maybank', openingBalance: 100000 }));
    const sav = await saveAccount(acc({ name: 'ASB', type: 'savings', includeInAvailable: false }));
    const cc = await saveAccount(acc({ name: 'CC', type: 'credit_card', openingBalance: -20000, includeInAvailable: false, creditLimit: 500000 }));
    await saveTransaction({ ...blankTxn('income'), date: '2026-11-01', amount: 500000, accountId: bank, categoryId: 'inc-salary' });
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-02', amount: 1550, accountId: bank, categoryId: 'exp-food', needWant: 'need', merchant: 'Mamak' });
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-03', amount: 30000, accountId: cc, categoryId: 'exp-shopping', needWant: 'want' });
    await saveTransaction({ ...blankTxn('transfer'), date: '2026-11-04', amount: 100000, fee: 50, accountId: bank, toAccountId: sav });
    await saveTransaction({ ...blankTxn('debt_repayment'), date: '2026-11-05', amount: 20000, accountId: bank, toAccountId: cc });
    await saveTransaction({ ...blankTxn('refund'), date: '2026-11-06', amount: 550, accountId: bank, categoryId: 'exp-food', needWant: 'need' });
    const del = await saveTransaction({ ...blankTxn('expense'), date: '2026-11-06', amount: 99999, accountId: bank, categoryId: 'exp-food' });
    await deleteTransaction(del);
    await saveTransaction({ ...blankTxn('income'), date: '2026-11-30', amount: 1, accountId: bank, categoryId: 'inc-salary', status: 'expected' });

    const [accs, txns] = [await db.accounts.toArray(), await db.transactions.toArray()];
    const bal = computeBalances(accs, txns);
    expect(bal.get(bank)).toBe(100000 + 500000 - 1550 - 100050 - 20000 + 550);
    expect(bal.get(sav)).toBe(100000);
    expect(bal.get(cc)).toBe(-20000 - 30000 + 20000);
    const pos = computePosition(accs, bal);
    expect(pos.creditDebt).toBe(30000);
    expect(pos.available).toBe(bal.get(bank));
    expect(pos.netWorth).toBe(bal.get(bank)! + 100000 - 30000);

    const s = summarize(txns, accs, { from: '2026-11-01', to: '2026-11-30' });
    expect(s.income).toBe(500000);               // transfers not income
    expect(s.expenses).toBe(31550);
    expect(s.fees).toBe(50);
    expect(s.netExpenses).toBe(31550 + 50 - 550);
    expect(s.cardRepayments).toBe(20000);        // not counted as expense again
    expect(s.cashFlow).toBe(500000 - 31050);
    expect(s.savingsTransfers).toBe(100000);
    expect(s.expectedIncome).toBe(1);
    expect(s.needs).toBe(1550 + 50 - 550); expect(s.wants).toBe(30000);
  });

  it('ignores transactions dated before account opening date', async () => {
    const a = await saveAccount(acc({ openingBalance: 1000, openingDate: '2026-11-10' }));
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-09', amount: 500, accountId: a, categoryId: 'exp-food' });
    expect(computeBalances(await db.accounts.toArray(), await db.transactions.toArray()).get(a)).toBe(1000);
  });

  it('editing a transaction updates balances; reconciliation adjusts', async () => {
    const a = await saveAccount(acc({ openingBalance: 10000 }));
    const id = await saveTransaction({ ...blankTxn('expense'), amount: 1000, accountId: a, categoryId: 'exp-food' });
    const t = (await db.transactions.get(id))!;
    await saveTransaction({ ...t, amount: 2500 }, id);
    const bal = () => db.accounts.toArray().then(async (x) => computeBalances(x, await db.transactions.toArray()).get(a));
    expect(await bal()).toBe(7500);
    await reconcileAccount(a, 7000);
    expect(await bal()).toBe(7000);
    expect(await db.transactions.count()).toBe(2);
    await expect(deleteAccount(a)).rejects.toThrow(/Archive/);
  });

  it('confirming expected income does not duplicate', async () => {
    const a = await saveAccount(acc({}));
    const id = await saveTransaction({ ...blankTxn('income'), amount: 300000, accountId: null, categoryId: 'inc-salary', status: 'expected' });
    await confirmExpected(id, a, '2026-11-25', 299000);
    const all = await db.transactions.toArray();
    expect(all).toHaveLength(1);
    expect(computeBalances(await db.accounts.toArray(), all).get(a)).toBe(299000);
  });

  it('validation and duplicates', async () => {
    const a = await saveAccount(acc({}));
    await expect(saveTransaction({ ...blankTxn('transfer'), amount: 100, accountId: a, toAccountId: a })).rejects.toThrow(/differ/);
    await expect(saveTransaction({ ...blankTxn('expense'), amount: 0, accountId: a, categoryId: 'exp-food' })).rejects.toThrow();
    const t = { ...blankTxn('expense'), date: '2026-11-10', amount: 1234, accountId: a, categoryId: 'exp-food', merchant: 'Tesco' };
    await saveTransaction(t);
    expect(await findDuplicates({ ...t, date: '2026-11-11' })).toHaveLength(1);
    expect(await findDuplicates({ ...t, amount: 1235 })).toHaveLength(0);
  });

  it('daily allowance', () => {
    const r = dailyAllowance({ available: 100000, today: '2026-11-15', payDay: 25, unpaidCommitments: 30000 });
    expect(r.daysLeft).toBe(10); expect(r.perDay).toBe(7000); expect(r.insufficient).toBe(false);
    expect(dailyAllowance({ available: 100, today: '2026-11-15', payDay: 25, unpaidCommitments: 300 }).insufficient).toBe(true);
  });
});
