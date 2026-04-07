-- Run in Supabase SQL editor for shelter partner demo requests.
-- Backend inserts using SUPABASE_KEY (service role).

create table if not exists public.shelter_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  shelter_name text not null,
  email text not null,
  role text
);

comment on table public.shelter_inquiries is 'Demo / partnership requests from shelter portal';
