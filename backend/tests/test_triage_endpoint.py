"""Tests for the /triage request path: parsing, validation, storage, limits."""

from conftest import VALID_TRIAGE_JSON, sample_intake


def test_returns_triage_result(client, fake_claude):
    fake_claude()
    res = client.post("/triage", json=sample_intake())

    assert res.status_code == 200
    body = res.json()
    assert body["severity"] == "yellow"
    assert body["behavior_classification"] == "Fear-based reactivity"
    assert len(body["week_ahead"]) == 3
    assert body["session_id"]


def test_intake_and_result_are_persisted(client, fake_claude, fake_supabase):
    fake_claude()
    res = client.post("/triage", json=sample_intake(referral_source="austin-pets-alive"))

    assert res.status_code == 200
    assert len(fake_supabase.inserted) == 1
    row = fake_supabase.inserted[0]
    assert row["dog_name"] == "Rosie"
    assert row["referral_source"] == "austin-pets-alive"
    assert row["intake"]["behavior_type"] == "Barking"
    assert row["result"]["severity"] == "yellow"


def test_em_dashes_are_stripped_from_the_response(client, fake_claude):
    """House style bans em dashes, so the route rewrites any that slip through."""
    fake_claude(VALID_TRIAGE_JSON.replace("because the door is", "— the door is"))
    res = client.post("/triage", json=sample_intake())

    assert res.status_code == 200
    assert "—" not in res.json()["root_cause"]


def test_markdown_fenced_json_is_accepted(client, fake_claude):
    fake_claude(f"```json\n{VALID_TRIAGE_JSON}\n```")
    res = client.post("/triage", json=sample_intake())

    assert res.status_code == 200
    assert res.json()["severity"] == "yellow"


def test_unparseable_response_returns_502(client, fake_claude):
    fake_claude("Sorry, I cannot help with that.")
    res = client.post("/triage", json=sample_intake())

    assert res.status_code == 502
    assert "valid JSON" in res.json()["detail"]


def test_response_missing_required_fields_returns_502(client, fake_claude):
    fake_claude('{"severity": "green"}')
    res = client.post("/triage", json=sample_intake())

    assert res.status_code == 502
    assert "TriageResult" in res.json()["detail"]


def test_storage_failure_still_returns_advice(client, fake_claude, monkeypatch):
    """A Supabase outage must not cost the owner their triage."""
    import routes.triage as triage_module

    def boom():
        raise RuntimeError("supabase is down")

    monkeypatch.setattr(triage_module, "get_supabase", boom)
    fake_claude()

    res = client.post("/triage", json=sample_intake())
    assert res.status_code == 200
    assert res.json()["first_step"]
    assert res.json()["session_id"] is None


def test_invalid_intake_is_rejected(client, fake_claude):
    fake = fake_claude()
    res = client.post("/triage", json={"behavior_type": "Barking"})

    assert res.status_code == 422
    assert not fake.messages.calls, "invalid intake should never reach Claude"


def test_rate_limit_blocks_the_eleventh_request(client, fake_claude):
    import routes.triage as triage_module

    fake_claude()
    for _ in range(triage_module.RATE_LIMIT):
        assert client.post("/triage", json=sample_intake()).status_code == 200

    blocked = client.post("/triage", json=sample_intake())
    assert blocked.status_code == 429
    assert "Too many requests" in blocked.json()["detail"]


def test_health_endpoint(client):
    assert client.get("/health").json() == {"status": "ok"}
