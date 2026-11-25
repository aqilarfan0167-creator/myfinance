import { cn } from '@/lib/cn';
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { v: T; label: string }[] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
      {items.map((i) => <button key={i.v} role="tab" aria-selected={value === i.v} onClick={() => onChange(i.v)}
        className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium', value === i.v ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400')}>{i.label}</button>)}
    </div>
  );
}
