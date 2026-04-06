-- Run in Supabase SQL editor.

alter table public.triage_sessions
  add column if not exists dog_name text,
  add column if not exists photo_url text;

-- Optional: if your table has no created_at yet, uncomment:
-- alter table public.triage_sessions
--   add column if not exists created_at timestamptz default now();

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  triage_session_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists journal_entries_session_created_idx
  on public.journal_entries (triage_session_id, created_at desc);

comment on column public.triage_sessions.dog_name is 'Denormalized from intake for profile UI';
comment on column public.triage_sessions.photo_url is 'Optional data URL / base64 image';
