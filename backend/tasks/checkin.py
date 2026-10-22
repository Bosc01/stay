from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from html import escape
from urllib.parse import quote

import resend

from db import get_supabase

logger = logging.getLogger(__name__)

PAGE_SIZE = 100

SITE_URL = os.environ.get("SITE_URL", "https://trystay.org").rstrip("/")

# One tap answers both questions: is the dog still home, and is anything better.
# Scores follow the existing 1-5 scale (1 = much worse ... 5 = a lot better).
ANSWERS = [
    ("Still home, and things are better", "yes", 4),
    ("Still home, about the same", "yes", 2),
    ("Still home, but it has been harder", "yes", 1),
    ("{name} is not with me anymore", "no", None),
]


def _dog_name(row: dict) -> str:
    n = row.get("dog_name")
    if n is not None and str(n).strip():
        return str(n).strip()
    intake = row.get("intake")
    if isinstance(intake, dict):
        dn = intake.get("dog_name")
        if dn is not None and str(dn).strip():
            return str(dn).strip()
    return "your dog"


def _answer_url(session_id: str, home: str, score: int | None) -> str:
    q = f"home={home}" if score is None else f"home={home}&score={score}"
    return f"{SITE_URL}/checkin/{quote(str(session_id))}?{q}"


def build_checkin_email(session_id: str, name: str) -> dict:
    """Subject, html and text for the 7-day check-in. Two questions, one tap."""
    options = [
        (label.format(name=name), _answer_url(session_id, home, score))
        for label, home, score in ANSWERS
    ]

    links_html = "".join(
        f'<p style="margin:10px 0"><a href="{escape(url)}">{escape(label)}</a></p>'
        for label, url in options
    )
    html = (
        f"<p>It's been a week since you asked us about {escape(name)}.</p>"
        f"<p>Two things, one tap: is {escape(name)} still home, and is anything better?</p>"
        f"{links_html}"
        "<p>That's all. Nothing to fill out.</p>"
    )

    links_text = "\n".join(f"{label}\n{url}\n" for label, url in options)
    text = (
        f"It's been a week since you asked us about {name}.\n\n"
        f"Two things, one tap: is {name} still home, and is anything better?\n\n"
        f"{links_text}\n"
        "That's all. Nothing to fill out.\n"
    )

    return {"subject": f"How is {name} doing?", "html": html, "text": text}


def send_7day_checkins(dry_run: bool = False) -> dict:
    """
    Find triage_sessions due for the 7-day email, send via Resend, set follow_up_sent.

    follow_up_sent is only written after Resend confirms the send, so a failure
    leaves the row due rather than silently marking it done.
    With dry_run, payloads are logged and nothing is sent or written.
    """
    if not dry_run:
        resend.api_key = os.environ.get("RESEND_API_KEY")
        if not resend.api_key:
            return {
                "ok": False,
                "error": "RESEND_API_KEY not set",
                "sent": 0,
                "sessions": [],
            }

    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()
    sent_sessions: list[str] = []
    errors: list[dict] = []
    seen: set[str] = set()

    while True:
        try:
            res = (
                supabase.table("triage_sessions")
                .select("id,email,dog_name,intake,follow_up_7_day_at,follow_up_sent")
                .not_.is_("email", "null")
                .not_.is_("follow_up_7_day_at", "null")
                .lte("follow_up_7_day_at", now_iso)
                .eq("follow_up_sent", False)
                .limit(PAGE_SIZE)
                .execute()
            )
        except Exception as e:
            return {
                "ok": False,
                "error": str(e),
                "dry_run": dry_run,
                "sent": len(sent_sessions),
                "sessions": sent_sessions,
                "errors": errors,
            }

        # Rows stay due when a send fails, so skip anything already handled this
        # run. Without this the page would repeat forever.
        rows = [r for r in (res.data or []) if str(r.get("id")) not in seen]
        if not rows:
            break

        for row in rows:
            session_id = row.get("id")
            email = str(row.get("email") or "").strip()
            if not session_id or not email:
                continue
            seen.add(str(session_id))

            name = _dog_name(row)
            msg = build_checkin_email(str(session_id), name)

            if dry_run:
                # The address and body are the owner's, so only the session is logged.
                logger.info("checkin dry run: would email session %s", session_id)
                sent_sessions.append(str(session_id))
                continue

            try:
                resp = resend.Emails.send(
                    {
                        "from": "Stay <hello@trystay.org>",
                        "to": email,
                        "subject": msg["subject"],
                        "html": msg["html"],
                        "text": msg["text"],
                    }
                )
            except Exception as e:
                errors.append({"session_id": str(session_id), "error": str(e)})
                continue

            email_id = (
                resp.get("id") if isinstance(resp, dict) else getattr(resp, "id", None)
            )
            if not email_id:
                errors.append(
                    {"session_id": str(session_id), "error": "no send id from Resend"}
                )
                continue

            try:
                supabase.table("triage_sessions").update({"follow_up_sent": True}).eq(
                    "id", session_id
                ).execute()
            except Exception as e:
                errors.append(
                    {
                        "session_id": str(session_id),
                        "error": f"mark sent failed: {e}",
                    }
                )
                continue

            sent_sessions.append(str(session_id))

    return {
        "ok": True,
        "dry_run": dry_run,
        "sent": len(sent_sessions),
        "sessions": sent_sessions,
        "errors": errors,
    }
