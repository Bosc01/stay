from datetime import datetime, timedelta
import os
from html import escape

from fastapi import APIRouter, HTTPException
import resend

from db import get_supabase
from models import CheckInRequest, FollowUpRequest, WeeklyCheckInRequest

router = APIRouter()


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

    try:
        result = (
            get_supabase()
            .table("triage_sessions")
            .update(update_data)
            .eq("id", req.session_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # Best-effort welcome email after email signup is saved.
    if req.email is not None:
        try:
            resend.api_key = os.environ.get("RESEND_API_KEY")
            if resend.api_key:
                row = result.data[0] if isinstance(result.data, list) and result.data else {}
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
        session_exists = (
            get_supabase()
            .table("triage_sessions")
            .select("id")
            .eq("id", req.session_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not session_exists.data:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        insert_res = (
            get_supabase()
            .table("weekly_checkins")
            .insert(
                {
                    "session_id": req.session_id,
                    "week_number": req.week_number,
                    "score": req.score,
                    "note": req.note,
                }
            )
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {
        "status": "ok",
        "checkin": insert_res.data[0] if isinstance(insert_res.data, list) and insert_res.data else None,
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
