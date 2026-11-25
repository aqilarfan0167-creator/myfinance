import { useMemo, useState } from 'react';
import { Plus, Trash2, Calculator, CheckCircle2, Pencil, AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinance, useOT, useSalaries, type Finance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { DateInput, MoneyInput } from '@/components/inputs';
import { Tabs } from '@/components/Tabs';
import { PayslipImport, type PayslipApply } from '@/components/PayslipImport';
import { AttachmentChips } from '@/components/AttachmentChips';
import { Stat } from '@/components/Stat';
import { confirmSalaryReceived, deleteOT, deleteSalary, saveOT, saveSalary, computeOT, salaryTxnId, type OTInput, type SalaryInput } from '@/db/salaryRepo';
import { updateSettings, ValidationError } from '@/db/repo';
import { isLiability, type AccountType, type DayType, type OTEntry, type SalaryProfile, type SalaryRecord } from '@/db/types';
import { DAY_TYPES, estimateEIS, estimateEPF, estimateSOCSO, hourlyRate, salaryTotals, statutoryBases } from '@/domain/salary';
import { formatRM } from '@/lib/money';
import { addMonths, fmtDate, fmtMonth, todayKL, daysInMonth } from '@/lib/date';

const rm = (c: number) => formatRM(c);
const errMsg = (e: unknown) => (e instanceof ValidationError ? e.errors : [(e as Error).message]);

export default function SalaryPage() {
  const t = useT(); const f = useFinance(); const recs = useSalaries(); const ot = useOT();
  const [tab, setTab] = useState<'salary' | 'ot' | 'profile'>('salary');
  const [edit, setEdit] = useState<SalaryRecord | 'new' | null>(null);
  const [confirmRec, setConfirmRec] = useState<SalaryRecord | null>(null);
  const [editOT, setEditOT] = useState<OTEntry | 'new' | null>(null);
  if (!f || !recs || !ot) return <Loading />;
  const sorted = [...recs].sort((a, b) => b.month.localeCompare(a.month));
  const chart = [...sorted].slice(0, 12).reverse().map((r) => ({ m: fmtMonth(r.month), expected: r.expectedNet, actual: r.actualNet ?? 0 }));
  const latest = sorted[0];

  return (
    <>
      <PageHeader title={t('Salary & OT')} actions={tab === 'ot'
        ? <Button onClick={() => setEditOT('new')}><Plus className="h-4 w-4" />Add OT</Button>
        : <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Salary record</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ v: 'salary', label: 'Salary records' }, { v: 'ot', label: 'OT log' }, { v: 'profile', label: 'Profile & OT rates' }]} />

      {tab === 'salary' && <>
        {latest && <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={`Gross · ${fmtMonth(latest.month)}`} value={rm(latest.gross)} />
          <Stat label="Expected net" value={rm(latest.expectedNet)} tone="blue" />
          <Stat label="Actual net" value={latest.actualNet != null ? rm(latest.actualNet) : '—'} tone="green" sub={latest.paymentDate ? `Paid ${fmtDate(latest.paymentDate)}` : 'Not yet received'} />
          <Stat label="Difference" value={latest.actualNet != null ? formatRM(latest.actualNet - latest.expectedNet, { sign: true }) : '—'} tone={latest.actualNet != null && latest.actualNet < latest.expectedNet ? 'red' : 'green'} />
        </div>}
        {chart.length > 0 && <Card title="Expected vs actual net salary" className="mb-4">
          <ResponsiveContainer width="100%" height={220}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} width={45} tickFormatter={(v) => `${(v / 100000).toFixed(1)}k`} /><Tooltip formatter={(v: number) => rm(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="expected" name="Expected" fill="#93c5fd" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="actual" name="Actual" fill="#16a34a" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>
        </Card>}
        <Card title="Salary history">
          {sorted.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-2">Month</th><th>Company</th><th className="text-right">Gross</th><th className="text-right">Deductions</th><th className="text-right">Expected net</th><th className="text-right">Actual net</th><th className="pl-4">Status</th><th /></tr></thead>
            <tbody>{sorted.map((r) => {
              const txn = f.txns.find((x) => x.id === salaryTxnId(r.id));
              const missing = r.status === 'received' && (!txn || txn.deletedAt);
              return (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 font-medium">{fmtMonth(r.month)}</td><td className="truncate">{r.company || '—'}</td>
                  <td className="text-right tabular-nums">{rm(r.gross)}</td><td className="text-right tabular-nums text-expense">{rm(r.totalDeductions)}</td>
                  <td className="text-right tabular-nums">{rm(r.expectedNet)}</td><td className="text-right tabular-nums">{r.actualNet != null ? rm(r.actualNet) : '—'}</td>
                  <td className="pl-4">{missing ? <Badge tone="red">Income deleted</Badge> : r.status === 'received' ? <Badge tone="green">Received</Badge> : <Badge tone="orange">Expected {fmtDate(r.expectedPayDate)}</Badge>}</td>
                  <td className="whitespace-nowrap text-right">
                    {(r.status === 'expected' || missing) && <Button variant="ghost" className="text-income" onClick={() => setConfirmRec(r)}><CheckCircle2 className="h-4 w-4" />Confirm received</Button>}
                    <Button variant="ghost" onClick={() => setEdit(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  </td>
                </tr>);
            })}</tbody></table></div> : <Empty title="No salary records yet">Set up your profile, then add this month's salary.</Empty>}
        </Card>
      </>}

      {tab === 'ot' && <OTLog ot={ot} onEdit={setEditOT} />}
      {tab === 'profile' && <ProfileForm p={f.settings.salaryProfile} accounts={f.accounts} />}

      {edit && <SalaryForm f={f} rec={edit === 'new' ? undefined : edit} prev={sorted[0]} profile={f.settings.salaryProfile} onClose={() => setEdit(null)} />}
      {confirmRec && <ConfirmModal f={f} r={confirmRec} onClose={() => setConfirmRec(null)} />}
      {editOT && <OTForm e={editOT === 'new' ? undefined : editOT} profile={f.settings.salaryProfile} onClose={() => setEditOT(null)} />}
    </>
  );
}

/* ---------------- Salary form ---------------- */
type Item = { name: string; amount: number };
function ItemList({ label, items, onChange }: { label: string; items: Item[]; onChange: (i: Item[]) => void }) {
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span><button type="button" className="text-xs text-teal-700 hover:underline dark:text-teal-400" onClick={() => onChange([...items, { name: '', amount: 0 }])}>+ Add</button></div>
      {items.map((it, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_9rem_auto] gap-2">
          <Input placeholder="Name" value={it.name} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={60} />
          <MoneyInput value={it.amount || null} onChange={(c) => onChange(items.map((x, j) => (j === i ? { ...x, amount: c ?? 0 } : x)))} />
          <button type="button" aria-label="Remove" className="p-2 text-slate-400 hover:text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
        </div>))}
    </div>
  );
}

function SalaryForm({ f, rec, prev, profile, onClose }: { f: Finance; rec?: SalaryRecord; prev?: SalaryRecord; profile: SalaryProfile; onClose: () => void }) {
  const ot = useOT() ?? []; const { toast, confirm } = useUI();
  const [s, setS] = useState<SalaryInput>(() => {
    if (rec) return { ...rec };
    const month = prev ? addMonths(prev.month + '-01', 1).slice(0, 7) : todayKL().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const payDate = `${month}-${String(Math.min(f.settings.payDay, daysInMonth(y, m))).padStart(2, '0')}`;
    const base = prev ?? null;
    return { month, company: profile.company || base?.company || '', basic: profile.basic || base?.basic || 0, allowances: profile.allowances.length ? profile.allowances : base?.allowances ?? [],
      bonus: 0, claims: 0, incentives: 0, otAuto: true, ot: 0, epf: base?.epf ?? 0, socso: base?.socso ?? 0, eis: base?.eis ?? 0, pcb: base?.pcb ?? 0, unpaidLeave: 0,
      otherDeductions: base?.otherDeductions ?? [], actualNet: null, expectedPayDate: payDate, paymentDate: null, accountId: profile.defaultAccountId ?? base?.accountId ?? null, remarks: '', attachmentIds: [] };
  });
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof SalaryInput>(k: K, v: SalaryInput[K]) => setS((p) => ({ ...p, [k]: v }));
  const otLog = useMemo(() => ot.filter((o) => o.salaryMonth === s.month && o.approval !== 'rejected').reduce((a, o) => a + o.amount, 0), [ot, s.month]);
  const view = { ...s, ot: s.otAuto ? otLog : s.ot };
  const tot = salaryTotals(view);
  const [payslipNet, setPayslipNet] = useState<number | null>(null);
  const applyPayslip = (p: PayslipApply) => { setPayslipNet(p.net ?? null); setS((x) => ({ ...x,
    month: p.month ?? x.month, company: p.company ?? x.company, basic: p.basic ?? x.basic, bonus: p.bonus ?? x.bonus,
    ...(p.ot != null ? { otAuto: false, ot: p.ot } : {}), epf: p.epf ?? x.epf, socso: p.socso ?? x.socso, eis: p.eis ?? x.eis, pcb: p.pcb ?? x.pcb,
    allowances: p.allowances ?? x.allowances, attachmentIds: [...new Set([...x.attachmentIds, p.attachmentId])] })); };
  const estimate = () => { const b = statutoryBases(view); setS((p) => ({ ...p, epf: estimateEPF(b.epf), socso: estimateSOCSO(b.socso), eis: estimateEIS(b.socso) })); toast('Estimates applied – check against your payslip'); };
  const M = ({ k, label }: { k: 'basic' | 'bonus' | 'claims' | 'incentives' | 'epf' | 'socso' | 'eis' | 'pcb' | 'unpaidLeave'; label: string }) => <Field label={label}><MoneyInput value={s[k] || null} onChange={(c) => set(k, c ?? 0)} /></Field>;

  async function submit() {
    try { await saveSalary(view, rec?.id); toast('Salary record saved'); onClose(); } catch (e) { setErrors(errMsg(e)); }
  }
  async function remove() {
    if (!rec) return;
    if (await confirm({ title: 'Delete salary record?', message: rec.status === 'received' ? 'The record is removed; the income already recorded in your transactions is kept.' : 'The record and its expected income will be removed.', danger: true, confirmText: 'Delete' })) { await deleteSalary(rec.id); toast('Deleted'); onClose(); }
  }
  return (
    <Modal open onClose={onClose} title={rec ? `Salary ${fmtMonth(rec.month)}` : 'New salary record'} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2"><PayslipImport onApply={applyPayslip} /><AttachmentChips ids={s.attachmentIds} onRemove={(id) => set('attachmentIds', s.attachmentIds.filter((x) => x !== id))} /></div>
        <Field label="Salary month"><Input type="month" value={s.month} onChange={(e) => set('month', e.target.value)} /></Field>
        <Field label="Company"><Input value={s.company} onChange={(e) => set('company', e.target.value)} maxLength={100} /></Field>
        <Field label="Expected pay date"><DateInput value={s.expectedPayDate} onChange={(v) => set('expectedPayDate', v)} /></Field>
        <Field label="Paid into account"><Select value={s.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || null)}><option value="">— Select —</option>{f.accounts.filter((a) => a.status === 'active' && !isLiability(a.type as AccountType)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <h3 className="mt-2 text-sm font-semibold text-income sm:col-span-2">Earnings</h3>
        <M k="basic" label="Basic salary" />
        <Field label={`Overtime${s.otAuto ? ' (from OT log)' : ''}`} hint={<label className="flex items-center gap-1"><input type="checkbox" checked={s.otAuto} onChange={(e) => set('otAuto', e.target.checked)} />Use OT log total ({rm(otLog)})</label>}>
          {s.otAuto ? <Input disabled value={rm(otLog)} /> : <MoneyInput value={s.ot || null} onChange={(c) => set('ot', c ?? 0)} />}
        </Field>
        <ItemList label="Allowances" items={s.allowances} onChange={(v) => set('allowances', v)} />
        <M k="bonus" label="Bonus" /><M k="incentives" label="Incentives / commission" /><M k="claims" label="Claims (reimbursements)" />
        <div className="mt-2 flex items-center justify-between sm:col-span-2"><h3 className="text-sm font-semibold text-expense">Deductions</h3><Button type="button" variant="secondary" onClick={estimate}><Calculator className="h-4 w-4" />Estimate EPF/SOCSO/EIS</Button></div>
        <M k="epf" label="EPF / KWSP (employee)" /><M k="socso" label="SOCSO / PERKESO" /><M k="eis" label="EIS / SIP" />
        <Field label="PCB / MTD (income tax)" hint="Enter from your payslip – PCB is not auto-calculated."><MoneyInput value={s.pcb || null} onChange={(c) => set('pcb', c ?? 0)} /></Field>
        <M k="unpaidLeave" label="Unpaid leave" />
        <ItemList label="Other deductions" items={s.otherDeductions} onChange={(v) => set('otherDeductions', v)} />
        <p className="flex gap-1 text-xs text-slate-500 sm:col-span-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn" />Statutory estimates assume an employee under 60 (EPF 11%, SOCSO Category 1, EIS) with simplified wage definitions. Your payslip is the authority – edit any value.</p>
        <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={s.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={1000} /></Field>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center text-sm sm:col-span-2 dark:bg-slate-800">
          <div><p className="text-xs text-slate-500">Gross</p><p className="font-semibold tabular-nums">{rm(tot.gross)}</p></div>
          <div><p className="text-xs text-slate-500">Deductions</p><p className="font-semibold tabular-nums text-expense">{rm(tot.totalDeductions)}</p></div>
          <div><p className="text-xs text-slate-500">Expected net</p><p className="font-semibold tabular-nums text-income">{rm(tot.expectedNet)}</p></div>
        </div>
        {payslipNet != null && <p className={`text-xs sm:col-span-2 ${payslipNet === tot.expectedNet ? 'text-income' : 'text-warn'}`}>Payslip net pay {rm(payslipNet)}{payslipNet === tot.expectedNet ? ' ✓ matches' : ` – differs by ${formatRM(payslipNet - tot.expectedNet, { sign: true })}; check other deductions.`} Use “Confirm received” to record the amount actually paid.</p>}
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-between gap-2 sm:col-span-2">
          {rec ? <Button variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Save</Button></div>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ f, r, onClose }: { f: Finance; r: SalaryRecord; onClose: () => void }) {
  const { toast } = useUI();
  const [amt, setAmt] = useState<number | null>(r.actualNet ?? r.expectedNet); const [date, setDate] = useState(r.paymentDate ?? todayKL()); const [acc, setAcc] = useState(r.accountId ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <Modal open onClose={onClose} title={`Confirm salary received · ${fmtMonth(r.month)}`}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Expected net {rm(r.expectedNet)}. This records the salary as income exactly once – confirming again only updates the same record.</p>
      <div className="grid gap-3">
        <Field label="Actual net amount received"><MoneyInput value={amt} onChange={setAmt} /></Field>
        {amt != null && amt !== r.expectedNet && <p className="text-xs text-warn">Differs from expected by {formatRM(amt - r.expectedNet, { sign: true })}</p>}
        <Field label="Date received"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Received into"><Select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">— Select —</option>{f.accounts.filter((a) => a.status === 'active' && !isLiability(a.type as AccountType)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        {errors.length > 0 && <ul className="text-sm text-red-600">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { try { await confirmSalaryReceived(r.id, { actualNet: amt ?? 0, date, accountId: acc }); toast('Salary recorded as income'); onClose(); } catch (e) { setErrors(errMsg(e)); } }}>Confirm received</Button></div>
      </div>
    </Modal>
  );
}

/* ---------------- OT ---------------- */
function OTLog({ ot, onEdit }: { ot: OTEntry[]; onEdit: (e: OTEntry) => void }) {
  const months = [...new Set(ot.map((o) => o.salaryMonth))].sort().reverse();
  if (!ot.length) return <Empty title="No OT recorded">Use "Add OT" to log overtime. Rates come from your profile.</Empty>;
  return (
    <div className="space-y-4">{months.map((m) => {
      const list = ot.filter((o) => o.salaryMonth === m).sort((a, b) => b.date.localeCompare(a.date));
      const valid = list.filter((o) => o.approval !== 'rejected');
      return (
        <Card key={m} title={`Paid in ${fmtMonth(m)}`} action={<span className="text-sm font-semibold tabular-nums text-income">{valid.reduce((a, o) => a + o.hours, 0).toFixed(2)} h · {rm(valid.reduce((a, o) => a + o.amount, 0))}</span>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Date</th><th>Time</th><th>Type</th><th className="text-right">Hours</th><th className="text-right">Rate × mult.</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
            <tbody>{list.map((o) => (
              <tr key={o.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50" onClick={() => onEdit(o)}>
                <td className="py-2">{fmtDate(o.date)}</td><td>{o.start}–{o.end}{o.breakMinutes ? ` (−${o.breakMinutes}m)` : ''}</td><td>{DAY_TYPES.find((d) => d.v === o.dayType)?.label}</td>
                <td className="text-right tabular-nums">{o.hours.toFixed(2)}</td><td className="text-right tabular-nums">{rm(o.hourlyRate)} × {o.multiplier}</td><td className="text-right font-medium tabular-nums">{rm(o.amount)}</td>
                <td className="space-x-1"><Badge tone={o.approval === 'approved' ? 'green' : o.approval === 'rejected' ? 'red' : 'orange'}>{o.approval}</Badge><Badge tone={o.payment === 'paid' ? 'green' : 'slate'}>{o.payment}</Badge></td>
              </tr>))}</tbody></table></div>
        </Card>);
    })}</div>
  );
}

function OTForm({ e, profile, onClose }: { e?: OTEntry; profile: SalaryProfile; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const rate = hourlyRate(profile);
  const [o, setO] = useState<OTInput>(() => e ? { ...e } : { date: todayKL(), start: '18:00', end: '21:00', breakMinutes: 0, dayType: 'normal', multiplier: profile.multipliers.normal, hourlyRate: rate, reason: '', approval: 'pending', payment: 'unpaid', salaryMonth: todayKL().slice(0, 7) });
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof OTInput>(k: K, v: OTInput[K]) => setO((p) => ({ ...p, [k]: v }));
  const c = computeOT(o);
  return (
    <Modal open onClose={onClose} title={e ? 'Edit OT' : 'Add OT'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><DateInput value={o.date} onChange={(v) => set('date', v)} /></Field>
        <Field label="Paid in salary month"><Input type="month" value={o.salaryMonth} onChange={(ev) => set('salaryMonth', ev.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="Start"><Input type="time" value={o.start} onChange={(ev) => set('start', ev.target.value)} /></Field>
          <Field label="End"><Input type="time" value={o.end} onChange={(ev) => set('end', ev.target.value)} /></Field>
          <Field label="Break (min)"><Input type="number" min={0} value={o.breakMinutes} onChange={(ev) => set('breakMinutes', Math.max(0, Number(ev.target.value)))} /></Field>
        </div>
        <Field label="Day type"><Select value={o.dayType} onChange={(ev) => { const d = ev.target.value as DayType; setO((p) => ({ ...p, dayType: d, multiplier: profile.multipliers[d] })); }}>{DAY_TYPES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}</Select></Field>
        <Field label="Multiplier"><Input type="number" step="0.25" min={0} value={o.multiplier} onChange={(ev) => set('multiplier', Number(ev.target.value))} /></Field>
        <Field label="Hourly rate" hint={rate ? `Profile rate ${rm(rate)}/h` : 'Set basic salary in Profile to auto-calculate'}><MoneyInput value={o.hourlyRate || null} onChange={(v) => set('hourlyRate', v ?? 0)} /></Field>
        <Field label="Approval"><Select value={o.approval} onChange={(ev) => set('approval', ev.target.value as OTInput['approval'])}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select></Field>
        <Field label="Payment status"><Select value={o.payment} onChange={(ev) => set('payment', ev.target.value as OTInput['payment'])}><option value="unpaid">Unpaid</option><option value="paid">Paid</option></Select></Field>
        <Field label="Reason"><Input value={o.reason} onChange={(ev) => set('reason', ev.target.value)} maxLength={200} /></Field>
        <p className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2 dark:bg-slate-800">{c.hours.toFixed(2)} h × {rm(o.hourlyRate)} × {o.multiplier} = <b className="text-income">{rm(c.amount)}</b></p>
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-between gap-2 sm:col-span-2">
          {e ? <Button variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete OT entry?', message: 'Linked expected salary will be recalculated.', danger: true })) { await deleteOT(e.id); onClose(); } }}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={async () => { try { await saveOT(o, e?.id); toast('OT saved'); onClose(); } catch (er) { setErrors(errMsg(er)); } }}>Save</Button></div>
        </div>
      </div>
    </Modal>
  );
}

function ProfileForm({ p, accounts }: { p: SalaryProfile; accounts: { id: string; name: string; type: string; status: string }[] }) {
  const { toast } = useUI(); const [v, setV] = useState(p);
  const set = <K extends keyof SalaryProfile>(k: K, x: SalaryProfile[K]) => setV((s) => ({ ...s, [k]: x }));
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company"><Input value={v.company} onChange={(e) => set('company', e.target.value)} maxLength={100} /></Field>
        <Field label="Default salary account"><Select value={v.defaultAccountId ?? ''} onChange={(e) => set('defaultAccountId', e.target.value || null)}><option value="">—</option>{accounts.filter((a) => a.status === 'active' && !isLiability(a.type as AccountType)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Basic monthly salary"><MoneyInput value={v.basic || null} onChange={(c) => set('basic', c ?? 0)} /></Field>
        <Field label="Hourly OT base override" hint={`Default: basic ÷ ${v.workDaysPerMonth} ÷ ${v.hoursPerDay} = ${rm(hourlyRate({ ...v, hourlyRateOverride: null }))}/h (Employment Act 1955)`}><MoneyInput value={v.hourlyRateOverride} onChange={(c) => set('hourlyRateOverride', c || null)} placeholder="Auto" /></Field>
        <Field label="Working days per month (ORP divisor)"><Input type="number" min={1} max={31} value={v.workDaysPerMonth} onChange={(e) => set('workDaysPerMonth', Number(e.target.value) || 26)} /></Field>
        <Field label="Normal hours per day"><Input type="number" min={1} max={24} step="0.5" value={v.hoursPerDay} onChange={(e) => set('hoursPerDay', Number(e.target.value) || 8)} /></Field>
        {DAY_TYPES.map((d) => <Field key={d.v} label={`OT multiplier – ${d.label}`}><Input type="number" step="0.25" min={0} value={v.multipliers[d.v]} onChange={(e) => set('multipliers', { ...v.multipliers, [d.v]: Number(e.target.value) })} /></Field>)}
        <ItemList label="Fixed monthly allowances (pre-filled into new records)" items={v.allowances} onChange={(a) => set('allowances', a)} />
        <p className="text-xs text-slate-500 sm:col-span-2">Default multipliers follow the Employment Act 1955 (1.5× normal day, 2× rest day, 3× public holiday). Use your company's policy if different.</p>
        <div className="flex justify-end sm:col-span-2"><Button onClick={async () => { await updateSettings({ salaryProfile: { ...v, allowances: v.allowances.filter((a) => a.name || a.amount) } }); toast('Profile saved'); }}>Save profile</Button></div>
      </div>
    </Card>
  );
}
