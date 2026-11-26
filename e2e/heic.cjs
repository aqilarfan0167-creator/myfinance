// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } }); const logs = [];
  p.on('console', (m) => (m.type() === 'error' || /Refused|Security/.test(m.text())) && logs.push(m.text().slice(0, 200))); p.on('pageerror', (e) => logs.push('ERR ' + e.message.slice(0, 200)));
  await p.goto('http://localhost:4173/scan'); await p.waitForSelector('text=Take photo');
  await p.setInputFiles('input[type=file][multiple]', require('path').join(__dirname, '../src/__tests__/fixtures/receipt-iphone.heic'));
  await p.waitForTimeout(8000);
  const toast = await p.locator('[aria-live]').innerText().catch(() => '');
  const merchant = await p.locator('label:has(span:text-is("Merchant")) input').first().inputValue().catch(() => '(no review)');
  const total = await p.locator('label:has(span:text-is("Total (MYR)")) input').first().inputValue().catch(() => '');
  console.log('toast:', JSON.stringify(toast), '| merchant:', merchant, '| total:', total); console.log('logs:', logs);
  await b.close(); })();
