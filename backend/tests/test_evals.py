"""The eval harness itself is tested, so only the model run costs money."""

from evals.cases import CASES, SAFETY_CASES, EvalCase
from evals.runner import format_report, score_case, summarize


def red_result(**overrides) -> dict:
    result = {
        "severity": "red",
        "severity_label": "Professional help is the first step",
        "behavior_classification": "Learned aggression / bite history",
        "root_cause": "Cause",
        "first_step": "Contact a certified behavior consultant this week.",
        "week_ahead": ["a", "b", "c"],
        "honest_note": "Note",
        "escalation_needed": True,
        "escalation_reason": "A bite broke skin.",
        "resource_tags": ["certified_trainer"],
    }
    result.update(overrides)
    return result


def bite_case() -> EvalCase:
    return next(c for c in CASES if c.id == "bite_broke_skin")


def test_a_correct_red_passes():
    outcome = score_case(bite_case(), red_result())

    assert outcome.passed
    assert outcome.failures == []
    assert outcome.safety_critical


def test_wrong_severity_fails():
    outcome = score_case(bite_case(), red_result(severity="yellow"))

    assert not outcome.passed
    assert "severity was yellow" in outcome.failures[0]


def test_missing_escalation_flag_fails():
    outcome = score_case(bite_case(), red_result(escalation_needed=False))

    assert not outcome.passed
    assert any("escalation_needed" in f for f in outcome.failures)


def test_safety_case_needs_a_stated_reason():
    outcome = score_case(bite_case(), red_result(escalation_reason=""))

    assert not outcome.passed
    assert any("escalation_reason" in f for f in outcome.failures)


def test_missing_resource_tag_fails():
    case = next(c for c in CASES if c.id == "sudden_onset_flag")
    result = red_result(severity="green", escalation_needed=False, resource_tags=[])

    outcome = score_case(case, result)
    assert not outcome.passed
    assert any("low_cost_vet" in f for f in outcome.failures)


def test_resource_tag_match_is_case_insensitive():
    case = next(c for c in CASES if c.id == "sudden_onset_flag")
    result = red_result(
        severity="green", escalation_needed=False, resource_tags=["LOW_COST_VET"]
    )

    assert score_case(case, result).passed


def test_either_acceptable_severity_passes():
    case = next(c for c in CASES if c.id == "leash_pulling")

    for severity in ("green", "yellow"):
        result = red_result(severity=severity, escalation_needed=False)
        assert score_case(case, result).passed, severity


def test_aversive_language_is_an_advisory_not_a_failure():
    """'Never use a shock collar' is correct advice, so this cannot auto fail."""
    outcome = score_case(
        bite_case(),
        red_result(honest_note="Do not use a shock collar, it makes this worse."),
    )

    assert outcome.passed
    assert outcome.advisories


def test_missing_severity_is_reported_not_crashed():
    outcome = score_case(bite_case(), {"escalation_needed": True})

    assert not outcome.passed
    assert outcome.severity is None


def test_summary_counts_and_safety_recall():
    outcomes = [
        score_case(bite_case(), red_result()),
        score_case(bite_case(), red_result(severity="green")),
    ]
    summary = summarize(outcomes)

    assert summary["total"] == 2
    assert summary["passed"] == 1
    assert summary["pass_rate"] == 0.5
    assert summary["safety_recall"] == 0.5


def test_report_renders_failures_and_notes():
    outcomes = [score_case(bite_case(), red_result(severity="green"))]
    text = format_report(outcomes, summarize(outcomes))

    assert "FAIL" in text
    assert "bite_broke_skin" in text
    assert "safety recall" in text


def test_every_case_declares_intent():
    for case in CASES:
        assert case.expect_severity, case.id
        assert case.expect_severity <= {"green", "yellow", "red"}, case.id
        assert case.rationale, case.id
        assert case.intake.get("behavior_type"), case.id


def test_safety_cases_are_unambiguous_and_present():
    """A safety case that accepts more than one severity is not a safety case."""
    assert len(SAFETY_CASES) >= 3
    for case in SAFETY_CASES:
        assert case.expect_severity == {"red"}, case.id
        assert case.expect_escalation is True, case.id
