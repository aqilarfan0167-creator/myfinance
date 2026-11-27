import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const btn: Record<BtnVariant, string> = {
  primary: 'bg-teal-700 text-white shadow-sm hover:bg-teal-800 disabled:bg-teal-700/50 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200',
  secondary: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-[#b42318] text-white hover:bg-[#912018]',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};
export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button {...p} className={cn('inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60', btn[variant], className)} />;
}
const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) => <input ref={r} {...p} className={cn(field, className)} />);
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(field, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(field, className)} />;

export function Field({ label, children, hint, error, className }: { label: string; children: ReactNode; hint?: ReactNode; error?: string; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900', className)}>
      {(title || action) && <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-50">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** Accessible dialog: labelled, Escape closes, focus moves in, Tab stays inside, focus returns to the opener. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null); const titleId = useId(); const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[autofocus]') ?? el?.querySelector<HTMLElement>(`${FOCUSABLE.split(',').filter((x) => !x.startsWith('button')).join(',')}`) ?? el;
    (first ?? el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (!el || !el.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === 'Escape') { const dialogs = document.querySelectorAll('[role=dialog]'); if (dialogs[dialogs.length - 1] === el) { e.stopPropagation(); close.current(); } }
      if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null); if (!items.length) return;
        const [f, l] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); } else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl sm:p-6 dark:bg-slate-900', wide === 'xl' ? 'sm:max-w-6xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'slate' }) {
  const t = { green: 'bg-income-soft text-[#0f5f2b] dark:bg-green-900/40 dark:text-green-200', red: 'bg-expense-soft text-[#912018] dark:bg-red-900/40 dark:text-red-200', blue: 'bg-transfer-soft text-[#2b44a8] dark:bg-blue-900/40 dark:text-blue-200', orange: 'bg-warn-soft text-[#9a330a] dark:bg-orange-900/40 dark:text-orange-200', purple: 'bg-saving-soft text-[#5b33a3] dark:bg-purple-900/40 dark:text-purple-200', slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }[tone];
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', t)}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700"><p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p><div className="mx-auto mt-2 max-w-md text-sm text-slate-500">{children}</div></div>;
}
export const Loading = () => <div className="flex h-40 items-center justify-center text-sm text-slate-500"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />Loading…</div>;
export const PageHeader = ({ title, actions, subtitle }: { title: string; actions?: ReactNode; subtitle?: string }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px] dark:text-white">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
    <div className="flex flex-wrap gap-2">{actions}</div>
  </div>
);
