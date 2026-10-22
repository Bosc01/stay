import csv
import io
import json
import logging
import os
import random
import secrets
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException, Query, Response

from db import get_supabase
from models import OutreachUpdate, ReviewImport
from routes.events import funnel_summary, utc_date
from tasks.checkin import send_7day_checkins

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

PAGE_SIZE = 1000
FUNNEL_WINDOW_DAYS = 30
REVIEW_SAMPLE_SIZE = 30
REVIEW_MAX_IMPORT_ROWS = 200
REVIEW_COLUMNS = [
    "session_id", "created_at", "severity", "severity_label",
    "dog_profile", "model_output", "verdict", "note",
]
SEVERITY_LEVELS = ("green", "yellow", "red")


def _admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "").strip()


def _require_admin(x_admin_password: str | None) -> None:
    configured = _admin_password()
    if not configured:
        # Fail closed. With no password set, the admin surface stays locked
        # rather than falling back to a default anyone could read in this repo.
        raise HTTPException(
            status_code=503,
            detail="Admin access is not configured on this server.",
        )
    if not x_admin_password:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Constant time compare so a wrong password does not leak its prefix length.
    if not secrets.compare_digest(
        x_admin_password.encode("utf-8"), configured.encode("utf-8")
    ):
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
    """Every triage_sessions row with the given columns (also used by impact.py)."""
    return _fetch_all(lambda: supabase.table("triage_sessions").select(columns).order("id"))


