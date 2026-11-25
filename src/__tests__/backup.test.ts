import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { saveAccount, saveTransaction, blankTxn } from '@/db/repo';
import { exportAll, restore, validateBackup, listSnapshots, previewRestore } from '@/db/backup';
import { loadDemo, clearDemo } from '@/db/demo';

const acc = { name: 'B', type: 'bank' as const, openingBalance: 1000, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active' as const, lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true };

describe('backup & restore', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('round-trips via replace and preserves IDs', async () => {
    const a = await saveAccount(acc);
    const t = await saveTransaction({ ...blankTxn('expense'), amount: 100, accountId: a, categoryId: 'exp-food' });
    const file = JSON.parse(JSON.stringify(await exportAll()));
    expect(validateBackup(file).ok).toBe(true);
    await saveTransaction({ ...blankTxn('expense'), amount: 200, accountId: a, categoryId: 'exp-food' });
    await restore(validateBackup(file).file!, 'replace');
    const txns = await db.transactions.toArray();
    expect(txns.map((x) => x.id)).toEqual([t]);
    expect((await listSnapshots()).length).toBe(1); // safety snapshot taken
  });

  it('merge keeps newer local edits and adds missing', async () => {
    const a = await saveAccount(acc);
    const t = await saveTransaction({ ...blankTxn('expense'), amount: 100, accountId: a, categoryId: 'exp-food' });
    const file = await exportAll();
    const rec = (await db.transactions.get(t))!;
    await db.transactions.put({ ...rec, amount: 999, updatedAt: new Date(Date.now() + 5000).toISOString() });
    await db.transactions.delete(t); await db.transactions.put({ ...rec, amount: 999, updatedAt: new Date(Date.now() + 5000).toISOString() });
    const extra = { ...rec, id: 'new-one' }; file.data.transactions.push(extra);
    const prev = previewRestore(file, await exportAll(), 'merge').find((p) => p.table === 'transactions')!;
    expect(prev).toMatchObject({ add: 1, keep: 1 });
    await restore(file, 'merge');
    expect((await db.transactions.get(t))!.amount).toBe(999);
    expect(await db.transactions.get('new-one')).toBeTruthy();
  });

  it('rejects invalid backups', () => {
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup({ app: 'MyFinance', schemaVersion: 99, data: {} }).errors.join()).toMatch(/newer/);
    const bad = { app: 'MyFinance', schemaVersion: 1, data: { accounts: [], categories: [], settings: [], transactions: [{ id: 'x', amount: 1.5, date: '2026-01-01', accountId: 'missing' }] } };
    expect(validateBackup(bad).errors.length).toBe(2);
  });

  it('demo data loads and clears without touching user records', async () => {
    const a = await saveAccount(acc);
    await saveTransaction({ ...blankTxn('expense'), amount: 100, accountId: a, categoryId: 'exp-food' });
    await loadDemo();
    expect(await db.transactions.count()).toBeGreaterThan(50);
    await clearDemo();
    expect(await db.transactions.count()).toBe(1);
    expect(await db.accounts.count()).toBe(1);
  });
});
