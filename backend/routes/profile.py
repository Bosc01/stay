import json

from fastapi import APIRouter, HTTPException

from db import get_supabase
from models import JournalEntryCreate, ProfileSessionUpdate, SessionHistoryRequest

router = APIRouter(prefix="/profile", tags=["profile"])

# Session reads take no auth, so they select only what the profile and
# check-in screens show. The email column is never among them.
PUBLIC_SESSION_COLUMNS = "id, created_at, dog_name, photo_url, intake, result"


def public_session(row: dict) -> dict:
    """The stored intake can carry an email too; drop it before returning.
    Some rows hold the intake as a JSON string, so parse those first."""
    intake = row.get("intake")
    if isinstance(intake, str):
        try:
            intake = json.loads(intake)
        except json.JSONDecodeError:
            intake = None
    if isinstance(intake, dict):
        intake = {k: v for k, v in intake.items() if k != "email"}
    return {**row, "intake": intake}


@router.get("/session/{session_id}")
def get_session(session_id: str):
    try:
        res = (
            get_supabase()
            .table("triage_sessions")
            .select(PUBLIC_SESSION_COLUMNS)
            .eq("id", session_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    return public_session(res.data)


@router.patch("/session/{session_id}")
def update_session(session_id: str, body: ProfileSessionUpdate):
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "dog_name" in update_data and update_data["dog_name"] == "":
        update_data["dog_name"] = None

    try:
        res = (
            get_supabase()
            .table("triage_sessions")
            .update(update_data)
            .eq("id", session_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "ok"}


@router.post("/history")
def session_history(req: SessionHistoryRequest):
    ids = req.session_ids
    if not ids:
        return {"sessions": []}

    try:
        res = (
            get_supabase()
            .table("triage_sessions")
            .select("id, created_at, result, dog_name, photo_url")
            .in_("id", ids)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    rows = []
    for row in res.data or []:
        r = row.get("result") or {}
        if isinstance(r, str):
            continue
        rows.append(
            {
                "id": row["id"],
                "created_at": row.get("created_at"),
                "behavior_classification": r.get("behavior_classification"),
                "severity": r.get("severity"),
                "severity_label": r.get("severity_label"),
                "dog_name": row.get("dog_name"),
            }
        )

    rows.sort(
        key=lambda x: (x.get("created_at") or "") or "",
        reverse=True,
    )

    return {"sessions": rows}


@router.get("/journal/{session_id}")
def list_journal(session_id: str):
    try:
        res = (
            get_supabase()
            .table("journal_entries")
            .select("id, note, created_at")
            .eq("triage_session_id", session_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"entries": res.data or []}


@router.post("/journal")
def create_journal(req: JournalEntryCreate):
    try:
        res = (
            get_supabase()
            .table("journal_entries")
            .insert(
                {
                    "triage_session_id": req.session_id,
                    "note": req.body,
                    "body": req.body,
                }
            )
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")

    return res.data[0] if isinstance(res.data, list) else res.data
