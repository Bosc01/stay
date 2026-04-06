-- Run in Supabase SQL editor. Optional seed for local/demo:
-- insert into public.stories (dog_name, behavior_type, update_text)
-- values ('Charlie', 'reactivity', 'First walk without lunging at bikes today.');

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  dog_name text,
  behavior_type text,
  behavior_classification text,
  update_text text,
  weeks_since_triage integer,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.stories
  add column if not exists behavior_classification text,
  add column if not exists weeks_since_triage integer,
  add column if not exists is_public boolean not null default true;

create index if not exists stories_created_at_idx
  on public.stories (created_at desc);
