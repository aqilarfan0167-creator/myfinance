// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  const U = 'http://localhost:4173';
  for (let i = 0; i < 20; i++) { try { await p.goto(U + '/settings'); break; } catch { await p.waitForTimeout(500); } }
  await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  // Budget
  await p.goto(U + '/budget'); await p.waitForSelector('text=Category budgets');
  await p.locator('select[aria-label="Category to add"]').selectOption('exp-medical'); await p.click('button[aria-label=Add]');
  await p.waitForTimeout(300); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-budget.png'), fullPage: true });
  await p.click('text=/Next month/i').catch(() => {}); await p.click('button[aria-label="Next month"]');
  await p.click('button:has-text("Copy")'); await p.waitForSelector('text=/Copied 7 budget/'); console.log('copy budgets OK');
  // Savings
  await p.goto(U + '/savings'); await p.waitForSelector('text=Total saved');
  await p.locator('button:has-text("Contribute")').nth(1).click(); // Japan trip (bank-linked)
  await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('100');
  await p.click('[role=dialog] button:has-text("Save")'); await p.waitForSelector('text=Contribution saved'); console.log('contribution OK');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-savings.png'), fullPage: true });
  // Debts
  await p.goto(U + '/debts'); await p.waitForSelector('text=Loans outstanding');
  await p.click('button:has-text("Schedule")'); await p.waitForSelector('text=Repayment schedule');
  await p.locator('[role=dialog] input[inputmode=decimal]').first().fill('200'); await p.waitForTimeout(200);
  console.log('schedule:', (await p.locator('[role=dialog]').innerText()).split('\n').slice(0, 14).join(' | '));
  await p.keyboard.press('Escape'); await p.click('[aria-label=Close]').catch(() => {});
  await p.click('button:has-text("Repay")'); await p.locator('[role=dialog] select').first().selectOption({ index: 1 });
  await p.click('[role=dialog] button[type=submit]'); await p.waitForSelector('text=Transaction saved'); console.log('loan repay OK');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-loans.png'), fullPage: true });
  await p.click('[role=tab]:has-text("Credit cards")'); await p.waitForSelector('text=utilised'); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-cards.png'), fullPage: true });
  console.log('card:', (await p.locator('main').innerText()).split('\n').filter((l) => /Statement|Still due|Paid since|Minimum/.test(l)).join(' | '));
  // Simulator
  await p.goto(U + '/simulator'); await p.waitForSelector('text=Your baseline');
  await p.click('button:has-text("Buy a car")'); await p.click('button:has-text("Extra debt repayment")'); await p.waitForTimeout(200);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-sim.png'), fullPage: true });
  // Tasks
  await p.goto(U + '/tasks'); await p.waitForSelector('text=Overdue');
  await p.locator('input[type=checkbox][aria-label^="Complete Renew"]').click(); await p.waitForSelector("text=next one scheduled"); console.log('recurring task OK');
  // Dashboard allowance
  await p.goto(U + '/'); await p.waitForSelector('text=Where your money went'); await p.click('button:has-text("How?")'); await p.waitForTimeout(300);
  console.log('allowance:', (await p.locator('[role=dialog]').innerText()).replace(/\n/g, ' | ').slice(0, 520));
  await p.keyboard.press('Escape'); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-dash3.png'), fullPage: true });
  await p.goto(U + '/calendar'); await p.waitForSelector('text=Goal targets');
  // mobile
  await p.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/budget', '/savings', '/debts', '/simulator', '/tasks', '/calendar', '/accounts']) {
    await p.goto(U + path); await p.waitForTimeout(700);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > 390) console.log('OVERFLOW', path, sw);
  }
  await p.goto(U + '/debts'); await p.waitForTimeout(500); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-debts-mobile.png') });
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
