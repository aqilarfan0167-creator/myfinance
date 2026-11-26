# MyFinance

Docs: [User guide](USER_GUIDE.md) · [Security](SECURITY.md) · [Testing summary](TESTING_SUMMARY.md) · [Requirements](PROJECT_REQUIREMENTS.md) · [Progress](DEVELOPMENT_PROGRESS.md)

A local-first personal finance manager for Malaysia: amounts in RM, dates as DD/MM/YYYY, timezone Asia/Kuala_Lumpur.

## Quick start
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit/integration tests (includes real OCR)
npm run lint       # React hooks rules
npm run test:smoke # cold-load every page (needs `npx vite preview --port 4173` running)
npm run build      # production build in dist/ (copies the on-device OCR engine & models to public/ocr first)
```
The app works without any configuration and stores data in IndexedDB in your browser. The database starts empty; you can load demo data from **Settings**.

## Deploy
Ready-made configs: `netlify.toml` + `public/_headers` (Netlify/Cloudflare Pages) and `vercel.json` – SPA fallback and security headers included. The Content-Security-Policy is in `index.html`.
`npm run build` produces a static site in `dist/`. You can host it on Netlify, Vercel, Cloudflare Pages, GitHub Pages or similar.
- **HTTPS is required** for the live camera, the installable app (PWA), the service worker and system notifications.
- **SPA fallback:** every route must serve `index.html`. Netlify: `/* /index.html 200`. Vercel: rewrites to `/index.html`.
- **Updates:** users see "New version available – Update". Updating replaces app files only; data in IndexedDB is never touched. Database changes are additive, and a copy of the data is saved before any upgrade.

## Cloud sync with Supabase (optional)
1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/20261126000000_sync.sql`. It is safe to re-run.
3. Configure **Authentication → URL configuration**:
   - Site URL = your app URL.
   - Add `https://<your-app>/account` to Redirect URLs. This is needed for email confirmation and password reset.
4. Provide the **anon/publishable** key, in either of two ways:
   - put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` before building, or
   - enter them in the app under **Settings → Account & cloud sync**.

   Never use the service-role key; the app rejects it.

**How sync works**
- Records sync through one RLS-protected table, `sync_records`, using the RPC `sync_push`, which applies last-writer-wins on the server.
- Files go to the private `attachments` bucket under `<user-id>/`.
- Deletions sync as tombstones.
- Sync runs on start, every 5 minutes, 15 s after changes, and when the app regains focus.
- One device is bound to one account. Switching accounts requires a backup first and then clears the device.

The relational SQL in `supabase/reference/` is documentation only and is not used by the app.

## Tests
```bash
npm test             # 54 unit/integration tests (incl. real OCR, XLSX via openpyxl, PDF via pypdf, sync engine)
npm run lint         # React hooks rules
npm run test:smoke   # cold-loads all 22 pages × empty/demo × light/dark + phone width (needs `npx vite preview --port 4173`)
npm run test:a11y    # axe-core WCAG 2.1 A/AA on 20 pages × light/dark
npm run test:e2e     # every browser suite (receipts with real OCR, HEIC, reports, backup/restore, keyboard…)
```
See `supabase/tests/README.md` to test the SQL migration and sync against PostgreSQL.

## Architecture
```
src/lib       money (integer cents), KL dates, CSV, i18n, labels
src/db        Dexie schema (versioned), repo (validated atomic writes + audit), backup, demo, seed categories
src/domain    pure financial calculations (balances, summaries, net worth, daily allowance)
src/hooks     live queries – all views recompute when data changes
src/components layout, forms, UI primitives
src/pages     feature screens
```

**Data integrity rules**
- Balances are never stored. They are calculated as the opening balance plus the transactions recorded on or after the opening date.
- Internal transfers and credit card repayments are not counted as income or expenses. Transfer fees are counted as expenses.
- Deletes are soft, so records stay in the audit trail and can be restored. An account that still has transactions can only be archived.
- **Schema changes:** add a new `this.version(n)` in `src/db/db.ts`, and never edit an old one. Bump `SCHEMA_VERSION` and add the matching step to `migrateBackup`.

## User guide
See **[USER_GUIDE.md](USER_GUIDE.md)**.
