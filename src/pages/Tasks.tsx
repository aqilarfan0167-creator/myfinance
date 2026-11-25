import { useState } from 'react';
import { Plus, Repeat, Trash2 } from 'lucide-react';
import { useTasks } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { DateInput } from '@/components/inputs';
import { Tabs } from '@/components/Tabs';
import { deleteTask, saveTask, setTaskStatus, type TaskInput } from '@/db/planningRepo';
import { ValidationError } from '@/db/repo';
import type { Task } from '@/db/types';
import { isOverdueTask } from '@/domain/planning';
import { addDays, fmtDate, todayKL } from '@/lib/date';
import { cn } from '@/lib/cn';

const CATS = ['Bills', 'Tax (LHDN)', 'Insurance', 'Vehicle', 'Banking', 'Savings', 'Investments', 'Documents', 'Family', 'Other'];
const PRI = { high: 'red', medium: 'orange', low: 'slate' } as const;

export default function TasksPage() {
  const t = useT(); const tasks = useTasks(); const { toast } = useUI(); const today = todayKL();
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open');
  const [edit, setEdit] = useState<Task | 'new' | null>(null);
  if (!tasks) return <Loading />;
  const sort = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority);
  const open = tasks.filter((x) => x.status === 'pending').sort(sort);
  const groups = tab === 'open' ? [
    { title: 'Overdue', items: open.filter((x) => isOverdueTask(x, today)), tone: 'text-expense' },
    { title: 'Due within 7 days', items: open.filter((x) => x.dueDate && x.dueDate >= today && x.dueDate <= addDays(today, 7)), tone: 'text-warn' },
    { title: 'Later', items: open.filter((x) => x.dueDate && x.dueDate > addDays(today, 7)), tone: '' },
    { title: 'No due date', items: open.filter((x) => !x.dueDate), tone: '' },
  ] : [{ title: tab === 'done' ? 'Completed / cancelled' : 'All tasks', items: (tab === 'done' ? tasks.filter((x) => x.status !== 'pending') : [...tasks]).sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)), tone: '' }];
  const toggle = async (x: Task) => { await setTaskStatus(x.id, x.status === 'done' ? 'pending' : 'done'); if (x.status !== 'done') toast(x.recurrence !== 'none' ? 'Done – next one scheduled' : 'Task completed'); };

  return (
    <>
      <PageHeader title={t('Financial Tasks')} actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Task</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ v: 'open', label: `Pending (${open.length})` }, { v: 'done', label: 'Completed' }, { v: 'all', label: 'All' }]} />
      {tasks.length === 0 ? <Empty title="No tasks yet">e.g. “Submit e-Filing (LHDN)”, “Renew car insurance”, “Update EPF nomination”.<br /><Button className="mt-2" onClick={() => setEdit('new')}>Add task</Button></Empty> :
        <div className="space-y-4">{groups.filter((g) => g.items.length).map((g) => (
          <Card key={g.title} title={<span className={g.tone}>{g.title} ({g.items.length})</span>}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{g.items.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <input type="checkbox" aria-label={`Complete ${x.name}`} className="h-5 w-5 accent-teal-700" checked={x.status === 'done'} disabled={x.status === 'cancelled'} onChange={() => toggle(x)} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(x)}>
                  <p className={cn('truncate text-sm font-medium', x.status !== 'pending' && 'text-slate-400 line-through')}>{x.name} {x.recurrence !== 'none' && <Repeat className="inline h-3 w-3 text-slate-400" />}</p>
                  <p className="text-xs text-slate-500">{x.category}{x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ''}{x.remarks ? ` · ${x.remarks}` : ''}</p>
                </button>
                <Badge tone={PRI[x.priority]}>{x.priority}</Badge>
                {isOverdueTask(x, today) && <Badge tone="red">Overdue</Badge>}
              </li>))}</ul>
          </Card>))}
          {tab === 'open' && !open.length && <Empty title="All caught up 🎉" />}
        </div>}
      {edit && <TaskForm t={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function TaskForm({ t, onClose }: { t?: Task; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const [v, setV] = useState<TaskInput>(() => t ? { name: t.name, category: t.category, dueDate: t.dueDate, priority: t.priority, recurrence: t.recurrence, status: t.status, remarks: t.remarks } : { name: '', category: 'Bills', dueDate: todayKL(), priority: 'medium', recurrence: 'none', status: 'pending', remarks: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof TaskInput>(k: K, x: TaskInput[K]) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Modal open onClose={onClose} title={t ? 'Edit task' : 'New task'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Task" className="sm:col-span-2"><Input value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={150} autoFocus /></Field>
        <Field label="Category"><Input list="mf-task-cats" value={v.category} onChange={(e) => set('category', e.target.value)} maxLength={50} /><datalist id="mf-task-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Due date"><DateInput value={v.dueDate ?? ''} onChange={(x) => set('dueDate', x || null)} /></Field>
        <Field label="Priority"><Select value={v.priority} onChange={(e) => set('priority', e.target.value as Task['priority'])}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
        <Field label="Repeat" hint={v.recurrence !== 'none' ? 'Completing it schedules the next one.' : undefined}><Select value={v.recurrence} onChange={(e) => set('recurrence', e.target.value as Task['recurrence'])}><option value="none">Does not repeat</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></Select></Field>
        {t && <Field label="Status"><Select value={v.status} onChange={(e) => set('status', e.target.value as Task['status'])}><option value="pending">Pending</option><option value="done">Done</option><option value="cancelled">Cancelled</option></Select></Field>}
        <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={v.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={1000} /></Field>
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex justify-between gap-2 sm:col-span-2">
          {t ? <Button variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete task?', message: t.name, danger: true, confirmText: 'Delete' })) { await deleteTask(t.id); onClose(); } }}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={async () => { try { if (t && v.status !== t.status) { await saveTask({ ...v, status: t.status }, t.id); await setTaskStatus(t.id, v.status); } else await saveTask(v, t?.id); toast('Task saved'); onClose(); } catch (e) { setErrors(e instanceof ValidationError ? e.errors : [(e as Error).message]); } }}>Save</Button></div>
        </div>
      </div>
    </Modal>
  );
}
