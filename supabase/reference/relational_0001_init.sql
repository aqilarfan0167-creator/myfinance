-- MyFinance – Supabase schema v1 (mirrors IndexedDB schema v1).
-- Money is stored as BIGINT cents. Every table is isolated per user via RLS.
-- Apply with: supabase db push   (or paste into the SQL editor)
-- Migrations must be additive/non-destructive. Never drop columns holding user data.

create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('bank','cash','ewallet','savings','investment','credit_card')),
  opening_balance bigint not null default 0,
  opening_date date not null,
  icon text not null default 'Landmark',
  color text not null default '#0f766e',
  status text not null default 'active' check (status in ('active','archived')),
  low_balance_threshold bigint,
  include_in_available boolean not null default true,
  include_in_net_worth boolean not null default true,
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  statement_day smallint check (statement_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.categories (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, name_ms text, kind text not null check (kind in ('income','expense')),
  color text not null, icon text not null, need_want text check (need_want in ('need','want')),
  system boolean not null default false, archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, time text not null default '00:00',
  name text not null check (char_length(name) <= 200), merchant text not null default '',
  type text not null check (type in ('income','expense','transfer','debt_repayment','refund','adjustment')),
  category_id text,
  amount bigint not null, fee bigint not null default 0 check (fee >= 0),
  account_id text references public.accounts(id),
  to_account_id text references public.accounts(id),
  payment_method text, need_want text check (need_want in ('need','want')),
  remarks text not null default '' check (char_length(remarks) <= 2000),
  status text not null default 'actual' check (status in ('actual','expected')),
  attachment_ids text[] not null default '{}',
  related jsonb not null default '[]',
  recurring_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (type = 'adjustment' or amount > 0),
  check (type <> 'transfer' or (to_account_id is not null and to_account_id <> account_id))
);
create index if not exists transactions_user_date on public.transactions(user_id, date);
create index if not exists transactions_user_updated on public.transactions(user_id, updated_at);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}', updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(), entity text not null, entity_id text not null, action text not null,
  before jsonb, after jsonb
);

create table if not exists public.schema_meta (key text primary key, value jsonb);
insert into public.schema_meta values ('schema_version', '1') on conflict do nothing;

-- Row Level Security: each user sees only their own rows.
do $$ declare t text; begin
  foreach t in array array['accounts','categories','transactions','settings','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
alter table public.schema_meta enable row level security;
drop policy if exists read_meta on public.schema_meta;
create policy read_meta on public.schema_meta for select using (true);

-- Private storage for receipts, payslips and backups: files live under <user_id>/...
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict do nothing;
drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects for all
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
