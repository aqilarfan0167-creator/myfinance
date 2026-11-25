import { db } from './db';
import { saveAccount, saveTransaction, blankTxn, type AccountInput, type TxnInput } from './repo';
import { addDays, addMonths, monthStart, todayKL } from '@/lib/date';

/** Optional demo data. All created IDs are tracked so they can be removed without touching real records. */
export async function loadDemo() {
  const today = todayKL(); const start = addMonths(monthStart(today), -3);
  const ids: { accounts: string[]; transactions: string[] } = { accounts: [], transactions: [] };
  const A = async (a: Partial<AccountInput>) => { const id = await saveAccount({ name: '', type: 'bank', openingBalance: 0, openingDate: start, icon: 'Landmark', color: '#0f766e', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, notes: 'Demo', ...a }); ids.accounts.push(id); return id; };
  const T = async (t: Partial<TxnInput>) => { const d = t.date!; if (d > today) return; ids.transactions.push(await saveTransaction({ ...blankTxn(t.type), ...t, remarks: '[demo]' })); };

  const bank = await A({ name: '[Demo] Maybank', openingBalance: 350000, lowBalanceThreshold: 50000 });
  const cash = await A({ name: '[Demo] Cash', type: 'cash', icon: 'Banknote', color: '#16a34a', openingBalance: 20000 });
  const tng = await A({ name: "[Demo] Touch 'n Go", type: 'ewallet', icon: 'Wallet', color: '#2563eb', openingBalance: 5000 });
  const asb = await A({ name: '[Demo] ASB Savings', type: 'savings', icon: 'PiggyBank', color: '#9333ea', openingBalance: 500000, includeInAvailable: false });
  const cc = await A({ name: '[Demo] CIMB Visa', type: 'credit_card', icon: 'CreditCard', color: '#dc2626', openingBalance: -45000, includeInAvailable: false, creditLimit: 800000, statementDay: 15, dueDay: 5 });

  for (let m = 0; m < 4; m++) {
    const ms = addMonths(start, m);
    await T({ type: 'income', date: addDays(ms, 24), name: 'Salary', merchant: 'Syarikat ABC Sdn Bhd', categoryId: 'inc-salary', amount: 420000, accountId: bank, paymentMethod: 'online_banking' });
    await T({ type: 'expense', date: addDays(ms, 0), name: 'House rental', categoryId: 'exp-rental', amount: 90000, accountId: bank, needWant: 'need', paymentMethod: 'online_banking' });
    await T({ type: 'expense', date: addDays(ms, 4), name: 'TNB electricity', merchant: 'TNB', categoryId: 'exp-utilities', amount: 12350 + m * 410, accountId: bank, needWant: 'need', paymentMethod: 'online_banking' });
    await T({ type: 'expense', date: addDays(ms, 6), name: 'Unifi', merchant: 'TM Unifi', categoryId: 'exp-phone', amount: 12900, accountId: cc, needWant: 'need', paymentMethod: 'credit_card' });
    await T({ type: 'expense', date: addDays(ms, 9), name: 'Netflix', merchant: 'Netflix', categoryId: 'exp-subscriptions', amount: 5500, accountId: cc, needWant: 'want', paymentMethod: 'credit_card' });
    await T({ type: 'transfer', date: addDays(ms, 25), name: 'Save to ASB', amount: 50000, accountId: bank, toAccountId: asb });
    await T({ type: 'debt_repayment', date: addDays(ms, 3), name: 'Card repayment', amount: 30000, accountId: bank, toAccountId: cc });
    await T({ type: 'debt_repayment', date: addDays(ms, 14), name: 'PTPTN', merchant: 'PTPTN', amount: 20000, accountId: bank });
    await T({ type: 'transfer', date: addDays(ms, 1), name: 'Reload TNG', amount: 10000, fee: 0, accountId: bank, toAccountId: tng });
    for (let d = 0; d < 28; d += 2) {
      await T({ type: 'expense', date: addDays(ms, d), name: 'Lunch', merchant: d % 4 ? 'Restoran Nasi Kandar' : 'Mamak Corner', categoryId: 'exp-food', amount: 1200 + ((d * 37) % 900), accountId: d % 3 ? cash : tng, needWant: 'need', paymentMethod: d % 3 ? 'cash' : 'ewallet' });
      if (d % 6 === 0) await T({ type: 'expense', date: addDays(ms, d + 1), name: 'Petrol RON95', merchant: 'Petronas', categoryId: 'exp-petrol', amount: 6000, accountId: bank, needWant: 'need', paymentMethod: 'debit_card' });
      if (d % 8 === 0) await T({ type: 'expense', date: addDays(ms, d + 1), name: 'Groceries', merchant: 'Lotus’s', categoryId: 'exp-groceries', amount: 8500 + d * 120, accountId: cc, needWant: 'need', paymentMethod: 'credit_card' });
    }
    await T({ type: 'expense', date: addDays(ms, 18), name: 'Shopee order', merchant: 'Shopee', categoryId: 'exp-shopping', amount: 15990, accountId: cc, needWant: 'want', paymentMethod: 'credit_card' });
    await T({ type: 'transfer', date: addDays(ms, 10), name: 'ATM withdrawal', amount: 20000, fee: 100, accountId: bank, toAccountId: cash });
  }
  await T({ type: 'income', date: today, name: 'OT claim (expected)', categoryId: 'inc-ot', amount: 35000, accountId: bank, status: 'expected' });
  await db.meta.put({ key: 'demoIds', value: ids });
  await db.settings.update('app', { demoLoaded: true });
}

export async function clearDemo() {
  const ids = (await db.meta.get('demoIds'))?.value as { accounts: string[]; transactions: string[] } | undefined;
  await db.transaction('rw', db.accounts, db.transactions, db.meta, db.settings, async () => {
    if (ids) {
      const demoTx = new Set(ids.transactions), demoAcc = new Set(ids.accounts);
      const used = await db.transactions.filter((t) => !demoTx.has(t.id) && !t.deletedAt && (demoAcc.has(t.accountId ?? '') || demoAcc.has(t.toAccountId ?? ''))).count();
      if (used) throw new Error(`${used} of your own transaction(s) use demo accounts. Move or delete them first.`);
      await db.transactions.bulkDelete(ids.transactions); await db.accounts.bulkDelete(ids.accounts); }
    await db.meta.delete('demoIds'); await db.settings.update('app', { demoLoaded: false });
  });
}
