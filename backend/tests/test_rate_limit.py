"""The limiter must key on the owner, must not be forgeable, and must not grow forever."""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient
from starlette.requests import Request

import ratelimit
from conftest import sample_intake
from main import app
from ratelimit import (
    MAX_TRACKED_IPS,
    RATE_LIMIT,
    RATE_WINDOW,
    _prune,
    _record_and_check,
    client_ip_header,
)

CF = "cf-connecting-ip"


def post(client, headers=None):
    return client.post("/triage", json=sample_intake(), headers=headers or {})


def key_for(headers=None, peer=("198.51.100.9", 1)) -> str:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return ratelimit.client_ip(Request({"type": "http", "headers": raw, "client": peer}))


# --- which address counts


def test_render_trusts_the_cloudflare_header_by_default():
    assert client_ip_header({"RENDER": "true"}) == CF
    assert client_ip_header({}) == ""
    assert client_ip_header({"RENDER": "true", "CLIENT_IP_HEADER": "X-Real-IP"}) == "x-real-ip"


def test_cloudflare_header_is_the_bucket_on_render(monkeypatch):
    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", CF)
    assert key_for({CF: "203.0.113.10"}) == "203.0.113.10"


def test_a_forged_forwarded_for_never_counts(monkeypatch):
    """Render appends to X-Forwarded-For, so its left side is the caller's choice."""
    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", CF)
    forged = {CF: "203.0.113.10", "X-Forwarded-For": "6.6.6.6, 203.0.113.10"}
    assert key_for(forged) == "203.0.113.10"

    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", "")
    assert key_for({"X-Forwarded-For": "6.6.6.6"}) == "198.51.100.9"


def test_missing_header_falls_back_to_the_peer(monkeypatch):
    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", CF)
    assert key_for({}) == "198.51.100.9"
    assert key_for({CF: "   "}) == "198.51.100.9"


def test_ipv6_is_bucketed_by_64(monkeypatch):
    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", CF)
    assert key_for({CF: "2001:db8:1:2::1"}) == key_for({CF: "2001:db8:1:2:ffff::9"}) == "2001:db8:1:2::/64"
    assert key_for({CF: "2001:db8:1:3::1"}) == "2001:db8:1:3::/64"
    assert key_for({CF: "::ffff:203.0.113.1"}) == "203.0.113.1"
    assert key_for(peer=("testclient", 1)) == "testclient"
    assert ratelimit.client_ip(Request({"type": "http", "headers": [], "client": None})) == "unknown"


# --- the limit through the route


def test_one_owner_hitting_the_limit_does_not_block_another(client, fake_claude, monkeypatch):
    """The regression that matters: behind a proxy everyone shared one bucket."""
    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", CF)
    fake_claude()
    for _ in range(RATE_LIMIT):
        assert post(client, {CF: "203.0.113.10"}).status_code == 200

    assert post(client, {CF: "203.0.113.10"}).status_code == 429
    assert post(client, {CF: "203.0.113.99"}).status_code == 200


def test_rotating_the_forwarded_header_does_not_reset_the_limit(client, fake_claude, monkeypatch):
    monkeypatch.setattr(ratelimit, "CLIENT_IP_HEADER", CF)
    fake_claude()
    codes = [
        post(client, {CF: "203.0.113.10", "X-Forwarded-For": f"6.6.6.{n}"}).status_code
        for n in range(RATE_LIMIT + 1)
    ]
    assert codes == [200] * RATE_LIMIT + [429]


def test_parallel_requests_from_one_client_stop_at_the_limit(fake_supabase, fake_claude, monkeypatch):
    """Handlers can run in threads; without the lock all 30 read a count under 10."""

    class SlowBuckets(dict):
        def get(self, key, default=None):
            # Read, then hold the stale value, so unguarded threads all act on
            # the same count before any of them writes it back.
            value = super().get(key, default)
            time.sleep(0.01)
            return value

    monkeypatch.setattr(ratelimit, "_rate_limit", SlowBuckets())
    fake_claude()
    client = TestClient(app)
    with ThreadPoolExecutor(max_workers=30) as pool:
        codes = list(pool.map(lambda _: post(client).status_code, range(30)))
    assert sorted(codes) == [200] * RATE_LIMIT + [429] * (30 - RATE_LIMIT)


# --- the in-memory store


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
    assert len(ratelimit._rate_limit) == 50

    _prune(now + timedelta(seconds=RATE_WINDOW + 60))
    assert ratelimit._rate_limit == {}


def test_tracked_addresses_stay_bounded(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_TRACKED_IPS", 25)
    now = datetime.now()

    for i in range(200):
        _record_and_check(f"10.1.{i // 256}.{i % 256}", now + timedelta(seconds=i))

    assert len(ratelimit._rate_limit) <= 25


def test_eviction_keeps_the_most_recent_callers(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_TRACKED_IPS", 3)
    now = datetime.now()

    for i in range(6):
        _record_and_check(f"10.2.0.{i}", now + timedelta(seconds=i))

    assert "10.2.0.5" in ratelimit._rate_limit
    assert "10.2.0.0" not in ratelimit._rate_limit


def test_max_tracked_ips_is_a_sane_default():
    assert MAX_TRACKED_IPS >= 1000


# --- the Supabase store


class FakeRpc:
    def __init__(self, data=None, error=None):
        self.data, self.error, self.calls = data, error, []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data=self.data)


def test_supabase_store_decides_and_memory_stays_empty(monkeypatch):
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_STORE", "supabase")
    allow, deny = FakeRpc(data=True), FakeRpc(data=False)

    monkeypatch.setattr(ratelimit, "get_supabase", lambda: allow)
    assert ratelimit.allow_request("203.0.113.1") is True
    assert allow.calls == [
        ("triage_rate_limit_hit", {"p_key": "203.0.113.1", "p_limit": RATE_LIMIT, "p_window_seconds": RATE_WINDOW})
    ]
    monkeypatch.setattr(ratelimit, "get_supabase", lambda: deny)
    assert ratelimit.allow_request("203.0.113.1") is False
    # Nothing in process memory, so a restart has nothing to lose.
    assert ratelimit._rate_limit == {}


def test_supabase_failure_falls_back_to_memory(monkeypatch):
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_STORE", "supabase")
    for fake in (FakeRpc(error=RuntimeError("permission denied for function")), FakeRpc(data=[])):
        ratelimit._rate_limit.clear()
        monkeypatch.setattr(ratelimit, "get_supabase", lambda fake=fake: fake)
        results = [ratelimit.allow_request("203.0.113.1") for _ in range(RATE_LIMIT + 1)]
        assert results == [True] * RATE_LIMIT + [False]
