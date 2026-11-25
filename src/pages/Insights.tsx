import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { useReportInput } from '@/hooks/useReportInput';
import { useT } from '@/lib/i18n';
import { Card, Loading, PageHeader } from '@/components/ui';
import { buildInsights, type Insight } from '@/domain/insights';
import { cn } from '@/lib/cn';

const SEV = {
  alert: { icon: AlertOctagon, cls: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30', ic: 'text-expense', label: 'Needs attention' },
  warning: { icon: AlertTriangle, cls: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30', ic: 'text-warn', label: 'Watch' },
  good: { icon: CheckCircle2, cls: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30', ic: 'text-income', label: 'Doing well' },
  info: { icon: Info, cls: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900', ic: 'text-transfer', label: 'Good to know' },
} as const;
const KIND: Record<Insight['kind'], string> = { trend: 'Spending trend', top: 'Top spending', unusual: 'Unusual increase', frequent: 'Frequent purchases', budget: 'Budget', savings: 'Savings', subscription: 'Recurring payment' };

export default function InsightsPage() {
  const t = useT(); const d = useReportInput();
  const list = useMemo(() => (d ? buildInsights({ txns: d.txns, accounts: d.accounts, cats: d.cats, budgets: d.budgets, goals: d.goals, commitments: d.commitments, today: d.today }) : null), [d]);
  if (!list) return <Loading />;
  const groups = (['alert', 'warning', 'good', 'info'] as const).map((s) => ({ s, items: list.filter((i) => i.severity === s) })).filter((g) => g.items.length);
  return (
    <>
      <PageHeader title={t('Insights')} subtitle="Based only on the transactions, budgets and goals you have recorded." />
      <div className="space-y-5">{groups.map((g) => { const m = SEV[g.s]; return (
        <section key={g.s}><h2 className="mb-2 text-sm font-semibold text-slate-500">{m.label} ({g.items.length})</h2>
          <div className="grid gap-3 md:grid-cols-2">{g.items.map((i) => (
            <div key={i.id} className={cn('flex gap-3 rounded-xl border p-4', m.cls)}>
              <m.icon className={cn('mt-0.5 h-5 w-5 shrink-0', m.ic)} />
              <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-wide text-slate-500">{KIND[i.kind]}</p><p className="font-semibold">{i.title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{i.detail}</p>
                {i.link && <Link to={i.link} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">View <ArrowRight className="h-3 w-3" /></Link>}</div>
            </div>))}</div></section>); })}</div>
      <Card className="mt-5"><p className="text-xs text-slate-500">Comparisons use the same number of days in previous months, so a part-month isn't compared with a full month. Projections are simple averages and are labelled as such.</p></Card>
    </>
  );
}
