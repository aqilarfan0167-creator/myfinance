import { useRef, useState } from 'react';
import { FileUp, AlertTriangle } from 'lucide-react';
import { Button, Modal, Badge } from './ui';
import { FileViewer } from './FileViewer';
import { useUI } from './UIContext';
import { scanPayslip } from '@/db/receiptRepo';
import { ValidationError } from '@/db/repo';
import type { PayslipData } from '@/domain/receipt';
import type { Field } from '@/db/types';
import { formatRM } from '@/lib/money';
import { fmtMonth } from '@/lib/date';

export interface PayslipApply { month?: string; company?: string; basic?: number; ot?: number; bonus?: number; epf?: number; socso?: number; eis?: number; pcb?: number; allowances?: { name: string; amount: number }[]; net?: number; attachmentId: string }

/** Upload a payslip image/PDF, read it on-device, and let the user choose which values to apply. */
export function PayslipImport({ onApply }: { onApply: (v: PayslipApply) => void }) {
  const input = useRef<HTMLInputElement>(null); const { toast } = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ attachmentId: string; data: PayslipData; text: string; confidence: number; source: string } | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});

  async function run(file: File) {
    setBusy('Reading payslip…');
    try { const r = await scanPayslip(file, (p) => setBusy(`${p.stage} ${p.pct}%`)); setRes(r);
      const d = r.data; setPick(Object.fromEntries(Object.entries(d).filter(([, v]) => (v as Field<unknown>)?.value != null).map(([k]) => [k, true]).concat(d.allowances.length ? [['allowances', true]] : [])));
    } catch (e) { toast(e instanceof ValidationError ? e.errors[0] : `Could not read payslip: ${(e as Error).message}`, 'err'); }
    finally { setBusy(null); }
  }
  const rows: [keyof PayslipData, string, 'money' | 'month' | 'text'][] = [['month', 'Salary month', 'month'], ['company', 'Company', 'text'], ['basic', 'Basic salary', 'money'], ['overtime', 'Overtime', 'money'], ['bonus', 'Bonus / incentive', 'money'],
    ['epf', 'EPF (employee)', 'money'], ['socso', 'SOCSO', 'money'], ['eis', 'EIS', 'money'], ['pcb', 'PCB / MTD', 'money'], ['gross', 'Gross pay (check only)', 'money'], ['totalDeductions', 'Total deductions (check only)', 'money'], ['net', 'Net pay', 'money']];
  const apply = () => {
    if (!res) return; const d = res.data; const v = (k: keyof PayslipData) => (pick[k] ? (d[k] as Field<unknown>).value ?? undefined : undefined);
    onApply({ attachmentId: res.attachmentId, month: v('month') as string, company: v('company') as string, basic: v('basic') as number, ot: v('overtime') as number, bonus: v('bonus') as number,
      epf: v('epf') as number, socso: v('socso') as number, eis: v('eis') as number, pcb: v('pcb') as number, net: v('net') as number, allowances: pick.allowances ? d.allowances : undefined });
    setRes(null); toast('Payslip values applied – review before saving');
  };
  return (
    <>
      <Button type="button" variant="secondary" disabled={!!busy} onClick={() => input.current?.click()}><FileUp className="h-4 w-4" />{busy ?? 'Read payslip (image/PDF)'}</Button>
      <input ref={input} type="file" accept="image/*,.heic,.heif,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(f); }} />
      <Modal open={!!res} onClose={() => setRes(null)} title="Payslip values found" wide="xl">
        {res && <div className="grid gap-4 md:grid-cols-2">
          <FileViewer attachmentId={res.attachmentId} className="h-[55vh]" />
          <div>
            <p className="mb-2 text-xs text-slate-500">{res.source === 'pdf-text' ? 'Read from the PDF text layer.' : `OCR confidence ${res.confidence}%.`} Tick the values to apply. Nothing is saved until you save the salary record.</p>
            {res.data.warnings.map((w) => <p key={w} className="mb-1 flex gap-1 text-xs text-warn"><AlertTriangle className="h-3.5 w-3.5" />{w}</p>)}
            <table className="w-full text-sm"><tbody>{rows.map(([k, label, kind]) => { const fld = res.data[k] as Field<string | number>; const check = !['gross', 'totalDeductions'].includes(k);
              return <tr key={k} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">{check && <input type="checkbox" aria-label={`Apply ${label}`} disabled={fld.value == null} checked={!!pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} />}</td>
                <td className="px-2">{label}</td><td className="text-right tabular-nums">{fld.value == null ? <span className="text-xs text-red-600">not found</span> : kind === 'money' ? formatRM(fld.value as number) : kind === 'month' ? fmtMonth(fld.value as string) : fld.value}</td>
                <td className="pl-2">{fld.confidence && fld.confidence !== 'high' && <Badge tone="orange">check</Badge>}</td></tr>; })}
              {res.data.allowances.length > 0 && <tr className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5"><input type="checkbox" aria-label="Apply allowances" checked={!!pick.allowances} onChange={(e) => setPick({ ...pick, allowances: e.target.checked })} /></td><td className="px-2">Allowances</td><td className="text-right text-xs">{res.data.allowances.map((a) => `${a.name} ${formatRM(a.amount)}`).join(', ')}</td><td /></tr>}
            </tbody></table>
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">Recognised text</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 dark:bg-slate-800">{res.text}</pre></details>
            <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRes(null)}>Cancel</Button><Button onClick={apply}>Apply selected</Button></div>
          </div>
        </div>}
      </Modal>
    </>
  );
}
