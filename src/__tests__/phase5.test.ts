import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { db, defaultNotificationPrefs } from '@/db/db';
import { saveAccount, saveTransaction, blankTxn, type AccountInput } from '@/db/repo';
import { setBudget } from '@/db/planningRepo';
import { saveCommitment, generateOccurrences } from '@/db/commitmentRepo';
import { buildReport, periodRange, previousRange, type ReportInput } from '@/domain/report';
import { buildInsights } from '@/domain/insights';
import { computeNotifications, mergeNotifications } from '@/domain/notifications';
import { buildOccViews } from '@/domain/commitments';
import { reportCsv, reportXlsx, reportPdf } from '@/lib/reportExport';

const A = (o: Partial<AccountInput> = {}) => saveAccount({ name: 'Bank', type: 'bank', openingBalance: 100000, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, ...o });
const TODAY = '2026-11-25';
async function input(): Promise<ReportInput> {
  const [accounts, txns, cats, occ, commitments, budgets] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.categories.toArray(), db.occurrences.toArray(), db.commitments.toArray(), db.budgets.toArray()]);
  return { accounts, txns, cats, occ: buildOccViews(occ, commitments, txns, TODAY), goals: [], goalEntries: [], salaries: [], ot: [], budgets, receipts: [], today: TODAY };
}

describe('periods', () => {
  it('ranges and comparisons', () => {
    expect(periodRange('weekly', '2026-11-25')).toMatchObject({ from: '2026-11-23', to: '2026-11-29' });
    expect(previousRange('weekly', periodRange('weekly', '2026-11-25'))).toMatchObject({ from: '2026-11-16', to: '2026-11-22' });
    expect(previousRange('monthly', periodRange('monthly', '2026-03-31'))).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange('yearly', periodRange('yearly', '2026-06-01'))).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    expect(previousRange('custom', periodRange('custom', TODAY, { from: '2026-11-11', to: '2026-11-20' }))).toMatchObject({ from: '2026-11-01', to: '2026-11-10' });
    expect(previousRange('daily', periodRange('daily', '2026-03-01'))).toMatchObject({ from: '2026-02-28', to: '2026-02-28' });
  });
});

