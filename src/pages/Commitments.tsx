import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Link2, Pencil, Trash2, SkipForward, Undo2 } from 'lucide-react';
import { useCommitments, useFinance, useRules, type Finance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { DateInput, MoneyInput } from '@/components/inputs';
import { Tabs } from '@/components/Tabs';
import { Stat } from '@/components/Stat';
import { deleteCommitment, deleteRule, linkTransaction, payOccurrence, saveCommitment, saveRule, unlinkPayment, updateOccurrence, type CommitmentInput, type RuleInput } from '@/db/commitmentRepo';
import { ValidationError } from '@/db/repo';
import type { Commitment, RecurringRule, TxnType } from '@/db/types';
import { STATUS_META, summarizeOcc, type OccStatus, type OccView } from '@/domain/commitments';
import { FREQUENCIES } from '@/domain/schedule';
import { formatRM } from '@/lib/money';
import { addDays, addMonths, fmtDate, fmtMonth, monthEnd, monthStart, todayKL } from '@/lib/date';
import { txnLabel } from '@/lib/labels';

const rm = (c: number) => formatRM(c);
const errMsg = (e: unknown) => (e instanceof ValidationError ? e.errors : [(e as Error).message]);
const PRESETS = ['Rental', 'Car loan', 'MARA', 'PTPTN', 'Insurance', 'Electricity (TNB)', 'Water', 'Internet', 'Phone', 'Credit card', 'Takaful', 'Netflix', 'Spotify', 'Gym'];

export default function CommitmentsPage() {
  const t = useT(); const f = useFinance(); const c = useCommitments(); const rules = useRules();
  const [tab, setTab] = useState<'schedule' | 'list' | 'recurring'>('schedule');
  const [month, setMonth] = useState(monthStart(todayKL()));
  const [status, setStatus] = useState<OccStatus | ''>('');
  const [pay, setPay] = useState<OccView | null>(null);
  const [editC, setEditC] = useState<Commitment | 'new' | null>(null);
  const [editR, setEditR] = useState<RecurringRule | 'new' | null>(null);
  if (!f || !c || !rules) return <Loading />;
  const today = todayKL();
  const inMonth = c.views.filter((v) => v.dueDate >= month && v.dueDate <= monthEnd(month));
  const overduePrev = c.views.filter((v) => v.dueDate < month && v.remaining > 0 && v.dueDate < today);
  const sum = summarizeOcc(c.views, month, monthEnd(month), today);
  const list = [...(month === monthStart(today) ? overduePrev : []), ...inMonth].filter((v) => !status || v.status === status);

  return (
    <>
      <PageHeader title={t('Commitments')} actions={tab === 'recurring'
        ? <Button onClick={() => setEditR('new')}><Plus className="h-4 w-4" />Recurring transaction</Button>
        : <Button onClick={() => setEditC('new')}><Plus className="h-4 w-4" />Commitment</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ v: 'schedule', label: 'Payment schedule' }, { v: 'list', label: `Commitments (${c.commitments.length})` }, { v: 'recurring', label: `Recurring transactions (${rules.length})` }]} />

      {tab === 'schedule' && <>
        <div className="mb-4 flex items-center gap-2">
          <Button variant="secondary" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-28 text-center font-semibold">{fmtMonth(month.slice(0, 7), f.settings.language)}</span>
          <Button variant="secondary" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {month !== monthStart(today) && <Button variant="ghost" onClick={() => setMonth(monthStart(today))}>Today</Button>}
          <div className="ml-auto w-40"><Select value={status} onChange={(e) => setStatus(e.target.value as OccStatus)} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select></div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total due" value={rm(sum.total)} sub={`${inMonth.filter((v) => v.status !== 'skipped').length} item(s)`} />
          <Stat label="Paid" value={rm(sum.paid)} tone="green" sub={`${sum.counts.paid} paid · ${sum.counts.partial} partial`} />
          <Stat label="Pending / upcoming" value={rm(sum.pending)} tone="blue" sub={`${sum.counts.pending} pending · ${sum.counts.upcoming} upcoming`} />
          <Stat label="Overdue" value={rm(sum.overdue)} tone="red" sub={`${sum.counts.overdue} overdue`} />
        </div>
        {month > addDays(today, 62) && <p className="mb-3 text-xs text-slate-500">Items are generated up to about 2 months ahead.</p>}
        <Card>
          {list.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{list.map((v) => <OccRow key={v.id} v={v} f={f} onPay={() => setPay(v)} />)}</div>
            : <Empty title={c.commitments.length ? 'Nothing due' : 'No commitments yet'}>{!c.commitments.length && <>Add rental, loans, PTPTN, insurance, bills and subscriptions.<br /><Button className="mt-2" onClick={() => setEditC('new')}>Add commitment</Button></>}</Empty>}
        </Card>
      </>}

      {tab === 'list' && <Card>{c.commitments.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{c.commitments.sort((a, b) => a.name.localeCompare(b.name)).map((x) => {
        const next = c.views.find((v) => v.commitmentId === x.id && v.remaining > 0);
        return (
          <div key={x.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{x.name} {!x.active && <Badge>Inactive</Badge>} <Badge tone={x.kind === 'debt' ? 'orange' : 'slate'}>{x.kind === 'debt' ? 'Debt repayment' : f.catMap.get(x.categoryId ?? '')?.name ?? 'Expense'}</Badge></p>
              <p className="text-xs text-slate-500">{FREQUENCIES.find((q) => q.v === x.frequency)?.label} from {fmtDate(x.startDate)}{x.endDate ? ` to ${fmtDate(x.endDate)}` : ''} · {f.accMap.get(x.accountId ?? '')?.name ?? 'No account'}{next ? ` · next ${fmtDate(next.dueDate)}` : ''}</p></div>
            <span className="font-semibold tabular-nums">{rm(x.amount)}</span>
            <Button variant="ghost" onClick={() => setEditC(x)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
          </div>);
      })}</div> : <Empty title="No commitments yet" />}</Card>}

      {tab === 'recurring' && <Card>
        <p className="mb-3 text-xs text-slate-500">Recurring transactions are created automatically up to 31 days ahead. <b>Auto-post</b> records them as actual on their date; otherwise they stay “expected” until you confirm. Use commitments instead for bills you want to track as paid/overdue – don't set up the same bill twice.</p>
        {rules.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{r.name} <Badge tone={r.template.type === 'income' ? 'green' : r.template.type === 'transfer' ? 'blue' : 'red'}>{txnLabel(r.template.type)}</Badge> {r.autoPost ? <Badge tone="purple">Auto-post</Badge> : <Badge>Confirm manually</Badge>} {!r.active && <Badge>Paused</Badge>}</p>
              <p className="text-xs text-slate-500">{FREQUENCIES.find((q) => q.v === r.frequency)?.label} from {fmtDate(r.startDate)}{r.endDate ? ` to ${fmtDate(r.endDate)}` : ''} · {f.accMap.get(r.template.accountId ?? '')?.name ?? '—'}{r.template.toAccountId ? ` → ${f.accMap.get(r.template.toAccountId)?.name}` : ''}</p></div>
            <span className="font-semibold tabular-nums">{rm(r.template.amount)}</span>
            <Button variant="ghost" onClick={() => setEditR(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
          </div>))}</div> : <Empty title="No recurring transactions">Create one here, or tick “Repeat” when adding a transaction.</Empty>}
      </Card>}

      {pay && <PayModal v={pay} f={f} onClose={() => setPay(null)} />}
      {editC && <CommitmentForm c={editC === 'new' ? undefined : editC} f={f} onClose={() => setEditC(null)} />}
      {editR && <RuleForm r={editR === 'new' ? undefined : editR} f={f} onClose={() => setEditR(null)} />}
    </>
  );
}

