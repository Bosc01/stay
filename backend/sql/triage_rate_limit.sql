-- Triage rate limit that survives restarts. One row per allowed request, kept
-- for a day. Run in Supabase SQL editor, then set RATE_LIMIT_STORE=supabase on
-- the backend.

create table if not exists public.triage_rate_limit (
  id bigint generated always as identity primary key,
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists triage_rate_limit_key_created_idx
  on public.triage_rate_limit (client_key, created_at);

-- Rows hold client IP addresses. Nothing reads the table directly: the backend
-- goes through the function below, which runs as its owner and so bypasses
-- RLS. With RLS on and no policy, the anon key cannot read or edit rows, and
-- this works whichever key SUPABASE_KEY is.
alter table public.triage_rate_limit enable row level security;

-- Records a request for p_key and returns true, or returns false without
-- recording when p_key already has p_limit requests inside the window. The
-- advisory lock makes check-and-insert atomic per key, so parallel requests
-- cannot all slip under the limit. The one-day prune is fixed here rather than
-- taken from the arguments, so a bad argument cannot wipe every client's count;
-- windows longer than a day would undercount.
create or replace function public.triage_rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('triage_rate_limit:' || p_key));

  delete from public.triage_rate_limit where created_at < now() - interval '1 day';

  if (
    select count(*) from public.triage_rate_limit
    where client_key = p_key
      and created_at > now() - make_interval(secs => p_window_seconds)
  ) >= p_limit then
    return false;
  end if;

  insert into public.triage_rate_limit (client_key) values (p_key);
  return true;
end;
$$;

-- Only the backend may call this. Left open, anyone holding the anon key could
-- fill another client's bucket and lock them out for an hour. This means the
-- Supabase store needs SUPABASE_KEY to be the service role key; with the anon
-- key the call fails and the backend logs "rate limit store error" and falls
-- back to its in-memory counter.
revoke execute on function public.triage_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.triage_rate_limit_hit(text, integer, integer) to service_role;
