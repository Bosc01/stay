import json
import os
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from db import get_supabase

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "stay2026")

PAGE_SIZE = 1000


def _require_admin(x_admin_password: str | None) -> None:
    if not x_admin_password or x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _count_total(supabase) -> int:
    res = (
        supabase.table("triage_sessions")
        .select("id", count="exact")
        .limit(1)
        .execute()
    )
    return int(res.count or 0)


def _count_triages_since(supabase, iso_start: str) -> int:
    res = (
        supabase.table("triage_sessions")
        .select("id", count="exact")
        .gte("created_at", iso_start)
        .limit(1)
        .execute()
    )
    return int(res.count or 0)


def _count_with_email(supabase) -> int:
    res = (
        supabase.table("triage_sessions")
        .select("id", count="exact")
        .not_.is_("email", "null")
        .limit(1)
        .execute()
    )
    return int(res.count or 0)


def _paginate_select(supabase, columns: str):
    rows = []
    start = 0
    while True:
        res = (
            supabase.table("triage_sessions")
            .select(columns)
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def _parse_result(raw):
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


@router.get("/stats")
async def admin_stats(x_admin_password: str | None = Header(None)):
    _require_admin(x_admin_password)

    supabase = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()

    total_triages = _count_total(supabase)

    triages_today = _count_triages_since(supabase, today_start)

    with_email = _count_with_email(supabase)
    email_capture_rate = (with_email / total_triages) if total_triages else 0.0

    all_rows = _paginate_select(supabase, "result,week1_improvement_score,dog_still_home")

    severities = []
    behaviors = []
    week1_scores = []
    dog_home_answered = 0
    dog_still_home_true = 0

    for row in all_rows:
        r = _parse_result(row.get("result"))
        sev = str(r.get("severity") or "").lower().strip()
        if sev in ("green", "yellow", "red"):
            severities.append(sev)
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

    sev_counter = Counter(severities)
    denom = max(total_triages, 1)
    severity_breakdown = {
        "green": round(sev_counter["green"] / denom * 100, 1),
        "yellow": round(sev_counter["yellow"] / denom * 100, 1),
        "red": round(sev_counter["red"] / denom * 100, 1),
        "counts": {
            "green": sev_counter["green"],
            "yellow": sev_counter["yellow"],
            "red": sev_counter["red"],
            "unknown": max(0, total_triages - sum(sev_counter.values())),
        },
    }

    top_behaviors = [
        {"classification": name, "count": count}
        for name, count in Counter(behaviors).most_common(5)
    ]

    week1_improvement_average = (
        round(sum(week1_scores) / len(week1_scores), 2) if week1_scores else None
    )

    dog_retention_rate = (
        round(dog_still_home_true / dog_home_answered, 4) if dog_home_answered else None
    )

    return {
        "total_triages": total_triages,
        "triages_today": triages_today,
        "email_capture_rate": round(email_capture_rate, 4),
        "email_captured_count": with_email,
        "severity_breakdown": severity_breakdown,
        "top_behaviors": top_behaviors,
        "week1_improvement_average": week1_improvement_average,
        "week1_scores_count": len(week1_scores),
        "dog_retention_rate": dog_retention_rate,
        "dog_still_home_answered": dog_home_answered,
        "dog_still_home_true": dog_still_home_true,
        "updated_at": now.isoformat(),
    }
