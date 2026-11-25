import Dexie, { type Table } from 'dexie';
import type { Account, Transaction, Category, Settings, AuditEntry, Meta, SalaryRecord, OTEntry, Commitment, Occurrence, RecurringRule, SalaryProfile, Budget, Goal, GoalEntry, Task } from './types';
import { defaultCategories } from './seed';

export const APP_VERSION = '0.3.0';
/**
 * Schema history. NEVER edit or remove a past version; only append new ones.
 * Dexie upgrades are non-destructive: existing rows are preserved.
 */
export const SCHEMA_VERSION = 3;

export class MyFinanceDB extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  settings!: Table<Settings, string>;
  audit!: Table<AuditEntry, string>;
  meta!: Table<Meta, string>;
  salaries!: Table<SalaryRecord, string>;
  otEntries!: Table<OTEntry, string>;
  commitments!: Table<Commitment, string>;
  occurrences!: Table<Occurrence, string>;
  recurring!: Table<RecurringRule, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  goalEntries!: Table<GoalEntry, string>;
  tasks!: Table<Task, string>;

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
    // v2 (Phase 2): additive only – existing data untouched.
    this.version(2).stores({
      salaries: 'id, month, status, updatedAt',
      otEntries: 'id, date, salaryMonth, updatedAt',
      commitments: 'id, active, updatedAt',
      occurrences: 'id, commitmentId, dueDate',
      recurring: 'id, active, updatedAt',
    }).upgrade(async (tx) => {
      await tx.table('settings').toCollection().modify((s: Settings) => { if (!s.salaryProfile) s.salaryProfile = defaultSalaryProfile(); });
      await tx.table('meta').put({ key: 'schemaVersion', value: 2 });
    });
    // v3 (Phase 3): additive only.
    this.version(3).stores({
      budgets: 'id, month, categoryId',
      goals: 'id, status, updatedAt',
      goalEntries: 'id, goalId, date, txnId',
      tasks: 'id, dueDate, status, seriesId, updatedAt',
    }).upgrade(async (tx) => { await tx.table('meta').put({ key: 'schemaVersion', value: 3 }); });
    this.on('populate', async (tx) => {
      await tx.table('categories').bulkAdd(defaultCategories());
      await tx.table('settings').add(defaultSettings());
      await tx.table('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    });
  }
}

export const defaultSettings = (): Settings => ({
  id: 'app', language: 'en', theme: 'system', payDay: 25, demoLoaded: false, merchantCategory: {}, salaryProfile: defaultSalaryProfile(),
});
export const defaultSalaryProfile = (): SalaryProfile => ({
  company: '', basic: 0, allowances: [], hourlyRateOverride: null, workDaysPerMonth: 26, hoursPerDay: 8,
  multipliers: { normal: 1.5, rest: 2, public_holiday: 3 }, defaultAccountId: null,
});

export const db = new MyFinanceDB();

/** Ask the browser not to evict our data. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