function OccRow({ v, f, onPay }: { v: OccView; f: Finance; onPay: () => void }) {
  const { toast } = useUI(); const [open, setOpen] = useState(false); const [editAmt, setEditAmt] = useState(false); const [amt, setAmt] = useState<number | null>(v.amount);
  const m = STATUS_META[v.status];
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <p className="truncate font-medium">{v.commitment.name} <Badge tone={m.tone}>{m.label}</Badge></p>
          <p className="text-xs text-slate-500">Due {fmtDate(v.dueDate)} · {f.accMap.get(v.commitment.accountId ?? '')?.name ?? 'no account'}{v.paid > 0 && ` · paid ${rm(v.paid)}`}{v.payments.length ? ` · ${v.payments.length} payment(s)` : ''}</p>
        </button>
        <div className="text-right"><p className="font-semibold tabular-nums">{rm(v.amount)}</p>{v.remaining > 0 && v.paid > 0 && <p className="text-xs text-expense">{rm(v.remaining)} left</p>}</div>
        <div className="flex gap-1">
          {v.remaining > 0 && <Button variant="secondary" className="text-income" onClick={onPay}><CheckCircle2 className="h-4 w-4" />Mark paid</Button>}
          {v.paid === 0 && <Button variant="ghost" title={v.skipped ? 'Unskip' : 'Skip this one'} aria-label={v.skipped ? 'Unskip' : 'Skip'} onClick={() => updateOccurrence(v.id, { skipped: !v.skipped })}>{v.skipped ? <Undo2 className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}</Button>}
        </div>
      </div>
      {open && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
        {editAmt ? <div className="flex items-end gap-2"><Field label="Amount for this period"><MoneyInput value={amt} onChange={setAmt} /></Field><Button onClick={async () => { try { await updateOccurrence(v.id, { amount: amt ?? 0 }); setEditAmt(false); toast('Amount updated'); } catch (e) { toast(errMsg(e)[0], 'err'); } }}>Save</Button></div>
          : <button className="text-xs text-teal-700 hover:underline dark:text-teal-400" onClick={() => setEditAmt(true)}>Change amount for this period only</button>}
        <p className="mt-2 text-xs font-semibold text-slate-500">Payment history</p>
        {v.payments.length ? <ul>{v.payments.map((p) => <li key={p.id} className="flex items-center justify-between py-1"><span>{fmtDate(p.date)} · {f.accMap.get(p.accountId ?? '')?.name} · {txnLabel(p.type)}</span><span className="flex items-center gap-2 tabular-nums">{rm(p.amount)}<button className="text-xs text-red-600 hover:underline" onClick={() => unlinkPayment(v.id, p.id)}>Unlink</button></span></li>)}</ul> : <p className="text-xs text-slate-500">No payments yet.</p>}
      </div>}
    </div>
  );
}

