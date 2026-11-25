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

## Phase 3 – Budget, savings, debt/credit cards, simulator, tasks ✅
- [x] DB schema v3 (additive): budgets, goals, goalEntries, tasks; new account type `loan` with loan details (no index change)
- [x] Budgets: per category per month (deterministic IDs), spent from ledger net of refunds, green <70% / orange 70–99% / red ≥100%, copy previous month (add-missing or overwrite, idempotent), unbudgeted spending, chart, debounced saving
- [x] Savings goals: type, target/date, starting amount, monthly plan, linked account, priority, colour; contributions/withdrawals (optionally real transfers – never expenses); progress, ETA, required monthly & on-track; history with delete (removes linked transfer atomically); complete/archive
- [x] Daily allowance now reserves goal money held in spending accounts + this month's unpaid goal contributions; planned savings transfers to goal accounts are not counted twice
- [x] Loans as liability accounts: lender, type, original amount, rate, reducing/flat, instalment, due day, target date; outstanding from ledger; repayments, interest/fee charges (expense), balance update (reconcile)
- [x] Repayment projection & schedule (reducing/flat), extra monthly & lump-sum what-ifs (months & interest saved), infeasible-payment warning, "Track monthly" → commitment
- [x] Credit cards: limit, used/available, utilisation, statement balance/date, due date, paid since statement, remaining & estimated minimum due; pay, purchase, interest/fee, reconcile
- [x] Repay/Pay from Debts page auto-links the open commitment item (no double counting); link shown & removable in the form
- [x] Ledger: loan charges counted once in cash flow; card repayments excluded; loan repayments included; positions split cards/loans
- [x] Financial simulator (pure, never writes): baseline from last 3 months (editable), salary change, new loan, car purchase (flat HP + running costs + down payment), new commitment, extra savings, extra repayment (time/interest saved); before/after, DSR, warnings, chart
- [x] Financial tasks: category, due date, priority, recurrence (next created once on completion), statuses, overdue grouping
- [x] Dashboard: remaining budget, budget bars, goal progress, tasks due soon, loans in debt; calendar shows tasks & goal target dates
- [x] Supabase migration `0003_phase3.sql` (not wired up yet)
- [x] Tests: 28 automated (loan maths, schedules, card statements, budget levels/copy, goals & reservations, loan/card ledger & cash flow, recurring tasks, simulator purity, v1→v3 migration, demo cleanup) + Playwright flow test; no console errors; no mobile overflow

## Phase 4 – Receipt scanner, OCR, receipt library, attachments ✅
- [x] DB schema v4 (additive): attachments (metadata + SHA-256), files (original blob, processed copy, thumbnail), receipts
- [x] Capture: live camera (rear camera preferred, switch camera, preview, retake/use, multi-shot), system-camera fallback, upload (multiple), paste (Ctrl+V & button), drag & drop
- [x] Formats: JPG, JPEG, PNG, WEBP, HEIC/HEIF (converted on device), PDF; size/type validation (20 MB)
- [x] Image tools: zoom, rotate, crop (drag), enhance (contrast stretch + sharpen), apply & rescan, reset to original – original file never modified
- [x] Real on-device OCR: Tesseract.js 7 (eng + msa) with self-hosted worker/WASM/models (no CDN, works offline); PDF.js text layer for digital PDFs, rendered-page OCR for scanned PDFs
- [x] Parser for Malaysian receipts (EN/BM): merchant, registration no., address, date (DMY, YMD, month names incl. BM), time, receipt/invoice no., items (qty × price), subtotal, discount, SST/tax, service charge, rounding, total, currency, payment method (cash, cards, DuitNow QR, e-wallets, FPX); OCR digit fixes
- [x] Per-field confidence; missing/uncertain fields highlighted; consistency checks (subtotal/tax/total, items vs subtotal); fallbacks are flagged, never silent – no fabricated values
- [x] Category suggestion: learned merchant memory → merchant/header keyword rules; account suggested only when the payment method matches exactly one account (flagged)
- [x] Review: original beside editable fields, items editor, split across categories (must equal total), required account, raw OCR text
- [x] Actions: Rescan, Retake, Save draft, Attach to existing transaction (suggested matches + search), Confirm & save expense, Cancel/discard
- [x] Records created only on confirm (atomic): expense(s) + receipt link → balances, budgets, dashboard, allowance update live
- [x] Duplicates: file hash on upload; merchant + receipt no.; merchant + date + total; matching expenses (amount, ±2 days, merchant) → warning with attach-instead or save-anyway
- [x] Bulk queue: processing (with progress), review, draft, duplicate, failed, recorded; survives page navigation; interrupted scans resume
- [x] Receipt Library: thumbnails, preview (image zoom / PDF pages), search (merchant, receipt no., items, OCR text, amount), filters (status, category, date range, linked), download original, edit, rescan, delete (transaction kept)
- [x] Transaction attachments (add/view/remove – removing never deletes the transaction); payslips & other files tab
- [x] Payslip OCR in salary form: basic, OT, allowances, bonus, EPF/SOCSO/EIS/PCB (employee only; employer & YTD ignored), gross/deductions/net check; user picks values to apply; payslip attached to record
- [x] Settings disclosure: OCR is local; optional AI Vision not enabled (needs secure backend, costs, explicit consent)
- [x] Fixed: salary form / reconcile / attach dialogs crashed on a cold page load (data read before live queries resolved)
- [x] Supabase migration `0004_phase4.sql` (not wired up yet)
- [x] Tests: 38 automated incl. real Tesseract OCR on generated receipts (clean + rotated/noisy BM photo) and parser tests; Playwright flow with real OCR in Chromium: single scan, bulk (4 files incl. scanned & text PDF, ~2.6 s), hash & content duplicates, split, attach-to-existing, fake-device camera capture, paste, drag & drop, library delete keeps transaction, payslip OCR; no console errors; no mobile overflow

## Phase 5 – Reports (PDF/Excel/CSV/print), insights, in-app notifications
## Phase 6 – ZIP backup with files, CSV import, Supabase auth + sync, PWA
## Phase 7 – Full testing, security review, bug fixes

## Known limitations (current)
- Statutory figures are estimates for employees under 60; PCB is entered manually.
- Recurring items are generated when the app is opened (no background job).
- Loan projections assume a constant rate; flat-rate early-settlement rebates are not modelled. Card minimum payment is an estimate.
- Simulator scenarios are not saved.
- Receipt files are not in JSON backups yet (ZIP backup in Phase 6). OCR accuracy depends on photo quality; handwritten receipts are not supported.
- HEIC conversion tested by code path only (no HEIC sample in automated tests). Live camera needs HTTPS (or localhost); tested with Chromium's fake camera, not a physical phone.
- AI Vision API not implemented (optional; requires a backend).
- Data is stored only in this browser until Phase 6 (cloud sync). Download backups regularly.
- Bahasa Melayu covers navigation and main labels; full translation is ongoing.
- Modules marked "soon" in the sidebar are placeholders.
