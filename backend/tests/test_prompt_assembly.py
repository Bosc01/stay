"""Tests for the system prompt the triage route sends to Claude.

These cover the regression fixed in #3: the owner context placeholders in
SYSTEM_PROMPT were never substituted, so Claude received the literal text
"{owner_experience}" on every request and the tailoring instructions that
depend on those values had nothing real to act on.
"""

import re

from conftest import flatten_system, sample_intake
from prompts.system import OWNER_CONTEXT, SUDDEN_ONSET_PRIORITY, SYSTEM_PROMPT

# Matches a leftover {placeholder} but not the JSON schema example in the prompt,
# which uses braces on their own lines.
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


def sent_system_prompt(fake) -> str:
    assert fake.messages.calls, "expected the triage route to call Claude"
    return flatten_system(fake.messages.calls[0]["system"])


def test_owner_experience_is_substituted(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake(owner_experience="First-time owner"))

    system = sent_system_prompt(fake)
    assert "Experience: First-time owner" in system
    assert "{owner_experience}" not in system


def test_prior_training_is_substituted(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake(prior_training="Yes, didn't help"))

    system = sent_system_prompt(fake)
    assert "Prior training: Yes, didn't help" in system
    assert "{prior_training}" not in system


def test_missing_owner_context_falls_back_to_not_specified(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake())

    system = sent_system_prompt(fake)
    assert "Experience: Not specified" in system
    assert "Prior training: Not specified" in system


def test_no_unfilled_placeholders_ever_reach_claude(client, fake_claude):
    """The bug this suite exists for: guard every intake shape at once."""
    cases = [
        sample_intake(),
        sample_intake(owner_experience="First-time owner"),
        sample_intake(prior_training="Yes, it helped"),
        sample_intake(
            owner_experience="Experienced owner",
            prior_training="Yes, didn't help",
            sudden_onset=True,
        ),
    ]

    for body in cases:
        fake = fake_claude()
        client.post("/triage", json=body)
        system = sent_system_prompt(fake)
        leftovers = PLACEHOLDER.findall(system)
        assert not leftovers, f"unfilled placeholders {leftovers} for intake {body}"


def test_sudden_onset_appends_medical_priority(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake(sudden_onset=True))

    system = sent_system_prompt(fake)
    assert SUDDEN_ONSET_PRIORITY.strip() in system


def test_sudden_onset_absent_by_default(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake())

    assert SUDDEN_ONSET_PRIORITY.strip() not in sent_system_prompt(fake)


def test_safety_rules_are_always_present(client, fake_claude):
    """The bite/child escalation rule is the product's safety floor."""
    fake = fake_claude()
    client.post("/triage", json=sample_intake())

    system = sent_system_prompt(fake)
    assert "bite that broke skin" in system
    assert "escalation_needed must be true" in system
    assert "Never recommend punishment, alpha/dominance techniques" in system


def test_owner_context_template_still_has_placeholders_to_substitute():
    """If someone removes these, the route's replace() silently no-ops."""
    assert "{owner_experience}" in OWNER_CONTEXT
    assert "{prior_training}" in OWNER_CONTEXT


def test_static_prompt_holds_no_per_request_values():
    """SYSTEM_PROMPT is the cache prefix, so nothing owner specific may live in it."""
    assert "{owner_experience}" not in SYSTEM_PROMPT
    assert "{prior_training}" not in SYSTEM_PROMPT
    assert "Owner context" not in SYSTEM_PROMPT
