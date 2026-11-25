import type { Report } from '@/domain/report';
import type { Account, Category } from '@/db/types';
import { writeXlsx, type Cell, type Sheet } from './xlsx';
import { toCSV } from './csv';
import { fmtDate, fmtDateTime, fmtMonth } from './date';
import { formatRM } from './money';
import { txnLabel, PAYMENT_METHODS } from './labels';

const M = (c: number | null | undefined): Cell => (c == null ? null : { v: c / 100, f: 'money' });
const P = (x: number | null | undefined): Cell => (x == null ? null : { v: x, f: 'pct' });
const pctText = (x: number | null) => (x == null ? 'new' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const statusLabel = (s: string) => s.replace('_', ' ');

/** All report tables as plain rows (shared by CSV, Excel, PDF and print). */
export function reportTables(r: Report, accounts: Account[], cats: Category[]) {
  const accName = new Map(accounts.map((a) => [a.id, a.name])); const catName = new Map(cats.map((c) => [c.id, c.name]));
  const summary: Cell[][] = [['Item', r.range.label, r.prevRange.label, 'Change'], ...r.totals.map((t) => [t.label, t.kind === 'pct' ? P(t.cur) : M(t.cur), t.kind === 'pct' ? P(t.prev) : M(t.prev), t.kind === 'pct' ? `${((t.change ?? 0) * 100).toFixed(1)} pts` : pctText(t.change)]),
    ['Needs', M(r.needsWants.needs)], ['Wants', M(r.needsWants.wants)], ['Unclassified spending', M(r.needsWants.unclassified)],
    ['Net worth at start', M(r.position.start.netWorth)], ['Net worth at end', M(r.position.end.netWorth)], ['Total debt at start', M(r.position.start.liabilities)], ['Total debt at end', M(r.position.end.liabilities)]];
  const cat = (rows: Report['expenseCats']): Cell[][] => [['Category', 'Amount', 'Share', 'Previous', 'Change'], ...rows.map((c) => [c.name, M(c.amount), P(c.share), M(c.prev), pctText(c.change)])];
  const accountsT: Cell[][] = [['Account', 'Type', 'Start balance', 'End balance', 'Change'], ...r.accounts.map((a) => [a.name, a.type.replace('_', ' '), M(a.start), M(a.end), M(a.change)])];
  const merchants: Cell[][] = [['Merchant', 'Spent', 'Transactions'], ...r.merchants.map((m) => [m.merchant, M(m.amount), { v: m.count, f: 'int' as const }])];
  const commitments: Cell[][] = [['Commitment', 'Due', 'Amount', 'Paid', 'Status'], ...r.commitments.items.map((c) => [c.name, fmtDate(c.due), M(c.amount), M(c.paid), statusLabel(c.status)]), ['Total', '', M(r.commitments.total), M(r.commitments.paid), `${formatRM(r.commitments.outstanding)} outstanding`]];
  const budgets: Cell[][] = [['Month', 'Category', 'Allocated', 'Spent', 'Remaining', 'Used'], ...r.budgets.flatMap((b) => b.lines.map((l) => [fmtMonth(b.month), l.name, M(l.allocated), M(l.spent), M(l.remaining), P(l.pct)]))];
  const salary: Cell[][] = [['Month', 'Company', 'Gross', 'Expected net', 'Actual net', 'Status'], ...r.salary.records.map((s) => [fmtMonth(s.month), s.company, M(s.gross), M(s.expectedNet), M(s.actualNet), s.status]),
    ['OT in period', `${r.salary.otEntries} entries · ${r.salary.otHours} h`, M(r.salary.otAmount)]];
  const savings: Cell[][] = [['Item', 'Amount'], ['Goal contributions', M(r.savings.contributed)], ['Goal withdrawals', M(r.savings.withdrawn)], ['Net moved to savings accounts', M(r.savings.transfers)], ...r.savings.goals.map((g) => [`Goal: ${g.name} (${Math.round(g.progress * 100)}% of ${formatRM(g.target)})`, M(g.saved)])];
  const receipts: Cell[][] = [['Item', 'Value'], ['Receipts recorded', { v: r.receipts.recorded, f: 'int' as const }], ['Total of recorded receipts', M(r.receipts.recordedTotal)], ['Receipts waiting for review (all time)', { v: r.receipts.pending, f: 'int' as const }], ...r.receipts.topMerchants.map((m) => [`${m.merchant} (${m.count})`, M(m.total)])];
  const txns: Cell[][] = [['Date', 'Time', 'Type', 'Name', 'Merchant', 'Category', 'Amount', 'Fee', 'From/Account', 'To account', 'Payment method', 'Need/Want', 'In income/expense totals', 'Remarks', 'ID'],
    ...r.transactions.map((t) => [fmtDate(t.date), t.time, txnLabel(t.type), t.name, t.merchant, catName.get(t.categoryId ?? '') ?? '', M(t.amount), t.fee ? M(t.fee) : null, accName.get(t.accountId ?? '') ?? '', accName.get(t.toAccountId ?? '') ?? '',
      PAYMENT_METHODS.find((p) => p.v === t.paymentMethod)?.label ?? '', t.needWant ?? '', ['income', 'expense', 'refund'].includes(t.type) ? 'yes' : t.type === 'transfer' && t.fee ? 'fee only' : 'no', t.remarks, t.id])];
  return { summary, expenseCats: cat(r.expenseCats), incomeCats: cat(r.incomeCats), accountsT, merchants, commitments, budgets, salary, savings, receipts, txns };
}

const plain = (c: Cell): string | number => (c == null ? '' : typeof c === 'object' ? (c.v == null ? '' : c.f === 'money' ? (c.v as number).toFixed(2) : c.f === 'pct' ? `${((c.v as number) * 100).toFixed(1)}%` : c.v) : c);
const meta = (r: Report) => `MyFinance report · ${r.range.label} (${fmtDate(r.range.from)} – ${fmtDate(r.range.to)}) · compared with ${r.prevRange.label} · generated ${fmtDateTime(r.generatedAt)} · amounts in MYR`;

export function reportCsv(r: Report, accounts: Account[], cats: Category[]): string {
  const t = reportTables(r, accounts, cats);
  const section = (title: string, rows: Cell[][]) => [`# ${title}`, toCSV(rows.slice(1).map((row) => Object.fromEntries((rows[0] as string[]).map((h, i) => [h, plain(row[i])]))))].join('\n');
  return '﻿' + [meta(r), section('Summary', t.summary), section('Expenses by category', t.expenseCats), section('Income by category', t.incomeCats), section('Top merchants', t.merchants), section('Accounts', t.accountsT),
    section('Commitments', t.commitments), section('Budgets', t.budgets), section('Savings', t.savings), section('Salary & OT', t.salary), section('Receipts', t.receipts), section('Transactions', t.txns), `# Notes\n${r.notes.join('\n')}`].join('\n\n');
}

export function reportXlsx(r: Report, accounts: Account[], cats: Category[]): Uint8Array {
  const t = reportTables(r, accounts, cats);
  const sheets: Sheet[] = [
    { name: 'Summary', rows: [...t.summary, [], [meta(r)], ...r.notes.map((n) => [n])] }, { name: 'Expenses by category', rows: t.expenseCats }, { name: 'Income by category', rows: t.incomeCats },
    { name: 'Merchants', rows: t.merchants }, { name: 'Accounts', rows: t.accountsT }, { name: 'Commitments', rows: t.commitments }, { name: 'Budgets', rows: t.budgets },
    { name: 'Savings', rows: t.savings }, { name: 'Salary & OT', rows: t.salary }, { name: 'Receipts', rows: t.receipts }, { name: 'Transactions', rows: t.txns },
    { name: 'Trend', rows: [['Period', 'Income', 'Expenses', 'Net'], ...r.series.map((s) => [s.label, M(s.income), M(s.expenses), M(s.net)])] },
  ];
  return writeXlsx(sheets);
}

/** PDF via jsPDF + AutoTable (loaded only when exporting). */
export async function reportPdf(r: Report, accounts: Account[], cats: Category[]): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const t = reportTables(r, accounts, cats);
  const W = doc.internal.pageSize.getWidth();
  doc.setFontSize(18); doc.setTextColor(15, 118, 110); doc.text('MyFinance Report', 40, 50);
  doc.setFontSize(11); doc.setTextColor(30, 41, 59); doc.text(`${r.range.label}  (${fmtDate(r.range.from)} – ${fmtDate(r.range.to)})`, 40, 70);
  doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(`Compared with ${r.prevRange.label} · generated ${fmtDateTime(r.generatedAt)} · MYR`, 40, 84);
  let y = 100;
  const table = (title: string, rows: Cell[][], opts: { maxRows?: number } = {}) => {
    if (rows.length <= 1) return;
    const body = rows.slice(1, opts.maxRows ? opts.maxRows + 1 : undefined).map((row) => (rows[0] as Cell[]).map((_, i) => { const c = row[i]; return typeof c === 'object' && c?.f === 'money' ? formatRM(Math.round((c.v as number) * 100)) : String(plain(c)); }));
    if (y > 740) { doc.addPage(); y = 50; }
    doc.setFontSize(11); doc.setTextColor(30, 41, 59); doc.text(title, 40, y);
    autoTable(doc, { startY: y + 6, head: [rows[0].map((c) => String(plain(c)))], body, theme: 'striped', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [15, 118, 110] }, margin: { left: 40, right: 40 },
      columnStyles: Object.fromEntries((rows[0] as Cell[]).map((_, i) => [i, { halign: body.some((b) => /^-?RM |%$|^[+-]?\d/.test(b[i] ?? '')) && i > 0 ? 'right' : 'left' }])) });
    // @ts-expect-error lastAutoTable is added by the plugin
    y = doc.lastAutoTable.finalY + 22;
    if (opts.maxRows && rows.length - 1 > opts.maxRows) { doc.setFontSize(7); doc.text(`… ${rows.length - 1 - opts.maxRows} more rows in the Excel/CSV export`, 40, y - 12); }
  };
  table('Summary', t.summary); table('Expenses by category', t.expenseCats); table('Income by category', t.incomeCats); table('Top merchants', t.merchants, { maxRows: 10 });
  table('Accounts', t.accountsT); table('Commitments', t.commitments); table('Budget performance', t.budgets); table('Savings', t.savings); table('Salary & OT', t.salary); table('Receipts', t.receipts);
  table('Transactions', t.txns.map((row) => [row[0], row[2], row[3], row[5], row[6], row[8]]), { maxRows: 300 });
  doc.setFontSize(7); doc.setTextColor(100, 116, 139); r.notes.forEach((n, i) => doc.text(n, 40, Math.min(y + i * 10, 800)));
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7); doc.text(`Page ${i} of ${pages}`, W - 80, 820); }
  return doc.output('blob');
}
