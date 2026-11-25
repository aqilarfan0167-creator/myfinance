import { useState } from 'react';
import { Plus, Pencil, MinusCircle, PlusCircle, Trash2, CheckCircle2 } from 'lucide-react';
import { useFinance, useGoals, type Finance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { DateInput, MoneyInput } from '@/components/inputs';
import { Stat } from '@/components/Stat';
import { Progress } from '@/components/Progress';
import { addGoalEntry, deleteGoal, deleteGoalEntry, saveGoal, type GoalInput } from '@/db/planningRepo';
import { ValidationError } from '@/db/repo';
import { isLiability, type GoalEntry, type GoalType } from '@/db/types';
import type { GoalView } from '@/domain/planning';
import { formatRM } from '@/lib/money';
import { fmtDate, todayKL } from '@/lib/date';

const rm = (c: number) => formatRM(c);
const errMsg = (e: unknown) => (e instanceof ValidationError ? e.errors : [(e as Error).message]);
export const GOAL_TYPES: { v: GoalType; label: string }[] = [
  { v: 'emergency', label: 'Emergency fund' }, { v: 'car', label: 'Car deposit' }, { v: 'house', label: 'House deposit' }, { v: 'wedding', label: 'Wedding' },
  { v: 'travel', label: 'Travel' }, { v: 'investment', label: 'Investment' }, { v: 'education', label: 'Education' }, { v: 'other', label: 'Other' },
];
const PRI = { 1: ['High', 'red'], 2: ['Medium', 'orange'], 3: ['Low', 'slate'] } as const;

export default function SavingsPage() {
  const t = useT(); const f = useFinance(); const g = useGoals();
  const [edit, setEdit] = useState<GoalView | 'new' | null>(null);
  const [entry, setEntry] = useState<{ g: GoalView; sign: 1 | -1 } | null>(null);
  const [showDone, setShowDone] = useState(false);
  if (!f || !g) return <Loading />;
  const active = g.views.filter((v) => v.status === 'active').sort((a, b) => a.priority - b.priority);
  const others = g.views.filter((v) => v.status !== 'active');
  const tot = active.reduce((a, v) => ({ saved: a.saved + v.saved, target: a.target + v.target, month: a.month + v.thisMonth, plan: a.plan + v.monthlyContribution }), { saved: 0, target: 0, month: 0, plan: 0 });

  return (
    <>
      <PageHeader title={t('Savings Goals')} actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Goal</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total saved" value={rm(tot.saved)} tone="purple" sub={`${active.length} active goal(s)`} />
        <Stat label="Total target" value={rm(tot.target)} sub={tot.target ? `${Math.round((tot.saved / tot.target) * 100)}% overall` : '—'} />
        <Stat label="Saved this month" value={rm(tot.month)} tone={tot.month >= tot.plan ? 'green' : 'orange'} sub={`Plan ${rm(tot.plan)}/month`} />
        <Stat label="Still to save" value={rm(Math.max(0, tot.target - tot.saved))} tone="blue" />
      </div>
      {active.length ? <div className="grid gap-4 md:grid-cols-2">{active.map((v) => <GoalCard key={v.id} v={v} f={f} entries={g.entries.filter((e) => e.goalId === v.id)} onEdit={() => setEdit(v)} onEntry={(sign) => setEntry({ g: v, sign })} />)}</div>
        : <Empty title="No savings goals yet">Create an emergency fund, house deposit, wedding or travel goal.<br /><Button className="mt-2" onClick={() => setEdit('new')}>Create goal</Button></Empty>}
      {others.length > 0 && <div className="mt-4"><button className="text-sm text-slate-500 hover:underline" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} completed & archived ({others.length})</button>
        {showDone && <div className="mt-3 grid gap-4 md:grid-cols-2">{others.map((v) => <GoalCard key={v.id} v={v} f={f} entries={g.entries.filter((e) => e.goalId === v.id)} onEdit={() => setEdit(v)} onEntry={(sign) => setEntry({ g: v, sign })} />)}</div>}</div>}
      <p className="mt-4 text-xs text-slate-500">Contributions moved between your own accounts are recorded as transfers – never as expenses. Goal money kept in a spending account, and this month's unpaid planned contribution, are set aside in the daily allowance.</p>
      {edit && <GoalForm g={edit === 'new' ? undefined : edit} f={f} onClose={() => setEdit(null)} />}
      {entry && <EntryModal g={entry.g} sign={entry.sign} f={f} onClose={() => setEntry(null)} />}
    </>
  );
}

