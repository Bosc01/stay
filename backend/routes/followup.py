from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from backend.db import get_supabase
from backend.models import FollowUpRequest

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

    return {"status": "ok", **response_extra}


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
