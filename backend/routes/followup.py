import json
import os
from datetime import datetime, timedelta
from html import escape

import anthropic
import resend
from fastapi import APIRouter, HTTPException

from db import get_supabase
from models import CheckInRequest, FollowUpRequest, WeeklyCheckInRequest

router = APIRouter()
_claude = anthropic.Anthropic()


def _generate_revised_first_step(
    *,
    original_triage: dict,
    intake: dict,
    score: int,
    tried_first_step: str,
    note: str | None,
) -> str | None:
    payload = {
        "instruction": (
            "The dog owner completed a day-7 check-in. Score meaning: "
            "1 = much worse, 2 = about the same, 3 = slightly better, "
            "4 = noticeably better, 5 = a lot better. "
            "Their score is low, so things are not improving or got worse.\n\n"
            "They were asked if they tried the first step from triage: "
            f"{tried_first_step}.\n\n"
            "Write ONE revised first step only: 2–4 short sentences, actionable, "
            "kind, and safety-aware. Do not diagnose or shame. "
            "Plain text only — no markdown, no bullet list. "
            "If the owner's note mentions bites, aggression, or safety risk, "
            "prioritize professional help and safety."
        ),
        "original_triage": original_triage,
        "intake_summary": {
            "dog_name": intake.get("dog_name"),
            "behavior_type": intake.get("behavior_type"),
            "behavior_description": intake.get("behavior_description"),
            "triggers": intake.get("triggers"),
            "duration": intake.get("duration"),
            "already_tried": intake.get("already_tried"),
        },
        "week1_score": score,
        "week1_note": (note or "").strip() or None,
    }
    try:
        response = _claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            system=(
                "You are Stay's triage assistant. You only output the revised "
                "first step as plain prose — nothing else."
            ),
            messages=[{"role": "user", "content": json.dumps(payload, indent=2)}],
        )
        text = response.content[0].text.strip()
        return text if text else None
    except Exception as e:
        print(f"[weekly_checkin] revised first step Claude error: {e}")
        return None


@router.post("/followup")
async def create_followup(req: FollowUpRequest):
    update_data: dict = {}
    response_extra: dict = {}

    if req.email is not None:
        follow_up_send_at = (datetime.now() + timedelta(days=30)).isoformat()
        update_data["email"] = req.email
        update_data["follow_up_send_at"] = follow_up_send_at
        response_extra["follow_up_send_at"] = follow_up_send_at

    if req.dog_still_home is not None:
        update_data["followed_up"] = True
        update_data["dog_still_home"] = req.dog_still_home

    if req.improvement_score is not None:
        update_data["improvement_score"] = req.improvement_score

    if not update_data:
        raise HTTPException(
            status_code=400, detail="No fields to update (send email and/or survey fields)"
        )

    # If we can't find the session, create a minimal one so the user still gets confirmation.
    try:
        supabase = get_supabase()
        update_res = (
            supabase.table("triage_sessions")
            .update(update_data)
            .eq("id", req.session_id)
            .execute()
        )

        if not update_res.data:
            minimal_row = {"id": req.session_id}
            if req.email is not None:
                minimal_row["email"] = req.email
                minimal_row["follow_up_send_at"] = update_data.get("follow_up_send_at")
            supabase.table("triage_sessions").insert(minimal_row).execute()
    except Exception as e:
        print(f"Followup error: {e}")

    # Best-effort welcome email after email signup is saved.
    if req.email is not None:
        try:
            resend.api_key = os.environ.get("RESEND_API_KEY")
            if resend.api_key:
                row = (
                    update_res.data[0]
                    if isinstance(update_res.data, list) and update_res.data
                    else {}
                )
                intake = row.get("intake") or {}
                triage_result = row.get("result") or {}
                dog_name = (
                    row.get("dog_name")
                    or intake.get("dog_name")
                    or "your dog"
                )
                follow_up_date = response_extra.get("follow_up_send_at", "")
                try:
                    follow_up_date = datetime.fromisoformat(follow_up_date).strftime("%B %d, %Y")
                except Exception:
                    pass

                resend.Emails.send(
                    {
                        "from": "Stay <hello@trystay.org>",
                        "to": req.email,
                        "subject": f"Your triage for {dog_name}",
                        "html": f"""
    <h2>Here's what we found for {escape(str(dog_name))}</h2>
    <p><strong>What's driving it:</strong> {escape(str(triage_result.get("root_cause", "")))}</p>
    <p><strong>Try this today:</strong> {escape(str(triage_result.get("first_step", "")))}</p>
    <p><strong>Honest assessment:</strong> {escape(str(triage_result.get("honest_note", "")))}</p>
    <br>
    <p>We'll check in on {escape(str(follow_up_date))} to see how things are going.</p>
    <p><a href="https://trystay.org">Back to Stay</a></p>
  """,
                    }
                )
            else:
                print("RESEND_API_KEY not set; skipping welcome email")
        except Exception as e:
            print(f"Resend welcome email failed: {e}")

    return {"status": "ok", **response_extra}


@router.post("/checkin")
async def week1_checkin(req: CheckInRequest):
    now = datetime.now()
    try:
        result = (
            get_supabase()
            .table("triage_sessions")
            .update(
                {
                    "week1_improvement_score": req.improvement_score,
                    "week2_send_at": (now + timedelta(days=14)).isoformat(),
                    "week3_send_at": (now + timedelta(days=21)).isoformat(),
                    "week4_send_at": (now + timedelta(days=28)).isoformat(),
                }
            )
            .eq("id", req.session_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "ok"}


@router.post("/checkin/weekly")
async def weekly_checkin(req: WeeklyCheckInRequest):
    try:
        session_row = (
            get_supabase()
            .table("triage_sessions")
            .select("id, intake, result")
            .eq("id", req.session_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not session_row.data:
        raise HTTPException(status_code=404, detail="Session not found")

    original_triage = session_row.data.get("result") or {}
    if not isinstance(original_triage, dict):
        original_triage = {}
    intake = session_row.data.get("intake") or {}
    if not isinstance(intake, dict):
        intake = {}

    revised: str | None = None
    if req.score <= 2:
        revised = _generate_revised_first_step(
            original_triage=original_triage,
            intake=intake,
            score=req.score,
            tried_first_step=req.tried_first_step,
            note=req.note,
        )

    row_payload = {
        "session_id": req.session_id,
        "week_number": req.week_number,
        "score": req.score,
        "tried_first_step": req.tried_first_step,
        "note": req.note,
        "revised_first_step": revised,
    }

    try:
        insert_res = (
            get_supabase()
            .table("weekly_checkins")
            .insert(row_payload)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {
        "status": "ok",
        "checkin": insert_res.data[0] if isinstance(insert_res.data, list) and insert_res.data else None,
        "revised_first_step": revised,
    }


@router.get("/followup/{session_id}")
async def get_followup(session_id: str):
    try:
        result = (
            get_supabase()
            .table("triage_sessions")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    return result.data
