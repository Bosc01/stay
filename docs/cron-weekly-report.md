# Weekly shelter partner report

Sends one email per partner (see `shelter_partners` in Supabase) that had at least one `triage_sessions` row in the **last 7 days** with a matching `referral_source` slug.

## 1. Supabase

Run `backend/sql/shelter_partners.sql`, then insert partners (slug must match `?ref=` / `referral_source`):

```sql
insert into public.shelter_partners (slug, name, contact_email)
values
  ('austin-pets-alive', 'Austin Pets Alive', 'partner@example.org');
```

## 2. Environment

Same as the API: `SUPABASE_URL`, `SUPABASE_KEY` (service role), `RESEND_API_KEY`.

## 3. Manual run

From the **backend** directory (where `.env` lives):

```bash
cd backend
python -m jobs.weekly_shelter_report
```

From the **repo root** (if `.env` is at `backend/.env`):

```bash
python -m jobs.weekly_shelter_report
```

The job adds `backend/` to `sys.path` and loads `backend/.env` or `backend/.env` via path next to the `jobs/` package.

## 4. Schedule: Monday 9:00

Cron uses the server’s timezone unless the platform specifies UTC.

- **UTC — Monday 09:00**  
  `0 9 * * 1`

- **US Eastern — Monday 09:00** (standard time; adjust for DST if needed)  
  `0 14 * * 1` (14:00 UTC ≈ 9:00 EST)

- **US Central — Monday 09:00**  
  `0 15 * * 1` (approx.; verify for DST)

## 5. Railway

1. In the Railway project, add a **Cron** service (or **Scheduled Job**), or use a separate worker service with a cron plugin.
2. Set the same environment variables as the FastAPI service (`SUPABASE_*`, `RESEND_API_KEY`).
3. **Start command** (working directory should be the folder that contains `backend` as a subfolder, or set root to `backend`):

   ```bash
   python -m jobs.weekly_shelter_report
   ```

   If the repo root is the service root and the app lives in `backend/`:

   ```bash
   cd backend && python -m jobs.weekly_shelter_report
   ```

4. **Schedule:** e.g. `0 9 * * 1` for Monday 09:00 UTC (change to match your timezone; see above).

Railway’s UI for cron schedules may differ; use their docs for “Cron Jobs” or “Scheduled Tasks” and map the same command + cron expression.

## 6. Retention line in the email

`[X]` is computed as the **minimum** number of days until the **30-day** follow-up horizon for any session in that partner’s weekly cohort (roughly “soonest we might have 30-day follow-up signal”). If there are no parsed timestamps, it defaults to `30`.
