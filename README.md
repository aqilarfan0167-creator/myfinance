# MyFinance

A local-first personal finance manager for Malaysia: amounts in RM, dates as DD/MM/YYYY, timezone Asia/Kuala_Lumpur.

## Quick start
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit/integration tests
npm run build      # production build in dist/
```
The app works without any configuration and stores data in IndexedDB in your browser. The database starts empty; you can load demo data from **Settings**.

## Deploy
`dist/` is a static site that can be hosted on Netlify, Vercel, Cloudflare Pages or similar. Configure an SPA fallback so every route serves `index.html`.

## Supabase (optional, Phase 6)
1. Create a project and run `supabase/migrations/0001_init.sql`.
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use the **anon** key only; never put the service-role key in the frontend.

Sync is not wired up yet; see DEVELOPMENT_PROGRESS.md.

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
- **Backup:** download a JSON backup regularly. Restoring shows a preview first and takes a safety snapshot of your current data.
