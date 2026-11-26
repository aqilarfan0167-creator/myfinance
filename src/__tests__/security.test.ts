import { describe, it, expect, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { safeLink, checkRecord } from '@/lib/security';
import { validateBackup, exportAll } from '@/db/backup';
import { readZip } from '@/db/zipBackup';
import { db, MyFinanceDB } from '@/db/db';
import { syncOnce } from '@/lib/sync/engine';
import { FakeServer } from '@/lib/sync/fakeRemote';
import { toCSV } from '@/lib/csv';
import { validateConfig } from '@/lib/cloud';

describe('security hardening', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('safeLink only allows in-app paths', () => {
    for (const ok of ['/budget', '/transactions?account=abc-1', '/']) expect(safeLink(ok)).toBe(ok);
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/x"><script>', '\\\\evil', null, 42]) expect(safeLink(bad, '/home')).toBe('/home');
  });

  it('rejects malformed records in backups', async () => {
    const f = JSON.parse(JSON.stringify(await exportAll()));
    f.data.transactions.push({ id: 'x', date: '2026-11-01', type: 'expense', amount: '100; DROP', status: 'actual' });
    f.data.accounts.push({ id: 'a', name: 'A', type: 'hacker', openingBalance: 0, openingDate: '2026-01-01' });
    const v = validateBackup(f);
    expect(v.ok).toBe(false); expect(v.errors.join(' ')).toMatch(/transactions.*invalid amount/); expect(v.errors.join(' ')).toMatch(/accounts.*invalid type/);
    expect(checkRecord('transactions', { id: '', date: '2026-11-01' })).toBe('invalid id');
    expect(checkRecord('settings', { id: 'app', payDay: 40 })).toBe('invalid payDay');
  });

  it('refuses zip bombs before decompressing', async () => {
    const bomb = zipSync({ 'manifest.json': strToU8('{}'), 'data.json': [new Uint8Array(110 * 1048576), { level: 9 }] });
    expect(bomb.byteLength).toBeLessThan(1048576);
    const t0 = Date.now(); await expect(readZip(bomb)).rejects.toThrow(/larger than allowed/); expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('sync never stores malformed remote rows', async () => {
    const S = new FakeServer(); const A = new MyFinanceDB('secA'); await A.delete(); await A.open();
    await S.remote('u').push([{ table: 'transactions', id: 'bad', data: { id: 'bad', amount: 'NaN', date: 'x' }, updatedAt: '2026-11-01T00:00:00Z', deleted: false, schema: 6 },
      { table: 'transactions', id: 'evil', data: { id: 'other-id', amount: 1 }, updatedAt: '2026-11-01T00:00:00Z', deleted: false, schema: 6 }]);
    const r = await syncOnce(A, S.remote('u')); expect(r.rejected).toBe(2); expect(await A.transactions.count()).toBe(0);
  });

  it('CSV exports neutralise spreadsheet formulas; cloud config rejects privileged keys', () => {
    const csv = toCSV([{ a: '=HYPERLINK("http://x")', b: '+1+1', c: '-5', d: '@SUM(A1)', e: 'normal' }]);
    expect(csv.split('\n')[1]).toBe(`"'=HYPERLINK(""http://x"")",'+1+1,-5,'@SUM(A1),normal`);
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.c2lnbmF0dXJlc2lnbmF0dXJlc2ln`;
    expect(validateConfig('https://x.supabase.co', jwt('service_role'))).toMatch(/SERVICE ROLE/);
    expect(validateConfig('https://x.supabase.co', 'sb_secret_abcdefghijklmnopqrstuvwxyz123456')).toMatch(/SECRET/);
    expect(validateConfig('http://evil.com', jwt('anon'))).toMatch(/Project URL/);
    expect(validateConfig('https://x.supabase.co', jwt('anon'))).toBeNull();
  });
});
