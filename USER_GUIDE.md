# MyFinance – User Guide

Amounts are in **RM**, dates are **DD/MM/YYYY** and the timezone is **Asia/Kuala_Lumpur**. Bahasa Melayu is available under Settings → Language.

## 1. Getting started
1. **Bank Accounts → Add account.** Add your bank accounts, cash, e-wallets (Touch 'n Go, GrabPay), savings (ASB, Tabung Haji), credit cards and loans.
   - For a credit card or loan, enter the amount you **owe** as the opening balance.
   - Balances are always calculated from your transactions. MyFinance never asks for online-banking passwords.
2. **Settings:** set your salary day; this drives the *days to salary* count and the *daily allowance*.
3. **Optional:** Settings → *Load demo data* to explore the app first. You can remove it later without affecting your own records.

## 2. Recording money
- **Add income, expense or transfer:** use the header buttons, or the **+** button on mobile.
  - **Transfer:** moves money between your own accounts. It is never counted as income or spending; any transfer fee is counted as spending.
  - **Debt repayment:** pays a credit card or loan. Choose the card or loan as the destination so the purchases aren't counted twice.
  - **Expected income:** stays out of your balances until you press **Received**.
  - **Repeat:** creates a recurring transaction (auto-posted on its date, or waiting for you to confirm).
- **Transactions / Income / Expenses:** search and filter the list, export CSV, attach files, and restore recently deleted items.

## 3. Receipts
- **Scan Receipt:**
  - **Getting receipts in:** take a photo (rear camera), upload several files (JPG/PNG/WEBP/HEIC/PDF), paste (Ctrl+V) or drag and drop.
  - **Reading:** text is read **on your device**. Fields highlighted orange are uncertain; red means missing.
  - **Saving:** choose the account you paid with, then press **Confirm & save expense**. Nothing is recorded before that.
  - **Other options:** **Split** shares one receipt across categories, and **Attach to existing** links a receipt to an expense you already entered.
- **Receipt Library:** search, preview, download, rescan or delete receipts. Deleting a receipt keeps its transaction.

## 4. Salary & OT
1. Fill in **Profile & OT rates**. The defaults follow the Employment Act: 1.5× normal day, 2× rest day, 3× public holiday.
2. Log your overtime.
3. Add a salary record each month. **Estimate EPF/SOCSO/EIS** pre-fills the deductions (check them against your payslip); enter PCB yourself, or use **Read payslip** to pre-fill everything from an image or PDF.
4. When the salary arrives, press **Confirm received**. It is recorded once; confirming again only updates the same income.

## 5. Bills, budgets, goals and debts
- **Commitments:** rent, loans, PTPTN, insurance and bills.
  - **Statuses:** Paid, Pending, Overdue, Upcoming, Partially paid.
  - **Paying:** **Mark paid** records the payment. You can also link a payment you already entered.
- **Budget Planner:** set monthly budgets per category, or copy last month's. Bars turn orange at 70% and red at 100%.
- **Savings Goals:** contributions can move real money between your accounts (a transfer, not spending). Goal money is set aside in your daily allowance.
- **Debt & Credit Cards:**
  - **Credit cards:** statement balance, due date and an estimated minimum payment.
  - **Loans:** a repayment schedule, and how much sooner you'd finish with extra payments.
- **Daily allowance** (Dashboard, tap to see how it's worked out): available money, minus unpaid bills and planned savings due before payday, divided by the days left until payday.

## 6. Planning and reports
- **Simulator:** try changes such as a pay rise, a new car or a new loan. It never changes your records.
- **Calendar:** shows payments, income, tasks and goal dates by month, week or day.
- **Tasks:** recurring tasks schedule the next one when you tick them off.
- **Insights:** trends, unusual spending, budget pace and savings health.
- **Reports:** choose a day, week, month, year or custom range; each is compared with the previous period. Export as PDF, Excel or CSV, or print.
- **Notifications:** use the bell icon. Choose which reminders you want under Reminder settings. Reminders appear while the app is open.

## 7. Keeping your data safe
- **Backup & Restore:**
  - **Backups:** download a **Full backup (ZIP)** regularly (it includes receipts and payslips). On Chrome or Edge on a computer you can choose a folder for automatic daily backups.
  - **Restoring:** the backup is checked and previewed first; choose **Merge** or **Replace**. A safety snapshot is always saved before restoring.
  - **CSV import:** import bank statements; possible duplicates are unticked for you.
- **Updates:** app updates never delete your data. A copy is saved automatically before any database upgrade.
- **Sync between devices (optional):** go to Settings → Account & cloud sync and sign in on each device. See README → *Cloud sync* to set up your own Supabase project.
- **Install the app:** Settings → About → Install, or your browser's "Add to Home screen". Once installed it works offline.
