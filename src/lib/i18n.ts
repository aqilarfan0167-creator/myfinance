import { useSettings } from '@/hooks/useData';

const ms: Record<string, string> = {
  Dashboard: 'Papan Pemuka', Transactions: 'Transaksi', Income: 'Pendapatan', 'Salary & OT': 'Gaji & OT', Expenses: 'Perbelanjaan',
  'Smart Receipt Scanner': 'Pengimbas Resit Pintar', 'Receipt Library': 'Pustaka Resit', 'Bank Accounts': 'Akaun Bank',
  Commitments: 'Komitmen', 'Budget Planner': 'Perancang Bajet', 'Savings Goals': 'Matlamat Simpanan', 'Debt & Credit Cards': 'Hutang & Kad Kredit',
  'Financial Simulator': 'Simulator Kewangan', 'Financial Calendar': 'Kalendar Kewangan', 'Financial Tasks': 'Tugasan Kewangan',
  Insights: 'Analisis', Reports: 'Laporan', Notifications: 'Pemberitahuan', Settings: 'Tetapan', 'Backup & Restore': 'Sandaran & Pulih',
  Home: 'Utama', 'Scan Receipt': 'Imbas Resit', Budget: 'Bajet', More: 'Lagi',
  'Total Balance': 'Jumlah Baki', 'Available to Spend': 'Baki Boleh Dibelanja', 'Net Worth': 'Nilai Bersih', 'Outstanding Debt': 'Hutang Tertunggak',
  'Cash Flow': 'Aliran Tunai', Savings: 'Simpanan', 'Daily Allowance': 'Elaun Harian', 'Days to Salary': 'Hari ke Gaji',
  'Recent Transactions': 'Transaksi Terkini', 'Add Income': 'Tambah Pendapatan', 'Add Expense': 'Tambah Perbelanjaan', Transfer: 'Pindahan',
  Save: 'Simpan', Cancel: 'Batal', Delete: 'Padam', Edit: 'Ubah', Search: 'Cari', Date: 'Tarikh', Amount: 'Jumlah', Category: 'Kategori',
  Account: 'Akaun', Name: 'Nama', Merchant: 'Peniaga', Remarks: 'Catatan', Type: 'Jenis', 'Add Account': 'Tambah Akaun', Language: 'Bahasa', Theme: 'Tema',
  'Income vs Expenses': 'Pendapatan lwn Perbelanjaan', 'Spending by Category': 'Perbelanjaan mengikut Kategori', 'Daily Spending': 'Perbelanjaan Harian',
  'Needs vs Wants': 'Keperluan lwn Kehendak', 'Expected Income': 'Pendapatan Dijangka', 'Quick Actions': 'Tindakan Pantas', Export: 'Eksport',
};

export function useT() {
  const s = useSettings();
  return (k: string) => (s?.language === 'ms' ? ms[k] ?? k : k);
}
