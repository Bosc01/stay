-- Run in Supabase SQL editor

alter table public.triage_sessions
  add column if not exists followup_question_asked boolean not null default false,
  add column if not exists followup_question text,
  add column if not exists followup_question_answer text;