function GoalCard({ v, f, entries, onEdit, onEntry }: { v: GoalView; f: Finance; entries: GoalEntry[]; onEdit: () => void; onEntry: (s: 1 | -1) => void }) {
  const { confirm, toast } = useUI(); const [hist, setHist] = useState(false);
  const acc = v.linkedAccountId ? f.accMap.get(v.linkedAccountId) : undefined;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: v.color }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{v.name} <Badge tone={PRI[v.priority][1]}>{PRI[v.priority][0]}</Badge> {v.status !== 'active' && <Badge>{v.status}</Badge>}</p>
          <p className="text-xs text-slate-500">{GOAL_TYPES.find((x) => x.v === v.type)?.label}{acc ? ` · in ${acc.name}` : ''}{v.targetDate ? ` · by ${fmtDate(v.targetDate)}` : ''}</p>
        </div>
        <Button variant="ghost" onClick={onEdit} aria-label="Edit goal"><Pencil className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 flex items-baseline justify-between"><span className="text-xl font-bold tabular-nums text-saving">{rm(v.saved)}</span><span className="text-sm text-slate-500">of {rm(v.target)}</span></div>
      <Progress value={v.progress} tone="purple" className="mt-1 h-3" />
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span>Progress: <b>{Math.round(v.progress * 100)}%</b></span><span>Remaining: <b>{rm(v.remaining)}</b></span>
        <span>Plan: <b>{rm(v.monthlyContribution)}</b>/mo</span><span>This month: <b>{rm(v.thisMonth)}</b></span>
        <span>Est. completion: <b>{v.remaining === 0 ? 'Reached 🎉' : v.etaDate ? fmtDate(v.etaDate) : 'set a monthly plan'}</b></span>
        {v.requiredMonthly != null && <span>Needed: <b className={v.onTrack ? 'text-income' : 'text-warn'}>{rm(v.requiredMonthly)}</b>/mo {v.onTrack ? '✓' : '(behind)'}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Button variant="secondary" className="text-saving" onClick={() => onEntry(1)}><PlusCircle className="h-4 w-4" />Contribute</Button>
        <Button variant="ghost" onClick={() => onEntry(-1)}><MinusCircle className="h-4 w-4" />Withdraw</Button>
        {v.remaining === 0 && v.status === 'active' && <Button variant="ghost" className="text-income" onClick={async () => { const { id, createdAt: _c, updatedAt: _u, deletedAt: _d, saved: _s, remaining: _r, progress: _p, thisMonth: _t, requiredMonthly: _q, etaDate: _e, monthsLeft: _m, onTrack: _o, ...rest } = v; await saveGoal({ ...rest, status: 'completed' }, id); toast('Goal completed!'); }}><CheckCircle2 className="h-4 w-4" />Mark completed</Button>}
        <button className="ml-auto text-xs text-slate-500 hover:underline" onClick={() => setHist(!hist)}>History ({entries.length})</button>
      </div>
      {hist && <ul className="mt-2 max-h-48 overflow-y-auto text-xs">
        {v.startingAmount > 0 && <li className="flex justify-between py-1 text-slate-500"><span>Starting amount</span><span>{rm(v.startingAmount)}</span></li>}
        {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
          <li key={e.id} className="flex items-center justify-between border-t border-slate-100 py-1 dark:border-slate-800"><span>{fmtDate(e.date)} {e.note && `· ${e.note}`} {e.txnId && <Badge tone="blue">transfer</Badge>}</span>
            <span className="flex items-center gap-2"><b className={e.amount > 0 ? 'text-saving' : 'text-expense'}>{formatRM(e.amount, { sign: true })}</b>
              <button aria-label="Delete entry" className="text-slate-400 hover:text-red-600" onClick={async () => { if (await confirm({ title: 'Delete entry?', message: e.txnId ? 'The linked transfer will also be deleted and balances recalculated.' : 'The goal progress will be recalculated.', danger: true, confirmText: 'Delete' })) await deleteGoalEntry(e.id); }}><Trash2 className="h-3.5 w-3.5" /></button></span></li>))}
      </ul>}
    </Card>
  );
}

