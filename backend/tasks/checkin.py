from __future__ import annotations

import os
from datetime import datetime, timezone

import resend

from db import get_supabase

PAGE_SIZE = 100


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


def send_7day_checkins() -> dict:
    """
    Find triage_sessions due for the 7-day email, send via Resend, set follow_up_sent.
    """
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
                "sent": len(sent_sessions),
                "sessions": sent_sessions,
                "errors": errors,
            }

        rows = res.data or []
        if not rows:
            break

        for row in rows:
            session_id = row.get("id")
            email = str(row.get("email") or "").strip()
            if not session_id or not email:
                continue

            name = _dog_name(row)
            subject = f"How is {name} doing?"
            body = (
                f"It's been 7 days since you used Stay to understand {name}'s behavior.\n\n"
                "Did the first step help? We'd love to know how things are going.\n\n"
                "Reply to this email or visit your profile:\n"
                f"https://trystay.org/profile/{session_id}"
            )

            try:
                resend.Emails.send(
                    {
                        "from": "Stay <hello@trystay.org>",
                        "to": email,
                        "subject": subject,
                        "text": body,
                    }
                )
            except Exception as e:
                errors.append({"session_id": str(session_id), "error": str(e)})
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
        "sent": len(sent_sessions),
        "sessions": sent_sessions,
        "errors": errors,
    }
