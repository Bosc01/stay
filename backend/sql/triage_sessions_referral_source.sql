-- Run in Supabase SQL editor before using referrals.
alter table public.triage_sessions
  add column if not exists referral_source text;

create index if not exists triage_sessions_referral_source_idx
  on public.triage_sessions (referral_source);

comment on column public.triage_sessions.referral_source is 'UTM-style ref slug, e.g. from ?ref=';
