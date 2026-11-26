import { describe, it, expect, beforeEach } from 'vitest';
import { MyFinanceDB } from '@/db/db';
import { syncOnce, SchemaTooNewError } from '@/lib/sync/engine';
import { FakeServer } from '@/lib/sync/fakeRemote';

const acc = (id: string, name: string, updatedAt: string) => ({ id, name, type: 'bank', openingBalance: 1000, openingDate: '2026-01-01', icon: 'Landmark', color: '#000', status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, createdAt: '2026-01-01T00:00:00Z', updatedAt, deletedAt: null });
const tx = (id: string, amount: number, updatedAt: string) => ({ id, date: '2026-11-01', time: '12:00', name: 'Lunch', merchant: '', type: 'expense', categoryId: 'exp-food', amount, fee: 0, accountId: 'a1', toAccountId: null, paymentMethod: null, needWant: null, remarks: '', status: 'actual', attachmentIds: [], related: [], createdAt: '2026-11-01T00:00:00Z', updatedAt, deletedAt: null });
let A: MyFinanceDB, B: MyFinanceDB, S: FakeServer;
let clock = 0; const now = () => new Date(Date.UTC(2026, 10, 26, 0, 0, clock++)).toISOString();

describe('cloud sync engine', () => {
  beforeEach(async () => {
    for (const n of ['devA', 'devB']) await new MyFinanceDB(n).delete();
    A = new MyFinanceDB('devA'); B = new MyFinanceDB('devB'); await A.open(); await B.open(); S = new FakeServer(); clock = 0;
  });

  it('first sync uploads everything; second device receives it exactly; re-sync is a no-op', async () => {
    await A.accounts.put(acc('a1', 'Maybank', '2026-11-01T00:00:00Z') as never);
    await A.transactions.put(tx('t1', 1250, '2026-11-01T01:00:00Z') as never);
    const r1 = await syncOnce(A, S.remote('u1'), now);
    expect(r1.pushed).toBeGreaterThan(20); // categories + settings + records
    const r2 = await syncOnce(B, S.remote('u1'), now);
    expect(await B.transactions.get('t1')).toEqual(await A.transactions.get('t1'));
    expect((await B.accounts.get('a1'))!.name).toBe('Maybank');
    expect(r2.pushed).toBe(0);                       // B pulled the same content – nothing to push back
    const before = S.seq; const r3 = await syncOnce(A, S.remote('u1'), now);
    expect(r3).toMatchObject({ pulled: 0, pushed: 0 }); expect(S.seq).toBe(before);
  });

  it('last writer wins; an older edit never overwrites a newer one', async () => {
    await A.transactions.put(tx('t1', 1000, '2026-11-01T00:00:00Z') as never);
    await syncOnce(A, S.remote('u1'), now); await syncOnce(B, S.remote('u1'), now);
    await A.transactions.update('t1', { amount: 2000, updatedAt: '2026-11-02T00:00:00Z' });   // older edit
    await B.transactions.update('t1', { amount: 3000, updatedAt: '2026-11-03T00:00:00Z' });   // newer edit
    await syncOnce(B, S.remote('u1'), now);
    const ra = await syncOnce(A, S.remote('u1'), now);
    expect(ra.conflicts).toBe(1);
    expect((await A.transactions.get('t1'))!.amount).toBe(3000);
    await syncOnce(B, S.remote('u1'), now);
    expect((await B.transactions.get('t1'))!.amount).toBe(3000);
    expect(S.rows.get('transactions:t1')!.data!.amount).toBe(3000);
  });

  it('hard deletes propagate as tombstones; soft deletes sync as data', async () => {
    await A.transactions.bulkPut([tx('t1', 100, '2026-11-01T00:00:00Z'), tx('t2', 200, '2026-11-01T00:00:00Z')] as never);
    await syncOnce(A, S.remote('u1'), now); await syncOnce(B, S.remote('u1'), now);
    await A.transactions.delete('t1');                                                   // hard delete (e.g. demo cleanup)
    await A.transactions.update('t2', { deletedAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z' }); // soft delete
    const r = await syncOnce(A, S.remote('u1'), now); expect(r.deletedRemote).toBe(1);
    const rb = await syncOnce(B, S.remote('u1'), now); expect(rb.deletedLocal).toBe(1);
    expect(await B.transactions.get('t1')).toBeUndefined();
    expect((await B.transactions.get('t2'))!.deletedAt).toBe('2026-11-05T00:00:00Z');
  });

  it('a newer local edit survives a remote delete', async () => {
    await A.transactions.put(tx('t1', 100, '2026-11-01T00:00:00Z') as never);
    await syncOnce(A, S.remote('u1'), now); await syncOnce(B, S.remote('u1'), now);
    await A.transactions.delete('t1'); await syncOnce(A, S.remote('u1'), now);            // tombstone stamped 2026-11-26
    await B.transactions.update('t1', { amount: 999, updatedAt: '2026-12-01T00:00:00Z' }); // edited later on B
    await syncOnce(B, S.remote('u1'), now);
    expect((await B.transactions.get('t1'))!.amount).toBe(999);
    await syncOnce(A, S.remote('u1'), now);
    expect((await A.transactions.get('t1'))!.amount).toBe(999);
  });

  it('changes without a timestamp bump still sync (content hash)', async () => {
    await syncOnce(A, S.remote('u1'), now); await syncOnce(B, S.remote('u1'), now);
    await A.settings.update('app', { merchantCategory: { tesco: 'exp-groceries' } });       // no updatedAt change
    await syncOnce(A, S.remote('u1'), now); await syncOnce(B, S.remote('u1'), now);
    expect((await B.settings.get('app'))!.merchantCategory).toEqual({ tesco: 'exp-groceries' });
  });

  it('files are uploaded and downloaded; deleted attachments are removed from storage', async () => {
    const att = { id: 'f1', kind: 'receipt', fileName: 'r.png', mimeType: 'image/png', size: 3, hash: 'x', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', deletedAt: null };
    await A.attachments.put(att as never); await A.files.put({ id: 'f1', blob: new Blob(['abc']), thumb: new Blob(['t']), processed: null });
    const ra = await syncOnce(A, S.remote('u1'), now); expect(ra.filesUp).toBe(1); expect([...S.files.keys()].sort()).toEqual(['u1/f1/original', 'u1/f1/thumb']);
    const rb = await syncOnce(B, S.remote('u1'), now); expect(rb.filesDown).toBe(1);
    expect(await (await B.files.get('f1'))!.blob.text()).toBe('abc');
    await A.attachments.update('f1', { deletedAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z' });
    await syncOnce(A, S.remote('u1'), now); expect(S.files.size).toBe(0);
  });

  it('refuses data from a newer app schema without applying anything', async () => {
    await S.remote('u1').push([{ table: 'transactions', id: 'tz', data: tx('tz', 1, '2026-11-01T00:00:00Z'), updatedAt: '2026-11-01T00:00:00Z', deleted: false, schema: 99 }]);
    await expect(syncOnce(A, S.remote('u1'), now)).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(await A.transactions.get('tz')).toBeUndefined();
  });
});
