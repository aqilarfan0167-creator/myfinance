import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Check, CheckCheck, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useSettings } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Input, Loading, PageHeader } from '@/components/ui';
import { Tabs } from '@/components/Tabs';
import { updateSettings } from '@/db/repo';
import type { AppNotification, NotificationPrefs } from '@/db/types';
import { fmtDateTime } from '@/lib/date';
import { cn } from '@/lib/cn';

const now = () => new Date().toISOString();
const markRead = (ids: string[]) => db.notifications.where('id').anyOf(ids).modify({ readAt: now() });

export default function NotificationsPage() {
  const t = useT(); const s = useSettings(); const { toast } = useUI();
  const [tab, setTab] = useState<'active' | 'all' | 'settings'>('active');
  const all = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().toArray(), []);
  const [perm, setPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  if (!all || !s) return <Loading />;
  const active = all.filter((n) => !n.dismissedAt && !n.resolvedAt);
  const list = tab === 'active' ? active : all;
  const p = s.notificationPrefs;
  const setP = (x: Partial<NotificationPrefs>) => updateSettings({ notificationPrefs: { ...p, ...x } });

  return (
    <>
      <PageHeader title={t('Notifications')} actions={tab !== 'settings' && active.some((n) => !n.readAt) && <Button variant="secondary" onClick={() => markRead(active.filter((n) => !n.readAt).map((n) => n.id))}><CheckCheck className="h-4 w-4" />Mark all read</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ v: 'active', label: `Active (${active.length})` }, { v: 'all', label: 'History' }, { v: 'settings', label: 'Reminder settings' }]} />
      {tab !== 'settings' ? (list.length ? <Card><ul className="divide-y divide-slate-100 dark:divide-slate-800">{list.map((n) => <Row key={n.id} n={n} />)}</ul></Card>
        : <Empty title={tab === 'active' ? 'You are all caught up' : 'No notifications yet'}>Reminders appear here for payments, budgets, balances, salary, tasks, receipts and backups.</Empty>)
        : <Card>
          <div className="space-y-3 text-sm">
            <Toggle label="Upcoming payments & card due dates" on={p.payments.enabled} set={(v) => setP({ payments: { ...p.payments, enabled: v } })}><Days v={p.payments.daysBefore} set={(d) => setP({ payments: { ...p.payments, daysBefore: d } })} /></Toggle>
            <Toggle label="Overdue commitments" on={p.overdue} set={(v) => setP({ overdue: v })} />
            <Toggle label="Subscription renewals" on={p.subscriptions.enabled} set={(v) => setP({ subscriptions: { ...p.subscriptions, enabled: v } })}><Days v={p.subscriptions.daysBefore} set={(d) => setP({ subscriptions: { ...p.subscriptions, daysBefore: d } })} /></Toggle>
            <Toggle label="Budget warnings" on={p.budget.enabled} set={(v) => setP({ budget: { ...p.budget, enabled: v } })}><span className="flex items-center gap-1">at <Input type="number" min={10} max={100} className="w-20" value={p.budget.warnAt} onChange={(e) => setP({ budget: { ...p.budget, warnAt: Math.min(100, Math.max(10, Number(e.target.value) || 80)) } })} />% used</span></Toggle>
            <Toggle label="Low account balances" on={p.lowBalance} set={(v) => setP({ lowBalance: v })} />
            <Toggle label="Salary expected / not yet confirmed" on={p.salary} set={(v) => setP({ salary: v })} />
            <Toggle label="Financial tasks" on={p.tasks.enabled} set={(v) => setP({ tasks: { ...p.tasks, enabled: v } })}><Days v={p.tasks.daysBefore} set={(d) => setP({ tasks: { ...p.tasks, daysBefore: d } })} /></Toggle>
            <Toggle label="Receipts waiting for review" on={p.receipts} set={(v) => setP({ receipts: v })} />
            <Toggle label="Backup reminder" on={p.backup.enabled} set={(v) => setP({ backup: { ...p.backup, enabled: v } })}><span className="flex items-center gap-1">every <Input type="number" min={1} max={90} className="w-20" value={p.backup.everyDays} onChange={(e) => setP({ backup: { ...p.backup, everyDays: Math.min(90, Math.max(1, Number(e.target.value) || 14)) } })} /> days</span></Toggle>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Toggle label="Show system notifications while MyFinance is open" on={p.browser && perm === 'granted'} set={async (v) => {
                if (!v) return setP({ browser: false });
                if (perm === 'unsupported') return toast('This browser does not support notifications', 'err');
                const r = await Notification.requestPermission(); setPerm(r); if (r === 'granted') { setP({ browser: true }); toast('System notifications enabled'); } else toast('Permission was not granted – enable notifications for this site in your browser settings', 'err');
              }} />
              <p className="mt-2 text-xs text-slate-500">Permission: <b>{perm}</b>. Reminders are checked when you open MyFinance, when you return to it, and every 30 minutes while it is open. <b>They are not delivered while the app is closed</b> – that would require a push server, which isn't set up. Install the app (PWA) and open it daily for best results.</p>
            </div>
          </div>
        </Card>}
    </>
  );
}

function Row({ n }: { n: AppNotification }) {
  const tone = n.severity === 'alert' ? 'red' : n.severity === 'warning' ? 'orange' : 'blue';
  return (
    <li className={cn('flex items-start gap-3 py-3', !n.readAt && !n.resolvedAt && !n.dismissedAt && 'font-medium')}>
      {n.readAt || n.resolvedAt || n.dismissedAt ? <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <Bell className={cn('mt-0.5 h-4 w-4 shrink-0', n.severity === 'alert' ? 'text-expense' : n.severity === 'warning' ? 'text-warn' : 'text-transfer')} />}
      <Link to={n.link} onClick={() => markRead([n.id])} className="min-w-0 flex-1 hover:underline">
        <p className="text-sm">{n.title} {n.resolvedAt && <Badge tone="green">resolved</Badge>}{n.dismissedAt && <Badge>dismissed</Badge>}</p>
        <p className="text-xs font-normal text-slate-500">{n.body} · {fmtDateTime(n.createdAt)}</p>
      </Link>
      <Badge tone={tone}>{n.type.replace('_', ' ')}</Badge>
      {!n.dismissedAt && !n.resolvedAt && <>
        {!n.readAt && <button aria-label="Mark read" className="text-slate-400 hover:text-slate-700" onClick={() => markRead([n.id])}><Check className="h-4 w-4" /></button>}
        <button aria-label="Dismiss" className="text-slate-400 hover:text-red-600" onClick={() => db.notifications.update(n.id, { dismissedAt: now(), readAt: n.readAt ?? now() })}><X className="h-4 w-4" /></button></>}
    </li>
  );
}
function Toggle({ label, on, set, children }: { label: string; on: boolean; set: (v: boolean) => void; children?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={on} onChange={(e) => set(e.target.checked)} />{label}</label>{on && children}</div>;
}
function Days({ v, set }: { v: number; set: (d: number) => void }) {
  return <span className="flex items-center gap-1"><Input type="number" min={0} max={30} className="w-20" value={v} onChange={(e) => set(Math.min(30, Math.max(0, Number(e.target.value) || 0)))} /> days before</span>;
}
