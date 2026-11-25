# Development Progress

Legend: [x] done & tested · [~] partial · [ ] not started

## Phase 1 – Core architecture, accounts, transactions, dashboard ✅
- [x] Vite + React 18 + TS + Tailwind; routing; lazy pages; vendor/chart code-split
- [x] IndexedDB (Dexie) schema v1 with versioning policy (append-only versions), persistent-storage request
- [x] Repository layer: validation, atomic Dexie transactions, audit log, soft-delete + restore
- [x] Integer-cent money parsing/formatting; KL timezone dates; DD/MM/YYYY input with picker
- [x] Accounts: 6 types, CRUD, archive, delete-guard (no delete if used), credit limit/utilisation, low-balance alert, reconcile → adjustment with history
- [x] Ledger: income, expense, transfer (+fee), debt repayment (external or to card), refund, signed adjustment
- [x] Balances derived from ledger only; transfers/card repayments excluded from income/expense
- [x] Expected vs actual income; "Received" converts the same record (no duplicates)
- [x] Transactions/Income/Expenses pages: search, filters, totals, CSV export (formula-injection safe), recently-deleted restore
- [x] Duplicate warning (same type+amount ±1 day, same account or merchant)
- [x] Merchant → category learning
- [x] Custom categories (EN/BM names, colour, icon, default need/want, archive)
- [x] Dashboard: 12 KPIs, period/account/category filters, 5 charts, recent & expected income, daily-allowance breakdown modal
- [x] Light/Dark/System theme, EN/BM (navigation + key labels), desktop sidebar, mobile bottom nav + quick-add FAB
- [x] Optional demo data (tracked IDs, removable without touching user data)
- [x] JSON backup, validated restore (merge/replace) with preview, auto pre-restore snapshot, daily local auto-snapshot, history (5)
- [x] Supabase SQL schema + RLS + private storage bucket (`supabase/migrations/0001_init.sql`) – **not yet wired up**
- [x] Tests: 12 unit/integration tests (calculations, edits, transfers, card repayment, reconciliation, duplicates, backup/restore, demo) + Playwright smoke test (desktop & mobile, no console errors, no horizontal overflow)

## Phase 2 – Salary & OT, commitments, recurring, calendar ✅
- [x] DB schema v2 (additive Dexie upgrade; v1→v2 migration tested on a real v1 database; v1 backups auto-migrate)
- [x] Salary profile: company, basic, fixed allowances, ORP divisor (26), hours/day, OT multipliers per day type (EA 1955 defaults 1.5/2/3), hourly override
- [x] OT log: start/end (overnight-safe), break, hours, rate × multiplier, day type, reason, approval & payment status, salary month
- [x] Salary records: earnings, OT (auto from log or manual), EPF/SOCSO/EIS/PCB/unpaid leave/other deductions, gross/expected/actual net
- [x] Statutory **estimates** (EPF 11% banded, SOCSO 0.5% & EIS 0.2% RM100 bands capped RM6,000) – editable; PCB manual (not calculated)
- [x] One record per month+company; expected salary shown as expected income
- [x] Confirm Salary Received → income via deterministic ID `salary:<id>` (re-confirm updates, never duplicates); marks OT paid
- [x] Expected vs actual chart & salary history; warning if the linked income was deleted
- [x] Commitments: expense or debt kind, category, amount, frequency (weekly…yearly), start/end, account, card being repaid
- [x] Occurrences generated idempotently (deterministic IDs), ~2 months ahead, tracking from creation month (no back-filled overdue years)
- [x] Statuses Paid / Partially Paid / Overdue / Pending (≤7 days) / Upcoming / Skipped – derived from linked ledger payments
- [x] Mark Paid → expense or debt repayment (card repayments not double-counted); partial payments; link existing transaction; unlink; per-period amount override; skip
- [x] Recurring transactions (rules + "Repeat" in transaction form): auto-post or confirm-manually; deleted entries never recreated; stale future entries pruned
- [x] Expected entries of any type can be confirmed (same record); salary ones route through salary confirmation
- [x] Financial calendar: month/week/day views, colour legend with toggles, day detail, click to edit
- [x] Dashboard: commitments paid/pending/overdue, upcoming payments (14 days); daily allowance now deducts unpaid commitments, planned expenses and planned savings transfers due before payday (card-paid items excluded)
- [x] Generators run at start-up and when the app is reopened on a new day
- [x] Supabase migration `0002_phase2.sql` (not wired up yet)
- [x] Tests: 20 automated (schedules, OT/statutory maths, salary idempotency, commitments lifecycle, card commitments, recurring, v1→v2 migration, backup migration, demo cleanup) + Playwright flow test (salary, OT, mark paid, commitment, repeat, calendar, dashboard; no console errors; no mobile overflow)

## Phase 3 – Budget, savings, debt/credit cards, simulator, tasks
## Phase 4 – Receipt scanner (camera, OCR, PDF), receipt library, attachments
## Phase 5 – Reports (PDF/Excel/CSV/print), insights, in-app notifications
## Phase 6 – ZIP backup with files, CSV import, Supabase auth + sync, PWA
## Phase 7 – Full testing, security review, bug fixes

## Known limitations (current)
- Payslip upload/OCR deferred to Phase 4 (shares the OCR pipeline with receipts).
- Statutory figures are estimates for employees under 60; PCB is entered manually.
- Recurring items are generated when the app is opened (no background job).
- Data is stored only in this browser until Phase 6 (cloud sync). Download backups regularly.
- Bahasa Melayu covers navigation and main labels; full translation is ongoing.
- Modules marked "soon" in the sidebar are placeholders.
