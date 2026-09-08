"""Logging should be useful without putting owner data in the log."""

import logging

from conftest import VALID_TRIAGE_JSON, sample_intake

SENSITIVE_INTAKE = sample_intake(
    dog_name="Wilbur",
    behavior_description="He lunges at my neighbour Sarah every single morning",
    already_tried="Shouting, which I regret",
)


def test_owner_text_is_not_logged_on_a_healthy_request(client, fake_claude, caplog):
    fake_claude()
    with caplog.at_level(logging.INFO):
        res = client.post("/triage", json=SENSITIVE_INTAKE)

    assert res.status_code == 200
    logged = caplog.text
    assert "Wilbur" not in logged
    assert "neighbour Sarah" not in logged
    assert "which I regret" not in logged


def test_model_output_is_not_logged_on_a_healthy_request(client, fake_claude, caplog):
    fake_claude()
    with caplog.at_level(logging.INFO):
        client.post("/triage", json=sample_intake())

    assert "Toss five treats" not in caplog.text


def test_cache_counters_are_logged(client, fake_claude, caplog):
    """Operators need this to tell whether prompt caching is actually working."""
    fake_claude()
    with caplog.at_level(logging.INFO):
        client.post("/triage", json=sample_intake())

    assert "cache read=" in caplog.text


def test_session_id_is_logged_on_success(client, fake_claude, caplog):
    fake_claude()
    with caplog.at_level(logging.INFO):
        res = client.post("/triage", json=sample_intake())

    assert res.json()["session_id"] in caplog.text


def test_raw_response_is_logged_when_parsing_fails(client, fake_claude, caplog):
    """The one moment the raw text earns its place in the log."""
    fake_claude("I am not going to answer that")
    with caplog.at_level(logging.ERROR):
        res = client.post("/triage", json=sample_intake())

    assert res.status_code == 502
    assert "I am not going to answer that" in caplog.text


def test_storage_failure_is_logged_with_a_traceback(client, fake_claude, caplog, monkeypatch):
    import routes.triage as triage_module

    def boom():
        raise RuntimeError("supabase exploded")

    monkeypatch.setattr(triage_module, "get_supabase", boom)
    fake_claude()

    with caplog.at_level(logging.ERROR):
        res = client.post("/triage", json=sample_intake())

    assert res.status_code == 200
    assert "supabase exploded" in caplog.text
    assert "Traceback" in caplog.text


def test_no_print_statements_remain_in_backend_source():
    """print bypasses levels and formatting, so it should not come back."""
    from pathlib import Path

    backend = Path(__file__).resolve().parents[1]
    offenders = []
    for path in backend.rglob("*.py"):
        if "tests" in path.parts:
            continue
        for number, line in enumerate(path.read_text().splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("print(") or " print(" in stripped:
                offenders.append(f"{path.relative_to(backend)}:{number}")

    assert not offenders, f"use logging instead of print: {offenders}"


def test_valid_json_fixture_is_still_what_the_assertions_assume():
    assert "Toss five treats" in VALID_TRIAGE_JSON
