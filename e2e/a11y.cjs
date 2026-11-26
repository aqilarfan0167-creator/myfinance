// Accessibility audit (axe-core, WCAG 2.1 A/AA) of every page with demo data, light & dark.
const { chromium } = require('playwright'); const { AxeBuilder } = require('@axe-core/playwright');
const ROUTES = ['/', '/transactions', '/salary', '/scan', '/receipts', '/accounts', '/commitments', '/budget', '/savings', '/debts', '/simulator', '/calendar', '/tasks', '/insights', '/reports', '/notifications', '/settings', '/backup', '/account', '/more'];
const U = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const totals = {}; const detail = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme }); const p = await ctx.newPage();
    await p.goto(U + '/settings'); await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
    for (const r of ROUTES) {
      await p.goto(U + r); await p.waitForTimeout(800);
      const res = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of res.violations) { const k = `${v.impact} ${v.id}`; totals[k] = (totals[k] ?? 0) + v.nodes.length; (detail[k] ??= new Set()).add(`${scheme}${r}: ${v.nodes[0].target.join(' ')} — ${v.nodes[0].failureSummary?.split('\n')[1]?.trim().slice(0, 110)}`); }
    }
    await ctx.close();
  }
  const keys = Object.keys(totals).sort();
  if (!keys.length) console.log('No WCAG 2.1 A/AA violations on', ROUTES.length, 'pages × 2 themes');
  for (const k of keys) { console.log(`${k}: ${totals[k]} node(s)`); [...detail[k]].slice(0, 3).forEach((d) => console.log('   ', d)); }
  await b.close(); process.exit(keys.some((k) => /^(critical|serious)/.test(k)) ? 1 : 0);
})();
