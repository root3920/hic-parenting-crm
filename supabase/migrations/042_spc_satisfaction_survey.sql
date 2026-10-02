create table if not exists public.spc_satisfaction_responses (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  name text,
  membership_status text,
  survey_date timestamptz not null default now(),

  -- Raw responses
  csat int not null check (csat between 1 and 5),
  value_score int not null check (value_score between 1 and 5),
  engagement text not null,
  engagement_score int not null check (engagement_score between 1 and 5),
  top_value text,
  outcome text[] default '{}',
  barrier text,
  support_score int not null check (support_score between 1 and 5),
  feedback text,
  nps int not null check (nps between 0 and 10),
  testimonial_opportunity text,
  recovery_permission text,
  next_support text,

  -- Computed server-side
  health_score numeric not null,
  health_color text not null check (health_color in ('green','yellow','red')),
  is_advocate boolean not null default false,
  is_coaching_opportunity boolean not null default false,

  -- CSM follow-up
  csm_followup_required boolean not null default false,
  followup_status text default 'pending' check (followup_status in ('pending','in_progress','recovered','monitoring','cancellation_risk','cancelled','not_needed')),
  followup_date date,
  followup_notes text,
  final_outcome text,

  created_at timestamptz not null default now()
);

create index idx_ssr_email on public.spc_satisfaction_responses(lower(email));
create index idx_ssr_health_color on public.spc_satisfaction_responses(health_color);
create index idx_ssr_survey_date on public.spc_satisfaction_responses(survey_date desc);

alter table public.spc_satisfaction_responses enable row level security;

create policy "Authenticated users can read satisfaction responses"
  on public.spc_satisfaction_responses for select
  to authenticated using (true);
