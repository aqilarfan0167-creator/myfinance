/**
 * Sync engine ↔ real PostgreSQL with the production migration (RLS + sync_push), queried as Supabase's `authenticated` role.
 * Runs only when PG_SOCKET is set (see supabase/tests/README.md); skipped otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { MyFinanceDB } from '@/db/db';
import { syncOnce, type Remote } from '@/lib/sync/engine';

const SOCKET = process.env.PG_SOCKET;
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
let pool: pg.Pool;
const asUser = async <T,>(uid: string, f: (c: pg.PoolClient) => Promise<T>) => {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); const r = await f(c); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
};
const files = new Map<string, Blob>();
const pgRemote = (uid: string): Remote => ({
  userId: uid,
  pull: (after, limit) => asUser(uid, async (c) => (await c.query('select table_name, record_id, data, updated_at, deleted, seq, schema_version from sync_records where seq > $1 order by seq limit $2', [after, limit])).rows
    .map((r) => ({ table: r.table_name, id: r.record_id, data: r.data, updatedAt: new Date(r.updated_at).toISOString(), deleted: r.deleted, seq: Number(r.seq), schema: r.schema_version }))),
  push: async (rows) => { await asUser(uid, (c) => c.query('select sync_push($1::jsonb)', [JSON.stringify(rows.map((r) => ({ table_name: r.table, record_id: r.id, data: r.data, updated_at: r.updatedAt, deleted: r.deleted, schema_version: r.schema })))])); },
  putFile: async (p, b) => { files.set(p, b); }, getFile: async (p) => files.get(p) ?? null, removeFiles: async (ps) => { ps.forEach((p) => files.delete(p)); },
});
const tx = (id: string, amount: number, updatedAt: string) => ({ id, date: '2026-11-01', time: '12:00', name: 'Lunch', merchant: '', type: 'expense', categoryId: 'exp-food', amount, fee: 0, accountId: 'a1', toAccountId: null, paymentMethod: null, needWant: null, remarks: '', status: 'actual', attachmentIds: [], related: [], createdAt: '2026-11-01T00:00:00Z', updatedAt, deletedAt: null });

describe.skipIf(!SOCKET)('sync engine against PostgreSQL (production migration)', () => {
  beforeAll(async () => { pool = new pg.Pool({ host: SOCKET, port: 54329, user: 'postgres', database: 'mf' }); await pool.query('truncate sync_records'); });
  afterAll(async () => { await pool?.end(); });

  it('two devices, one account: full sync, LWW, tombstones; a second account sees nothing', async () => {
    const [A, B, C] = ['pgA', 'pgB', 'pgC'].map((n) => new MyFinanceDB(n)); for (const d of [A, B, C]) { await d.delete(); await d.open(); }
    await A.transactions.bulkPut([tx('t1', 1000, '2026-11-01T00:00:00Z'), tx('t2', 2000, '2026-11-01T00:00:00Z')] as never);
    const ra = await syncOnce(A, pgRemote(U1)); expect(ra.pushed).toBeGreaterThan(20);
    await syncOnce(B, pgRemote(U1));
    expect((await B.transactions.get('t1'))!.amount).toBe(1000);
    await A.transactions.update('t1', { amount: 1500, updatedAt: '2026-11-02T00:00:00Z' });
    await B.transactions.update('t1', { amount: 1800, updatedAt: '2026-11-03T00:00:00Z' });
    await B.transactions.delete('t2');
    await syncOnce(A, pgRemote(U1)); await syncOnce(B, pgRemote(U1)); await syncOnce(A, pgRemote(U1));
    expect((await A.transactions.get('t1'))!.amount).toBe(1800); expect((await B.transactions.get('t1'))!.amount).toBe(1800);
    expect(await A.transactions.get('t2')).toBeUndefined();
    const rc = await syncOnce(C, pgRemote(U2));
    expect(rc.pulled).toBe(0); expect(await C.transactions.count()).toBe(0);
    const counts = (await pool.query('select user_id, count(*)::int n from sync_records group by user_id order by user_id')).rows;
    expect(counts.map((r) => r.user_id)).toEqual([U1, U2]);
  }, 30000);
});
