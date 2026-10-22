"""Funnel event logging and the dashboard funnel. No network, no Supabase, no Claude."""

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import ratelimit
import routes.events as events
import routes.followup as followup
import routes.triage as triage
from conftest import sample_intake
from main import app
from models import TriageIntake, TriageResult

RESULT = TriageResult(
    severity="yellow",
    severity_label="Try this first",
    behavior_classification="Fear-based reactivity",
    root_cause="Rosie is scared of other dogs at close range.",
    first_step="Toss chicken from 8 feet for 3 minutes, once a day.",
    week_ahead=["Day 1 to 2", "Day 3 to 5", "Day 6 to 7"],
    honest_note="If a dog rounds the corner at 4 feet, you lose the session.",
    escalation_needed=False,
    escalation_reason=None,
    resource_tags=["trainer"],
)


class FakeQuery:
    """Enough of the Supabase query builder for these routes."""

    def __init__(self, data=None, error: Exception | None = None):
        self.data, self.error = data, error

    def __getattr__(self, name):  # table, select, eq, limit, update, insert
        return lambda *args, **kwargs: self

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data=self.data)


def fake_supabase(data=None, error=None):
    return lambda: FakeQuery(data, error)


@pytest.fixture
def logged(monkeypatch):
    """Every funnel event the routes log, as (session_id, event)."""
    calls: list[tuple[str, str]] = []
    record = lambda session_id, event: calls.append((session_id, event))  # noqa: E731
    for module in (events, triage, followup):
        monkeypatch.setattr(module, "log_event", record)
    return calls


@pytest.fixture
def api():
    return TestClient(app)


def test_funnel_summary_is_strict_and_skips_sessions_started_elsewhere():
    rows = [
        *({"session_id": s, "event": "triage_started"} for s in "abcd"),
        *({"session_id": s, "event": "triage_completed"} for s in "abcx"),
        *({"session_id": s, "event": "email_signup"} for s in "ab"),
        {"session_id": "a", "event": "return_visit_7d"},
        {"session_id": "c", "event": "return_visit_7d"},  # no email, so not counted
    ]
    steps = events.funnel_summary(rows)
    assert [s["event"] for s in steps] == list(events.FUNNEL_STEPS)
    assert [s["count"] for s in steps] == [4, 3, 2, 1]
    assert [s["from_previous"] for s in steps] == [None, 0.75, 0.6667, 0.5]


def test_funnel_summary_with_no_rows():
    steps = events.funnel_summary([])
    assert [s["count"] for s in steps] == [0, 0, 0, 0]
    assert all(s["from_previous"] is None for s in steps)


def test_return_window_is_days_one_through_seven():
    now = datetime(2026, 10, 22, 15, 0, tzinfo=timezone.utc)
    assert not events.is_return_visit("2026-10-22T01:00:00+00:00", now)  # same day
    assert events.is_return_visit("2026-10-21T23:59:00Z", now)
    assert events.is_return_visit((now - timedelta(days=7)).isoformat(), now)
    assert not events.is_return_visit((now - timedelta(days=8)).isoformat(), now)
    assert not events.is_return_visit("not a date", now)


def test_events_endpoint(api, logged, monkeypatch):
    sid = str(uuid.uuid4())
    assert api.post("/events", json={"session_id": "nope", "event": "visit"}).status_code == 422
    assert api.post("/events", json={"session_id": sid, "event": "email_signup"}).status_code == 422

    assert api.post("/events", json={"session_id": sid.upper(), "event": "triage_started"}).status_code == 204
    assert logged == [(sid, "triage_started")]  # stored in canonical form

    three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    for completed, expected in (
        ([{"created_at": three_days_ago}], [(sid, "return_visit_7d")]),
        ([{"created_at": datetime.now(timezone.utc).isoformat()}], []),  # same visit
        ([], []),  # never completed
    ):
        logged.clear()
        monkeypatch.setattr(events, "get_supabase", fake_supabase(completed))
        assert api.post("/events", json={"session_id": sid, "event": "visit"}).status_code == 204
        assert logged == expected, completed

    logged.clear()
    monkeypatch.setattr(events, "get_supabase", fake_supabase(error=RuntimeError("relation does not exist")))
    assert api.post("/events", json={"session_id": sid, "event": "visit"}).status_code == 204
    assert logged == []


def test_starts_are_rate_limited_per_client_but_visits_are_not(api, logged, monkeypatch):
    monkeypatch.setattr(events, "get_supabase", fake_supabase([]))
    codes = [
        api.post("/events", json={"session_id": str(uuid.uuid4()), "event": "triage_started"}).status_code
        for _ in range(ratelimit.RATE_LIMIT + 1)
    ]
    assert codes == [204] * ratelimit.RATE_LIMIT + [429]
    assert len(logged) == ratelimit.RATE_LIMIT
    assert api.post("/events", json={"session_id": str(uuid.uuid4()), "event": "visit"}).status_code == 204
    # The start allowance is its own bucket, so the owner can still triage.
    assert set(ratelimit._rate_limit) == {"events:testclient"}


def test_triage_keeps_the_browser_session_id(api, logged, monkeypatch):
    seen = {}

    def fake_run(intake, dry_run=False, session_id=None):
        seen["session_id"] = session_id
        return RESULT, session_id

    monkeypatch.setattr(triage, "run_triage", fake_run)
    sid = str(uuid.uuid4())

    res = api.post("/triage", json=sample_intake(session_id=sid))
    assert res.status_code == 200 and res.json()["session_id"] == sid
    assert seen["session_id"] == sid and logged == [(sid, "triage_completed")]

    logged.clear()
    minted = api.post("/triage", json=sample_intake(session_id="not-a-uuid")).json()["session_id"]
    assert minted != "not-a-uuid" and str(uuid.UUID(minted)) == minted
    assert logged == [(minted, "triage_completed")]


def test_a_session_that_was_never_stored_does_not_count(api, logged, monkeypatch):
    monkeypatch.setattr(triage, "run_triage", lambda intake, dry_run=False, session_id=None: (RESULT, None))
    assert api.post("/triage", json=sample_intake(session_id=str(uuid.uuid4()))).status_code == 200
    assert logged == []


def test_the_session_id_never_reaches_the_prompt_or_the_stored_intake():
    intake = TriageIntake(**sample_intake(session_id=str(uuid.uuid4())))
    assert "session_id" not in intake.model_dump()


def test_email_signup_is_logged_only_when_saved(api, logged, monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)  # no welcome email
    monkeypatch.setattr(followup, "_ensure_follow_up_7_day_at", lambda session_id: None)
    sid = str(uuid.uuid4())
    body = {"session_id": sid, "email": "owner@example.com"}

    monkeypatch.setattr(followup, "get_supabase", fake_supabase([{"id": sid}]))
    assert api.post("/followup", json=body).status_code == 200
    assert logged == [(sid, "email_signup")]

    logged.clear()
    monkeypatch.setattr(followup, "get_supabase", fake_supabase(error=RuntimeError("connection refused")))
    assert api.post("/followup", json=body).status_code == 200
    assert logged == []

    logged.clear()
    monkeypatch.setattr(followup, "get_supabase", fake_supabase([{"id": sid}]))
    assert api.post("/followup", json={"session_id": sid, "dog_still_home": True}).status_code == 200
    assert logged == []  # a survey answer is not a signup
