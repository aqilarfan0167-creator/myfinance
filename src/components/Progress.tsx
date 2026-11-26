import { cn } from '@/lib/cn';
const TONE = { ok: 'bg-green-600', warn: 'bg-orange-500', over: 'bg-red-600', purple: 'bg-saving', blue: 'bg-transfer' } as const;
export function Progress({ value, tone = 'ok', className, label = 'Progress' }: { value: number; tone?: keyof typeof TONE; className?: string; label?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800', className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', TONE[tone])} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
