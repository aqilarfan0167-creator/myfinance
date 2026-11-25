import { db } from './db';
import { saveAccount, saveTransaction, blankTxn, type AccountInput, type TxnInput } from './repo';
import { addDays, addMonths, monthStart, todayKL } from '@/lib/date';
import { saveSalary, confirmSalaryReceived, saveOT, salaryTxnId } from './salaryRepo';
import { saveCommitment, linkTransaction, saveRule, generateOccurrences } from './commitmentRepo';
import { estimateEPF, estimateSOCSO, estimateEIS } from '@/domain/salary';
import { setBudget, saveGoal, addGoalEntry, saveTask } from './planningRepo';
import { budgetId } from '@/domain/planning';

interface DemoIds { accounts: string[]; transactions: string[]; salaries?: string[]; ot?: string[]; commitments?: string[]; rules?: string[]; budgets?: string[]; goals?: string[]; tasks?: string[] }

/** Optional demo data. All created IDs are tracked so they can be removed without touching real records. */
export async function loadDemo() {
  const today = todayKL(); const start = addMonths(monthStart(today), -3);
  const ids: Required<DemoIds> = { accounts: [], transactions: [], salaries: [], ot: [], commitments: [], rules: [], budgets: [], goals: [], tasks: [] };
  const A = async (a: Partial<AccountInput>) => { const id = await saveAccount({ name: '', type: 'bank', openingBalance: 0, openingDate: start, icon: 'Landmark', color: '#0f766e', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, notes: 'Demo', ...a }); ids.accounts.push(id); return id; };
  const T = async (t: Partial<TxnInput>) => { const d = t.date!; if (d > today) return; ids.transactions.push(await saveTransaction({ ...blankTxn(t.type), ...t, remarks: '[demo]' })); };

  const bank = await A({ name: '[Demo] Maybank', openingBalance: 350000, lowBalanceThreshold: 50000 });
  const cash = await A({ name: '[Demo] Cash', type: 'cash', icon: 'Banknote', color: '#16a34a', openingBalance: 20000 });
  const tng = await A({ name: "[Demo] Touch 'n Go", type: 'ewallet', icon: 'Wallet', color: '#2563eb', openingBalance: 5000 });
  const asb = await A({ name: '[Demo] ASB Savings', type: 'savings', icon: 'PiggyBank', color: '#9333ea', openingBalance: 500000, includeInAvailable: false });
  const cc = await A({ name: '[Demo] CIMB Visa', type: 'credit_card', icon: 'CreditCard', color: '#dc2626', openingBalance: -45000, includeInAvailable: false, creditLimit: 800000, statementDay: 15, dueDay: 5 });

  for (let m = 0; m < 4; m++) {
    const ms = addMonths(start, m);
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
  // Salary profile, OT and monthly salary records (received for past paydays, expected otherwise)
  const profile = { company: 'Syarikat ABC Sdn Bhd', basic: 450000, allowances: [{ name: 'Travel allowance', amount: 30000 }], hourlyRateOverride: null, workDaysPerMonth: 26, hoursPerDay: 8, multipliers: { normal: 1.5, rest: 2, public_holiday: 3 }, defaultAccountId: bank };
  await db.settings.update('app', { salaryProfile: profile, payDay: 25 });
  const rate = Math.round(450000 / 26 / 8);
  for (let m = 0; m < 4; m++) {
    const month = addMonths(start, m).slice(0, 7);
    for (const [day, st, en, dt, mult] of [[5, '18:00', '21:00', 'normal', 1.5], [13, '09:00', '13:00', 'rest', 2]] as const) {
      const d = `${month}-${String(day).padStart(2, '0')}`; if (d > today) continue;
      ids.ot.push(await saveOT({ date: d, start: st, end: en, breakMinutes: 0, dayType: dt, multiplier: mult, hourlyRate: rate, reason: 'Month-end closing', approval: 'approved', payment: 'unpaid', salaryMonth: month }));
    }
    const wages = 480000;
    const sid = await saveSalary({ month, company: profile.company, basic: 450000, allowances: profile.allowances, bonus: 0, claims: m === 1 ? 12000 : 0, incentives: 0, otAuto: true, ot: 0,
      epf: estimateEPF(wages), socso: estimateSOCSO(wages + 20000), eis: estimateEIS(wages + 20000), pcb: 18000, unpaidLeave: 0, otherDeductions: [], actualNet: null,
      expectedPayDate: `${month}-25`, paymentDate: null, accountId: bank, remarks: '[demo]', attachmentIds: [] });
    ids.salaries.push(sid); ids.transactions.push(salaryTxnId(sid));
    const rec = (await db.salaries.get(sid))!;
    if (`${month}-25` <= today) await confirmSalaryReceived(sid, { actualNet: rec.expectedNet - (m === 2 ? 1500 : 0), date: `${month}-25`, accountId: bank });
  }

  // Commitments, linked to this month's existing demo payments
  const cur = monthStart(today);
  const C = async (name: string, kind: 'expense' | 'debt', amount: number, day: number, o: { categoryId?: string; accountId?: string; toAccountId?: string; match?: string }) => {
    const id = await saveCommitment({ name, kind, categoryId: o.categoryId ?? null, amount, startDate: addDays(start, day - 1), endDate: null, frequency: 'monthly', accountId: o.accountId ?? bank, toAccountId: o.toAccountId ?? null, active: true, remarks: '[demo]' });
    ids.commitments.push(id);
    if (o.match) {
      const t = (await db.transactions.where('date').between(cur, addDays(cur, 31)).toArray()).find((x) => x.name === o.match && ids.transactions.includes(x.id));
      if (t) await linkTransaction(`${id}:${t.date}`, t.id).catch(() => {});
    }
  };
  await C('Rental', 'expense', 90000, 1, { categoryId: 'exp-rental', match: 'House rental' });
  await C('TNB electricity', 'expense', 13000, 5, { categoryId: 'exp-utilities', match: 'TNB electricity' });
  await C('Unifi', 'expense', 12900, 7, { categoryId: 'exp-phone', accountId: cc, match: 'Unifi' });
  await C('CIMB Visa repayment', 'debt', 30000, 4, { toAccountId: cc, match: 'Card repayment' });
  await C('PTPTN', 'debt', 20000, 15, { match: 'PTPTN' });
  const carLoan = await A({ name: '[Demo] Car loan (Myvi)', type: 'loan', icon: 'Landmark', color: '#b91c1c', openingBalance: -3900000, openingDate: cur, includeInAvailable: false, dueDay: 28,
    loan: { lender: 'Public Bank', loanType: 'car', originalAmount: 5200000, annualRate: 2.8, rateType: 'flat', instalment: 65000, targetDate: addMonths(cur, 60) } });
  await C('Car loan', 'debt', 65000, 28, { toAccountId: carLoan });
  await generateOccurrences();
  ids.rules.push(await saveRule({ name: 'Monthly ASB saving', template: { type: 'transfer', amount: 50000, fee: 0, categoryId: null, accountId: bank, toAccountId: asb, merchant: '', paymentMethod: 'online_banking', needWant: null, remarks: '[demo]' },
    frequency: 'monthly', startDate: addDays(addMonths(cur, 1), 25), endDate: null, autoPost: false, active: true }));
  // Budgets for last month and this month
  const prevM = addMonths(cur, -1).slice(0, 7), curM = cur.slice(0, 7);
  for (const [cat, amt] of [['exp-food', 45000], ['exp-groceries', 35000], ['exp-petrol', 25000], ['exp-shopping', 15000], ['exp-subscriptions', 6000], ['exp-utilities', 15000]] as const)
    for (const m of [prevM, curM]) { await setBudget(m, cat, amt); ids.budgets.push(budgetId(m, cat)); }
  // Savings goals
  const g1 = await saveGoal({ name: '[Demo] Emergency fund', type: 'emergency', target: 2000000, targetDate: addMonths(cur, 18), startingAmount: 500000, monthlyContribution: 50000, linkedAccountId: asb, priority: 1, status: 'active', color: '#9333ea', reserveMonthly: true, remarks: '' });
  const g2 = await saveGoal({ name: '[Demo] Japan trip', type: 'travel', target: 800000, targetDate: addMonths(cur, 10), startingAmount: 120000, monthlyContribution: 30000, linkedAccountId: bank, priority: 2, status: 'active', color: '#db2777', reserveMonthly: false, remarks: '' });
  ids.goals.push(g1, g2);
  for (let m = 0; m < 3; m++) await addGoalEntry(g1, { date: addDays(addMonths(start, m), 25), amount: 50000, accountId: null, note: 'Monthly ASB saving' });
  await addGoalEntry(g2, { date: addDays(addMonths(cur, -1), 26), amount: 30000, accountId: null, note: '' });
  // Tasks
  for (const t of [
    { name: 'Submit e-Filing (LHDN)', category: 'Tax (LHDN)', dueDate: `${today.slice(0, 4)}-04-30` > today ? `${today.slice(0, 4)}-04-30` : `${Number(today.slice(0, 4)) + 1}-04-30`, priority: 'high', recurrence: 'yearly' },
    { name: 'Renew car insurance & road tax', category: 'Vehicle', dueDate: addDays(today, 5), priority: 'high', recurrence: 'yearly' },
    { name: 'Review monthly budget', category: 'Other', dueDate: addDays(monthStart(addMonths(cur, 1)), 0), priority: 'medium', recurrence: 'monthly' },
    { name: 'Update EPF i-Akaun nomination', category: 'Documents', dueDate: addDays(today, -3), priority: 'low', recurrence: 'none' },
  ] as const) ids.tasks.push(await saveTask({ ...t, status: 'pending', remarks: '[demo]' }));
  await db.meta.put({ key: 'demoIds', value: ids });
  await db.settings.update('app', { demoLoaded: true });
}

export async function clearDemo() {
  const ids = (await db.meta.get('demoIds'))?.value as DemoIds | undefined;
  await db.transaction('rw', [db.accounts, db.transactions, db.meta, db.settings, db.salaries, db.otEntries, db.commitments, db.occurrences, db.recurring, db.budgets, db.goals, db.goalEntries, db.tasks], async () => {
    if (ids) {
      const rules = ids.rules ?? [], comms = ids.commitments ?? [];
      const genTx = rules.length ? await db.transactions.where('recurringId').anyOf(rules).primaryKeys() : [];
      const demoTx = new Set([...ids.transactions, ...genTx]), demoAcc = new Set(ids.accounts);
      const used = await db.transactions.filter((t) => !demoTx.has(t.id) && !t.deletedAt && (demoAcc.has(t.accountId ?? '') || demoAcc.has(t.toAccountId ?? ''))
        && !t.related?.some((r) => r.kind === 'commitment' && comms.includes(r.id))).count();
      if (used) throw new Error(`${used} of your own transaction(s) use demo accounts. Move or delete them first.`);
      const occTx = await db.transactions.filter((t) => !!t.related?.some((r) => r.kind === 'commitment' && comms.includes(r.id)) && demoAcc.has(t.accountId ?? '')).primaryKeys();
      await db.transactions.bulkDelete([...demoTx, ...occTx]); await db.accounts.bulkDelete(ids.accounts);
      await db.salaries.bulkDelete(ids.salaries ?? []); await db.otEntries.bulkDelete(ids.ot ?? []); await db.recurring.bulkDelete(rules);
      await db.commitments.bulkDelete(comms); await db.occurrences.where('commitmentId').anyOf(comms).delete();
      await db.budgets.bulkDelete(ids.budgets ?? []); await db.goals.bulkDelete(ids.goals ?? []); await db.goalEntries.where('goalId').anyOf(ids.goals ?? []).delete();
      const tasks = ids.tasks ?? []; await db.tasks.where('seriesId').anyOf(tasks).delete();
    }
    await db.meta.delete('demoIds'); await db.settings.update('app', { demoLoaded: false });
  });
}
