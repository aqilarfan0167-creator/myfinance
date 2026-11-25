import Dexie, { type Table } from 'dexie';
import type { Account, Transaction, Category, Settings, AuditEntry, Meta } from './types';
import { defaultCategories } from './seed';

export const APP_VERSION = '0.1.0';
/**
 * Schema history. NEVER edit or remove a past version; only append new ones.
 * Dexie upgrades are non-destructive: existing rows are preserved.
 */
export const SCHEMA_VERSION = 1;

export class MyFinanceDB extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  settings!: Table<Settings, string>;
  audit!: Table<AuditEntry, string>;
  meta!: Table<Meta, string>;

  constructor(name = 'myfinance') {
    super(name);
    this.version(1).stores({
      accounts: 'id, type, status, updatedAt',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, status, merchant, updatedAt, recurringId',
      categories: 'id, kind, name',
      settings: 'id',
      audit: 'id, at, entity, entityId',
      meta: 'key',
    });
    this.on('populate', async (tx) => {
      await tx.table('categories').bulkAdd(defaultCategories());
      await tx.table('settings').add(defaultSettings());
      await tx.table('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    });
  }
}

export const defaultSettings = (): Settings => ({
  id: 'app', language: 'en', theme: 'system', payDay: 25, demoLoaded: false, merchantCategory: {},
});

export const db = new MyFinanceDB();

/** Ask the browser not to evict our data. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
