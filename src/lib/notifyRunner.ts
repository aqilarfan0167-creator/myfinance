import { db } from '@/db/db';
import { computeNotifications, mergeNotifications, type NotifInput } from '@/domain/notifications';
import { safeLink } from './security';

/** Syncs current reminders into the notifications table; returns the ones that are new. */
export async function syncNotifications(input: Omit<NotifInput, 'lastBackup' | 'firstUse'>) {
  const [lastBackup, accounts] = await Promise.all([db.meta.get('lastManualBackup'), db.accounts.orderBy('updatedAt').first()]);
  const firstUse = (await db.accounts.toArray()).reduce<string | null>((m, a) => (!m || a.createdAt < m ? a.createdAt.slice(0, 10) : m), null) ?? accounts?.createdAt.slice(0, 10) ?? null;
  const current = computeNotifications({ ...input, lastBackup: (lastBackup?.value as string) ?? null, firstUse });
  return db.transaction('rw', db.notifications, async () => {
    const { put, newOnes } = mergeNotifications(await db.notifications.toArray(), current, new Date().toISOString());
    if (put.length) await db.notifications.bulkPut(put);
    return newOnes;
  });
}

/** System notifications – only while the app is open; no background push (would need a push server). */
export function showSystem(title: string, body: string, link: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/icon.svg', tag: title });
    n.onclick = () => { window.focus(); window.history.pushState({}, '', safeLink(link)); window.dispatchEvent(new PopStateEvent('popstate')); n.close(); };
  } catch { /* some mobile browsers only allow notifications from a service worker */ }
}
