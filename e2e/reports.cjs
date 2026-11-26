// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['notifications'], acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => (m.type() === 'error' || /Refused|Content Security/.test(m.text())) && errs.push('console: ' + m.text().slice(0, 200)));
  const U = 'http://localhost:4173';
  for (let i = 0; i < 20; i++) { try { await p.goto(U + '/settings'); break; } catch { await p.waitForTimeout(500); } }
  await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  // Reports
  await p.goto(U + '/reports'); await p.waitForSelector('text=Expenses by category');
  console.log('cards:', (await p.locator('main .grid').first().innerText()).replace(/\n/g, ' | ').slice(0, 420));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-reports.png'), fullPage: true });
  const dl = async (label, ext) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click(`main button:has-text("${label}")`)]); const f = require('path').join(require('os').tmpdir(), `mf-report.${ext}`); await d.saveAs(f); return f; };
  const x = await dl('Excel', 'xlsx');
  console.log('xlsx:', execFileSync('python3', ['-c', `import openpyxl;wb=openpyxl.load_workbook('${x}');s=wb['Summary'];print(wb.sheetnames);print([[c.value for c in r] for r in s.iter_rows(min_row=1,max_row=4)]);print('tx rows',wb['Transactions'].max_row)`]).toString().trim());
  const pdf = await dl('PDF', 'pdf');
  console.log('pdf:', execFileSync('python3', ['-c', `import pypdf;r=pypdf.PdfReader('${pdf}');print('pages',len(r.pages));print(r.pages[0].extract_text()[:300])`]).toString().trim().replace(/\n/g, ' | '));
  const csv = await dl('CSV', 'csv'); console.log('csv head:', require('fs').readFileSync(csv, 'utf8').split('\n').slice(0, 4).join(' | ').slice(0, 300));
  await dl('Transactions CSV', 'tx.csv');
  // period switching
  for (const k of ['daily', 'weekly', 'yearly']) { await p.selectOption('select[aria-label="Report period"]', k); await p.waitForTimeout(400); console.log(k, '→', await p.locator('main span.min-w-40').innerText()); }
  await p.selectOption('select[aria-label="Report period"]', 'monthly'); await p.click('button[aria-label="Previous period"]'); await p.waitForTimeout(300);
  console.log('prev month:', await p.locator('main span.min-w-40').innerText());
  await p.emulateMedia({ media: 'print' }); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-print.png'), fullPage: true }); await p.emulateMedia({ media: 'screen' });
  // Insights
  await p.goto(U + '/insights'); await p.waitForSelector('text=Based only on');
  console.log('insights:', (await p.locator('main p.font-semibold').allInnerTexts()).join(' || '));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-insights.png'), fullPage: true });
  // Notifications
  await p.goto(U + '/'); await p.waitForTimeout(2500);
  console.log('bell:', (await p.locator('header a[href="/notifications"]').innerText()).replace(/\s+/g, ' '));
  await p.goto(U + '/notifications'); await p.waitForSelector('text=Active (');
  console.log('notifications:', (await p.locator('main li p.text-sm').allInnerTexts()).join(' || '));
  await p.locator('button[aria-label=Dismiss]').first().click(); await p.waitForTimeout(300);
  await p.click('text=Reminder settings'); await p.click('text=Show system notifications while MyFinance is open'); await p.waitForSelector('text=System notifications enabled');
  console.log('permission:', await p.locator('text=/Permission:/').innerText().then((s) => s.slice(0, 40)));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-notif.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/reports', '/insights', '/notifications']) { await p.goto(U + path); await p.waitForTimeout(700); const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > 390) console.log('OVERFLOW', path, sw); }
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})().catch((e) => { console.error('FAIL', e.message.slice(0, 500)); process.exit(1); });
