-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Transactions table
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  offer_title text not null,
  cost numeric not null default 0,
  buyer_name text not null,
  buyer_email text not null,
  currency text not null default 'USD',
  source text not null check (source in ('Kajabi', 'GoHighLevel')),
  created_at timestamptz not null default now()
);

-- Setter reports table
create table if not exists public.setter_reports (
  id uuid primary key default uuid_generate_v4(),
  setter_name text not null,
  date date not null,
  total_convos int not null default 0,
  follow_ups int not null default 0,
  outbound int not null default 0,
  inbound int not null default 0,
  call_proposed int not null default 0,
  qualified_calls int not null default 0,
  disqualified int not null default 0,
  hours_worked numeric not null default 0,
  performance_score numeric not null default 0,
  highs text,
  lows text,
  notes text,
  created_at timestamptz not null default now()
);

-- Closer reports table
create table if not exists public.closer_reports (
  id uuid primary key default uuid_generate_v4(),
  closer_name text not null,
  date date not null,
  total_meetings int not null default 0,
  showed_meetings int not null default 0,
  cancelled_meetings int not null default 0,
  no_show_meetings int not null default 0,
  rescheduled_meetings int not null default 0,
  offers_proposed int not null default 0,
  won_deals int not null default 0,
  lost_deals int not null default 0,
  cash_collected numeric not null default 0,
  recurrent_pipeline numeric not null default 0,
  feedback text,
  created_at timestamptz not null default now()
);

-- SPC members table
create table if not exists public.spc_members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  plan text not null check (plan in ('monthly', 'annual')),
  amount numeric not null default 0,
  status text not null check (status in ('active', 'trial')),
  provider text not null check (provider in ('Kajabi', 'Stripe', 'PayPal')),
  joined_at date not null,
  next_payment_date date not null,
  trial_end_date date,
  trial_days int,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.transactions enable row level security;
alter table public.setter_reports enable row level security;
alter table public.closer_reports enable row level security;
alter table public.spc_members enable row level security;

-- RLS Policies: only authenticated users can access data
create policy "Authenticated users can read transactions"
  on public.transactions for select
  to authenticated
  using (true);

create policy "Authenticated users can insert transactions"
  on public.transactions for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update transactions"
  on public.transactions for update
  to authenticated
  using (true);

create policy "Authenticated users can delete transactions"
  on public.transactions for delete
  to authenticated
  using (true);

create policy "Authenticated users can read setter_reports"
  on public.setter_reports for select
  to authenticated
  using (true);

create policy "Authenticated users can insert setter_reports"
  on public.setter_reports for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update setter_reports"
  on public.setter_reports for update
  to authenticated
  using (true);

create policy "Authenticated users can delete setter_reports"
  on public.setter_reports for delete
  to authenticated
  using (true);

create policy "Authenticated users can read closer_reports"
  on public.closer_reports for select
  to authenticated
  using (true);

create policy "Authenticated users can insert closer_reports"
  on public.closer_reports for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update closer_reports"
  on public.closer_reports for update
  to authenticated
  using (true);

create policy "Authenticated users can delete closer_reports"
  on public.closer_reports for delete
  to authenticated
  using (true);

create policy "Authenticated users can read spc_members"
  on public.spc_members for select
  to authenticated
  using (true);

create policy "Authenticated users can insert spc_members"
  on public.spc_members for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update spc_members"
  on public.spc_members for update
  to authenticated
  using (true);

create policy "Authenticated users can delete spc_members"
  on public.spc_members for delete
  to authenticated
  using (true);
