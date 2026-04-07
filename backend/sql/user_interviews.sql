-- Run in Supabase SQL editor

create table if not exists public.user_interviews (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  q1 text,
  q2 text,
  q3 text,
  created_at timestamptz not null default now()
);

create index if not exists user_interviews_created_at_idx
  on public.user_interviews (created_at desc);
