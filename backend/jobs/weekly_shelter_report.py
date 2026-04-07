"""
Weekly shelter partner email report.

Run every Monday at 9:00 in your chosen timezone (see docs/cron-weekly-report.md).
Example from repo root:
  cd backend && python -m jobs.weekly_shelter_report

Requires: SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY, and shelter_partners rows.
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

# backend/ directory (parent of jobs/)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")
# Also support running from repo root with backend/.env
load_dotenv(_BACKEND_DIR.parent / "backend" / ".env")

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import resend  # noqa: E402

from db import get_supabase  # noqa: E402

PAGE_SIZE = 1000
WINDOW_DAYS = 7
FOLLOWUP_DAYS = 30


def _parse_result(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_created_at(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def fetch_sessions_last_week(supabase, since_iso: str) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        res = (
            supabase.table("triage_sessions")
            .select("referral_source,result,email,created_at")
            .gte("created_at", since_iso)
            .not_.is_("referral_source", "null")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def fetch_shelter_partners(supabase) -> dict[str, dict]:
    rows: list[dict] = []
    start = 0
    while True:
        res = (
            supabase.table("shelter_partners")
            .select("slug,name,contact_email")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    out: dict[str, dict] = {}
    for r in rows:
        slug = str(r.get("slug") or "").strip().lower()
        if slug:
            out[slug] = r
    return out


def aggregate_by_ref(sessions: list[dict]) -> dict[str, dict]:
    """ref -> {total, green, yellow, red, followup_signups, created_ats}."""
    agg: dict[str, dict] = defaultdict(
        lambda: {
            "total": 0,
            "green": 0,
            "yellow": 0,
            "red": 0,
            "followup_signups": 0,
            "created_ats": [],
        }
    )
    for row in sessions:
        ref = str(row.get("referral_source") or "").strip().lower()
        if not ref:
            continue
        a = agg[ref]
        a["total"] += 1
        r = _parse_result(row.get("result"))
        sev = str(r.get("severity") or "").lower().strip()
        if sev == "green":
            a["green"] += 1
        elif sev == "yellow":
            a["yellow"] += 1
        elif sev == "red":
            a["red"] += 1
        email = row.get("email")
        if email is not None and str(email).strip():
            a["followup_signups"] += 1
        ca = _parse_created_at(row.get("created_at"))
        if ca:
            a["created_ats"].append(ca)
    return dict(agg)


def days_until_retention_hint(created_ats: list[datetime]) -> int:
    """Soonest 30-day follow-up horizon from any session in the window (days, clamped)."""
    if not created_ats:
        return FOLLOWUP_DAYS
    now = datetime.now(timezone.utc)
    mins: list[int] = []
    for ca in created_ats:
        age_days = max(0, (now - ca).days)
        mins.append(max(0, FOLLOWUP_DAYS - age_days))
    return max(0, min(mins))


def build_html_email(
    shelter_name: str,
    total: int,
    green: int,
    yellow: int,
    red: int,
    followups: int,
    retention_days: int,
) -> str:
    if total == 1:
        referred_line = (
            "<p>This week, <strong>1</strong> dog owner was referred through your Stay link.</p>"
        )
    else:
        referred_line = f"""\
<p>This week, <strong>{total}</strong> dog owners were referred through your Stay link.</p>"""
    if followups == 1:
        fu_line = "<p><strong>1</strong> owner signed up for the 30-day follow-up.</p>"
    else:
        fu_line = f"<p><strong>{followups}</strong> owners signed up for the 30-day follow-up.</p>"
    day_word = "day" if retention_days == 1 else "days"
    return f"""\
{referred_line}
<ul>
<li><strong>{green}</strong> received a green triage (manageable at home)</li>
<li><strong>{yellow}</strong> received a yellow triage (try this first)</li>
<li><strong>{red}</strong> received a red triage (referred to professional)</li>
</ul>
{fu_line}
<p>We&apos;ll have retention data in <strong>{retention_days}</strong> {day_word}.</p>
<p>—The Stay team<br><a href="https://trystay.org">trystay.org</a></p>
"""


def run() -> int:
    resend.api_key = os.environ.get("RESEND_API_KEY")
    if not resend.api_key:
        print("RESEND_API_KEY not set; aborting.")
        return 1

    supabase = get_supabase()
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=WINDOW_DAYS)
    since_iso = since.isoformat()

    try:
        sessions = fetch_sessions_last_week(supabase, since_iso)
    except Exception as e:
        print(f"Failed to fetch triage_sessions: {e}")
        return 1

    try:
        partners = fetch_shelter_partners(supabase)
    except Exception as e:
        print(f"Failed to fetch shelter_partners (table may be missing): {e}")
        return 1

    by_ref = aggregate_by_ref(sessions)
    sent = 0
    skipped = 0

    for ref_slug, stats in sorted(by_ref.items()):
        partner = partners.get(ref_slug)
        if not partner:
            print(f"Skip {ref_slug}: no shelter_partners row")
            skipped += 1
            continue

        total = stats["total"]
        if total == 0:
            continue

        name = str(partner.get("name") or ref_slug).strip()
        to = str(partner.get("contact_email") or "").strip()
        if not to or "@" not in to:
            print(f"Skip {ref_slug}: invalid contact_email")
            skipped += 1
            continue

        retention_days = days_until_retention_hint(stats["created_ats"])
        html = build_html_email(
            name,
            total,
            stats["green"],
            stats["yellow"],
            stats["red"],
            stats["followup_signups"],
            retention_days,
        )

        try:
            resend.Emails.send(
                {
                    "from": "Stay <hello@trystay.org>",
                    "to": to,
                    "subject": f"Stay weekly update — {name}",
                    "html": html,
                }
            )
            print(f"Sent weekly report to {to} ({ref_slug}, n={total})")
            sent += 1
        except Exception as e:
            print(f"Resend failed for {ref_slug} ({to}): {e}")
            skipped += 1

    print(f"Done. Sent={sent}, skipped_or_failed={skipped}, refs_in_window={len(by_ref)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
