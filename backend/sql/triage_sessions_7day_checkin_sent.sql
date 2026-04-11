-- Run in Supabase SQL editor if not already applied.
alter table public.triage_sessions
  add column if not exists follow_up_sent boolean not null default false;

comment on column public.triage_sessions.follow_up_sent is 'True after 7-day check-in email was sent';
