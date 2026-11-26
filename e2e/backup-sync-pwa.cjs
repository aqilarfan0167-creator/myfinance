// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright'); const { execFileSync } = require('child_process'); const fs = require('fs');
const FX = require('path').join(__dirname, '../src/__tests__/fixtures/'); const SP = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mf-e2e-')); const U = 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|supabase|fetch/i.test(m.text()) && errs.push('console: ' + m.text().slice(0, 200))); };

  // 1. Pre-upgrade safety: an old (v5) database with data is snapshotted before the app upgrades it
  const c0 = await b.newContext(); const p0 = await c0.newPage(); watch(p0);
  await p0.goto(U + '/icon.svg');
  await p0.evaluate(() => new Promise((res) => { const r = indexedDB.open('myfinance', 10); r.onupgradeneeded = () => { const d = r.result; const idx = { accounts: ['type', 'status', 'updatedAt'], transactions: ['date', 'type', 'accountId', 'toAccountId', 'categoryId', 'status', 'merchant', 'updatedAt', 'recurringId'], categories: ['kind', 'name'], settings: [], audit: ['at', 'entity', 'entityId'], meta: [] }; for (const [s, ix] of Object.entries(idx)) { const os = d.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' }); ix.forEach((i) => os.createIndex(i, i)); } };
    r.onsuccess = () => { const d = r.result; const t = d.transaction(['transactions', 'settings'], 'readwrite'); t.objectStore('transactions').put({ id: 'old1', amount: 4242, date: '2026-01-01', deletedAt: null, status: 'actual', type: 'expense', related: [], attachmentIds: [] }); t.objectStore('settings').put({ id: 'app', language: 'en', theme: 'system', payDay: 25, demoLoaded: false, merchantCategory: {} }); t.oncomplete = () => { d.close(); res(); }; }; }));
  await p0.goto(U + '/backup'); await p0.waitForSelector('text=Before upgrade v1 → v6', { timeout: 20000 });
  console.log('pre-upgrade snapshot shown: OK; old txn kept:', await p0.evaluate(() => new Promise((res) => { const r = indexedDB.open('myfinance'); r.onsuccess = () => { const g = r.result.transaction('transactions').objectStore('transactions').get('old1'); g.onsuccess = () => res(g.result?.amount + ' (db v' + r.result.version / 10 + ')'); }; })));
  await c0.close();

  // 2. Full ZIP backup including a scanned receipt file
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); watch(p);
  await p.goto(U + '/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  await p.goto(U + '/scan'); await p.setInputFiles('input[type=file][multiple]', FX + 'receipt-restaurant.png');
  await p.waitForSelector('text=Confirm & save expense'); await p.waitForFunction(() => !document.body.innerText.includes('Reading receipt on this device'), null, { timeout: 60000 });
  await p.locator('label:has(span:text-is("Paid from account *")) select').selectOption({ label: '[Demo] Maybank' });
  await p.click('text=Confirm & save expense'); await p.waitForSelector('text=Expense saved and receipt linked');
  await p.goto(U + '/backup');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('text=Download full backup (ZIP)')]); const zipPath = SP + '/full.zip'; await d.saveAs(zipPath);
  console.log('zip:', execFileSync('python3', ['-c', `import zipfile,json;z=zipfile.ZipFile('${zipPath}');n=z.namelist();m=json.loads(z.read('manifest.json'));print(len(n),'entries;',m['counts']['transactions'],'txns;',m['counts']['files'],'files;',[x for x in n if x.startswith('files/')][:2])`]).toString().trim());
  const txCount = async () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('myfinance'); r.onsuccess = () => { const c = r.result.transaction('transactions').objectStore('transactions').count(); c.onsuccess = () => res(c.result); }; }));
  const before = await txCount();

  // 3. Wipe everything (fresh profile) and restore the ZIP → records + receipt image back
  const ctx2 = await b.newContext({ viewport: { width: 1366, height: 900 } }); const q = await ctx2.newPage(); watch(q);
  await q.goto(U + '/backup'); await q.setInputFiles('input[type=file][accept*=zip]', zipPath); await q.waitForSelector('text=All checksums verified');
  await q.click('[role=dialog] button:text-is("Replace")'); await q.click('text=Restore (replace)'); await q.locator('[role=dialog] button:text-is("Replace")').last().click();
  await q.waitForSelector('text=/Restore complete · \\d+ file/'); console.log('restore toast:', await q.locator('text=/Restore complete/').innerText());
  const after = await q.evaluate(() => new Promise((res) => { const r = indexedDB.open('myfinance'); r.onsuccess = () => { const c = r.result.transaction('transactions').objectStore('transactions').count(); c.onsuccess = () => res(c.result); }; }));
  console.log('transactions before/after restore:', before, after);
  await q.goto(U + '/receipts'); await q.waitForSelector('text=RESTORAN NASI KANDAR'); console.log('receipt image restored:', await q.locator('main img').count() > 0);

  // 4. CSV import (bank statement)
  fs.writeFileSync(SP + '/bank.csv', 'Date;Description;Debit;Credit\n20/11/2026;GRAB FOOD;23,50;\n21/11/2026;"FUND TRANSFER ""SIDE""";;150,00\n22/11/2026;GRAB FOOD;23,50;\n');
  await q.goto(U + '/backup'); await q.click('button:has-text("Import CSV")'); await q.setInputFiles('[role=dialog] input[type=file]', SP + '/bank.csv');
  await q.locator('[role=dialog] label:has(span:text-is("Account (if no column)")) select').selectOption({ index: 1 });
  await q.click('text=Check for duplicates'); await q.waitForSelector('text=/Import \\d+ transaction/');
  console.log('csv:', await q.locator('text=/valid ·/').innerText());
  await q.click('text=/Import \\d+ transaction/'); await q.waitForSelector('text=/transaction\\(s\\) imported/'); console.log('csv import:', await q.locator('text=/imported/').innerText());

  // 5. Account page: config validation & graceful errors
  await q.goto(U + '/account'); await q.waitForSelector('text=Cloud sync is not set up');
  const svc = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from(JSON.stringify({ role: 'service_role', iss: 'supabase' })).toString('base64url') + '.c2lnbmF0dXJlc2lnbmF0dXJl';
  await q.fill('input[placeholder^="https://xxxx"]', 'https://demo-project.supabase.co'); await q.locator('label:has(span:text-is("Anon / publishable key")) input').fill(svc);
  await q.click('text=Save & connect'); await q.waitForSelector('text=/SERVICE ROLE key/'); console.log('service-role key rejected: OK');
  const anon = svc.replace(Buffer.from(JSON.stringify({ role: 'service_role', iss: 'supabase' })).toString('base64url'), Buffer.from(JSON.stringify({ role: 'anon', iss: 'supabase' })).toString('base64url'));
  await q.locator('label:has(span:text-is("Anon / publishable key")) input').fill(anon); await q.click('text=Save & connect'); await q.waitForLoadState('load'); await q.waitForSelector('text=Forgot password', { timeout: 15000 });
  await q.fill('input[type=email]', 'me@example.com'); await q.fill('input[type=password]', 'secret123'); await q.click('form button[type=submit]');
  await q.waitForSelector('form p.text-red-600', { timeout: 30000 }); console.log('sign-in against unreachable server shows error:', await q.locator('form p.text-red-600').innerText());
  await q.click('text=disconnect'); await q.waitForSelector('text=Cloud sync is not set up'); console.log('disconnect: OK');

  // 6. PWA: manifest, service worker, offline reload
  const man = await (await q.request.get(U + '/manifest.webmanifest')).json(); console.log('manifest:', man.name, man.display, man.icons.length, 'icons');
  await q.goto(U + '/'); await q.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 20000 });
  await q.reload(); await q.waitForTimeout(1500); await ctx2.setOffline(true);
  await q.goto(U + '/reports'); await q.waitForSelector('text=Expenses by category', { timeout: 15000 }); console.log('offline navigation to /reports: OK');
  await ctx2.setOffline(false);
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})().catch((e) => { console.error('FAIL', e.message.slice(0, 600)); process.exit(1); });
