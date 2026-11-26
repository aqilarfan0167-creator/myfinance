import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushRow, Remote, RemoteRow } from './engine';

const BUCKET = 'attachments';
/** Supabase transport: table public.sync_records (RLS) + RPC public.sync_push (server-side last-writer-wins) + private Storage bucket. */
export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  return {
    userId,
    async pull(after, limit) {
      const { data, error } = await sb.from('sync_records').select('table_name, record_id, data, updated_at, deleted, seq, schema_version').gt('seq', after).order('seq').limit(limit);
      if (error) throw new Error(`Sync download failed: ${error.message}`);
      return (data ?? []).map((r): RemoteRow => ({ table: r.table_name, id: r.record_id, data: r.data, updatedAt: new Date(r.updated_at).toISOString(), deleted: r.deleted, seq: Number(r.seq), schema: r.schema_version }));
    },
    async push(rows: PushRow[]) {
      const { error } = await sb.rpc('sync_push', { p_rows: rows.map((r) => ({ table_name: r.table, record_id: r.id, data: r.data, updated_at: r.updatedAt, deleted: r.deleted, schema_version: r.schema })) });
      if (error) throw new Error(`Sync upload failed: ${error.message}`);
    },
    async putFile(path, blob) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
      if (error) throw new Error(`File upload failed: ${error.message}`);
    },
    async getFile(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) { if (/not found|404|Object not found/i.test(error.message)) return null; throw new Error(`File download failed: ${error.message}`); }
      return data;
    },
    async removeFiles(paths) { if (paths.length) await sb.storage.from(BUCKET).remove(paths); },
  };
}
