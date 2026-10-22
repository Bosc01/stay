"""Funnel events: triage_started, triage_completed, email_signup, return_visit_7d.

One session id runs through all four. The browser mints it when the owner
starts the intake, sends it with the triage, and the triage stores under it.
Completion and email signup are logged server-side where they happen; the
browser only reports the start and later visits.
"""

import logging
from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import get_supabase
from ratelimit import allow_request, client_ip

logger = logging.getLogger(__name__)

router = APIRouter()

FUNNEL_STEPS = ("triage_started", "triage_completed", "email_signup", "return_visit_7d")
RETURN_WINDOW_DAYS = 7


def log_event(session_id: str | None, event: str) -> None:
    """Record one funnel step. A repeat for the same session is ignored, and a
    failure is only printed, so logging never breaks the owner's flow."""
    if not session_id:
        return
    try:
        get_supabase().table("funnel_events").upsert(
            {"session_id": session_id, "event": event},
            on_conflict="session_id,event",
            ignore_duplicates=True,
        ).execute()
    except Exception as e:
        logger.warning("could not log %s for session %s: %s", event, session_id, e)


def utc_date(value) -> date | None:
    """The UTC calendar date of a Supabase timestamp, or None if it will not parse."""
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date()


def is_return_visit(completed_at, now: datetime) -> bool:
    """A visit on a later UTC day, at most RETURN_WINDOW_DAYS after the triage."""
    completed = utc_date(completed_at)
    if completed is None:
        return False
    days = (now.astimezone(timezone.utc).date() - completed).days
    return 1 <= days <= RETURN_WINDOW_DAYS


class FunnelEventIn(BaseModel):
    session_id: UUID
    # "visit" is reported on every return; the server decides whether it counts.
    event: Literal["triage_started", "visit"]


@router.post("/events", status_code=204)
def post_event(body: FunnelEventIn, request: Request) -> None:
    session_id = str(body.session_id)
    if body.event == "triage_started":
        # Anyone can post a start, so each client gets its own allowance,
        # apart from its triage budget; otherwise a script could inflate the
        # top of the funnel. Visits need a stored completion, so they cannot.
        if not allow_request(f"events:{client_ip(request)}"):
            raise HTTPException(status_code=429, detail="Too many requests.")
        log_event(session_id, "triage_started")
        return
    try:
        rows = (
            get_supabase()
            .table("funnel_events")
            .select("created_at")
            .eq("session_id", session_id)
            .eq("event", "triage_completed")
            .limit(1)
            .execute()
            .data
        )
    except Exception as e:
        logger.warning("visit lookup failed for session %s: %s", session_id, e)
        return
    if rows and is_return_visit(rows[0]["created_at"], datetime.now(timezone.utc)):
        log_event(session_id, "return_visit_7d")


def funnel_summary(rows: list[dict]) -> list[dict]:
    """Strict funnel over the sessions that started in the rows given.

    Each step counts sessions that also reached every step before it, so no
    step can exceed the one above. from_previous is None when the step above
    is empty.
    """
    by_event: dict[str, set] = {step: set() for step in FUNNEL_STEPS}
    for row in rows:
        if row.get("event") in by_event and row.get("session_id"):
            by_event[row["event"]].add(row["session_id"])

    steps = []
    reached = by_event[FUNNEL_STEPS[0]]
    previous = None
    for step in FUNNEL_STEPS:
        reached = reached & by_event[step]
        count = len(reached)
        steps.append(
            {
                "event": step,
                "count": count,
                "from_previous": (
                    None if previous is None or previous == 0 else round(count / previous, 4)
                ),
            }
        )
        previous = count
    return steps
