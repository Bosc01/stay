-- Shelter outreach targets: research from scripts/find_shelters.py, reviewed at
-- /admin/outreach. Sending stays manual. Run in Supabase SQL editor.

create table if not exists public.outreach_targets (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  city text not null,
  website text,
  contact_name text not null,
  contact_title text,
  contact_email text,
  specific_detail text not null,
  detail_source_url text not null,
  status text not null default 'drafted',
  drafted_body text,
  sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  constraint outreach_targets_org_city_key unique (org_name, city),
  constraint outreach_targets_status_check
    check (status in ('drafted', 'approved', 'rejected', 'sent'))
);

-- The review queue reads by status, newest first.
create index if not exists outreach_targets_status_idx
  on public.outreach_targets (status, created_at desc);

comment on table public.outreach_targets is
  'Researched shelter contacts and drafted outreach emails; sending is manual';

-- This table holds contact names and emails and is only ever read through the
-- password-gated /admin/outreach route, never from the browser. Like the other
-- tables in this repo it ships without RLS. If SUPABASE_KEY is the service role
-- key, uncomment the line below to close the table to the anon key as well. Do
-- not uncomment it if the backend connects with the anon key: with RLS on and
-- no policy, every query returns zero rows.
-- alter table public.outreach_targets enable row level security;
