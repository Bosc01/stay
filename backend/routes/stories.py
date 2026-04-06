from fastapi import APIRouter

from db import get_supabase

router = APIRouter(prefix="/stories", tags=["stories"])


@router.get("/recent")
async def recent_stories():
    """Public read of latest story cards for landing social proof."""
    try:
        res = (
            get_supabase()
            .table("stories")
            .select("dog_name, behavior_type, update_text, created_at")
            .order("created_at", desc=True)
            .limit(3)
            .execute()
        )
        rows = res.data or []
        out = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            out.append(
                {
                    "dog_name": row.get("dog_name"),
                    "behavior_type": row.get("behavior_type"),
                    "update_text": row.get("update_text"),
                }
            )
        return {"stories": out}
    except Exception:
        return {"stories": []}