function PayModal({ v, f, onClose }: { v: OccView; f: Finance; onClose: () => void }) {
  const { toast } = useUI();
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [amt, setAmt] = useState<number | null>(v.remaining); const [date, setDate] = useState(todayKL()); const [acc, setAcc] = useState(v.commitment.accountId ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const candidates = useMemo(() => f.txns.filter((t) => !t.deletedAt && t.status === 'actual' && (t.type === 'expense' || t.type === 'debt_repayment')
    && !t.related.some((r) => r.kind === 'occurrence') && t.date >= addDays(v.dueDate, -20) && t.date <= addDays(v.dueDate, 20))
    .sort((a, b) => Math.abs(a.amount - v.remaining) - Math.abs(b.amount - v.remaining)).slice(0, 15), [f.txns, v]);
  const accOpts = f.accounts.filter((a) => a.status === 'active' && a.id !== v.commitment.toAccountId);
  return (
    <Modal open onClose={onClose} title={`Pay ${v.commitment.name} · due ${fmtDate(v.dueDate)}`}>
      <div className="mb-3 flex gap-2"><Button variant={mode === 'new' ? 'primary' : 'secondary'} onClick={() => setMode('new')}>Record payment</Button><Button variant={mode === 'link' ? 'primary' : 'secondary'} onClick={() => setMode('link')}><Link2 className="h-4 w-4" />Link existing</Button></div>
      {mode === 'new' ? <div className="grid gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Creates {v.commitment.kind === 'debt' ? 'a debt repayment (not counted as an expense)' : 'an expense'} and updates balances. Enter less than {rm(v.remaining)} for a partial payment.</p>
        <Field label="Amount"><MoneyInput value={amt} onChange={setAmt} /></Field>
        <Field label="Date paid"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Paid from"><Select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">— Select —</option>{accOpts.map((a) => <option key={a.id} value={a.id}>{a.name} ({rm(f.balances.get(a.id) ?? 0)})</option>)}</Select></Field>
        {errors.length > 0 && <ul className="text-sm text-red-600">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { if (!amt) return setErrors(['Enter an amount.']); try { await payOccurrence(v.id, { amount: amt, date, accountId: acc }); toast('Payment recorded'); onClose(); } catch (e) { setErrors(errMsg(e)); } }}>Mark paid</Button></div>
      </div> : <div>
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Already recorded this payment? Link it to avoid a duplicate.</p>
        {candidates.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{candidates.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 truncate">{fmtDate(t.date)} · {t.name} · {f.accMap.get(t.accountId ?? '')?.name}</span>
            <span className="flex items-center gap-2"><b className="tabular-nums">{rm(t.amount)}</b><Button variant="secondary" onClick={async () => { try { await linkTransaction(v.id, t.id); toast('Linked'); onClose(); } catch (e) { toast(errMsg(e)[0], 'err'); } }}>Link</Button></span></li>))}</ul>
          : <Empty title="No matching transactions within 20 days of the due date" />}
      </div>}
    </Modal>
  );
}

