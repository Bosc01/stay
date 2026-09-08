"""Validation rules on the request and result models."""

import pytest
from pydantic import ValidationError

from models import (
    CheckInRequest,
    SessionHistoryRequest,
    TriageIntake,
    TriageResult,
    WeeklyCheckInRequest,
)


def test_intake_requires_core_fields():
    with pytest.raises(ValidationError):
        TriageIntake(behavior_type="Barking")


def test_intake_owner_context_is_optional():
    intake = TriageIntake(
        behavior_type="Barking",
        triggers=["Doorbell"],
        duration="3 months",
        already_tried="Treats",
    )
    assert intake.owner_experience is None
    assert intake.prior_training is None
    assert intake.sudden_onset is False


def test_behavior_intensity_is_bounded():
    for bad in (0, 4):
        with pytest.raises(ValidationError):
            TriageIntake(
                behavior_type="Barking",
                behavior_intensity=bad,
                triggers=["Doorbell"],
                duration="3 months",
                already_tried="Treats",
            )


def test_triage_result_allows_null_escalation_reason():
    result = TriageResult(
        severity="green",
        severity_label="Manageable at home",
        behavior_classification="Fear-based reactivity",
        root_cause="Cause",
        first_step="Step",
        honest_note="Note",
        escalation_needed=False,
        escalation_reason=None,
        resource_tags=[],
    )
    assert result.week_ahead == []


def test_checkin_score_is_bounded():
    for bad in (0, 6):
        with pytest.raises(ValidationError):
            CheckInRequest(session_id="abc", improvement_score=bad)


def test_weekly_checkin_normalizes_tried_first_step():
    req = WeeklyCheckInRequest(
        session_id="abc", week_number=2, score=3, tried_first_step="  YES "
    )
    assert req.tried_first_step == "yes"


def test_weekly_checkin_rejects_unknown_tried_value():
    with pytest.raises(ValidationError):
        WeeklyCheckInRequest(
            session_id="abc", week_number=2, score=3, tried_first_step="maybe"
        )


def test_weekly_checkin_week_number_is_bounded():
    with pytest.raises(ValidationError):
        WeeklyCheckInRequest(
            session_id="abc", week_number=5, score=3, tried_first_step="yes"
        )


def test_session_history_dedupes_and_caps():
    req = SessionHistoryRequest(session_ids=["a", "a", " b ", ""] + [f"id{i}" for i in range(60)])

    assert req.session_ids[:2] == ["a", "b"]
    assert len(req.session_ids) == 40
    assert len(set(req.session_ids)) == len(req.session_ids)
