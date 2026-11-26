import type { Account, Category, NeedWant, PaymentMethod, TxnType } from '@/db/types';
import type { TxnInput } from '@/db/repo';
import { blankTxn } from '@/db/repo';
import { parseRM } from '@/lib/money';
import { PAYMENT_METHODS, TXN_TYPES } from '@/lib/labels';

/** RFC 4180-style CSV parser with delimiter detection (, ; tab), quotes, escaped quotes, CRLF and BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const firstLine = s.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim().replace(/^'(?=[=+\-@])/, ''))); // undo formula-injection guard from our own export
}

export type Field = 'date' | 'time' | 'amount' | 'debit' | 'credit' | 'type' | 'name' | 'merchant' | 'category' | 'account' | 'toAccount' | 'remarks' | 'needWant' | 'paymentMethod' | 'fee' | 'id';
export type Mapping = Partial<Record<Field, number>>;
export const FIELD_LABELS: Record<Field, string> = { date: 'Date *', time: 'Time', amount: 'Amount (signed or positive)', debit: 'Debit / money out', credit: 'Credit / money in', type: 'Type', name: 'Description / name', merchant: 'Merchant', category: 'Category', account: 'Account', toAccount: 'To account', remarks: 'Remarks', needWant: 'Need/Want', paymentMethod: 'Payment method', fee: 'Fee', id: 'MyFinance ID' };
const GUESS: [Field, RegExp][] = [
  ['date', /^(date|tarikh|transaction date|posting date|value date)$/i], ['time', /^(time|masa)$/i], ['debit', /^(debit|withdrawal|money out|keluar|dr)$/i], ['credit', /^(credit|deposit|money in|masuk|cr)$/i],
  ['amount', /^(amount|amaun|jumlah|value|amount \(rm\)|amount \(myr\))$/i], ['type', /^(type|jenis)$/i], ['name', /^(name|description|desc|details|keterangan|transaction description|nama)$/i],
  ['merchant', /^(merchant|payee|peniaga|beneficiary)$/i], ['category', /^(category|kategori)$/i], ['account', /^(account|from\/account|from account|akaun)$/i], ['toAccount', /^(to account|to_account)$/i],
  ['remarks', /^(remarks|notes?|catatan|reference|ref)$/i], ['needWant', /^(need\/want|need_want|needs?\/wants?)$/i], ['paymentMethod', /^(payment method|payment_method|method)$/i], ['fee', /^fee$/i], ['id', /^id$/i],
];
export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  headers.forEach((h, i) => { for (const [f, re] of GUESS) if (m[f] == null && re.test(h.trim())) { m[f] = i; break; } });
  return m;
}

export function parseDate(s: string, order: 'dmy' | 'mdy' | 'ymd'): string | null {
  const t = s.trim().split(/[ T]/)[0];
  const m = t.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/); if (!m) return null;
  let [y, mo, d] = order === 'ymd' || m[1].length === 4 ? [m[1], m[2], m[3]] : order === 'mdy' ? [m[3], m[1], m[2]] : [m[3], m[2], m[1]];
  if (y.length === 2) y = `20${y}`;
  const Y = +y, M = +mo, D = +d; const dt = new Date(Date.UTC(Y, M - 1, D));
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D || Y < 1990 || Y > 2100) return null;
  return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}
const amt = (s: string | undefined) => { if (!s?.trim()) return null; s = /^[-(]?\s*(RM|MYR)?\s*\d+,\d{1,2}\)?$/i.test(s.trim()) ? s.replace(',', '.') : s; /* 45,90 = decimal comma */ const neg = /^\(.*\)$/.test(s.trim()) || /\bDR\b/i.test(s); const c = parseRM(s.replace(/[()]|\b(CR|DR)\b/gi, '').replace(/^(MYR|RM)\s*/i, '')); return c == null ? null : neg ? -Math.abs(c) : c; };

export interface ImportOptions { dateOrder: 'dmy' | 'mdy' | 'ymd'; defaultAccountId: string | null; positiveIs: 'income' | 'expense'; skipHeader: boolean; learned: Record<string, string> }
export interface ImportRow { line: number; txn: TxnInput | null; errors: string[]; warnings: string[]; existingId?: string }

