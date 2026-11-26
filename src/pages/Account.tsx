import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, LogOut, ShieldCheck, AlertTriangle, KeyRound } from 'lucide-react';
import { useCloud } from '@/hooks/useCloud';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { Tabs } from '@/components/Tabs';
import { bindDevice, clearUserConfig, saveUserConfig, sendPasswordReset, setAuto, setNewPassword, signIn, signOut, signUp, switchAccountOnDevice, syncNow } from '@/lib/cloud';
import { buildZip, logBackup } from '@/db/zipBackup';
import { downloadBlob } from '@/lib/files';
import { fmtDateTime } from '@/lib/date';

async function downloadFullBackup() {
  const { bytes, manifest, fileName } = await buildZip();
  downloadBlob(new Blob([bytes as unknown as ArrayBuffer], { type: 'application/zip' }), fileName);
  await logBackup({ at: new Date().toISOString(), kind: 'zip', fileName, size: bytes.byteLength, records: Object.entries(manifest.counts).filter(([k]) => k !== 'files').reduce((a, [, v]) => a + v, 0), files: manifest.counts.files });
}

export default function AccountPage() {
  const c = useCloud(); const { toast, confirm } = useUI();
  const [tab, setTab] = useState<'signin' | 'register' | 'reset'>('signin');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [url, setUrl] = useState(''); const [key, setKey] = useState('');
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setErr(''); setMsg(''); try { await f(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  return (
    <>
      <PageHeader title="Account & Cloud Sync" subtitle="Optional. MyFinance works fully on this device without an account." />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {!c.config ? (
          <Card title={<span className="flex items-center gap-2"><CloudOff className="h-4 w-4" />Cloud sync is not set up</span>}>
            <p className="text-sm text-slate-600 dark:text-slate-400">To sync between your laptop and phone, create a free Supabase project, run <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">supabase/migrations/20261126000000_sync.sql</code>, then enter its URL and <b>anon (public)</b> key. Never use the service-role or secret key.</p>
            <div className="mt-3 grid gap-3">
              <Field label="Project URL"><Input placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
              <Field label="Anon / publishable key"><Input value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" /></Field>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button disabled={busy || !url || !key} onClick={() => run(() => saveUserConfig(url, key))}>Save & connect</Button>
              <p className="text-xs text-slate-500">Alternatively set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY when building (see README).</p>
            </div>
          </Card>
        ) : c.recovery ? (
          <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Choose a new password</span>}>
            <div className="grid gap-3"><Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button disabled={busy} onClick={() => run(async () => { if (pw !== pw2) throw new Error('Passwords do not match.'); await setNewPassword(pw); toast('Password updated'); })}>Update password</Button></div>
          </Card>
        ) : !c.session ? (
          <Card>
            <Tabs value={tab} onChange={(v) => { setTab(v); setErr(''); setMsg(''); }} items={[{ v: 'signin', label: 'Sign in' }, { v: 'register', label: 'Create account' }, { v: 'reset', label: 'Forgot password' }]} />
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault();
              run(async () => {
                if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
                if (tab === 'signin') { await signIn(email, pw); toast('Signed in'); }
                else if (tab === 'register') { if (pw !== pw2) throw new Error('Passwords do not match.'); const r = await signUp(email, pw); setMsg(r.needsConfirmation ? 'Check your email to confirm your account, then sign in.' : 'Account created.'); }
                else { await sendPasswordReset(email); setMsg('If an account exists for this email, a reset link has been sent.'); }
              }); }}>
              <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              {tab !== 'reset' && <Field label="Password" hint={tab === 'register' ? 'At least 8 characters' : undefined}><Input type="password" autoComplete={tab === 'register' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
              {tab === 'register' && <Field label="Repeat password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>}
              {err && <p className="text-sm text-red-600">{err}</p>}{msg && <p className="text-sm text-income">{msg}</p>}
              <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : tab === 'signin' ? 'Sign in' : tab === 'register' ? 'Create account' : 'Send reset link'}</Button>
            </form>
            <p className="mt-3 text-xs text-slate-500">Connected to {new URL(c.config.url).host}{c.config.source === 'user' && <> · <button className="underline" onClick={() => clearUserConfig()}>disconnect</button></>}</p>
          </Card>
        ) : (
          <Card title={<span className="flex items-center gap-2"><Cloud className="h-4 w-4 text-transfer" />Signed in</span>} action={<Badge tone={c.status === 'error' ? 'red' : c.status === 'syncing' ? 'blue' : 'green'}>{c.status === 'syncing' ? 'Syncing…' : c.status === 'error' ? 'Problem' : 'Up to date'}</Badge>}>
            <p className="text-sm"><b>{c.session.user.email}</b></p>
            {c.needsBinding === 'first' && <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
              <p className="font-medium">This device already has data. How should it sync?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => run(async () => { await bindDevice('merge'); toast('Device data merged with your account'); })}>Upload & merge with my account</Button>
                <Button variant="secondary" onClick={() => run(async () => { if (!(await confirm({ title: 'Replace this device’s data?', message: 'A full backup (ZIP) of this device is downloaded first. Then local records are replaced by your cloud data.', danger: true, confirmText: 'Back up & replace' }))) return; await downloadFullBackup(); await bindDevice('cloud'); toast('Device now uses your cloud data'); })}>Use cloud data only</Button>
              </div></div>}
            {c.needsBinding === 'other-user' && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <p className="flex gap-1 font-medium"><AlertTriangle className="h-4 w-4" />This device holds data of a different account.</p>
              <p className="mt-1">To keep accounts separate, sync is paused. You can sign out, or back up this device and switch it to the new account.</p>
              <div className="mt-2 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => signOut()}>Sign out</Button>
                <Button variant="danger" onClick={() => run(async () => { if (!(await confirm({ title: 'Switch this device to the new account?', message: 'A full backup (ZIP) is downloaded first, then the other account’s data is removed from this device.', danger: true, confirmText: 'Back up & switch' }))) return; await downloadFullBackup(); await switchAccountOnDevice(); toast('Device switched'); })}>Back up & switch</Button></div></div>}
            {!c.needsBinding && <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={c.status === 'syncing'} onClick={() => run(async () => { const r = await syncNow(); if (r) toast(`Synced · ${r.pulled} down, ${r.pushed} up`); })}><RefreshCw className={`h-4 w-4 ${c.status === 'syncing' ? 'animate-spin' : ''}`} />Sync now</Button>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.auto} onChange={(e) => setAuto(e.target.checked)} />Sync automatically</label>
              </div>
              {c.error && <p className="mt-2 text-sm text-red-600">{c.error}</p>}
              {c.last && <p className="mt-2 text-xs text-slate-500">Last sync {fmtDateTime(c.last.at)} · {c.last.pulled} received · {c.last.pushed} sent · {c.last.deletedLocal + c.last.deletedRemote} deletions · {c.last.filesUp + c.last.filesDown} files{c.last.conflicts ? ` · ${c.last.conflicts} conflict(s) resolved (newest change kept)` : ''}</p>}
            </>}
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"><Button variant="ghost" onClick={async () => { await signOut(); toast('Signed out – your data stays on this device'); }}><LogOut className="h-4 w-4" />Sign out</Button></div>
          </Card>
        )}
        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-income" />How your data is protected</span>}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Without an account, everything stays in this browser only.</li>
            <li>With sync, records and files go to <b>your own</b> Supabase project. Row Level Security lets each account read and write only its own data; files are in a private bucket.</li>
            <li>Only the public anon key is used in the app. MyFinance never asks for online-banking credentials.</li>
            <li>Conflicts: the most recent change wins; deletions sync to other devices. A device bound to one account never mixes in another account’s data.</li>
            <li>Sync runs when the app is open (on start, every 5 minutes, after changes). Offline changes sync when you are back online.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
export { downloadFullBackup };
