# MyFinance – Project Requirements

A personal finance web application for managing day-to-day money.

## Global settings
- Currency MYR (RM) · Date format DD/MM/YYYY · Timezone Asia/Kuala_Lumpur
- English, with optional Bahasa Melayu · Responsive on desktop and mobile · Light/Dark mode · Installable PWA where supported
- Preferred stack: React, TypeScript, Tailwind, Supabase, Recharts, Tesseract.js, PDF.js, with IndexedDB as the local fallback

## 1. Dashboard
- Show: total and available balance; monthly income, expenses, savings and cash flow; paid/pending/overdue commitments; outstanding debt; net worth; remaining budget; daily allowance; days to salary; recent transactions; upcoming payments; pending tasks and receipts.
- Charts: income vs expenses, categories, daily spending, savings, budgets, debt, net worth, Needs vs Wants.
- Filters: date, account, category and transaction.

## 2. Transactions (central ledger)
- Types: income, expense, transfer, debt repayment, refund, adjustment.
- Fields: ID, date/time, name, merchant, type, category, amount, source/destination account, payment method, Needs/Wants, remarks, attachments, related IDs.
- CRUD, search, filters, recurring transactions, custom categories, history, export.
- Malaysian income and expense categories. Payment methods: cash, card, online banking, DuitNow QR, e-wallet.
- Expected income is tracked separately from income actually received. All calculations update automatically.

## 3. Salary & OT
- Salary components, OT entries (times, break, rate, multiplier, type, approval, payment), EPF/SOCSO/EIS/PCB and other deductions.
- Gross, expected net and actual net pay.
- Configurable OT rates. Manual deduction adjustments. Payslip OCR.
- Salary history, expected vs actual comparison, and a "Confirm Salary Received" action that never creates a duplicate.

## 4. Smart Receipt Scanner & Library (priority)
- Input: camera (rear camera preferred), webcam, upload, paste, PDF, drag and drop, multiple files. Formats: JPG, PNG, WEBP, HEIC, PDF.
- Image tools: preview, retake, crop, rotate, zoom and enhance.
- Real OCR with Tesseract.js and PDF.js (embedded PDF text, or OCR of rendered pages). Never fabricate results.
- Extract merchant, date/time, reference number, line items, subtotal, discount, SST, service charge, total and payment method. Supports English and Bahasa Melayu receipts.
- Suggest a category and remember it per merchant. Split a receipt across categories. Show the original beside editable fields and highlight uncertain ones. Require an account.
- Actions: Rescan, Save Draft, Attach to Existing Transaction, Confirm & Save, Cancel. Records are only created after confirmation.
- Library: thumbnails, preview, search, filters, download, edit, rescan, delete.
- Duplicate detection by file hash, merchant, receipt number, date and amount.
- Bulk scanning with statuses. Original files are stored persistently. Deleting an attachment never deletes its transaction.
- An optional AI Vision API must go through a secure backend, with costs disclosed and the user's consent.

## 5. Accounts
- Bank, cash, e-wallet, savings/investment and credit card accounts.
- Fields: opening balance/date, icon, colour, status, low-balance threshold, and inclusion in available balance and net worth.
- Transfers with fees, reconciliation and adjustment history. Balances are calculated from the ledger. Transfers are not income or expense.
- Never request bank credentials or claim bank sync.

## 6. Commitments & Budget
- Recurring commitments (rental, loans, MARA, PTPTN, insurance, bills, subscriptions) with statuses: Paid, Pending, Overdue, Upcoming, Partially Paid. Records are generated without duplicates.
- "Mark Paid" creates or links a transaction.
- Monthly category budgets, colour-coded: green below 70%, orange 70–99%, red 100% and above. Budgets can be copied from the previous month.
- Daily allowance = (liquid balance − unpaid commitments − reserved savings − planned essentials) ÷ days to payday. Show the breakdown and warnings, with no double counting.

## 7. Savings, Debts, Credit Cards
- Goals: contributions, withdrawals and completion estimates. Savings transfers are not expenses.
- Debts: lender, principal, rate, instalment, schedule, extra payments and settlement estimate.
- Cards: limit, utilisation, statement and due dates. Purchases are expenses; repayments are liability settlements; interest and fees are recorded separately. No duplicates.

## 8. Planning
- Tasks.
- Calendar: day, week and month views.
- Simulator: what-if scenarios that never modify actual records.
- Insights from actual data.
- Notifications: configurable, with honest claims about background delivery.

## 9. Reports
- Daily, weekly, monthly, yearly and custom periods, compared with the previous period.
- Exports: PDF, Excel, CSV and print.
- Transfers are excluded from income and expense.

## 10. Data, Security, Backup
- Supabase Auth, Postgres, private Storage and RLS. Login, registration and password reset. No secret keys in the frontend. Input and file validation.
- IndexedDB fallback with a migration path to Supabase.
- Preserve all data across updates. Schema versioning with non-destructive migrations.
- Backups: manual, automatic and history. JSON/CSV import and export. Full ZIP including attachments.
- Restore by merge or replace, with validation, preview and a pre-restore backup.
- Integer cents, atomic operations and an audit history.

## 11. UI
- Desktop sidebar with all modules. Mobile bottom navigation: Home, Transactions, Scan Receipt, Budget, More. Quick Actions.
- Colours: green = income, red = expense/overdue, blue = transfers, orange = warnings, purple = savings.
- Responsive tables and charts, loading states, validation, confirmations and clear errors.

## 12. Delivery
- Phases: 1 Core → 2 Salary/Commitments/Calendar → 3 Budget/Savings/Debt/Simulator/Tasks → 4 Receipts/OCR → 5 Reports/Insights/Notifications → 6 Backup ZIP/Sync/PWA → 7 Testing/Security.
- Start with an empty database; demo data is optional. Clearly flag anything untested or needing external configuration.
