-- ============================================================
-- Public IT Tickets: allow unauthenticated submissions
-- ============================================================

-- 1. Make requester_id nullable (public tickets have no auth user)
alter table public.it_tickets alter column requester_id drop not null;

-- 2. Add source and contact fields
alter table public.it_tickets
  add column if not exists source text not null default 'dashboard',
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

alter table public.it_tickets
  add constraint it_tickets_source_check check (source in ('dashboard','public_form'));

-- 3. Rate limiting table (service role only, no RLS policies)
create table if not exists public.it_ticket_rate_limits (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index idx_it_rate_limits_ip_time
  on public.it_ticket_rate_limits(ip_hash, created_at);

alter table public.it_ticket_rate_limits enable row level security;
-- No policies: only service role can read/write

-- 4. Verify RLS for public tickets
-- The existing "Requester can view own tickets" policy uses
--   requester_id = auth.uid()
-- For public tickets where requester_id IS NULL, this evaluates to
--   NULL = auth.uid() → false. So public tickets are never visible
-- to non-admin authenticated users. Admin sees all via the other policy.
-- No changes needed.