def _fetch_all(make_query) -> list[dict]:
    """Every row of a query, a page at a time. make_query builds a fresh query
    each call, because a range on a reused builder stacks up."""
    rows = []
    start = 0
    while True:
        batch = make_query().range(start, start + PAGE_SIZE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def _count_by_ref(supabase, ref: str) -> int:
    res = (
        supabase.table("triage_sessions")
        .select("id", count="exact")
        .eq("referral_source", ref)
        .limit(1)
        .execute()
    )
    return int(res.count or 0)


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
    rows = _fetch_all(
        lambda: supabase.table("triage_sessions")
        .select("result,dog_still_home")
        .eq("referral_source", ref)
        .order("id")
    )

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
    day = utc_date(value)
    return day.isoformat() if day else None


@router.get("/send-checkins")
def admin_send_checkins(
    dry_run: bool = Query(False),
    x_admin_password: str | None = Header(None),
):
    """Manually trigger 7-day follow-up emails (due rows only)."""
    _require_admin(x_admin_password)
    return send_7day_checkins(dry_run=dry_run)


@router.get("/stats")
def admin_stats(x_admin_password: str | None = Header(None)):
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
        logger.warning("user_interviews fetch skipped: %s", e)

    # Sessions that started in the window; their later steps fall inside it too.
    funnel = None
    try:
        since = (now - timedelta(days=FUNNEL_WINDOW_DAYS)).isoformat()
        funnel = funnel_summary(
            _fetch_all(
                lambda: supabase.table("funnel_events")
                .select("session_id,event")
                .gte("created_at", since)
                .order("id")
            )
        )
    except Exception as e:
        logger.warning("funnel_events fetch skipped: %s", e)

    review_agreement = None
    try:
        review_agreement = agreement_by_severity(
            _fetch_all(
                lambda: supabase.table("triage_reviews").select("severity,verdict").order("id")
            )
        )
    except Exception as e:
        logger.warning("triage_reviews fetch skipped: %s", e)

    return {
        "funnel": funnel,
        "funnel_window_days": FUNNEL_WINDOW_DAYS,
        "review_agreement": review_agreement,
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


OUTREACH_COLUMNS = (
    "id,org_name,city,website,contact_name,contact_title,contact_email,"
    "specific_detail,detail_source_url,status,drafted_body,sent_at,replied_at,created_at"
)


@router.get("/outreach")
def list_outreach_targets(
    status: str | None = Query(None, max_length=32),
    x_admin_password: str | None = Header(None),
):
    """Drafted outreach with the research attached, newest first."""
    _require_admin(x_admin_password)

    try:
        query = (
            get_supabase()
            .table("outreach_targets")
            .select(OUTREACH_COLUMNS)
            .order("created_at", desc=True)
            .limit(PAGE_SIZE)
        )
        if status:
            query = query.eq("status", status.strip().lower())
        res = query.execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"targets": list(res.data or [])}


@router.patch("/outreach/{target_id}")
def update_outreach_target(
    target_id: str,
    body: OutreachUpdate,
    x_admin_password: str | None = Header(None),
):
    _require_admin(x_admin_password)

    update_data = body.model_dump(exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if update_data.get("status") == "sent":
        update_data["sent_at"] = datetime.now(timezone.utc).isoformat()

    try:
        res = (
            get_supabase()
            .table("outreach_targets")
            .update(update_data)
            .eq("id", target_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Target not found")

    return {"status": "ok", "target": res.data[0]}


# --- Quality review: a trainer or vet marks sampled triages agree or disagree.


def dog_profile_summary(intake: dict) -> str:
    """What a reviewer needs to judge the call, one fact per line.

    The owner's email and referral source stay out. A field the intake never
    captured is left out rather than shown as "no".
    """
    name = str(intake.get("dog_name") or "").strip()
    lines = [f"Dog: {name}" if name else "Dog: name not given"]
    if intake.get("behavior_type"):
        lines.append(f"Behavior: {intake['behavior_type']}")
    if intake.get("behavior_intensity") is not None:
        lines.append(f"Intensity: {intake['behavior_intensity']} of 3")
    if intake.get("sudden_onset") is not None:
        lines.append(f"Sudden onset: {'yes' if intake['sudden_onset'] else 'no'}")
    triggers = intake.get("triggers") or []
    if triggers:
        lines.append("Triggers: " + ", ".join(str(t) for t in triggers))
    for key, label in (
        ("duration", "Going on for"),
        ("already_tried", "Already tried"),
        ("owner_experience", "Owner experience"),
        ("prior_training", "Prior training"),
        ("behavior_description", "In the owner's words"),
    ):
        value = str(intake.get(key) or "").strip()
        if value:
            lines.append(f"{label}: {value}")
    return "\n".join(lines)


def model_output_text(result: dict) -> str:
    lines = []
    for key, label in (
        ("behavior_classification", "Classification"),
        ("root_cause", "Root cause"),
        ("first_step", "First step"),
        ("honest_note", "Honest note"),
    ):
        value = str(result.get(key) or "").strip()
        if value:
            lines.append(f"{label}: {value}")
    week = result.get("week_ahead") or []
    if week:
        lines.append("Week ahead: " + " | ".join(str(w) for w in week))
    if result.get("escalation_needed") is not None:
        escalation = "yes" if result["escalation_needed"] else "no"
        reason = str(result.get("escalation_reason") or "").strip()
        lines.append(f"Refer to a professional: {escalation}" + (f" ({reason})" if reason else ""))
    return "\n".join(lines)


def _csv_safe(value) -> str:
    """Owners write the dog name and description, so a cell that a spreadsheet
    would run as a formula gets a leading quote."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def review_sample_csv(rows: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(REVIEW_COLUMNS)
    for row in rows:
        intake = _parse_result(row.get("intake"))
        result = _parse_result(row.get("result"))
        writer.writerow(
            _csv_safe(value)
            for value in (
                row.get("id"),
                row.get("created_at"),
                result.get("severity"),
                result.get("severity_label"),
                dog_profile_summary(intake),
                model_output_text(result),
                "",
                "",
            )
        )
    return out.getvalue()


def parse_review_csv(text: str) -> tuple[list[dict], list[str]]:
    """Marked rows and readable errors. Rows with a blank verdict were not
    reviewed and are skipped. Row numbers match the spreadsheet."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    if not {"session_id", "verdict"} <= set(reader.fieldnames or []):
        return [], ["The file needs session_id and verdict columns."]

    by_session: dict[str, dict] = {}
    errors = []
    for row_number, row in enumerate(reader, start=2):
        verdict = str(row.get("verdict") or "").strip().lower()
        if not verdict:
            continue
        if verdict not in ("agree", "disagree"):
            errors.append(f"Row {row_number}: verdict must be agree or disagree, not {verdict!r}.")
            continue
        try:
            session_id = str(uuid.UUID(str(row.get("session_id") or "").strip()))
        except ValueError:
            errors.append(f"Row {row_number}: session_id is missing or malformed.")
            continue
        # A session listed twice keeps its last verdict.
        by_session[session_id] = {
            "session_id": session_id,
            "verdict": verdict,
            "note": str(row.get("note") or "").strip() or None,
        }
    return list(by_session.values()), errors


def agreement_by_severity(reviews: list[dict]) -> list[dict]:
    """Agree share per severity. rate is None for a level with no reviews; an
    "unknown" level appears only when some review has no severity."""
    tally = {level: [0, 0] for level in SEVERITY_LEVELS}
    for review in reviews:
        level = str(review.get("severity") or "").strip().lower() or "unknown"
        if level not in tally:
            tally[level] = [0, 0]
        tally[level][1] += 1
        if review.get("verdict") == "agree":
            tally[level][0] += 1
    return [
        {
            "severity": level,
            "reviews": total,
            "agree": agree,
            "rate": round(agree / total, 4) if total else None,
        }
        for level, (agree, total) in tally.items()
    ]


@router.get("/reviews/sample")
def review_sample(x_admin_password: str | None = Header(None)):
    """REVIEW_SAMPLE_SIZE random completed triages as CSV, ready to mark."""
    _require_admin(x_admin_password)
    try:
        supabase = get_supabase()
        ids = [
            row["id"]
            for row in _fetch_all(
                lambda: supabase.table("triage_sessions")
                .select("id")
                .not_.is_("result", "null")
                .order("id")
            )
        ]
        picked = random.sample(ids, min(REVIEW_SAMPLE_SIZE, len(ids)))
        rows = (
            supabase.table("triage_sessions")
            .select("id,created_at,intake,result")
            .in_("id", picked)
            .execute()
            .data
            or []
        ) if picked else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    filename = f"stay-review-sample-{datetime.now(timezone.utc).date().isoformat()}.csv"
    return Response(
        review_sample_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/reviews")
def import_reviews(body: ReviewImport, x_admin_password: str | None = Header(None)):
    """Store verdicts from a marked review CSV. The severity comes from the
    stored triage, not from the file, so an edited cell cannot move a verdict."""
    _require_admin(x_admin_password)

    rows, errors = parse_review_csv(body.csv_text)
    if len(rows) > REVIEW_MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"At most {REVIEW_MAX_IMPORT_ROWS} marked rows per upload.",
        )
    if not rows:
        return {"saved": 0, "errors": errors or ["No rows were marked agree or disagree."]}

    try:
        supabase = get_supabase()
        found = (
            supabase.table("triage_sessions")
            .select("id,result")
            .in_("id", [r["session_id"] for r in rows])
            .execute()
            .data
            or []
        )
        severity = {}
        for f in found:
            result = _parse_result(f.get("result"))
            if result:
                severity[str(f["id"])] = str(result.get("severity") or "").strip().lower() or None

        to_save = []
        for r in rows:
            if r["session_id"] not in severity:
                errors.append(f"{r['session_id']}: no completed triage with this id.")
                continue
            to_save.append({**r, "reviewer": body.reviewer, "severity": severity[r["session_id"]]})

        if to_save:
            supabase.table("triage_reviews").upsert(
                to_save, on_conflict="session_id,reviewer"
            ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"saved": len(to_save), "errors": errors}
