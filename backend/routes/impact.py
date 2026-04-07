from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter

from db import get_supabase
from routes.admin import (
    _count_total,
    _count_with_email,
    _paginate_select,
    _parse_result,
)

router = APIRouter(prefix="/impact", tags=["impact"])


@router.get("/public")
async def impact_public():
    """Public pilot metrics for marketing / transparency (no auth)."""
    supabase = get_supabase()
    now = datetime.now(timezone.utc)

    total_triages = _count_total(supabase)
    dogs_helped = _count_with_email(supabase)

    rows = _paginate_select(supabase, "result,week1_improvement_score,dog_still_home")
    behaviors: list[str] = []
    week1_scores: list[int] = []
    dog_home_answered = 0
    dog_still_home_true = 0

    for row in rows:
        r = _parse_result(row.get("result"))
        bc = str(r.get("behavior_classification") or "").strip()
        if bc:
            behaviors.append(bc)

        w1 = row.get("week1_improvement_score")
        if w1 is not None:
            try:
                n = int(w1)
                if 1 <= n <= 5:
                    week1_scores.append(n)
            except (TypeError, ValueError):
                pass

        dsh = row.get("dog_still_home")
        if dsh is not None:
            dog_home_answered += 1
            if dsh is True:
                dog_still_home_true += 1

    top_common = Counter(behaviors).most_common(1)
    top_behavior = top_common[0][0] if top_common else None
    behavior_breakdown = [
        {"behavior_classification": behavior, "count": count}
        for behavior, count in Counter(behaviors).most_common()
    ]

    avg_improvement = (
        round(sum(week1_scores) / len(week1_scores), 2) if week1_scores else None
    )

    retention_rate = (
        round(dog_still_home_true / dog_home_answered, 4) if dog_home_answered else None
    )

    return {
        "total_triages": total_triages,
        "dogs_helped": dogs_helped,
        "retention_rate": retention_rate,
        "top_behavior": top_behavior,
        "behavior_breakdown": behavior_breakdown,
        "avg_improvement": avg_improvement,
        "updated_at": now.isoformat(),
    }
