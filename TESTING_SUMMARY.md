# Testing Summary

Status as of 26/11/2026, app v0.6.0, database schema v6.

## Automated tests
| Suite | Command | Result |
|---|---|---|
| Unit & integration tests: 64 tests in 13 files, plus 1 PostgreSQL test | `npm test` | **64 passed**, 1 skipped (it needs PostgreSQL) |
| Sync engine against PostgreSQL 16 (production migration, RLS, `authenticated` role) | `PG_SOCKET=… npx vitest run src/__tests__/sync.postgres.test.ts` | **passed** |
| SQL security checks (Supabase shim + migration, applied twice) | `psql -f supabase/tests/security_test.sql` | **20 / 20 passed** |
| React hooks lint | `npm run lint` | clean |
| Typecheck | `npx tsc -b` | clean |
| Cold-load smoke: 22 pages × empty/demo database × light/dark, plus phone width | `npm run test:smoke` | **88 loads OK**, no horizontal overflow at 390 px |
| Accessibility (axe-core, WCAG 2.1 A/AA): 20 pages × light/dark | `npm run test:a11y` | **0 violations** |
| Browser end-to-end suites (Playwright, Chromium): smoke, a11y, core, phase2, phase3, receipts (real OCR), heic, reports, backup-sync-pwa, keyboard | `npm run test:e2e` | **10 / 10 passed**, no console errors or CSP violations |

Coverage (Vitest v8): **domain logic 95.6 %** of statements, **sync engine 98.9 %**, `db/` 73.6 %. Browser-only modules (camera, OCR worker, file handling, receipt repository) are covered by the end-to-end suites rather than unit tests.

## What was verified
- **Financial correctness:**
  - Integer-sen money, DD/MM/YYYY, and Malaysia-time dates under 4 device timezones (including UTC+14 and a US daylight-saving change).
  - Balances come only from the ledger. Transfers and credit-card repayments are not counted as income or spending.
  - Refunds, fees, adjustments, and loan and card charges.
  - **300 randomised ledgers**: balances, net worth, cash flow, category and Needs/Wants totals, daily totals, and monthly-vs-yearly reports always reconcile.
- **Transactions:** create, edit, soft delete and restore; duplicate warnings; expected → received income (never duplicated); recurring transactions (idempotent, deleted entries never recreated).
- **Salary & OT:** OT maths (including overnight), EPF/SOCSO/EIS estimates checked against the contribution tables, payslip OCR, salary confirmed exactly once.
- **Commitments:** idempotent generation, partial payments, linking an existing payment, deleting a payment makes it unpaid again, credit-card commitments, and the daily-allowance deductions.
- **Budgets, goals, loans and cards:** budget levels and copy; goal transfers are never expenses; loan schedules; card statement balance, due date and minimum payment; the simulator never writes data.
- **Receipts (real OCR, no mocks):**
  - **Reading:** a clean receipt was read at 94 % confidence with every field correct; a noisy, rotated Bahasa Melayu photo still gave the right total, date and payment method.
  - **Formats:** HEIC from an iPhone; digital PDF (text layer); scanned PDF (rendered, then OCR).
  - **Input methods:** camera (simulated device), paste, drag & drop, bulk upload (4 files in about 2.6 s).
  - **Saving:** splits; duplicates caught by file hash and by content; attach-to-existing; deleting a receipt keeps its transaction.
- **Reports:** every period type; the PDF checked with pypdf and the XLSX with openpyxl; CSV with formula injection neutralised; print layout.
- **Backup & migration:**
  - **ZIP:** full backup restored to a fresh profile (records and receipt images); checksums verified; damaged files and zip bombs rejected.
  - **JSON:** merge and replace restores.
  - **Upgrades:** a v1 → v6 database upgrade in a real browser, with the pre-upgrade snapshot taken first; v1 backups migrate on restore.
  - **CSV import:** bank statements, decimal commas, and a round-trip of the app's own export.
- **Sync:** first sync and second device; last-writer-wins in both directions; tombstones; a newer edit beats a delete; content-hash change detection; files; the newer-schema guard; malformed rows rejected; account isolation on PostgreSQL.
- **Security:**
  - **Dependencies:** 0 production vulnerabilities.
  - **CSP:** a strict policy with zero violations across OCR, PDF, camera, exports and HEIC.
  - **Hostile input:** `safeLink` blocks unsafe stored links; privileged Supabase keys are rejected.
- **PWA:** manifest, service worker, offline navigation and the update prompt.
- **Keyboard and screen readers:** dialogs move and trap focus, Escape closes the topmost one, focus is restored, and each dialog is labelled.

## Performance (headless Chromium, demo data plus N generated transactions)
| | N = 1 | N = 10 000 | N = 50 000 |
|---|---|---|---|
| Full page reload, Dashboard | 0.27 s | 0.96 s | 4.0 s |
| In-app navigation, slowest page | — | 212 ms | 307 ms |
| Search keystroke | 28 ms | 81 ms | 75 ms |
| Add expense, until saved | 0.31 s | 0.40 s | 3.1 s |

The app is responsive up to about 20 000 transactions, which is years of daily use. Above that, saving slows down because each change re-reads the whole table; an incremental cache is noted as future work.

## Bugs found and fixed during testing (all phases)
1. The salary form, reconcile and attach dialogs crashed on a cold page load (data was read before live queries resolved).
2. The Notifications page crashed on first load (a hook was called after an early return). Fixed, and the whole codebase is now covered by lint.
3. Sync echo: a device's own uploads coming back could overwrite newer local edits and resurrect deleted records.
4. A fresh device's default settings could override the cloud settings on first sync.
5. CSV decimal commas ("45,90") were read as thousands.
6. The pre-upgrade safety snapshot raced the database upgrade.
7. HEIC conversion hung silently under a strict CSP. It now runs in a sandboxed converter with a timeout.
8. Reports showed a false net-worth drop when an account was added during the period.
9. Recurring-payment insights flagged bills that were already tracked as commitments.
10. About 680 accessibility violations (contrast, names, nested controls), and dialogs had no keyboard support.
11. Duplicate full-table scans made pages 1–6 s slower with large datasets.
12. Phone-width overflow on the Account page.
13. Payday-today gave a 1-day allowance; the net-worth trend counted accounts before they were opened; the camera's Capture button was enabled before the video was ready.

## Not tested here (needs a real device or external setup)
- **A hosted Supabase project:** the Supabase JS client against real Supabase Auth and Storage, and the confirmation and password-reset emails. The SQL and the sync engine were tested on PostgreSQL 16 with a Supabase-compatible shim.
- **Physical devices:** the camera on a real phone, PWA installation on iOS and Android, and OCR accuracy on real crumpled or thermal receipts. Handwritten receipts are not supported.
- **Automatic folder backups:** headless browsers cannot show the folder picker, so this was reviewed by code only.
- **Background notifications:** not possible without a push server; reminders only appear while the app is open.
