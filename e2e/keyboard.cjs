// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('http://localhost:4173/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(800);
  await p.focus('header button[aria-label="New"] >> visible=true'); await p.keyboard.press('Enter'); await p.waitForSelector('[role=menu]');
  await p.focus('[role=menuitem]:has-text("Add Expense")'); await p.keyboard.press('Enter'); await p.waitForSelector('[role=dialog]');
  const inDialog = () => p.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
  console.log('focus moved into dialog:', await inDialog(), '| focused:', await p.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('inputmode') ?? '')));
  for (let i = 0; i < 40; i++) await p.keyboard.press('Tab'); console.log('after 40×Tab still inside:', await inDialog());
  for (let i = 0; i < 40; i++) await p.keyboard.press('Shift+Tab'); console.log('after 40×Shift+Tab still inside:', await inDialog());
  console.log('dialog labelled:', await p.evaluate(() => document.getElementById(document.querySelector('[role=dialog]').getAttribute('aria-labelledby'))?.textContent));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('Escape closed:', (await p.locator('[role=dialog]').count()) === 0, '| focus returned to opener:', await p.evaluate(() => document.activeElement?.textContent?.trim()));
  // nested: transaction form → delete confirm; Escape closes only the top one
  await p.goto('http://localhost:4173/transactions'); await p.locator('main button:has(p)').first().click(); await p.waitForSelector('[role=dialog]');
  await p.click('[role=dialog] button:has-text("Delete")'); await p.waitForTimeout(200); console.log('dialogs open:', await p.locator('[role=dialog]').count());
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); console.log('after Escape:', await p.locator('[role=dialog]').count(), 'dialog(s) (edit form stays)');
  await b.close(); })();
