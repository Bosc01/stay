-- Run in Supabase SQL editor

alter table public.triage_sessions
  add column if not exists week2_send_at timestamptz,
  add column if not exists week3_send_at timestamptz,
  add column if not exists week4_send_at timestamptz;

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  week_number integer not null,
  score integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists weekly_checkins_session_week_idx
  on public.weekly_checkins (session_id, week_number, created_at desc);