describe('reports, insights, notifications', () => {
  let bank = '', sav = '', cc = '';
  beforeEach(async () => {
    await db.delete(); await db.open();
    bank = await A(); sav = await A({ name: 'ASB', type: 'savings', openingBalance: 0, includeInAvailable: false });
    cc = await A({ name: 'Visa', type: 'credit_card', openingBalance: 0, includeInAvailable: false, creditLimit: 500000 });
    for (const m of ['2026-09', '2026-10', '2026-11']) {
      await saveTransaction({ ...blankTxn('income'), date: `${m}-01`, amount: 400000, accountId: bank, categoryId: 'inc-salary' });
      await saveTransaction({ ...blankTxn('expense'), date: `${m}-03`, amount: 20000, accountId: bank, categoryId: 'exp-food', merchant: 'Mamak', needWant: 'need' });
      await saveTransaction({ ...blankTxn('transfer'), date: `${m}-04`, amount: 50000, fee: 100, accountId: bank, toAccountId: sav });
      await saveTransaction({ ...blankTxn('expense'), date: `${m}-05`, amount: 5500, accountId: cc, categoryId: 'exp-subscriptions', merchant: 'Netflix', needWant: 'want' });
      await saveTransaction({ ...blankTxn('debt_repayment'), date: `${m}-06`, amount: 5500, accountId: bank, toAccountId: cc });
    }
    // November: shopping spike + frequent coffee
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-10', amount: 60000, accountId: bank, categoryId: 'exp-shopping', merchant: 'Shopee', needWant: 'want' });
    for (let i = 0; i < 7; i++) await saveTransaction({ ...blankTxn('expense'), date: `2026-11-${String(12 + i).padStart(2, '0')}`, amount: 1500, accountId: bank, categoryId: 'exp-food', merchant: 'ZUS Coffee' });
    await setBudget('2026-11', 'exp-shopping', 30000); await setBudget('2026-11', 'exp-food', 50000);
  });

  it('monthly report: transfers excluded, previous-month comparison, balances, budgets', async () => {
    const r = buildReport(await input(), 'monthly', periodRange('monthly', TODAY));
    expect(r.cur.income).toBe(400000);
    expect(r.cur.netExpenses).toBe(20000 + 5500 + 100 + 60000 + 10500);        // transfer fee counted, transfer & card repayment not
    expect(r.prev.netExpenses).toBe(20000 + 5500 + 100);
    expect(r.totals.find((t) => t.key === 'cards')!.cur).toBe(5500);
    expect(r.expenseCats[0]).toMatchObject({ name: 'Shopping', amount: 60000, prev: 0, change: null });
    expect(r.expenseCats.find((c) => c.name === 'Food & Drinks')).toMatchObject({ amount: 30500, prev: 20000 });
    const b = r.accounts.find((a) => a.name === 'Bank')!;
    expect(b.end - b.start).toBe(400000 - 20000 - 50100 - 5500 - 60000 - 10500);
    expect(r.budgets[0].lines.find((l) => l.name === 'Shopping')).toMatchObject({ spent: 60000, level: 'over' });
    expect(r.transactions.length).toBe(5 + 1 + 7);
    expect(r.series).toHaveLength(30);
    // an account added mid-period starts at its opening balance (no fake net-worth drop)
    await A({ name: 'Car loan', type: 'loan', openingBalance: -3000000, openingDate: '2026-11-15', includeInAvailable: false });
    const r2 = buildReport(await input(), 'monthly', periodRange('monthly', TODAY));
    expect(r2.accounts.find((a) => a.name === 'Car loan')).toMatchObject({ start: -3000000, end: -3000000, change: 0, openedInPeriod: true });
    expect(r2.position.end.netWorth - r2.position.start.netWorth).toBe(r.position.end.netWorth - r.position.start.netWorth);
  });

  it('exports: CSV sections, valid XLSX (openpyxl) and PDF (pypdf)', async () => {
    const inp = await input(); const r = buildReport(inp, 'monthly', periodRange('monthly', TODAY));
    const csv = reportCsv(r, inp.accounts, inp.cats);
    expect(csv).toContain('# Summary'); expect(csv).toContain('# Transactions'); expect(csv).toContain('Income,4000.00,4000.00');
    mkdirSync('node_modules/.cache/exports', { recursive: true });
    writeFileSync('node_modules/.cache/exports/r.xlsx', reportXlsx(r, inp.accounts, inp.cats));
    const py = `import openpyxl,json;wb=openpyxl.load_workbook('node_modules/.cache/exports/r.xlsx');s=wb['Summary'];t=wb['Transactions'];print(json.dumps({'sheets':wb.sheetnames,'b2':s['B2'].value,'fmt':s['B2'].number_format,'a1':s['A1'].value,'bold':s['A1'].font.b,'txrows':t.max_row}))`;
    const x = JSON.parse(execFileSync('python3', ['-c', py]).toString());
    expect(x.sheets).toContain('Transactions'); expect(x.b2).toBe(4000); expect(x.fmt).toBe('#,##0.00'); expect(x.a1).toBe('Item'); expect(x.bold).toBe(true); expect(x.txrows).toBe(14);
    const pdf = await reportPdf(r, inp.accounts, inp.cats);
    writeFileSync('node_modules/.cache/exports/r.pdf', Buffer.from(await pdf.arrayBuffer()));
    const txt = execFileSync('python3', ['-c', "import pypdf;r=pypdf.PdfReader('node_modules/.cache/exports/r.pdf');print(len(r.pages));print(r.pages[0].extract_text())"]).toString();
    expect(txt).toMatch(/MyFinance Report/); expect(txt).toMatch(/RM 4,000\.00/); expect(txt).toMatch(/Expenses by category/);
  }, 30000);

  it('insights from actual records', async () => {
    const inp = await input();
    const ins = buildInsights({ txns: inp.txns, accounts: inp.accounts, cats: inp.cats, budgets: inp.budgets, goals: [], commitments: [], today: TODAY });
    const ids = ins.map((i) => i.id);
    expect(ids).toContain('budget:exp-shopping');                    // over budget
    expect(ins.find((i) => i.id === 'budget:exp-shopping')!.severity).toBe('alert');
    expect(ids).toContain('unusual:exp-shopping');                   // new spike
    expect(ids.some((i) => i.startsWith('freq:ZUS'))).toBe(true);     // 7 coffees
    expect(ids.some((i) => i.startsWith('sub:NETFLIX'))).toBe(true);  // untracked recurring
    expect(ins.find((i) => i.id === 'trend')!.severity).toBe('warning');
    expect(ins[0].severity).toBe('alert');
  });

  it('notifications: deterministic, deduplicated, resolved and dismissals respected', async () => {
    await saveCommitment({ name: 'Rent', kind: 'expense', categoryId: 'exp-rental', amount: 90000, startDate: '2026-11-27', endDate: null, frequency: 'monthly', accountId: bank, toAccountId: null, active: true, remarks: '', trackFrom: '2026-11-01' });
    await generateOccurrences(TODAY);
    const inp = await input(); const prefs = defaultNotificationPrefs();
    const base = { prefs, today: TODAY, payDay: 25, occ: inp.occ, accounts: inp.accounts, txns: inp.txns, budgets: inp.budgets, cats: inp.cats, salaries: [], tasks: [], receipts: [], lastBackup: null, firstUse: '2026-09-01' };
    const n1 = computeNotifications(base);
    expect(n1.map((n) => n.type)).toEqual(expect.arrayContaining(['payment_due', 'budget', 'backup', 'salary']));
    expect(n1.find((n) => n.type === 'payment_due')!.title).toBe('Payment due in 2 days: Rent');
    const m1 = mergeNotifications([], n1, 'T1'); expect(m1.newOnes).toHaveLength(n1.length);
    const stored = m1.put.map((x) => (x.type === 'budget' ? { ...x, dismissedAt: 'T1' } : x));
    const m2 = mergeNotifications(stored, n1, 'T2'); expect(m2.newOnes).toHaveLength(0); expect(m2.put).toHaveLength(0);  // no duplicates, dismissal kept
    const m3 = mergeNotifications(stored, n1.filter((n) => n.type !== 'payment_due'), 'T3');
    expect(m3.put.find((x) => x.type === 'payment_due')!.resolvedAt).toBe('T3');
    const off = computeNotifications({ ...base, prefs: { ...prefs, payments: { enabled: false, daysBefore: 3 }, budget: { enabled: false, warnAt: 80 } } });
    expect(off.some((n) => n.type === 'payment_due' || n.type === 'budget')).toBe(false);
  });
});
