-- MyFinance – schema v4 (Phase 4): attachments & receipts. Additive only.
-- File bytes go to the private "attachments" Storage bucket at <user_id>/<attachment_id>/<file_name> (bucket + RLS created in 0001).

create table if not exists public.attachments (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('receipt','payslip','other')),
  file_name text not null, mime_type text not null check (mime_type ~ '^(image/(jpeg|png|webp|heic|heif)|application/pdf)$'),
  size bigint not null check (size > 0 and size <= 20971520), hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  storage_path text, width int, height int, pages int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists attachments_user_hash on public.attachments(user_id, hash);

create table if not exists public.receipts (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  attachment_id text not null references public.attachments(id),
  status text not null check (status in ('processing','review','draft','recorded','duplicate','failed')),
  ocr_text text not null default '', ocr_confidence int, ocr_engine text not null default '', text_source text,
  data jsonb, form jsonb, txn_ids text[] not null default '{}', duplicate_of text[] not null default '{}', error text,
  merchant text not null default '', date date, total bigint, receipt_no text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists receipts_user_lookup on public.receipts(user_id, receipt_no, date, total);

do $$ declare t text; begin
  foreach t in array array['attachments','receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
update public.schema_meta set value = '4' where key = 'schema_version';
