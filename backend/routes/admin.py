import json
import os
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query

from db import get_supabase
from tasks.checkin import send_7day_checkins

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


def _count_by_ref(supabase, ref: str) -> int:
    res = (
        supabase.table("triage_sessions")
        .select("id", count="exact")
        .eq("referral_source", ref)
        .limit(1)
        .execute()
    )
    return int(res.count or 0)


def _paginate_select_by_ref(supabase, ref: str, columns: str):
    rows = []
    start = 0
    while True:
        res = (
            supabase.table("triage_sessions")
            .select(columns)
            .eq("referral_source", ref)
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def _severity_numeric(sev: str) -> int | None:
    s = str(sev or "").lower().strip()
    if s == "green":
        return 1
    if s == "yellow":
        return 2
    if s == "red":
        return 3
    return None


def _average_severity_label(avg: float) -> str:
    if avg < 1.67:
        return "Low"
    if avg < 2.34:
        return "Moderate"
    return "High"


def _shelter_impact_stats(ref: str) -> dict:
    supabase = get_supabase()
    owners_helped = _count_by_ref(supabase, ref)
    rows = _paginate_select_by_ref(supabase, ref, "result,dog_still_home")

    scores: list[int] = []
    dogs_still_home = 0
    follow_up_answered = 0

    for row in rows:
        r = _parse_result(row.get("result"))
        n = _severity_numeric(r.get("severity"))
        if n is not None:
            scores.append(n)

        dsh = row.get("dog_still_home")
        if dsh is not None:
            follow_up_answered += 1
            if dsh is True:
                dogs_still_home += 1

    avg_score = round(sum(scores) / len(scores), 2) if scores else None
    avg_label = _average_severity_label(avg_score) if avg_score is not None else None

    return {
        "ref": ref,
        "owners_helped": owners_helped,
        "average_severity_score": avg_score,
        "average_severity_label": avg_label,
        "dogs_still_home": dogs_still_home,
        "follow_up_answered": follow_up_answered,
        "has_follow_up_data": follow_up_answered > 0,
    }


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


def _created_at_date_utc(value) -> str | None:
    """Return YYYY-MM-DD in UTC for daily triage grouping."""
    if value is None:
        return None
    try:
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.date().isoformat()
    except (TypeError, ValueError):
        return None


@router.get("/send-checkins")
async def admin_send_checkins(x_admin_password: str | None = Header(None)):
    """Manually trigger 7-day follow-up emails (due rows only)."""
    _require_admin(x_admin_password)
    return send_7day_checkins()


@router.get("/stats")
async def admin_stats(
    ref: str | None = Query(None, max_length=128),
    x_admin_password: str | None = Header(None),
):
    ref_clean = (ref or "").strip()
    if ref_clean:
        return _shelter_impact_stats(ref_clean)

    _require_admin(x_admin_password)

    supabase = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()

    total_triages = _count_total(supabase)

    triages_today = _count_triages_since(supabase, today_start)

    with_email = _count_with_email(supabase)
    email_capture_rate = (with_email / total_triages) if total_triages else 0.0

    all_rows = _paginate_select(
        supabase, "result,week1_improvement_score,dog_still_home,created_at"
    )

    sev_counter: Counter = Counter()
    behavior_counter: Counter = Counter()
    daily_counter: Counter = Counter()
    week1_scores = []
    dog_home_answered = 0
    dog_still_home_true = 0

    for row in all_rows:
        r = _parse_result(row.get("result"))
        sev = str(r.get("severity") or "").lower().strip()
        if sev in ("green", "yellow", "red"):
            sev_counter[sev] += 1
        bc = str(r.get("behavior_classification") or "").strip()
        if bc:
            behavior_counter[bc] += 1

        day = _created_at_date_utc(row.get("created_at"))
        if day:
            daily_counter[day] += 1

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

    severity_breakdown = {
        "green": int(sev_counter["green"]),
        "yellow": int(sev_counter["yellow"]),
        "red": int(sev_counter["red"]),
    }

    behavior_breakdown = [
        {"classification": name, "count": count}
        for name, count in behavior_counter.most_common()
    ]

    daily_triages = [
        {"date": d, "count": c} for d, c in sorted(daily_counter.items())
    ]

    week1_improvement_average = (
        round(sum(week1_scores) / len(week1_scores), 2) if week1_scores else None
    )

    dog_retention_rate = (
        round(dog_still_home_true / dog_home_answered, 4) if dog_home_answered else None
    )

    recent_user_interviews: list[dict] = []
    try:
        iv_res = (
            supabase.table("user_interviews")
            .select("id,session_id,q1,q2,q3,created_at")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        recent_user_interviews = list(iv_res.data or [])
    except Exception as e:
        print(f"[admin] user_interviews fetch skipped: {e}")

    return {
        "total_triages": total_triages,
        "triages_today": triages_today,
        "email_capture_rate": round(email_capture_rate, 4),
        "email_captured_count": with_email,
        "behavior_breakdown": behavior_breakdown,
        "severity_breakdown": severity_breakdown,
        "daily_triages": daily_triages,
        "week1_improvement_average": week1_improvement_average,
        "week1_scores_count": len(week1_scores),
        "dog_retention_rate": dog_retention_rate,
        "dog_still_home_answered": dog_home_answered,
        "dog_still_home_true": dog_still_home_true,
        "recent_user_interviews": recent_user_interviews,
        "updated_at": now.isoformat(),
    }
