import type { PushRow, Remote, RemoteRow } from './engine';
/** In-memory server with the same rules as supabase/migrations (LWW guard, monotonic seq, tombstones). Used in tests. */
export class FakeServer {
  rows = new Map<string, RemoteRow>(); files = new Map<string, Blob>(); seq = 0; pushes = 0;
  remote(userId: string): Remote {
    return {
      userId,
      pull: async (after, limit) => [...this.rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => structuredClone(r)),
      push: async (rows: PushRow[]) => { this.pushes++; for (const r of rows) { const k = `${r.table}:${r.id}`; const ex = this.rows.get(k);
        if (!ex || ex.updatedAt < r.updatedAt) this.rows.set(k, { ...structuredClone(r), data: r.deleted ? null : structuredClone(r.data), seq: ++this.seq }); } },
      putFile: async (p, b) => { this.files.set(p, b); },
      getFile: async (p) => this.files.get(p) ?? null,
      removeFiles: async (ps) => { ps.forEach((p) => this.files.delete(p)); },
    };
  }
}
