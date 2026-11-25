import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
export function Stat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: ReactNode; tone?: 'green' | 'red' | 'blue' | 'orange' | 'purple'; icon?: ReactNode }) {
  const c = { green: 'text-income', red: 'text-expense', blue: 'text-transfer', orange: 'text-warn', purple: 'text-saving' }[tone ?? 'blue'];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icon}{label}</p>
      <p className={cn('mt-1 truncate text-lg font-bold tabular-nums sm:text-xl', tone ? c : 'text-slate-900 dark:text-white')}>{value}</p>
      {sub && <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