export function buildImport(rows: string[][], map: Mapping, o: ImportOptions, cats: Category[], accounts: Account[]): ImportRow[] {
  const accBy = (n?: string) => (n ? accounts.find((a) => !a.deletedAt && a.name.trim().toLowerCase() === n.trim().toLowerCase()) : undefined);
  const catBy = (n: string | undefined, kind: 'income' | 'expense') => n ? cats.find((c) => c.kind === kind && [c.name, c.nameMs, c.id].some((x) => x?.toLowerCase() === n.trim().toLowerCase())) : undefined;
  const typeBy = (s?: string): TxnType | null => { if (!s) return null; const v = s.trim().toLowerCase();
    return TXN_TYPES.find((t) => t.v === v.replace(/ /g, '_') || t.label.toLowerCase() === v)?.v ?? (/(pendapatan|income|masuk)/.test(v) ? 'income' : /(perbelanjaan|expense|keluar)/.test(v) ? 'expense' : /(pindahan|transfer)/.test(v) ? 'transfer' : null); };
  const get = (r: string[], f: Field) => (map[f] != null ? r[map[f]!]?.trim() ?? '' : undefined);
  return rows.slice(o.skipHeader ? 1 : 0).map((r, i) => {
    const line = i + (o.skipHeader ? 2 : 1); const errors: string[] = [], warnings: string[] = [];
    const date = parseDate(get(r, 'date') ?? '', o.dateOrder); if (!date) errors.push(`Invalid date "${get(r, 'date') ?? ''}"`);
    let a = map.amount != null ? amt(get(r, 'amount')) : null;
    if (map.amount == null) { const dr = amt(get(r, 'debit')), cr = amt(get(r, 'credit')); a = cr ? Math.abs(cr) : dr ? -Math.abs(dr) : null; }
    if (a == null || a === 0) errors.push('Missing or invalid amount');
    let type = typeBy(get(r, 'type'));
    if (!type && a != null) type = a >= 0 ? (map.amount != null && o.positiveIs === 'expense' ? 'expense' : 'income') : (map.amount != null && o.positiveIs === 'expense' ? 'income' : 'expense');
    if (!type) type = 'expense';
    const acc = accBy(get(r, 'account')) ?? accounts.find((x) => x.id === o.defaultAccountId);
    if (!acc) errors.push(get(r, 'account') ? `Unknown account "${get(r, 'account')}"` : 'No account – choose a default account');
    else if (get(r, 'account') && !accBy(get(r, 'account'))) warnings.push(`Account "${get(r, 'account')}" not found – using ${acc.name}`);
    const to = accBy(get(r, 'toAccount'));
    if (type === 'transfer' && !to) errors.push('Transfer needs a "to account" that exists');
    const name = get(r, 'name') || get(r, 'merchant') || ''; const merchant = get(r, 'merchant') ?? '';
    const kind = type === 'income' ? 'income' : 'expense';
    let cat = ['income', 'expense', 'refund'].includes(type) ? catBy(get(r, 'category'), kind) : undefined;
    if (!cat && ['income', 'expense', 'refund'].includes(type)) {
      const learned = o.learned[(merchant || name).toLowerCase()]; cat = cats.find((c) => c.id === learned && c.kind === kind) ?? cats.find((c) => c.id === (kind === 'income' ? 'inc-other' : 'exp-other'));
      if (get(r, 'category')) warnings.push(`Category "${get(r, 'category')}" not found – using ${cat?.name}`);
    }
    const nw = get(r, 'needWant')?.toLowerCase(); const pm = get(r, 'paymentMethod');
    const time = get(r, 'time')?.match(/^(\d{1,2}):(\d{2})/);
    const txn: TxnInput | null = errors.length ? null : { ...blankTxn(type), date: date!, time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '12:00', name: name || (type === 'income' ? 'Income' : 'Expense'), merchant,
      amount: type === 'adjustment' ? a! : Math.abs(a!), fee: Math.abs(amt(get(r, 'fee')) ?? 0), accountId: acc!.id, toAccountId: type === 'transfer' || type === 'debt_repayment' ? to?.id ?? null : null,
      categoryId: cat?.id ?? null, needWant: (nw === 'need' || nw === 'want' ? nw : cat?.needWant ?? null) as NeedWant,
      paymentMethod: (PAYMENT_METHODS.find((p) => p.label.toLowerCase() === pm?.toLowerCase() || p.v === pm)?.v ?? null) as PaymentMethod | null, remarks: get(r, 'remarks') ?? '' };
    return { line, txn, errors, warnings, existingId: get(r, 'id') || undefined };
  });
}
