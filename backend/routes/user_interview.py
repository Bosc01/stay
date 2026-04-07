from fastapi import APIRouter, HTTPException

from db import get_supabase
from models import UserInterviewCreate

router = APIRouter(tags=["user-interview"])


@router.post("/user-interview")
async def create_user_interview(body: UserInterviewCreate):
    try:
        session_ok = (
            get_supabase()
            .table("triage_sessions")
            .select("id")
            .eq("id", body.session_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    rows = session_ok.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        insert_res = (
            get_supabase()
            .table("user_interviews")
            .insert(
                {
                    "session_id": body.session_id,
                    "q1": body.q1 or None,
                    "q2": body.q2 or None,
                    "q3": body.q3 or None,
                }
            )
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    row = insert_res.data[0] if isinstance(insert_res.data, list) and insert_res.data else None
    return {"status": "ok", "interview": row}
