/**
 * Optional cloud account & sync (Supabase). The app is fully usable without it.
 * Only the PUBLIC anon key is ever used in the browser; data isolation is enforced by Row Level Security.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { db } from '@/db/db';
import { resetSyncState, syncOnce, type SyncResult } from './sync/engine';
import { supabaseRemote } from './sync/supabaseRemote';
import { TABLES } from '@/db/backup';

export interface CloudConfig { url: string; anonKey: string; source: 'env' | 'user' }
export interface CloudState { config: CloudConfig | null; session: Session | null; status: 'off' | 'idle' | 'syncing' | 'error'; last: SyncResult | null; error: string | null; recovery: boolean; needsBinding: 'first' | 'other-user' | null; auto: boolean }
let state: CloudState = { config: null, session: null, status: 'off', last: null, error: null, recovery: false, needsBinding: null, auto: true };
const subs = new Set<(s: CloudState) => void>();
const set = (p: Partial<CloudState>) => { state = { ...state, ...p }; subs.forEach((f) => f(state)); };
export const subscribeCloud = (f: (s: CloudState) => void) => { subs.add(f); f(state); return () => { subs.delete(f); }; };
let client: SupabaseClient | null = null;

export function validateConfig(url: string, key: string): string | null {
  if (!/^https:\/\/[a-z0-9-.]+(:\d+)?\/?$/i.test(url.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url.trim())) return 'Project URL must look like https://xxxx.supabase.co';
  if (!/^[A-Za-z0-9_\-.]{30,}$/.test(key.trim())) return 'Anon key looks invalid.';
  try { const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (payload.role === 'service_role') return 'That is the SERVICE ROLE key – never use it in an app. Use the anon / publishable key.'; } catch { /* non-JWT publishable keys are fine */ }
  if (/^sb_secret_/.test(key.trim())) return 'That is a SECRET key – use the publishable / anon key.';
  return null;
}
export async function loadConfig(): Promise<CloudConfig | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key && !validateConfig(url, key)) return { url, anonKey: key, source: 'env' };
  const saved = (await db.meta.get('cloudConfig'))?.value as { url: string; anonKey: string } | undefined;
  return saved && !validateConfig(saved.url, saved.anonKey) ? { ...saved, source: 'user' } : null;
}
export async function saveUserConfig(url: string, anonKey: string) { const e = validateConfig(url, anonKey); if (e) throw new Error(e); await db.meta.put({ key: 'cloudConfig', value: { url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() } }); location.reload(); }
export async function clearUserConfig() { await signOut().catch(() => {}); await db.meta.delete('cloudConfig'); location.reload(); }

export async function initCloud() {
  const config = await loadConfig(); const auto = ((await db.meta.get('sync:auto'))?.value as boolean | undefined) ?? true;
  const last = ((await db.meta.get('sync:last'))?.value as SyncResult | undefined) ?? null;
  set({ config, auto, last, status: config ? 'idle' : 'off' }); if (!config) return;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'myfinance-auth' } });
  client.auth.onAuthStateChange((event, session) => {
    set({ session, recovery: event === 'PASSWORD_RECOVERY' ? true : state.recovery });
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void checkBinding().then(() => { if (state.auto && !state.needsBinding && session) void syncNow(); });
  });
  // Auto sync: on focus, every 5 minutes, and 15 s after local changes.
  let t: ReturnType<typeof setTimeout> | undefined;
  Dexie.on('storagemutated', () => { if (!state.auto || !state.session || state.status === 'syncing') return; clearTimeout(t); t = setTimeout(() => void syncNow(), 15000); });
  setInterval(() => state.auto && state.session && void syncNow(), 5 * 60000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && state.auto && state.session && void syncNow());
}

const requireClient = () => { if (!client) throw new Error('Cloud sync is not configured.'); return client; };
export async function signIn(email: string, password: string) { const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password }); if (error) throw new Error(friendly(error.message)); }
export async function signUp(email: string, password: string) {
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}/account` } });
  if (error) throw new Error(friendly(error.message));
  return { needsConfirmation: !data.session };
}
export async function sendPasswordReset(email: string) { const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/account` }); if (error) throw new Error(friendly(error.message)); }
export async function setNewPassword(password: string) { if (password.length < 8) throw new Error('Use at least 8 characters.'); const { error } = await requireClient().auth.updateUser({ password }); if (error) throw new Error(friendly(error.message)); set({ recovery: false }); }
export async function signOut() { if (client) await client.auth.signOut(); set({ session: null, needsBinding: null }); }
export async function setAuto(v: boolean) { await db.meta.put({ key: 'sync:auto', value: v }); set({ auto: v }); }
const friendly = (m: string) => (/failed to fetch|networkerror|load failed/i.test(m) ? 'Could not reach the sync server. Check your internet connection and the project URL.' : /invalid login/i.test(m) ? 'Wrong email or password.' : /email not confirmed/i.test(m) ? 'Please confirm your email first (check your inbox).' : /rate limit/i.test(m) ? 'Too many attempts – please wait a minute.' : m);

/** One device = one account. Detects first sign-in on a device that already has data, or a different account. */
async function checkBinding() {
  const uid = state.session?.user.id; if (!uid) return;
  const bound = (await db.meta.get('sync:userId'))?.value as string | undefined;
  if (bound === uid) return set({ needsBinding: null });
  if (bound && bound !== uid) return set({ needsBinding: 'other-user' });
  const hasData = (await db.transactions.count()) + (await db.accounts.count()) > 0;
  if (!hasData) { await db.meta.put({ key: 'sync:userId', value: uid }); return set({ needsBinding: null }); }
  set({ needsBinding: 'first' });
}
/** 'merge': upload this device's data and combine it with the cloud. 'cloud': replace this device's data with the cloud copy (back up first!). */
export async function bindDevice(mode: 'merge' | 'cloud') {
  const uid = state.session?.user.id; if (!uid) throw new Error('Not signed in');
  if (mode === 'cloud') await wipeLocalData();
  await db.meta.put({ key: 'sync:userId', value: uid }); set({ needsBinding: null });
  await syncNow();
}
/** Removes all records & files on this device (used when switching accounts – caller must offer a backup first). */
export async function wipeLocalData() {
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.files, db.syncState, db.notifications, db.meta], async () => {
    for (const t of TABLES) if (t !== 'settings' && t !== 'categories') await db.table(t).clear();
    await db.files.clear(); await db.notifications.clear();
    for (const k of ['sync:userId', 'sync:cursor', 'demoIds']) await db.meta.delete(k);
  });
  await resetSyncState(db);
}
export async function switchAccountOnDevice() { await wipeLocalData(); await checkBinding(); if (!state.needsBinding) await syncNow(); }

export async function syncNow(): Promise<SyncResult | null> {
  if (!client || !state.session || state.needsBinding) return null;
  if (!navigator.onLine) { set({ status: 'error', error: 'You are offline – changes are saved on this device and will sync later.' }); return null; }
  set({ status: 'syncing', error: null });
  try { const r = await syncOnce(db, supabaseRemote(client, state.session.user.id)); set({ status: 'idle', last: r }); return r; }
  catch (e) { set({ status: 'error', error: (e as Error).message }); return null; }
}
export const getCloudState = () => state;
