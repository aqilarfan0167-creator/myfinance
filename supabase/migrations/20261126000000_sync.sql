-- MyFinance cloud sync schema. Apply with `supabase db push` or paste into the Supabase SQL editor.
-- Security: every row belongs to auth.uid(); Row Level Security enforces isolation; clients use the anon key only.
-- Non-destructive: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

create sequence if not exists public.sync_seq;

create table if not exists public.sync_records (
  user_id        uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  table_name     text        not null check (table_name in ('accounts','transactions','categories','settings','salaries','otEntries','commitments','occurrences','recurring','budgets','goals','goalEntries','tasks','attachments','receipts')),
  record_id      text        not null check (char_length(record_id) between 1 and 200),
  data           jsonb,
  updated_at     timestamptz not null,
  deleted        boolean     not null default false,
  schema_version int         not null default 1 check (schema_version between 1 and 1000),
  seq            bigint      not null default nextval('public.sync_seq'),   -- monotonic pull cursor (immune to device clock skew)
  server_updated_at timestamptz not null default now(),
  primary key (user_id, table_name, record_id),
  check (deleted or data is not null),
  check (data is null or pg_column_size(data) < 2000000)
);
create index if not exists sync_records_user_seq on public.sync_records (user_id, seq);

alter table public.sync_records enable row level security;
drop policy if exists "own rows: select" on public.sync_records;
drop policy if exists "own rows: insert" on public.sync_records;
drop policy if exists "own rows: update" on public.sync_records;
create policy "own rows: select" on public.sync_records for select to authenticated using (user_id = auth.uid());
create policy "own rows: insert" on public.sync_records for insert to authenticated with check (user_id = auth.uid());
create policy "own rows: update" on public.sync_records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No delete policy: deletions are tombstones (deleted = true) so other devices learn about them.

-- Upsert with last-writer-wins: a row is only replaced by a NEWER one. Timestamps more than 1 day in the future are rejected.
create or replace function public.sync_push(p_rows jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'p_rows must be an array of at most 500 rows'; end if;
  insert into public.sync_records (user_id, table_name, record_id, data, updated_at, deleted, schema_version)
  select auth.uid(), r->>'table_name', r->>'record_id',
         case when coalesce((r->>'deleted')::boolean, false) then null else r->'data' end,
         (r->>'updated_at')::timestamptz, coalesce((r->>'deleted')::boolean, false), coalesce((r->>'schema_version')::int, 1)
  from jsonb_array_elements(p_rows) r
  where (r->>'updated_at')::timestamptz < now() + interval '1 day'
  on conflict (user_id, table_name, record_id) do update
     set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, schema_version = excluded.schema_version,
         seq = nextval('public.sync_seq'), server_updated_at = now()
   where public.sync_records.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
grant usage on sequence public.sync_seq to authenticated;
grant select, insert, update on public.sync_records to authenticated;

-- Private storage for receipts, PDFs and payslips: <user_id>/<attachment_id>/<original|processed|thumb>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 20971520, array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects for all to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
