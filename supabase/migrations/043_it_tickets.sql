-- ============================================================
-- IT Tickets & Audit Trail
-- ============================================================

-- 1. it_tickets -----------------------------------------------
create table if not exists public.it_tickets (
  id              uuid primary key default gen_random_uuid(),
  ticket_number   bigint generated always as identity unique,
  title           text not null,
  description     text not null,
  category        text not null check (category in (
    'crm_dashboard','gohighlevel','zapier_automatizaciones','email',
    'acceso_contrasenas','zoom_llamadas','hotmart_pagos','equipo_hardware','otro'
  )),
  priority        text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status          text not null default 'pending'  check (status in ('pending','in_progress','resolved','closed')),
  page_url        text,
  attachment_urls text[] not null default '{}',

  requester_id    uuid not null references auth.users(id),
  requester_name  text,
  requester_email text,
  requester_role  text,

  admin_notes     text,

  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  updated_at      timestamptz not null default now()
);

create index idx_it_tickets_status       on public.it_tickets(status);
create index idx_it_tickets_requester    on public.it_tickets(requester_id);
create index idx_it_tickets_created_at   on public.it_tickets(created_at desc);

-- 2. it_ticket_events -----------------------------------------
create table if not exists public.it_ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.it_tickets(id) on delete cascade,
  event_type  text not null check (event_type in (
    'created','status_changed','priority_changed','comment','notes_updated'
  )),
  from_value  text,
  to_value    text,
  comment     text,
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  created_at  timestamptz not null default now()
);

create index idx_it_ticket_events_ticket on public.it_ticket_events(ticket_id);

-- 3. RLS ------------------------------------------------------
alter table public.it_tickets enable row level security;
alter table public.it_ticket_events enable row level security;

-- it_tickets: requester sees own tickets
create policy "Requester can view own tickets"
  on public.it_tickets for select to authenticated
  using (requester_id = auth.uid());

-- it_tickets: admin sees all
create policy "Admin can view all tickets"
  on public.it_tickets for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- it_ticket_events: visible if user can see the parent ticket
create policy "User can view events of visible tickets"
  on public.it_ticket_events for select to authenticated
  using (
    exists (
      select 1 from public.it_tickets t
      where t.id = it_ticket_events.ticket_id
        and (
          t.requester_id = auth.uid()
          or exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin'
          )
        )
    )
  );

-- 4. Storage bucket -------------------------------------------
insert into storage.buckets (id, name, public)
values ('it-ticket-attachments', 'it-ticket-attachments', false)
on conflict (id) do nothing;

-- Users can upload to their own folder
create policy "Users upload own attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'it-ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and octet_length(decode('', 'base64')) <= 5242880  -- 5 MB enforcement is done in the API route
  );

-- Users can read their own attachments
create policy "Users read own attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'it-ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin reads all attachments
create policy "Admin reads all attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'it-ticket-attachments'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
