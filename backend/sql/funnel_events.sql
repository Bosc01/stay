-- Funnel events, at most one row per session per step. Read by /admin/stats
-- for the 30-day funnel on the dashboard. Run in Supabase SQL editor.

create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  event text not null,
  created_at timestamptz not null default now(),
  constraint funnel_events_session_event_key unique (session_id, event),
  constraint funnel_events_event_check check (
    event in ('triage_started', 'triage_completed', 'email_signup', 'return_visit_7d')
  )
);

-- The dashboard reads by date. The unique key above covers the per-session
-- lookup a return visit makes.
create index if not exists funnel_events_created_at_idx
  on public.funnel_events (created_at);

-- Session ids also open an owner's profile page, so this table should stay
-- away from the anon key. Same caveat as outreach_targets.sql: uncomment only
-- if SUPABASE_KEY is the service role key, or every insert will fail.
-- alter table public.funnel_events enable row level security;
