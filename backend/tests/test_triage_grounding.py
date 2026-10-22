"""Knowledge retrieval and cost-aware routing. No network, no Supabase."""

import json
from types import SimpleNamespace

from conftest import flatten_system
from models import TriageIntake
from retrieval import (
    _DOCS,
    BASELINE,
    MAX_SOURCES,
    format_reference_block,
    select_sources,
)
import routes.triage as triage
from routes.triage import needs_deeper_reasoning

VALID_RESULT = {
    "severity": "yellow",
    "severity_label": "Try this first",
    "behavior_classification": "Fear-based reactivity",
    "root_cause": "Rosie is scared of other dogs at close range.",
    "first_step": "Toss chicken from 8 feet for 3 minutes, once a day.",
    "week_ahead": ["Day 1 to 2", "Day 3 to 5", "Day 6 to 7"],
    "honest_note": "If a dog rounds the corner at 4 feet, you lose the session.",
    "escalation_needed": False,
    "escalation_reason": None,
    "resource_tags": ["trainer"],
}


class FakeMessages:
    """Records the request and replays a canned response."""

    def __init__(self, blocks):
        self.blocks = blocks
        self.params = None

    def create(self, **params):
        self.params = params
        return SimpleNamespace(
            content=self.blocks,
            usage=SimpleNamespace(input_tokens=1, output_tokens=1),
        )


def fake_client(blocks):
    return SimpleNamespace(messages=FakeMessages(blocks))


def text_block(payload):
    return SimpleNamespace(type="text", text=json.dumps(payload))


def thinking_block():
    return SimpleNamespace(type="thinking", thinking="considering severity")



def intake(**overrides) -> TriageIntake:
    base = {
        "behavior_type": "Reactivity (barking, pulling on leash at other dogs/people)",
        "triggers": ["Other dogs"],
        "duration": "2-6 months",
        "already_tried": "Treats on walks",
    }
    base.update(overrides)
    return TriageIntake(**base)


def test_knowledge_base_loads():
    assert _DOCS, "no knowledge files loaded"
    assert BASELINE in _DOCS
    for slug, doc in _DOCS.items():
        assert doc.url.startswith("https://"), slug
        assert doc.org, slug
        assert doc.name, slug
        assert len(doc.body) > 200, f"{slug} excerpt looks empty"


def test_baseline_is_always_present_and_last():
    for case in (
        intake(),
        intake(behavior_type="House soiling / potty issues"),
        intake(behavior_type="Other", triggers=["No clear trigger"]),
        # Enough matches to fill the cap on their own.
        intake(
            behavior_type="Aggression (biting, growling, lunging)",
            behavior_intensity=3,
            sudden_onset=True,
            triggers=["Children", "Food or treats nearby"],
        ),
    ):
        docs = select_sources(case)
        assert docs, "no sources selected"
        assert docs[-1].slug == BASELINE, [d.slug for d in docs]


def test_behavior_routes_to_its_own_source():
    cases = {
        "Aggression (biting, growling, lunging)": "aspca-aggression",
        "Resource guarding (food, toys, space)": "aspca-food-guarding",
        "Reactivity (barking, pulling on leash at other dogs/people)": (
            "aspca-barking-and-reactivity"
        ),
    }
    for behavior, expected in cases.items():
        slugs = [d.slug for d in select_sources(intake(behavior_type=behavior))]
        assert slugs[0] == expected, f"{behavior} -> {slugs}"


def test_left_alone_trigger_pulls_separation_anxiety():
    slugs = [d.slug for d in select_sources(intake(triggers=["Being left alone"]))]
    assert "aspca-separation-anxiety" in slugs, slugs


def test_sudden_onset_pulls_medical_source():
    slugs = [d.slug for d in select_sources(intake(sudden_onset=True))]
    assert "aspca-medical-causes-of-behavior-change" in slugs, slugs


def test_source_count_is_capped_and_deduped():
    # Every rule fires at once: aggression, guarding, alone, severe, sudden onset.
    docs = select_sources(
        intake(
            behavior_type="Aggression (biting, growling, lunging)",
            behavior_intensity=3,
            sudden_onset=True,
            triggers=["Being left alone", "Food or treats nearby"],
        )
    )
    slugs = [d.slug for d in docs]
    assert len(slugs) <= MAX_SOURCES, slugs
    assert len(slugs) == len(set(slugs)), slugs


def test_reference_block_carries_the_excerpt_text():
    docs = select_sources(intake())
    block = format_reference_block(docs)
    for doc in docs:
        assert doc.name in block
        assert doc.body[:60] in block


def test_escalation_only_for_high_stakes_cases():
    assert not needs_deeper_reasoning(intake())
    assert not needs_deeper_reasoning(intake(behavior_intensity=2))
    assert needs_deeper_reasoning(intake(sudden_onset=True))
    assert needs_deeper_reasoning(intake(behavior_intensity=3))
    assert needs_deeper_reasoning(
        intake(behavior_type="Aggression (biting, growling, lunging)")
    )


def run_with_fake(case, blocks):
    original = triage.client
    triage.client = fake_client(blocks)
    try:
        result, session_id = triage.run_triage(case, dry_run=True)
        return result, session_id, triage.client.messages.params
    finally:
        triage.client = original


def test_thinking_path_reads_past_the_thinking_block():
    case = intake(behavior_type="Aggression (biting, growling, lunging)")
    result, session_id, params = run_with_fake(
        case, [thinking_block(), text_block(VALID_RESULT)]
    )
    assert params["thinking"] == {"type": "adaptive"}
    assert params["max_tokens"] == triage.MAX_TOKENS_THINKING
    assert result.first_step == VALID_RESULT["first_step"]
    assert session_id is None, "dry_run must not write a session"


def test_standard_path_turns_thinking_off():
    # Sonnet 5 thinks when the parameter is omitted, so off has to be explicit.
    result, _, params = run_with_fake(intake(), [text_block(VALID_RESULT)])
    assert params["thinking"] == {"type": "disabled"}
    assert params["max_tokens"] == triage.MAX_TOKENS
    assert result.first_step == VALID_RESULT["first_step"]


def test_excerpts_reach_the_system_prompt():
    case = intake()
    _, _, params = run_with_fake(case, [text_block(VALID_RESULT)])
    system = flatten_system(params["system"])
    assert "## Reference material" in system
    for doc in select_sources(case):
        assert doc.name in system


def test_sources_come_from_retrieval_not_the_model():
    case = intake()
    invented = dict(VALID_RESULT)
    invented["sources"] = [
        {"name": "Made up study", "org": "Nobody", "url": "https://example.com"}
    ]
    result, _, _ = run_with_fake(case, [text_block(invented)])
    urls = [s.url for s in result.sources]
    assert "https://example.com" not in urls, urls
    assert urls == [d.url for d in select_sources(case)], urls

