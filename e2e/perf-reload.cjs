// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4173/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  const N = Number(process.env.N || 10000);
  await p.evaluate((N) => new Promise((res) => { const r = indexedDB.open('myfinance'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['transactions', 'accounts'], 'readwrite');
    const accs = []; tx.objectStore('accounts').getAll().onsuccess = (e) => { for (const a of e.target.result) accs.push(a.id);
      const cats = ['exp-food', 'exp-groceries', 'exp-petrol', 'exp-shopping', 'exp-utilities']; const s = tx.objectStore('transactions');
      for (let i = 0; i < N; i++) { const d = new Date(Date.UTC(2024, 0, 1) + (i % 1060) * 86400000).toISOString().slice(0, 10);
        s.put({ id: 'perf' + i, date: d, time: '12:00', name: 'Perf ' + (i % 300), merchant: 'Shop ' + (i % 300), type: i % 25 === 0 ? 'income' : 'expense', categoryId: i % 25 === 0 ? 'inc-salary' : cats[i % 5], amount: 500 + (i * 37) % 20000, fee: 0,
          accountId: accs[i % accs.length], toAccountId: null, paymentMethod: null, needWant: i % 2 ? 'need' : 'want', remarks: '', status: 'actual', attachmentIds: [], related: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null }); } };
    tx.oncomplete = () => { db.close(); res(); }; }; }), N);
  const time = async (path, sel) => { const t0 = Date.now(); await p.goto('http://localhost:4173' + path); await p.waitForSelector(sel, { timeout: 60000 }); return Date.now() - t0; };
  const res = {};
  res.dashboard = await time('/', 'text=Income vs Expenses');
  res.transactions = await time('/transactions', 'text=/\\d+ record/');
  res.reportsMonthly = await time('/reports', 'text=Expenses by category');
  await p.selectOption('select[aria-label="Report period"]', 'yearly'); let t0 = Date.now(); await p.waitForFunction(() => document.querySelector('main span.min-w-40')?.textContent === '2026'); res.reportYearlySwitch = Date.now() - t0;
  res.insights = await time('/insights', 'text=Based only on');
  res.calendar = await time('/calendar', 'text=Mon');
  res.budget = await time('/budget', 'text=Category budgets');
  await p.goto('http://localhost:4173/transactions'); await p.waitForSelector('text=/\\d+ record/');
  t0 = Date.now(); await p.fill('input[placeholder^="Search"]', 'Shop 12'); await p.waitForFunction(() => /\d+ record/.test(document.body.innerText)); res.searchKeystroke = Date.now() - t0;
  // add one expense and time until the dashboard reflects it
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Income vs Expenses');
  t0 = Date.now(); await p.click('header >> text=Add Expense'); await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('1.23'); await p.locator('[role=dialog] select').nth(0).selectOption({ index: 1 });
  await p.locator('[role=dialog] select').nth(1).selectOption('exp-food'); await p.click('[role=dialog] button[type=submit]'); await p.waitForSelector('text=Transaction saved'); res.addExpenseRoundTrip = Date.now() - t0;
  const mem = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a');
  console.log(`N=${N} transactions (+ demo):`, JSON.stringify(res), 'heap', mem, 'errors', errs.length); await b.close(); })();
