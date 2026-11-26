# MyFinance

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
npm run test:smoke   # cold-loads all 22 pages × empty/demo × light/dark (needs `npx vite preview --port 4173`)
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

## User guide (Phase 1)
- **Accounts:** add your bank accounts, cash, e-wallets, savings and credit cards. Enter a credit card's opening balance as the amount you owe. Use **Reconcile** to match the balance your bank shows; the app records the difference as an adjustment.
- **Add transactions:** use the header buttons on desktop or the **+** button on mobile.
  - Choose **Transfer** to move money between your own accounts.
  - Choose **Debt Repayment** to pay a card. Pick the card as the destination so the purchases aren't counted twice.
  - Save income as **Expected** until it arrives, then press **Received**.
- **Dashboard:** tap **Daily Allowance** to see how it is calculated. Set your salary day in Settings.
- **Salary & OT:**
  1. Fill in **Profile & OT rates**, then log your overtime.
  2. Add a salary record each month. Use **Estimate EPF/SOCSO/EIS** for the deductions, then check them against your payslip.
  3. When the money arrives, press **Confirm received**. This records the income once; confirming again only updates it.
- **Commitments:** add rent, loans, PTPTN, insurance and bills. Choose "Debt repayment" for loans and credit cards. Use **Mark paid**, or link a payment you've already recorded. Unpaid amounts due before payday are deducted from your daily allowance.
- **Recurring:** tick **Repeat** when adding a transaction, or manage them under Commitments → Recurring. Don't track the same bill both as a commitment and as a recurring transaction.
- **Calendar:** shows month, week and day views of transactions, expected items and commitments due.
- **Budget:** set a budget for each category every month, or copy last month's. Bars turn orange at 70% and red at 100%.
- **Savings goals:**
  - **Contributions:** choose an account to move money from and the app records a real transfer (never an expense). Or just update the goal's progress.
  - **Daily allowance:** goal money kept in your spending account is set aside, so you don't spend it by accident.
- **Debt & credit cards:**
  - **Adding them:** add each loan as a "Loan / Financing" account. For hire-purchase car loans, choose "Flat" and enter the remaining total payable.
  - **Charges and repayments:** record interest or fees separately. **Repay** automatically marks the matching commitment as paid.
  - **Schedule:** shows how much sooner you'd finish with extra payments.
- **Simulator:** try changes such as a pay rise, a car purchase or a new loan. It never changes your records.
- **Tasks:** recurring tasks schedule the next one when you tick them off.
- **Scanning receipts:**
  1. Go to **Scan Receipt** and take a photo, upload files (including several at once, PDFs and HEIC), paste, or drag them in.
  2. Check the fields highlighted in orange or red, choose the account you paid from, then press **Confirm & save expense**. Nothing is recorded before that.
  3. Use **Split** to divide one receipt across several categories, or **Attach to existing** if you already entered the expense.
  - Receipts are read on your device; nothing is uploaded.
- **Receipt Library:** search, preview, download or delete receipts. Deleting a receipt keeps its transaction.
- **Payslips:** in a salary record, use **Read payslip** to pre-fill the figures from an image or PDF.
- **Reports:** pick a daily, weekly, monthly, yearly or custom period. Each report is compared with the previous period. Export it as PDF, Excel or CSV, or print it. Transfers between your own accounts are never counted as income or spending.
- **Insights:** trends, unusual increases, frequent purchases, budget pace and savings health, all calculated from your own records.
- **Notifications:**
  - **Bell icon:** shows your reminders.
  - **Choosing reminders:** pick which ones you want under Notifications → Reminder settings, where you can also turn on system pop-ups.
  - **Timing:** reminders only appear while MyFinance is open.
- **Backup & Restore:**
  - **Full backup:** download a **full backup (ZIP)** regularly. It includes receipts and payslips.
  - **Restoring:** the backup is checked and previewed first, and you choose to merge or replace.
  - **Folder backups:** on Chrome or Edge on a computer you can choose a folder for automatic daily backups.
  - **CSV import:** import bank statements here; possible duplicates are unticked for you.
- **Install the app:** go to Settings → About → Install, or use your browser's "Add to Home screen". After installing, the app works offline.
- **Cloud sync:** go to Settings → Account & cloud sync. Sign in on both your laptop and your phone to keep them in sync. Restoring shows a preview first and takes a safety snapshot of your current data.
