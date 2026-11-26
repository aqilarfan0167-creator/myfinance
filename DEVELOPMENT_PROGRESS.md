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

## Phase 5 – Reports, insights, notifications ✅
- [x] DB schema v5 (additive): notifications table; notification preferences in settings (v1–v4 backups migrate)
- [x] Reports: daily, weekly (Mon–Sun), monthly, yearly, custom; previous-period comparison (same length before a custom range)
- [x] Report content: income, expenses (net of refunds), loan & card repayments, cash flow, savings transfers, savings rate, net worth, income/expense categories with share & change, top merchants, Needs vs Wants, account balances start→end, debt (cards/loans), commitments due/paid/outstanding, savings goals, salary records & OT, budget performance per month, receipt summary, trend chart (daily/weekly/monthly buckets), transaction list
- [x] Internal transfers and card repayments excluded from income/expense totals (fees included); stated on every report/export
- [x] Accounts added during the period start at their opening balance (no fake net-worth swings)
- [x] Exports: PDF (jsPDF + AutoTable, lazy-loaded, page numbers), Excel .xlsx (own writer on fflate: 12 sheets, real numbers, RM & % formats, bold frozen headers), sectioned CSV, transactions CSV (UTF-8 BOM, formula-injection safe), print layout (A4, light mode, no navigation)
- [x] Insights from actual records: month-to-date vs same days of previous months, labelled projection, top categories & merchants, unusual category increases, frequent purchases, budget exceeded / near limit / pace, savings rate, emergency-fund coverage, goals behind schedule, untracked recurring payments (ignores ones already tracked as commitments)
- [x] Notifications: payments due (configurable days), overdue commitments, credit-card statement due, budget threshold, low balance, salary expected / not confirmed / payday, tasks, receipts awaiting review, subscription renewals, backup reminders
- [x] Deterministic notification IDs (no duplicates), auto-resolve when the condition clears, dismissals respected, read/unread, history, header bell with unread count
- [x] Optional system notifications while the app is open (permission flow); checked on open, on focus and every 30 min. Clearly stated: no delivery while the app is closed (no push server)
- [x] Fixed: Notifications page crashed on first load (hook after early return). Added ESLint `react-hooks/rules-of-hooks` (`npm run lint`) – whole codebase clean
- [x] Added cold-load smoke test (`npm run test:smoke`): 21 routes × empty/demo DB × light/dark = 84 loads, no errors
- [x] Tests: 43 automated (periods, report maths & exclusions, mid-period accounts, insights triggers, notification dedupe/resolve/dismiss/prefs, CSV; XLSX validated with openpyxl; PDF validated with pypdf) + Playwright: downloads of PDF/Excel/CSV verified, period switching, print media, insights, notifications, permission

## Phase 6 – Backup, restore, migration, cloud sync, PWA ✅
- [x] DB schema v6 (additive): syncState. Every version since v1 upgrades in place – verified v1 → v6 in a real browser
- [x] Update safety: before any schema upgrade, a raw copy of all records is saved to a separate IndexedDB ("Before upgrade vX → vY", downloadable); boot order fixed so the upgrade can't race the snapshot; other tabs are told to reload instead of blocking upgrades
- [x] Full ZIP backup: all records + original files, edited copies and thumbnails, manifest with SHA-256 checksums, README; verified before restore (damaged/foreign files rejected)
- [x] Restore ZIP or JSON with preview (new/updated/kept/removed + files), merge or replace, safety snapshot first, files never deleted
- [x] Backup history (downloads, folder backups), device snapshots (daily, pre-restore, pre-import), pre-upgrade snapshots
- [x] Automatic backups to a user-chosen folder (File System Access API, Chrome/Edge desktop): daily ZIP, newest 10 kept, re-permission flow
- [x] CSV import: delimiter/quote/BOM-aware parser, auto column mapping (bank statements, debit/credit, signed amounts, BM headers, MyFinance's own export round-trip), DMY/YMD/MDY, decimal commas, per-row validation, duplicate detection (existing + within file), atomic all-or-nothing import with snapshot
- [x] Supabase: login, registration (email confirmation), password reset + new-password flow, logout; config via env or in-app (service-role/secret keys rejected)
- [x] Sync engine: pull-then-push, server-side last-writer-wins RPC, monotonic server cursor (clock-skew safe), content-hash change detection, tombstones by reconciliation (catches all hard deletes), echo suppression, files to private storage, newer-schema guard, one-account-per-device binding (merge / use cloud / switch with backup)
- [x] Migration `supabase/migrations/20261126000000_sync.sql`: RLS (select/insert/update own rows, no delete), RPC with future-timestamp rejection, private bucket with size/type limits and per-user folders; re-runnable
- [x] PWA: manifest (icons incl. maskable, shortcuts), offline app shell (precache), OCR models cached on first use, install button / iOS instructions, update prompt
- [x] Tests: 54 automated + 1 PostgreSQL integration test; 20 SQL security checks on real PostgreSQL 16 (RLS isolation, LWW, tombstones, anon lockout, storage folders, bucket private); Playwright: v1→v6 upgrade with snapshot, ZIP backup → restore on a fresh device (records + receipt image), CSV import, config validation & error handling, manifest, offline navigation; smoke test 88 cold loads
- [x] Bugs found & fixed: sync echo overwrote local edits / resurrected deletes; fresh device's defaults could override cloud settings; CSV decimal commas read as thousands; pre-upgrade snapshot raced the upgrade

## Phase 7 – Full testing, security review, bug fixes

## Not yet verified / needs external configuration
- **Supabase cloud sync was not run against a hosted Supabase project** (no credentials in the dev environment). The SQL was tested on PostgreSQL 16 with a Supabase-compatible shim, and the sync engine was tested end-to-end against that database. The Supabase JS transport, Auth emails/redirects and Storage uploads need one real run (see README → Cloud sync).
- Camera on a physical phone, HEIC photos from iPhone, and PWA install on real devices: not tested here.
- Folder auto-backup needs Chrome/Edge desktop; tested by code review only (headless browsers can't show the folder picker).

## Known limitations (current)
- Statutory figures are estimates for employees under 60; PCB is entered manually.
- Recurring items are generated when the app is opened (no background job).
- Loan projections assume a constant rate; flat-rate early-settlement rebates are not modelled. Card minimum payment is an estimate.
- Simulator scenarios are not saved.
- OCR accuracy depends on photo quality; handwritten receipts are not supported.
- HEIC conversion tested by code path only (no HEIC sample in automated tests). Live camera needs HTTPS (or localhost); tested with Chromium's fake camera, not a physical phone.
- AI Vision API not implemented (optional; requires a backend).
- Notifications only appear while MyFinance is open or reopened; true background/push reminders need a push service (not configured).
- Report charts are not embedded in PDF exports (tables only); use Print for charts.
- Bahasa Melayu covers navigation and main labels; full translation is ongoing.
