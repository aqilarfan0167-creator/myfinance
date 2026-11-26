import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { MyFinanceDB } from '@/db/db';
import { snapshotBeforeUpgrade, listPreUpgradeSnapshots } from '@/db/preUpgrade';

describe('IndexedDB schema migration', () => {
  it('upgrades a v1 database to the latest schema without losing data', async () => {
    const name = 'mig-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ accounts: 'id, type, status, updatedAt', transactions: 'id, date, type, accountId, toAccountId, categoryId, status, merchant, updatedAt, recurringId', categories: 'id, kind, name', settings: 'id', audit: 'id, at, entity, entityId', meta: 'key' });
    await v1.open();
    await v1.table('accounts').add({ id: 'a1', name: 'Old bank', openingBalance: 12345 });
    await v1.table('transactions').add({ id: 't1', date: '2026-01-01', amount: 999 });
    await v1.table('settings').add({ id: 'app', language: 'ms', theme: 'dark', payDay: 28, demoLoaded: false, merchantCategory: { tesco: 'exp-groceries' } });
    v1.close();
    const snap = await snapshotBeforeUpgrade(name);
    expect(snap).toMatchObject({ fromVersion: 1, toVersion: 6 });
    expect((snap!.stores.transactions as { amount: number }[])[0].amount).toBe(999);
    expect((await listPreUpgradeSnapshots())[0].fromVersion).toBe(1);

    const v2 = new MyFinanceDB(name);
    await v2.open();
    expect(v2.verno).toBe(6);
    expect((await v2.settings.get('app'))!.notificationPrefs.payments.enabled).toBe(true);
    expect(await v2.goals.count()).toBe(0);
    expect((await v2.accounts.get('a1'))!.openingBalance).toBe(12345);
    expect((await v2.transactions.get('t1'))!.amount).toBe(999);
    const s = (await v2.settings.get('app'))!;
    expect(s.language).toBe('ms'); expect(s.payDay).toBe(28); expect(s.merchantCategory.tesco).toBe('exp-groceries');
    expect(s.salaryProfile.multipliers.public_holiday).toBe(3);
    expect(await v2.salaries.count()).toBe(0);
    v2.close();
    expect(await snapshotBeforeUpgrade(name)).toBeNull(); // already current – no snapshot
  });
});
