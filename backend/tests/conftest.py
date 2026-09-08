"""Shared test setup.

The backend uses flat imports (`from db import get_supabase`), so `backend/`
has to be on the import path before any test module imports application code.
Route modules also build API clients at import time, so throwaway credentials
are set here to keep importing the app from reaching for real ones.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-real")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-service-key")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")

import pytest  # noqa: E402

import routes.triage as triage_module  # noqa: E402

VALID_TRIAGE_JSON = """{
  "severity": "yellow",
  "severity_label": "Try this first, but consider support",
  "behavior_classification": "Fear-based reactivity",
  "root_cause": "Rosie barks at delivery drivers because the door is where strangers appear and vanish.",
  "first_step": "Toss five treats from 10 feet away when the van pulls up, three minutes, once a day.",
  "week_ahead": ["Day 1 to 2: she notices treats", "Day 3 to 5: she looks at you", "Day 6 to 7: shorter barking"],
  "honest_note": "If a driver walks up mid-session she will likely bark through it.",
  "escalation_needed": false,
  "escalation_reason": null,
  "resource_tags": ["reactivity_basics"]
}"""


class FakeTextBlock:
    def __init__(self, text: str) -> None:
        self.text = text


class FakeUsage:
    def __init__(self) -> None:
        self.input_tokens = 120
        self.cache_creation_input_tokens = 0
        self.cache_read_input_tokens = 1266


class FakeResponse:
    def __init__(self, text: str) -> None:
        self.content = [FakeTextBlock(text)]
        self.usage = FakeUsage()


class FakeMessages:
    """Stands in for `client.messages`, recording every call it receives."""

    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeResponse(self.response_text)


class FakeClaude:
    def __init__(self, response_text: str) -> None:
        self.messages = FakeMessages(response_text)


class FakeQuery:
    def __init__(self, recorder: list) -> None:
        self._recorder = recorder
        self._payload = None

    def insert(self, row):
        self._payload = row
        return self

    def execute(self):
        self._recorder.append(self._payload)
        return type("Result", (), {"data": [self._payload]})()


class FakeSupabase:
    """Minimal stand-in for the Supabase client used by the triage route."""

    def __init__(self) -> None:
        self.inserted: list = []

    def table(self, _name):
        return FakeQuery(self.inserted)


@pytest.fixture(autouse=True)
def clear_rate_limit():
    """The limiter is module level state, so it leaks between tests otherwise."""
    triage_module._rate_limit.clear()
    yield
    triage_module._rate_limit.clear()


@pytest.fixture
def fake_claude(monkeypatch):
    """Replace the Claude client so tests never touch the network."""

    def _install(response_text: str = VALID_TRIAGE_JSON) -> FakeClaude:
        fake = FakeClaude(response_text)
        monkeypatch.setattr(triage_module, "client", fake)
        return fake

    return _install


@pytest.fixture
def fake_supabase(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(triage_module, "get_supabase", lambda: fake)
    return fake


@pytest.fixture
def client(fake_supabase):
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app)


def flatten_system(system) -> str:
    """The system prompt is sent as content blocks; join them for assertions."""
    if isinstance(system, str):
        return system
    return "\n\n".join(block["text"] for block in system)


def sample_intake(**overrides) -> dict:
    """A minimally valid intake body; override fields per test."""
    intake = {
        "behavior_type": "Barking",
        "dog_name": "Rosie",
        "triggers": ["Delivery drivers"],
        "duration": "About 3 months",
        "already_tried": "Treats at the window",
    }
    intake.update(overrides)
    return intake
