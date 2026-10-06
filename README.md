# Stay

[![CI](https://github.com/Bosc01/stay/actions/workflows/ci.yml/badge.svg)](https://github.com/Bosc01/stay/actions/workflows/ci.yml)

Stay is a free tool for dog owners who are close to giving up their dog over a
behavior problem. An owner answers three short questions, and Stay explains
what is likely driving the behavior and gives them one specific thing to try
today. Thirty days later it checks back to see whether the dog is still home.

It is live at [trystay.org](https://trystay.org) and running in a pilot with
Austin Pets Alive, with 50+ pilot users so far.

## Why I built it

28% of dog surrenders are driven by behavior issues, and most of those are
fixable with early, plain advice. By the time an owner walks into a shelter, it
is usually too late for that advice to help. I wanted something that reaches
them a few weeks earlier, for free, at the moment they start searching for
help.

## How a triage works

1. The owner describes the behavior across three short screens.
2. The backend sends the intake to Claude (Sonnet 5) with a fixed system prompt.
3. The response has to validate as a Pydantic model: a green, yellow, or red
   severity, the likely root cause, a first step, a plan for the week, and an
   escalation flag. A response that fails validation is logged and rejected
   instead of being shown to the owner.
4. The owner sees the result, can ask follow-up questions, and gets weekly
   check-ins plus a 30-day follow-up email.

Some cases should never get home advice first. If the intake mentions a bite
that broke skin, a child involved, or an owner who is afraid of their dog, the
result must be red, must be flagged for escalation, and must lead with a
certified professional before anything else. That rule lives in the prompt and
is checked by the eval harness below.

## Engineering notes

- **Tests and CI.** 74 backend tests run on every push and pull request,
  alongside a frontend build. The suite exists because of a bug that sat in
  production for months: a template placeholder meant the owner's experience
  and prior training never reached the AI prompt. A regression test now fails
  if any unfilled placeholder reaches the model, for any intake shape.
- **Evals.** `backend/evals` holds a golden set of 10 cases, 3 of them
  safety-critical. Each case checks severity, escalation, and required
  referral tags. Scoring is pure Python and covered by the normal test suite,
  so CI verifies the harness without spending anything on API calls. Releases
  are gated on 100% recall of the bite and child safety rules.
- **Prompt caching.** The static system prompt sits before the cache
  boundary, which cut per-request token cost by 75%, confirmed with
  cache-hit telemetry.
- **Rate limiting.** The limiter keyed on the address it saw, which behind
  the hosting proxy was the proxy itself, so every owner shared one bucket and
  one busy hour would have locked everyone out. It now reads the real client
  address from the forwarded header, and the table of tracked addresses is
  capped so it cannot grow without bound.
- **Security and privacy.** Admin auth fails closed, dependencies are pinned,
  and a high-severity CVE in the router dependency was patched. Logging moved
  from print statements to structured logs, with owner data kept out of them.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React and Vite, deployed on Vercel |
| Backend | FastAPI (Python), deployed on Railway |
| Model | Anthropic Claude API, Sonnet 5 |
| Database | Supabase (PostgreSQL) |
| Email | Resend |

## Other features

- Dog profile with triage history and a behavior journal
- Shelter partner page with referral tracking, plus a weekly partner report
  (see `docs/cron-weekly-report.md`)
- Shareable result cards and behavior education cards
- Admin dashboard and an impact page

## What we measure

The one number that matters is the share of owners whose dog is still home
30 days after their first triage.

## Run it locally

Backend:

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # set ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
uvicorn main:app --reload
```

`RESEND_API_KEY` and `ADMIN_PASSWORD` are needed only for email and the admin
dashboard.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Tests and evals:

```bash
pip install -r requirements-dev.txt
pytest                                   # 74 tests, no API calls
cd backend && python -m evals.runner     # live evals, one API call per case
python -m evals.runner --safety          # safety-critical cases only
```

## Author

Built by Harekas Bindra, CS and Linguistics at UT Austin.
[linkedin.com/in/harekas](https://linkedin.com/in/harekas)
