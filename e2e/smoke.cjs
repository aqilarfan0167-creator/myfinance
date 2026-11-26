// Cold-load smoke test: every route in a fresh browser profile (empty DB) and again with demo data, light & dark.
// Usage: npm run build && npx vite preview --port 4173 & node e2e/smoke.cjs
const { chromium } = require('playwright');
const ROUTES = ['/', '/transactions', '/income', '/salary', '/expenses', '/scan', '/receipts', '/accounts', '/commitments', '/budget', '/savings', '/debts', '/simulator', '/calendar', '/tasks', '/insights', '/reports', '/notifications', '/settings', '/backup', '/account', '/more'];
const U = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); let fails = 0;
  for (const demo of [false, true]) for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
    if (demo) { const p = await ctx.newPage(); await p.goto(U + '/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 }); await p.close(); }
    for (const r of ROUTES) {
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
      await p.goto(U + r); await p.waitForTimeout(900);
      const ok = (await p.locator('main h1, main [role=tablist], main .grid').count()) > 0;
      if (!ok || errs.length) { fails++; console.log(`FAIL ${demo ? 'demo' : 'empty'}/${scheme} ${r}`, ok ? '' : '(nothing rendered)', errs.slice(0, 2)); }
      await p.close();
    }
    await ctx.close();
  }
  console.log(fails ? `${fails} failure(s)` : `All ${ROUTES.length * 4} cold loads OK`); await b.close(); process.exit(fails ? 1 : 0);
})();
