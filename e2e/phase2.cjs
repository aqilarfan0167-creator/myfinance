// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  const U = 'http://localhost:4173';
  await p.goto(U + '/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  // Salary
  await p.goto(U + '/salary'); await p.waitForSelector('text=Salary history');
  console.log('salary rows:', await p.locator('tbody tr').count());
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-salary.png'), fullPage: true });
  // OT add
  await p.click('text=OT log'); await p.click('text=Add OT'); await p.click('[role=dialog] button:has-text("Save")'); await p.waitForSelector('text=OT saved');
  // Commitments
  await p.goto(U + '/commitments'); await p.waitForSelector('text=Total due');
  const overdueBefore = await p.locator('text=Overdue').count();
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-commitments.png'), fullPage: true });
  const mark = p.locator('button:has-text("Mark paid")').first();
  if (await mark.count()) { await mark.click(); await p.locator('[role=dialog] select').selectOption({ index: 1 }); await p.click('[role=dialog] button:has-text("Mark paid")'); await p.waitForSelector('text=Payment recorded'); console.log('mark paid OK'); }
  // Add commitment
  await p.click('button:has-text("Commitment")'); await p.fill('[role=dialog] input[list=mf-presets]', 'Insurance');
  await p.locator('[role=dialog] select').nth(1).selectOption('exp-insurance');
  await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('150');
  await p.click('[role=dialog] button:has-text("Save")'); await p.waitForSelector('text=Commitment saved'); console.log('commitment add OK');
  // recurring via txn form
  await p.click('header >> text=Add Expense');
  await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('45.90');
  await p.locator('[role=dialog] select').nth(0).selectOption({ index: 1 });
  await p.fill('[role=dialog] input[list=mf-merchants]', 'Spotify');
  await p.locator('[role=dialog] select').nth(1).selectOption('exp-subscriptions');
  await p.check('text=Repeat this transaction');
  await p.click('[role=dialog] button[type=submit]'); await p.waitForSelector('text=Recurring transaction created'); console.log('recurring via form OK');
  await p.goto(U + '/commitments'); await p.click('text=/Recurring transactions/'); await p.waitForSelector('text=Spotify');
  // Calendar
  await p.goto(U + '/calendar'); await p.waitForSelector('text=Mon'); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-calendar.png'), fullPage: true });
  await p.click('text=Week'); await p.waitForTimeout(200); await p.click('[role=tab]:has-text("Day")');
  // Dashboard
  await p.goto(U + '/'); await p.waitForSelector('text=Commitments paid'); await p.click('text=Daily Allowance'); await p.waitForTimeout(300);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-allowance.png') });
  console.log('allowance modal:', (await p.locator('[role=dialog]').innerText()).replace(/\n/g, ' | ').slice(0, 400));
  await p.keyboard.press('Escape');
  // Mobile overflow
  await p.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/salary', '/commitments', '/calendar']) {
    await p.goto(U + path); await p.waitForTimeout(800);
    console.log(path, 'scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  }
  await p.goto(U + '/calendar'); await p.waitForTimeout(500); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-calendar-mobile.png') });
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