function EntryModal({ g, sign, f, onClose }: { g: GoalView; sign: 1 | -1; f: Finance; onClose: () => void }) {
  const { toast } = useUI();
  const [amt, setAmt] = useState<number | null>(sign > 0 ? Math.max(0, Math.min(g.remaining, g.monthlyContribution - g.thisMonth)) || null : null);
  const [date, setDate] = useState(todayKL()); const [acc, setAcc] = useState(''); const [note, setNote] = useState(''); const [errors, setErrors] = useState<string[]>([]);
  const linked = g.linkedAccountId ? f.accMap.get(g.linkedAccountId) : undefined;
  return (
    <Modal open onClose={onClose} title={`${sign > 0 ? 'Contribute to' : 'Withdraw from'} ${g.name}`}>
      <div className="grid gap-3">
        <Field label="Amount"><MoneyInput value={amt} onChange={setAmt} /></Field>
        <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
        <Field label={sign > 0 ? 'Move money from (optional)' : 'Move money to (optional)'} hint={linked ? `Choosing an account records a transfer ${sign > 0 ? `into ${linked.name}` : `out of ${linked.name}`}. Leave empty if the money is already there.` : 'Link the goal to an account to record real transfers.'}>
          <Select value={acc} disabled={!linked} onChange={(e) => setAcc(e.target.value)}><option value="">— Just update the goal —</option>{f.accounts.filter((a) => a.status === 'active' && a.id !== g.linkedAccountId && !isLiability(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name} ({rm(f.balances.get(a.id) ?? 0)})</option>)}</Select>
        </Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
        {errors.length > 0 && <ul className="text-sm text-red-600">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { if (!amt) return setErrors(['Enter an amount.']); try { await addGoalEntry(g.id, { date, amount: sign * amt, accountId: acc || null, note }); toast(sign > 0 ? 'Contribution saved' : 'Withdrawal saved'); onClose(); } catch (e) { setErrors(errMsg(e)); } }}>Save</Button></div>
      </div>
    </Modal>
  );
}

function GoalForm({ g, f, onClose }: { g?: GoalView; f: Finance; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const [v, setV] = useState<GoalInput>(() => g ? { name: g.name, type: g.type, target: g.target, targetDate: g.targetDate, startingAmount: g.startingAmount, monthlyContribution: g.monthlyContribution, linkedAccountId: g.linkedAccountId, priority: g.priority, status: g.status, color: g.color, reserveMonthly: g.reserveMonthly, remarks: g.remarks }
    : { name: '', type: 'emergency', target: 0, targetDate: null, startingAmount: 0, monthlyContribution: 0, linkedAccountId: null, priority: 2, status: 'active', color: '#9333ea', reserveMonthly: true, remarks: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof GoalInput>(k: K, x: GoalInput[K]) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Modal open onClose={onClose} title={g ? 'Edit goal' : 'New savings goal'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Goal name"><Input value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Emergency fund" /></Field>
        <Field label="Type"><Select value={v.type} onChange={(e) => set('type', e.target.value as GoalType)}>{GOAL_TYPES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</Select></Field>
        <Field label="Target amount"><MoneyInput value={v.target || null} onChange={(c) => set('target', c ?? 0)} /></Field>
        <Field label="Target date (optional)"><DateInput value={v.targetDate ?? ''} onChange={(x) => set('targetDate', x || null)} /></Field>
        <Field label="Already saved (starting amount)"><MoneyInput value={v.startingAmount || null} onChange={(c) => set('startingAmount', c ?? 0)} /></Field>
        <Field label="Planned monthly contribution"><MoneyInput value={v.monthlyContribution || null} onChange={(c) => set('monthlyContribution', c ?? 0)} /></Field>
        <Field label="Kept in account (optional)"><Select value={v.linkedAccountId ?? ''} onChange={(e) => set('linkedAccountId', e.target.value || null)}><option value="">—</option>{f.accounts.filter((a) => a.status === 'active' && !isLiability(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Priority"><Select value={v.priority} onChange={(e) => set('priority', Number(e.target.value) as 1 | 2 | 3)}><option value={1}>High</option><option value={2}>Medium</option><option value={3}>Low</option></Select></Field>
        <Field label="Status"><Select value={v.status} onChange={(e) => set('status', e.target.value as GoalInput['status'])}><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></Select></Field>
        <Field label="Colour"><Input type="color" className="h-10 p-1" value={v.color} onChange={(e) => set('color', e.target.value)} /></Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={v.reserveMonthly} onChange={(e) => set('reserveMonthly', e.target.checked)} />Set aside this month's unpaid contribution when calculating the daily allowance</label>
        <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={v.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={500} /></Field>
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-between gap-2 sm:col-span-2">
          {g ? <Button variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete goal?', message: 'The goal is removed. Transfers already recorded stay in your transactions.', danger: true, confirmText: 'Delete' })) { await deleteGoal(g.id); onClose(); } }}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={async () => { try { await saveGoal(v, g?.id); toast('Goal saved'); onClose(); } catch (e) { setErrors(errMsg(e)); } }}>Save</Button></div>
        </div>
      </div>
    </Modal>
  );
}
