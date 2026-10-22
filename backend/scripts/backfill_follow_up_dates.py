"""
One-off: give older triage_sessions a follow_up_7_day_at so the day 7 check-in
can find them.

Lists by default and writes nothing. Review the list first: anything older than
a week is already past due, so backfilling it sends the standard "it's been a
week" copy to someone who triaged months ago. Write different copy for those
instead of sweeping them in here.

  cd backend && python -m scripts.backfill_follow_up_dates
  cd backend && python -m scripts.backfill_follow_up_dates --max-age-days 14 --apply

Requires: SUPABASE_URL, SUPABASE_KEY.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from db import get_supabase  # noqa: E402

PAGE_SIZE = 1000
FOLLOW_UP_DAYS = 7


def _parse_dt(value) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _candidates(supabase) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        res = (
            supabase.table("triage_sessions")
            .select("id,email,dog_name,created_at")
            .not_.is_("email", "null")
            .is_("follow_up_7_day_at", "null")
            .order("created_at")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="actually write follow_up_7_day_at (default: list only)",
    )
    ap.add_argument(
        "--max-age-days",
        type=int,
        default=None,
        help="only touch sessions created within this many days (required with --apply)",
    )
    args = ap.parse_args()

    if args.apply and args.max_age_days is None:
        print(
            "Refusing to apply without --max-age-days. Old sessions would be "
            "instantly due and get the standard day 7 copy.",
            file=sys.stderr,
        )
        return 2

    now = datetime.now(timezone.utc)
    supabase = get_supabase()
    rows = _candidates(supabase)

    selected, skipped_old, undated = [], 0, 0
    for row in rows:
        created = _parse_dt(row.get("created_at"))
        if created is None:
            undated += 1
            continue
        age = (now - created).days
        if args.max_age_days is not None and age > args.max_age_days:
            skipped_old += 1
            continue
        selected.append((row, created, age))

    print(f"{len(rows)} sessions have an email and no follow_up_7_day_at.")
    if undated:
        print(f"{undated} skipped: unreadable created_at.")
    if skipped_old:
        print(f"{skipped_old} skipped: older than {args.max_age_days} days.")
    print()

    for row, created, age in selected:
        due = created + timedelta(days=FOLLOW_UP_DAYS)
        flag = "  PAST DUE, would send immediately" if due <= now else ""
        print(
            f"{row.get('id')}  {row.get('email')}  "
            f"{row.get('dog_name') or '(no dog name)'}  "
            f"created {created.date()} ({age}d ago)  ->  due {due.date()}{flag}"
        )

    if not args.apply:
        print(f"\nDry run. {len(selected)} rows would be updated. Re-run with --apply.")
        return 0

    written = 0
    for row, created, _ in selected:
        due = (created + timedelta(days=FOLLOW_UP_DAYS)).isoformat()
        try:
            supabase.table("triage_sessions").update(
                {"follow_up_7_day_at": due}
            ).eq("id", row.get("id")).execute()
            written += 1
        except Exception as e:
            print(f"failed {row.get('id')}: {e}", file=sys.stderr)

    print(f"\nUpdated {written} of {len(selected)} rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
