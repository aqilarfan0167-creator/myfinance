import { useEffect, useRef, useState } from 'react';
import { useBudgets, useCommitments, useFinance, useReceipts, useSalaries, useTasks } from '@/hooks/useData';
import { showSystem, syncNotifications } from '@/lib/notifyRunner';
import { todayKL } from '@/lib/date';

/** Recomputes reminders whenever data changes (debounced), when the app regains focus and every 30 minutes while open. */
export function NotificationRunner() {
  const f = useFinance(); const cm = useCommitments(); const sal = useSalaries(); const tasks = useTasks(); const receipts = useReceipts(); const budgets = useBudgets();
  const [tick, setTick] = useState(0); const timer = useRef<ReturnType<typeof setTimeout>>(); const first = useRef(true);
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 30 * 60000);
    const vis = () => document.visibilityState === 'visible' && setTick((x) => x + 1);
    document.addEventListener('visibilitychange', vis); return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);
  useEffect(() => {
    if (!f || !cm || !sal || !tasks || !receipts || !budgets) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const prefs = f.settings.notificationPrefs;
      const newOnes = await syncNotifications({ prefs, today: todayKL(), payDay: f.settings.payDay, occ: cm.views, accounts: f.accounts, txns: f.txns, budgets, cats: f.cats, salaries: sal, tasks, receipts }).catch(() => []);
      if (prefs.browser && !first.current) newOnes.filter((n) => n.severity !== 'info').slice(0, 3).forEach((n) => showSystem(n.title, n.body, n.link));
      if (prefs.browser && first.current && newOnes.length) { const urgent = newOnes.filter((n) => n.severity !== 'info'); if (urgent.length) showSystem(urgent.length === 1 ? urgent[0].title : `${urgent.length} MyFinance reminders`, urgent.length === 1 ? urgent[0].body : urgent.map((n) => n.title).join('\n'), '/notifications'); }
      first.current = false;
    }, 1200);
    return () => clearTimeout(timer.current);
  }, [f, cm, sal, tasks, receipts, budgets, tick]);
  return null;
}
