import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from './ui';

/** Shows "new version available"; updating reloads the app shell only – your data in IndexedDB is untouched. */
export function UpdatePrompt() {
  const [need, setNeed] = useState(false); const [ready, setReady] = useState(false); const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    const u = registerSW({ onNeedRefresh: () => setNeed(true), onOfflineReady: () => { setReady(true); setTimeout(() => setReady(false), 6000); },
      onRegisteredSW: (_url, reg) => reg && setInterval(() => reg.update().catch(() => {}), 60 * 60000) });
    setUpdate(() => u);
  }, []);
  if (!need && !ready) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-24 z-[70] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl lg:bottom-6">
      {need ? <><span>A new version of MyFinance is available. Your data is kept.</span><Button onClick={() => update?.(true)}>Update</Button><button className="text-slate-300" onClick={() => setNeed(false)}>Later</button></>
        : <span>MyFinance is ready to work offline.</span>}
    </div>
  );
}
