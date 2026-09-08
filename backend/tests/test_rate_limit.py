"""The limiter must key on the owner, not the proxy, and must not grow forever."""

from datetime import datetime, timedelta

import routes.triage as triage_module
from conftest import sample_intake
from routes.triage import (
    MAX_TRACKED_IPS,
    RATE_LIMIT,
    RATE_WINDOW,
    _prune,
    _record_and_check,
)


def post(client, body=None, ip=None):
    headers = {"x-forwarded-for": ip} if ip else {}
    return client.post("/triage", json=body or sample_intake(), headers=headers)


def test_one_owner_hitting_the_limit_does_not_block_another(client, fake_claude):
    """The regression that matters: behind a proxy everyone shared one bucket."""
    fake_claude()
    for _ in range(RATE_LIMIT):
        assert post(client, ip="203.0.113.10").status_code == 200

    assert post(client, ip="203.0.113.10").status_code == 429
    assert post(client, ip="203.0.113.99").status_code == 200


def test_forwarded_for_takes_precedence_over_peer_address(client, fake_claude):
    fake_claude()
    post(client, ip="203.0.113.10")

    assert "203.0.113.10" in triage_module._rate_limit
    assert "testclient" not in triage_module._rate_limit


def test_first_entry_of_a_forwarded_chain_is_used(client, fake_claude):
    """X-Forwarded-For lists the original client first, then each proxy."""
    fake_claude()
    post(client, ip="203.0.113.10, 70.41.3.18, 150.172.238.178")

    assert "203.0.113.10" in triage_module._rate_limit


def test_blank_forwarded_header_falls_back_to_peer(client, fake_claude):
    fake_claude()
    client.post("/triage", json=sample_intake(), headers={"x-forwarded-for": "  "})

    assert "testclient" in triage_module._rate_limit


def test_limit_is_enforced_per_owner():
    now = datetime.now()
    for i in range(RATE_LIMIT):
        assert _record_and_check("1.2.3.4", now + timedelta(seconds=i)) is False

    assert _record_and_check("1.2.3.4", now + timedelta(seconds=RATE_LIMIT)) is True


def test_hits_outside_the_window_do_not_count():
    now = datetime.now()
    for i in range(RATE_LIMIT):
        _record_and_check("1.2.3.4", now + timedelta(seconds=i))

    later = now + timedelta(seconds=RATE_WINDOW + 60)
    assert _record_and_check("1.2.3.4", later) is False


def test_stale_buckets_are_evicted():
    """Previously an address was tracked forever once seen, leaking memory."""
    now = datetime.now()
    for i in range(50):
        _record_and_check(f"10.0.0.{i}", now)
    assert len(triage_module._rate_limit) == 50

    _prune(now + timedelta(seconds=RATE_WINDOW + 60))
    assert triage_module._rate_limit == {}


def test_tracked_addresses_stay_bounded(monkeypatch):
    monkeypatch.setattr(triage_module, "MAX_TRACKED_IPS", 25)
    now = datetime.now()

    for i in range(200):
        _record_and_check(f"10.1.{i // 256}.{i % 256}", now + timedelta(seconds=i))

    assert len(triage_module._rate_limit) <= 25


def test_eviction_keeps_the_most_recent_callers(monkeypatch):
    monkeypatch.setattr(triage_module, "MAX_TRACKED_IPS", 3)
    now = datetime.now()

    for i in range(6):
        _record_and_check(f"10.2.0.{i}", now + timedelta(seconds=i))

    assert "10.2.0.5" in triage_module._rate_limit
    assert "10.2.0.0" not in triage_module._rate_limit


def test_max_tracked_ips_is_a_sane_default():
    assert MAX_TRACKED_IPS >= 1000
