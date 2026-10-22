"""Quality review export, import, and agreement rates. No network, no Supabase."""

import csv
import io
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import routes.admin as admin
from main import app

PASSWORD = "test-password"
AUTH = {"X-Admin-Password": PASSWORD}
client = TestClient(app)


@pytest.fixture(autouse=True)
def admin_password(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", PASSWORD)


def use_db(monkeypatch, db):
    monkeypatch.setattr(admin, "get_supabase", lambda: db)
    return db


INTAKE = {
    "behavior_type": "Resource guarding",
    "behavior_intensity": 3,
    "dog_name": "=HYPERLINK(\"http://evil.example\")",
    "sudden_onset": False,
    "triggers": ["Food bowl", "Bones"],
    "duration": "2-6 months",
    "already_tried": "Hand feeding",
    "behavior_description": "Growls when my son walks past her bowl.",
    "email": "owner@example.com",
    "referral_source": "austin-pets-alive",
}
RESULT = {
    "severity": "red",
    "severity_label": "Get help this week",
    "behavior_classification": "Resource guarding",
    "root_cause": "She expects to lose the bowl.",
    "first_step": "Feed her behind a closed door.",
    "week_ahead": ["Day 1 to 2", "Day 3 to 5"],
    "honest_note": "Children near the bowl are the risk.",
    "escalation_needed": True,
    "escalation_reason": "child in the home",
}


class FakeTable:
    def __init__(self, db, name):
        self.db, self.name, self.ids, self.payload, self.window = db, name, None, None, None

    def range(self, start, end):
        self.window = (start, end + 1)
        return self

    @property
    def not_(self):
        return self

    def in_(self, column, ids):
        self.ids = list(ids)
        return self

    def upsert(self, payload, **kwargs):
        self.payload = payload
        self.db.upserts.append((self.name, payload, kwargs))
        return self

    def __getattr__(self, name):  # select, is_, order, eq, gte, limit
        return lambda *args, **kwargs: self

    def execute(self):
        if self.payload is not None:
            return SimpleNamespace(data=self.payload)
        rows = self.db.tables.get(self.name, [])
        if self.ids is not None:
            rows = [r for r in rows if r["id"] in self.ids]
        count = len(rows)
        if self.window:
            rows = rows[self.window[0]:self.window[1]]
        return SimpleNamespace(data=rows, count=count)


class FakeSupabase:
    def __init__(self, tables):
        self.tables, self.upserts = tables, []

    def table(self, name):
        return FakeTable(self, name)


def sessions(n: int) -> list[dict]:
    return [
        {"id": str(uuid.uuid4()), "created_at": "2026-10-01T12:00:00+00:00", "intake": INTAKE, "result": RESULT}
        for _ in range(n)
    ]


def test_review_routes_are_admin_only():
    assert client.get("/admin/reviews/sample").status_code == 401
    assert client.get("/admin/reviews/sample", headers={"X-Admin-Password": "stay2026"}).status_code == 401
    assert client.post("/admin/reviews", json={"reviewer": "Dr. Lee", "csv_text": "x"}).status_code == 401


def test_sample_is_30_distinct_completed_triages_as_csv(monkeypatch):
    db = FakeSupabase({"triage_sessions": sessions(45)})
    use_db(monkeypatch, db)
    res = client.get("/admin/reviews/sample", headers=AUTH)
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv"), res.text
    assert "attachment" in res.headers["content-disposition"]

    rows = list(csv.DictReader(io.StringIO(res.text)))
    assert list(rows[0]) == admin.REVIEW_COLUMNS
    assert len(rows) == 30 and len({r["session_id"] for r in rows}) == 30
    row = rows[0]
    assert row["severity"] == "red" and row["severity_label"] == "Get help this week"
    assert "Growls when my son walks past her bowl." in row["dog_profile"]
    assert "Refer to a professional: yes (child in the home)" in row["model_output"]
    assert row["verdict"] == "" and row["note"] == ""
    # The owner's contact details never leave, and a formula never runs.
    assert "owner@example.com" not in res.text and "austin-pets-alive" not in res.text
    assert row["dog_profile"].startswith("Dog: =HYPERLINK")  # inside text, not a cell start
    assert admin._csv_safe("=1+1") == "'=1+1" and admin._csv_safe("-2") == "'-2"


def test_sample_with_fewer_triages_than_30(monkeypatch):
    use_db(monkeypatch, FakeSupabase({"triage_sessions": sessions(4)}))
    rows = list(csv.DictReader(io.StringIO(client.get("/admin/reviews/sample", headers=AUTH).text)))
    assert len(rows) == 4
    use_db(monkeypatch, FakeSupabase({"triage_sessions": []}))
    assert client.get("/admin/reviews/sample", headers=AUTH).text.strip() == ",".join(admin.REVIEW_COLUMNS)


def test_dog_profile_leaves_out_what_was_never_asked():
    text = admin.dog_profile_summary({"behavior_type": "Barking"})
    assert "Sudden onset" not in text and "Intensity" not in text, text
    assert text.startswith("Dog: name not given")


def test_parse_review_csv():
    a, b, c = (str(uuid.uuid4()) for _ in range(3))
    text = "﻿" + "\n".join(
        [
            "session_id,verdict,note",
            f"{a},Agree,",
            f"{b},  ,",  # not reviewed yet
            f"{c},maybe,",
            "not-a-uuid,disagree,",
            f"{a},disagree,changed my mind",
        ]
    )
    rows, errors = admin.parse_review_csv(text)
    assert rows == [{"session_id": a, "verdict": "disagree", "note": "changed my mind"}], rows
    assert errors == [
        "Row 4: verdict must be agree or disagree, not 'maybe'.",
        "Row 5: session_id is missing or malformed.",
    ], errors
    assert admin.parse_review_csv("id,score\n1,2") == ([], ["The file needs session_id and verdict columns."])


def test_import_takes_severity_from_the_triage_not_the_file(monkeypatch):
    known = sessions(2)
    stranger = str(uuid.uuid4())
    db = FakeSupabase({"triage_sessions": known})
    use_db(monkeypatch, db)
    text = "\n".join(
        [
            "session_id,severity,verdict,note",
            f"{known[0]['id']},green,agree,",  # file claims green; the triage says red
            f"{known[1]['id']},red,disagree,Should be yellow",
            f"{stranger},red,agree,",
        ]
    )
    res = client.post("/admin/reviews", json={"reviewer": "  Dr. Lee ", "csv_text": text}, headers=AUTH)
    assert res.status_code == 200, res.text
    assert res.json() == {"saved": 2, "errors": [f"{stranger}: no completed triage with this id."]}
    (table, payload, kwargs), = db.upserts
    assert table == "triage_reviews" and kwargs == {"on_conflict": "session_id,reviewer"}
    assert [(p["severity"], p["verdict"], p["reviewer"]) for p in payload] == [
        ("red", "agree", "Dr. Lee"),
        ("red", "disagree", "Dr. Lee"),
    ], payload

    res = client.post("/admin/reviews", json={"reviewer": "   ", "csv_text": text}, headers=AUTH)
    assert res.status_code == 422  # a blank reviewer would collapse everyone together


def test_agreement_by_severity():
    rows = [
        {"severity": "red", "verdict": "agree"},
        {"severity": "red", "verdict": "disagree"},
        {"severity": "red", "verdict": "agree"},
        {"severity": "green", "verdict": "agree"},
    ]
    assert admin.agreement_by_severity(rows) == [
        {"severity": "green", "reviews": 1, "agree": 1, "rate": 1.0},
        {"severity": "yellow", "reviews": 0, "agree": 0, "rate": None},
        {"severity": "red", "reviews": 3, "agree": 2, "rate": 0.6667},
    ]
    with_unknown = admin.agreement_by_severity([{"severity": None, "verdict": "disagree"}])
    assert with_unknown[-1] == {"severity": "unknown", "reviews": 1, "agree": 0, "rate": 0.0}


def test_stats_page_past_1000_rows_and_carry_funnel_and_agreement(monkeypatch):
    rows = sessions(1500)
    db = FakeSupabase(
        {
            "triage_sessions": rows,
            "funnel_events": [{"session_id": "a", "event": "triage_started"}],
            "triage_reviews": [{"severity": "red", "verdict": "agree"}],
        }
    )
    use_db(monkeypatch, db)
    stats = client.get("/admin/stats", headers=AUTH).json()
    assert stats["total_triages"] == 1500
    assert stats["severity_breakdown"] == {"green": 0, "yellow": 0, "red": 1500}, stats
    assert stats["daily_triages"] == [{"date": "2026-10-01", "count": 1500}]
    assert stats["funnel"][0] == {"event": "triage_started", "count": 1, "from_previous": None}
    assert stats["review_agreement"][2] == {"severity": "red", "reviews": 1, "agree": 1, "rate": 1.0}

    shelter = client.get("/impact/shelter/austin-pets-alive").json()
    assert shelter["owners_helped"] == 1500 and shelter["average_severity_label"] == "High", shelter

