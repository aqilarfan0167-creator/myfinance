/** Sequential OCR queue that keeps running while the user moves between pages. */
import { processReceipt } from '@/db/receiptRepo';

type State = Record<string, { stage: string; pct: number }>;
let queue: string[] = []; let running = false; let state: State = {};
const subs = new Set<(s: State) => void>();
const emit = () => subs.forEach((f) => f({ ...state }));

export function enqueue(ids: string[]) {
  for (const id of ids) if (!queue.includes(id) && !state[id]) { queue.push(id); state[id] = { stage: 'queued', pct: 0 }; }
  emit(); void run();
}
async function run() {
  if (running) return; running = true;
  while (queue.length) {
    const id = queue.shift()!;
    state[id] = { stage: 'starting', pct: 0 }; emit();
    await processReceipt(id, (p) => { state[id] = p; emit(); }).catch(() => {});
    delete state[id]; emit();
  }
  running = false;
}
export function subscribe(f: (s: State) => void) { subs.add(f); f({ ...state }); return () => { subs.delete(f); }; }
export const isQueued = (id: string) => !!state[id];
