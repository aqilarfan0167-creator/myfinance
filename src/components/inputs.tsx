import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from './ui';
import { centsToInput, parseRM } from '@/lib/money';
import { fmtDate, parseDMY } from '@/lib/date';

/** Money input that emits integer cents (null while invalid). */
export function MoneyInput({ value, onChange, allowNegative, id, placeholder = '0.00', large, autoFocus, label }: { value: number | null; onChange: (c: number | null) => void; allowNegative?: boolean; id?: string; placeholder?: string; large?: boolean; autoFocus?: boolean; label?: string }) {
  const [text, setText] = useState(value ? centsToInput(value) : '');
  useEffect(() => { if (value !== parseRM(text)) setText(value ? centsToInput(value) : ''); /* external change */ }, [value]); // eslint-disable-line
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 ${large ? 'text-lg font-semibold' : 'text-sm'}`}>RM</span>
      <Input id={id} inputMode="decimal" autoFocus={autoFocus} aria-label={label} className={`tabular-nums ${large ? '!py-3.5 !pl-14 !text-3xl font-bold tracking-tight text-left' : 'pl-10 text-right'}`} placeholder={placeholder} value={text}
        onChange={(e) => { const v = e.target.value; setText(v); const c = parseRM(v); onChange(c != null && (allowNegative || c >= 0) ? c : null); }}
        onBlur={() => { const c = parseRM(text); if (c != null) setText(centsToInput(c)); }} />
    </div>
  );
}

/** DD/MM/YYYY text input with native calendar picker; value is YYYY-MM-DD. */
export function DateInput({ value, onChange, id }: { value: string; onChange: (iso: string) => void; id?: string }) {
  const [text, setText] = useState(fmtDate(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { if (parseDMY(text) !== value) setText(fmtDate(value)); }, [value]); // eslint-disable-line
  const bad = text !== '' && !parseDMY(text);
  return (
    <div className="relative">
      <Input id={id} placeholder="DD/MM/YYYY" value={text} className={bad ? 'border-red-500' : ''}
        onChange={(e) => { setText(e.target.value); const iso = parseDMY(e.target.value); if (iso) onChange(iso); else onChange(''); }} />
      <button type="button" aria-label="Pick date" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500"
        onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); } }}><CalendarDays className="h-4 w-4" /></button>
      <input ref={picker} type="date" tabIndex={-1} aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0" value={value}
        onChange={(e) => { if (e.target.value) { onChange(e.target.value); setText(fmtDate(e.target.value)); } }} />
    </div>
  );
}
