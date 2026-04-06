from fastapi import APIRouter, HTTPException, Query

from db import get_supabase

router = APIRouter()


@router.get("/referral-stats")
async def referral_stats(
    ref: str = Query(..., min_length=1, max_length=128, description="referral_source slug"),
):
    try:
        res = (
            get_supabase()
            .table("triage_sessions")
            .select("*", count="exact")
            .eq("referral_source", ref)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    count = getattr(res, "count", None)
    if count is None:
        count = len(res.data) if res.data is not None else 0

    return {"referral_source": ref, "count": count}
