// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Welcome to MyFinance');
  // add account
  await p.click('text=Add your first account');
  await p.fill('input[placeholder^="e.g. Maybank"]', 'Test Bank');
  await p.locator('input[inputmode=decimal]').first().fill('1000');
  await p.click('button[type=submit]:has-text("Save")');
  await p.waitForSelector('text=Account created');
  // add expense
  await p.locator('header button[aria-label="New"] >> visible=true').click().then(() => p.click('[role=menuitem]:has-text("Add Expense")'));
  await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('12.50');
  await p.locator('[role=dialog] select').nth(0).selectOption({ index: 1 });
  await p.fill('[role=dialog] input[list=mf-merchants]', 'Mamak');
  await p.locator('[role=dialog] select').nth(1).selectOption('exp-food');
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForSelector('text=Transaction saved');
  const total = await p.locator('text=Available now').locator('..').innerText();
  console.log('AVAILABLE:', total.replace(/\n/g, ' | '));
  // duplicate warning
  await p.locator('header button[aria-label="New"] >> visible=true').click().then(() => p.click('[role=menuitem]:has-text("Add Expense")'));
  await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('12.50');
  await p.locator('[role=dialog] select').nth(0).selectOption({ index: 1 });
  await p.fill('[role=dialog] input[list=mf-merchants]', 'Mamak');
  const catVal = await p.locator('[role=dialog] select').nth(1).inputValue();
  console.log('learned category:', catVal);
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForSelector('text=Possible duplicate'); console.log('duplicate warning OK');
  await p.click('text=Review'); await p.click('[role=dialog] button:has-text("Cancel")');
  // demo
  await p.goto('http://localhost:4173/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 20000 });
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Safe to spend today'); await p.waitForTimeout(800);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-dash-desktop.png'), fullPage: true });
  await p.goto('http://localhost:4173/accounts'); await p.waitForTimeout(500); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-accounts.png'), fullPage: true });
  await p.goto('http://localhost:4173/transactions'); await p.waitForTimeout(500);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-txns.png') });
  await p.goto('http://localhost:4173/backup'); await p.click('text=Snapshot now'); await p.waitForSelector('text=Manual snapshot');
  // dark mobile
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  m.on('pageerror', (e) => errs.push('m pageerror: ' + e.message));
  // separate context => fresh DB; just check empty + layout
  await m.goto('http://localhost:4173/'); await m.waitForSelector('text=Welcome'); await m.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-mobile-empty.png') });
  const m2 = p; await m2.setViewportSize({ width: 390, height: 844 });
  await m2.goto('http://localhost:4173/'); await m2.waitForTimeout(1000); await m2.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-mobile-dash.png'), fullPage: false });
  const sw = await m2.evaluate(() => document.documentElement.scrollWidth); console.log('mobile scrollWidth', sw);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