function CommitmentForm({ c, f, onClose }: { c?: Commitment; f: Finance; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const [v, setV] = useState<CommitmentInput>(() => c ? { ...c } : { name: '', kind: 'expense', categoryId: null, amount: 0, startDate: todayKL(), endDate: null, frequency: 'monthly', accountId: null, toAccountId: null, active: true, remarks: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof CommitmentInput>(k: K, x: CommitmentInput[K]) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Modal open onClose={onClose} title={c ? 'Edit commitment' : 'New commitment'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input list="mf-presets" value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Rental, PTPTN, Car loan" /><datalist id="mf-presets">{PRESETS.map((p) => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Paid as" hint={v.kind === 'debt' ? 'Loan/card repayments reduce a liability, not counted as expenses.' : undefined}><Select value={v.kind} onChange={(e) => set('kind', e.target.value as Commitment['kind'])}><option value="expense">Expense (bill, rent, subscription)</option><option value="debt">Debt repayment (loan, PTPTN, card)</option></Select></Field>
        {v.kind === 'expense'
          ? <Field label="Category"><Select value={v.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}><option value="">— Select —</option>{f.cats.filter((x) => x.kind === 'expense' && !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          : <Field label="Credit card being repaid (optional)"><Select value={v.toAccountId ?? ''} onChange={(e) => set('toAccountId', e.target.value || null)}><option value="">— External loan —</option>{f.accounts.filter((a) => a.type === 'credit_card').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
        <Field label="Amount"><MoneyInput value={v.amount || null} onChange={(x) => set('amount', x ?? 0)} /></Field>
        <Field label="Frequency"><Select value={v.frequency} onChange={(e) => set('frequency', e.target.value as Commitment['frequency'])}>{FREQUENCIES.map((q) => <option key={q.v} value={q.v}>{q.label}</option>)}</Select></Field>
        <Field label="First / next due date" hint="Sets the due day"><DateInput value={v.startDate} onChange={(x) => set('startDate', x)} /></Field>
        <Field label="End date (optional)"><DateInput value={v.endDate ?? ''} onChange={(x) => set('endDate', x || null)} /></Field>
        <Field label="Usually paid from"><Select value={v.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || null)}><option value="">—</option>{f.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} />Active</label>
        <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={v.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={500} /></Field>
        {!c && <p className="text-xs text-slate-500 sm:col-span-2">Tracking starts from this month, so past years aren't marked overdue.</p>}
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-between gap-2 sm:col-span-2">
          {c ? <Button variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete commitment?', message: 'Unpaid schedule items are removed. Payments already recorded stay in your transactions.', danger: true, confirmText: 'Delete' })) { await deleteCommitment(c.id); onClose(); } }}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={async () => { try { await saveCommitment(v, c?.id); toast('Commitment saved'); onClose(); } catch (e) { setErrors(errMsg(e)); } }}>Save</Button></div>
        </div>
      </div>
    </Modal>
  );
}

export function RuleForm({ r, f, onClose, initial }: { r?: RecurringRule; f: Finance; onClose: () => void; initial?: Partial<RuleInput> }) {
  const { toast, confirm } = useUI();
  const [v, setV] = useState<RuleInput>(() => r ? { ...r } : { name: '', frequency: 'monthly', startDate: todayKL(), endDate: null, autoPost: false, active: true,
    template: { type: 'expense', amount: 0, fee: 0, categoryId: null, accountId: null, toAccountId: null, merchant: '', paymentMethod: null, needWant: null, remarks: '' }, ...initial });
  const [errors, setErrors] = useState<string[]>([]);
  const setT = <K extends keyof RuleInput['template']>(k: K, x: RuleInput['template'][K]) => setV((p) => ({ ...p, template: { ...p.template, [k]: x } }));
  const tp = v.template.type;
  return (
    <Modal open onClose={onClose} title={r ? 'Edit recurring transaction' : 'New recurring transaction'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={100} /></Field>
        <Field label="Type"><Select value={tp} onChange={(e) => setV({ ...v, template: { ...v.template, type: e.target.value as TxnType, categoryId: null, toAccountId: null } })}>{(['expense', 'income', 'transfer', 'debt_repayment'] as TxnType[]).map((x) => <option key={x} value={x}>{txnLabel(x)}</option>)}</Select></Field>
        <Field label="Amount"><MoneyInput value={v.template.amount || null} onChange={(x) => setT('amount', x ?? 0)} /></Field>
        {(tp === 'income' || tp === 'expense') && <Field label="Category"><Select value={v.template.categoryId ?? ''} onChange={(e) => setT('categoryId', e.target.value || null)}><option value="">— Select —</option>{f.cats.filter((x) => x.kind === tp && !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>}
        <Field label={tp === 'income' ? 'Into account' : 'From account'}><Select value={v.template.accountId ?? ''} onChange={(e) => setT('accountId', e.target.value || null)}><option value="">— Select —</option>{f.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        {(tp === 'transfer' || tp === 'debt_repayment') && <Field label={tp === 'transfer' ? 'To account' : 'Card repaid (optional)'}><Select value={v.template.toAccountId ?? ''} onChange={(e) => setT('toAccountId', e.target.value || null)}><option value="">—</option>{f.accounts.filter((a) => a.status === 'active' && a.id !== v.template.accountId && (tp === 'transfer' || a.type === 'credit_card')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
        <Field label="Merchant / payer"><Input value={v.template.merchant} onChange={(e) => setT('merchant', e.target.value)} maxLength={120} /></Field>
        <Field label="Frequency"><Select value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value as RuleInput['frequency'] })}>{FREQUENCIES.map((q) => <option key={q.v} value={q.v}>{q.label}</option>)}</Select></Field>
        <Field label="First date"><DateInput value={v.startDate} onChange={(x) => setV({ ...v, startDate: x })} /></Field>
        <Field label="End date (optional)"><DateInput value={v.endDate ?? ''} onChange={(x) => setV({ ...v, endDate: x || null })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.autoPost} onChange={(e) => setV({ ...v, autoPost: e.target.checked })} />Auto-post on due date</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Active</label>
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-between gap-2 sm:col-span-2">
          {r ? <Button variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete recurring transaction?', message: 'Future unconfirmed entries are removed; recorded ones are kept.', danger: true, confirmText: 'Delete' })) { await deleteRule(r.id); onClose(); } }}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={async () => { try { await saveRule(v, r?.id); toast('Recurring transaction saved'); onClose(); } catch (e) { setErrors(errMsg(e)); } }}>Save</Button></div>
        </div>
      </div>
    </Modal>
  );
}
