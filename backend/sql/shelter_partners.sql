-- Partner contacts for weekly referral reports. Run in Supabase SQL editor.

create table if not exists public.shelter_partners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text not null,
  name text not null,
  contact_email text not null,
  constraint shelter_partners_slug_key unique (slug)
);

create index if not exists shelter_partners_slug_idx on public.shelter_partners (slug);

comment on table public.shelter_partners is 'Shelter partner display name and weekly report recipient; slug matches triage_sessions.referral_source';
