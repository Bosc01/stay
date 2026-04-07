-- Run in Supabase SQL editor (extends weekly_checkins)

alter table public.weekly_checkins
  add column if not exists tried_first_step text,
  add column if not exists revised_first_step text;
