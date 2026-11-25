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

## Phase 2 – Salary & OT, commitments, calendar
- [ ] Salary records, OT entries & configurable rates, statutory deductions (EPF/SOCSO/EIS/PCB – manual with reference calculators)
- [ ] Confirm Salary Received → income (idempotent)
- [ ] Recurring transactions & commitments generator (idempotent), statuses, Mark Paid
- [ ] Financial calendar (day/week/month)
- [ ] Feed unpaid commitments into daily allowance & dashboard

## Phase 3 – Budget, savings, debt/credit cards, simulator, tasks
## Phase 4 – Receipt scanner (camera, OCR, PDF), receipt library, attachments
## Phase 5 – Reports (PDF/Excel/CSV/print), insights, in-app notifications
## Phase 6 – ZIP backup with files, CSV import, Supabase auth + sync, PWA
## Phase 7 – Full testing, security review, bug fixes

## Known limitations (current)
- Data is stored only in this browser until Phase 6 (cloud sync). Download backups regularly.
- Bahasa Melayu covers navigation and main labels; full translation is ongoing.
- Modules marked "soon" in the sidebar are placeholders.
