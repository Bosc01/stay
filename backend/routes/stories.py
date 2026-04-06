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


@router.get("/similar")
async def similar_stories(behavior_classification: str):
    """Public read of anonymized similar stories for triage result."""
    if not behavior_classification or not behavior_classification.strip():
        return {"stories": []}

    try:
        res = (
            get_supabase()
            .table("stories")
            .select(
                "dog_name, behavior_classification, update_text, weeks_since_triage"
            )
            .eq("behavior_classification", behavior_classification.strip())
            .eq("is_public", True)
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
                    "dog_name": row.get("dog_name") or "Another dog",
                    "behavior_classification": row.get("behavior_classification"),
                    "update_text": row.get("update_text"),
                    "weeks_since_triage": row.get("weeks_since_triage"),
                }
            )
        return {"stories": out}
    except Exception:
        return {"stories": []}
