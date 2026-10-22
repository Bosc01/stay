-- Trainer and vet verdicts on sampled triages, imported from the marked review
-- CSV at /admin. One verdict per session per reviewer; a re-upload replaces
-- it. Run in Supabase SQL editor.

create table if not exists public.triage_reviews (
  id bigint generated always as identity primary key,
  session_id text not null,
  reviewer text not null,
  -- The severity the reviewer judged, copied from the triage at import. Null
  -- when the triage carried none.
  severity text,
  verdict text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint triage_reviews_session_reviewer_key unique (session_id, reviewer),
  constraint triage_reviews_verdict_check check (verdict in ('agree', 'disagree'))
);

-- Holds reviewer names and notes. Same caveat as outreach_targets.sql:
-- uncomment only if SUPABASE_KEY is the service role key.
-- alter table public.triage_reviews enable row level security;
