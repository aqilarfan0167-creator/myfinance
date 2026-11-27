// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } }); const N = Number(process.env.N);
  await p.goto('http://localhost:4173/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  await p.evaluate((N) => new Promise((res) => { const r = indexedDB.open('myfinance'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['transactions'], 'readwrite'); const s = tx.objectStore('transactions');
    for (let i = 0; i < N; i++) s.put({ id: 'perf' + i, date: new Date(Date.UTC(2024, 0, 1) + (i % 1060) * 86400000).toISOString().slice(0, 10), time: '12:00', name: 'P' + (i % 300), merchant: 'S' + (i % 300), type: 'expense', categoryId: 'exp-food', amount: 500 + i % 999, fee: 0, accountId: 'x', toAccountId: null, paymentMethod: null, needWant: 'need', remarks: '', status: 'actual', attachmentIds: [], related: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null });
    tx.oncomplete = () => { db.close(); res(); }; }; }), N);
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Safe to spend today', { timeout: 60000 }); await p.waitForTimeout(2000);
  const res = {};
  for (const [label, sel] of [['/transactions', 'text=/\\d+ transactions?/'], ['/budget', 'text=Category budgets'], ['/reports', 'text=Expenses by category'], ['/insights', 'text=Based only on'], ['/calendar', 'text=Mon'], ['/', 'text=Safe to spend today']]) {
    const t0 = Date.now(); await p.click(`aside a[href="${label}"]`); await p.waitForSelector(sel, { timeout: 60000 }); res[label] = Date.now() - t0; }
  console.log(`N=${N} in-app navigation (ms):`, JSON.stringify(res)); await b.close(); })();
