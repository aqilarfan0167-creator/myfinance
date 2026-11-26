-- MyFinance – schema v2 (Phase 2): salary, OT, commitments, occurrences, recurring rules. Additive only.

create table if not exists public.salary_records (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'), company text not null default '',
  basic bigint not null default 0, allowances jsonb not null default '[]', bonus bigint not null default 0, claims bigint not null default 0, incentives bigint not null default 0,
  ot_auto boolean not null default true, ot bigint not null default 0,
  epf bigint not null default 0, socso bigint not null default 0, eis bigint not null default 0, pcb bigint not null default 0, unpaid_leave bigint not null default 0,
  other_deductions jsonb not null default '[]', gross bigint not null, total_deductions bigint not null, expected_net bigint not null, actual_net bigint,
  expected_pay_date date not null, payment_date date, account_id text references public.accounts(id),
  status text not null check (status in ('expected','received')), income_txn_id text, remarks text not null default '', attachment_ids text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index if not exists salary_unique_month on public.salary_records(user_id, month, lower(company)) where deleted_at is null;

create table if not exists public.ot_entries (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, start_time text not null, end_time text not null, break_minutes int not null default 0 check (break_minutes >= 0),
  day_type text not null check (day_type in ('normal','rest','public_holiday')), multiplier numeric(5,2) not null, hourly_rate bigint not null,
  hours numeric(6,2) not null, amount bigint not null, reason text not null default '',
  approval text not null check (approval in ('pending','approved','rejected')), payment text not null check (payment in ('unpaid','paid')), salary_month text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.commitments (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, kind text not null check (kind in ('expense','debt')), category_id text, amount bigint not null check (amount > 0),
  start_date date not null, end_date date, frequency text not null, account_id text references public.accounts(id), to_account_id text references public.accounts(id),
  track_from date not null, active boolean not null default true, remarks text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- Deterministic id "<commitment_id>:<due_date>" makes generation idempotent.
create table if not exists public.commitment_occurrences (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  commitment_id text not null references public.commitments(id), due_date date not null, amount bigint not null,
  amount_overridden boolean not null default false, skipped boolean not null default false, updated_at timestamptz not null default now(),
  unique (commitment_id, due_date)
);

create table if not exists public.recurring_rules (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, template jsonb not null, frequency text not null, start_date date not null, end_date date, track_from date not null,
  auto_post boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['salary_records','ot_entries','commitments','commitment_occurrences','recurring_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
update public.schema_meta set value = '2' where key = 'schema_version';
