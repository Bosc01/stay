-- Run in Supabase SQL editor (or via migration) before using new API fields.
alter table public.triage_sessions
  add column if not exists follow_up_7_day_at timestamptz,
  add column if not exists week1_improvement_score integer;

comment on column public.triage_sessions.follow_up_7_day_at is 'Target time for 7-day improvement check-in';
comment on column public.triage_sessions.week1_improvement_score is '1–5 score from POST /checkin';
