-- MyFinance – schema v3 (Phase 3): loans as accounts, budgets, savings goals, tasks. Additive only.

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check check (type in ('bank','cash','ewallet','savings','investment','credit_card','loan'));
alter table public.accounts add column if not exists loan jsonb; -- {lender, loanType, originalAmount, annualRate, rateType, instalment, targetDate}

-- Deterministic id "<YYYY-MM>:<category_id>" – one budget per category per month.
create table if not exists public.budgets (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'), category_id text not null, amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, month, category_id)
);

create table if not exists public.goals (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, type text not null, target bigint not null check (target > 0), target_date date,
  starting_amount bigint not null default 0 check (starting_amount >= 0), monthly_contribution bigint not null default 0 check (monthly_contribution >= 0),
  linked_account_id text references public.accounts(id), priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'active' check (status in ('active','completed','archived')), color text not null default '#9333ea',
  reserve_monthly boolean not null default true, remarks text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.goal_entries (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id text not null references public.goals(id), date date not null, amount bigint not null check (amount <> 0),
  txn_id text references public.transactions(id), note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.tasks (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, category text not null default '', due_date date, priority text not null check (priority in ('low','medium','high')),
  recurrence text not null default 'none' check (recurrence in ('none','weekly','monthly','quarterly','yearly')),
  status text not null default 'pending' check (status in ('pending','done','cancelled')), series_id text not null, completed_at timestamptz, remarks text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['budgets','goals','goal_entries','tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
update public.schema_meta set value = '3' where key = 'schema_version';
