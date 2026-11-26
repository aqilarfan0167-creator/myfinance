import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { saveAccount, saveTransaction, blankTxn, importTransactions } from '@/db/repo';
import { buildZip, readZip, restoreZip, previewZip } from '@/db/zipBackup';
import { parseCsv, guessMapping, buildImport, parseDate } from '@/domain/csvImport';
import { reportTables } from '@/lib/reportExport';
import { buildReport, periodRange } from '@/domain/report';
import { toCSV } from '@/lib/csv';

const acc = (o = {}) => saveAccount({ name: 'Maybank', type: 'bank', openingBalance: 100000, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, ...o });

describe('ZIP backup', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('round-trips records AND files with checksums; replace restores exactly', async () => {
    const a = await acc();
    const t = await saveTransaction({ ...blankTxn('expense'), amount: 1234, accountId: a, categoryId: 'exp-food', attachmentIds: ['att1'] });
    await db.attachments.put({ id: 'att1', kind: 'receipt', fileName: 'r.png', mimeType: 'image/png', size: 5, hash: 'h', createdAt: 'x', updatedAt: 'x', deletedAt: null });
    await db.files.put({ id: 'att1', blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' }), thumb: new Blob(['th']), processed: null });
    const { bytes, manifest } = await buildZip();
    expect(manifest.counts).toMatchObject({ transactions: 1, attachments: 1, files: 2 });
    // wipe & restore
    await db.transactions.clear(); await db.files.clear(); await db.attachments.clear();
    const parsed = await readZip(bytes); expect(parsed.problems).toEqual([]);
    expect((await previewZip(parsed, 'merge')).files).toEqual({ inBackup: 1, new: 1 });
    const r = await restoreZip(parsed, 'replace'); expect(r.restoredFiles).toBe(1);
    expect((await db.transactions.get(t))!.amount).toBe(1234);
    expect(new Uint8Array(await (await db.files.get('att1'))!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
  it('rejects damaged or foreign ZIPs', async () => {
    const { bytes } = await buildZip();
    const bad = bytes.slice(); for (let i = 60; i < 70; i++) bad[i] ^= 0xff; // corrupt compressed data.json
    await expect(readZip(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a valid ZIP|not a MyFinance/i);
    await expect(readZip(bad)).rejects.toThrow();
  });
});

describe('CSV import', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('bank statement with debit/credit columns, DMY dates, quotes and semicolons', async () => {
    const a = await acc(); const [cats, accounts] = [await db.categories.toArray(), await db.accounts.toArray()];
    const rows = parseCsv('﻿Tarikh;Keterangan;Debit;Credit\r\n05/11/2026;"TESCO; KEPONG";45,90;\r\n06/11/2026;"Salary ""Nov""";;4500.00\r\n31/02/2026;Bad;1;\r\n');
    expect(rows[1][1]).toBe('TESCO; KEPONG'); expect(rows[2][1]).toBe('Salary "Nov"');
    const map = guessMapping(rows[0]); expect(map).toMatchObject({ date: 0, name: 1, debit: 2, credit: 3 });
    const res = buildImport(rows, map, { dateOrder: 'dmy', defaultAccountId: a, positiveIs: 'income', skipHeader: true, learned: { 'tesco; kepong': 'exp-groceries' } }, cats, accounts);
    expect(res[0].txn).toMatchObject({ type: 'expense', amount: 4590, date: '2026-11-05', categoryId: 'exp-groceries' });
    expect(res[1].txn).toMatchObject({ type: 'income', amount: 450000, categoryId: 'inc-other' });
    expect(res[2].errors[0]).toMatch(/Invalid date/);
    expect(await importTransactions(res.filter((r) => r.txn).map((r) => r.txn!), 'test')).toBe(2);
    expect(await db.transactions.count()).toBe(2);
    expect(parseDate('2026-11-05', 'dmy')).toBe('2026-11-05'); expect(parseDate('11/05/2026', 'mdy')).toBe('2026-11-05');
  });
  it('re-imports MyFinance’s own transactions export (round trip)', async () => {
    const a = await acc(); const s = await acc({ name: 'ASB', type: 'savings' });
    await saveTransaction({ ...blankTxn('expense'), date: '2026-11-03', amount: 2550, accountId: a, categoryId: 'exp-food', merchant: '=cmd', needWant: 'need' });
    await saveTransaction({ ...blankTxn('transfer'), date: '2026-11-04', amount: 10000, fee: 50, accountId: a, toAccountId: s });
    const [accounts, txns, cats] = [await db.accounts.toArray(), await db.transactions.toArray(), await db.categories.toArray()];
    const rep = buildReport({ accounts, txns, cats, occ: [], goals: [], goalEntries: [], salaries: [], ot: [], budgets: [], receipts: [], today: '2026-11-25' }, 'monthly', periodRange('monthly', '2026-11-25'));
    const t = reportTables(rep, accounts, cats).txns;
    const csv = toCSV(t.slice(1).map((row) => Object.fromEntries((t[0] as string[]).map((h, i) => { const c = row[i]; return [h, c == null ? '' : typeof c === 'object' ? (c.f === 'money' ? (c.v as number).toFixed(2) : c.v) : c]; }))));
    const rows = parseCsv(csv); const map = guessMapping(rows[0]);
    const res = buildImport(rows, map, { dateOrder: 'dmy', defaultAccountId: null, positiveIs: 'expense', skipHeader: true, learned: {} }, cats, accounts);
    expect(res.every((r) => r.errors.length === 0)).toBe(true);
    expect(res[0].txn).toMatchObject({ type: 'expense', amount: 2550, categoryId: 'exp-food', merchant: '=cmd', needWant: 'need', accountId: a });
    expect(res[1].txn).toMatchObject({ type: 'transfer', amount: 10000, fee: 50, toAccountId: s });
    expect(res[0].existingId).toBe(txns.find((x) => x.type === 'expense')!.id);
  });
});
