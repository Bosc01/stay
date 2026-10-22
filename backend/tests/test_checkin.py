"""The 7-day check-in email and send loop. No network, no Supabase."""

import pytest

import tasks.checkin as checkin


@pytest.fixture(autouse=True)
def resend_key(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test-key")


ROW = {
    "id": "abc-123",
    "email": "owner@example.com",
    "dog_name": "Rosie",
    "follow_up_7_day_at": "2026-09-01T00:00:00+00:00",
    "follow_up_sent": False,
}


class FakeQuery:
    """Every builder method returns self; execute() hands back the fixed rows."""

    def __init__(self, rows, updates):
        self._rows = rows
        self._updates = updates
        self._update_payload = None

    # postgrest exposes .not_ as an attribute, not a call
    @property
    def not_(self):
        return self

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def update(self, payload):
        self._update_payload = payload
        return self

    def execute(self):
        if self._update_payload is not None:
            self._updates.append(self._update_payload)
            return type("Res", (), {"data": [ROW]})()
        return type("Res", (), {"data": list(self._rows)})()


class FakeSupabase:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def table(self, _name):
        return FakeQuery(self.rows, self.updates)


def test_email_copy():
    msg = checkin.build_checkin_email("abc-123", "Rosie")

    blob = msg["subject"] + msg["html"] + msg["text"]
    for dash in (chr(0x2014), chr(0x2013)):
        assert dash not in blob, "no em or en dashes in the email"
    assert "Rosie" in msg["subject"], msg["subject"]
    assert blob.count("your dog") == 0, "dog name should replace 'your dog'"

    for suffix in ("?home=yes&score=4", "?home=yes&score=2", "?home=yes&score=1", "?home=no"):
        url = f"{checkin.SITE_URL}/checkin/abc-123{suffix}"
        assert url in msg["text"], f"missing link {url}"
        # href is HTML escaped, so & becomes &amp;
        assert url.replace("&", "&amp;") in msg["html"], f"missing link {url}"

    # Two questions, four one-tap answers, nothing else to fill out.
    assert msg["html"].count("<a href=") == 4
    assert "<form" not in msg["html"] and "<input" not in msg["html"]


def test_failed_send_is_not_marked_sent_and_loop_ends(monkeypatch):
    fake = FakeSupabase([dict(ROW)])
    monkeypatch.setattr(checkin, "get_supabase", lambda: fake)

    class Boom:
        @staticmethod
        def send(_payload):
            raise RuntimeError("resend down")

    monkeypatch.setattr(checkin, "resend", type("R", (), {"api_key": "test", "Emails": Boom})())

    out = checkin.send_7day_checkins()
    assert out["sent"] == 0, out
    assert out["errors"] and "resend down" in out["errors"][0]["error"], out
    assert fake.updates == [], "a failed send must not set follow_up_sent"


def test_send_with_no_id_is_not_marked_sent(monkeypatch):
    fake = FakeSupabase([dict(ROW)])
    monkeypatch.setattr(checkin, "get_supabase", lambda: fake)

    class NoId:
        @staticmethod
        def send(_payload):
            return {}

    monkeypatch.setattr(checkin, "resend", type("R", (), {"api_key": "test", "Emails": NoId})())

    out = checkin.send_7day_checkins()
    assert out["sent"] == 0, out
    assert fake.updates == [], "unconfirmed send must not set follow_up_sent"


def test_confirmed_send_marks_sent(monkeypatch):
    fake = FakeSupabase([dict(ROW)])
    monkeypatch.setattr(checkin, "get_supabase", lambda: fake)

    class Ok:
        @staticmethod
        def send(_payload):
            return {"id": "email_1"}

    monkeypatch.setattr(checkin, "resend", type("R", (), {"api_key": "test", "Emails": Ok})())

    out = checkin.send_7day_checkins()
    assert out["sent"] == 1, out
    assert fake.updates == [{"follow_up_sent": True}], fake.updates


def test_dry_run_sends_nothing(monkeypatch):
    fake = FakeSupabase([dict(ROW)])
    monkeypatch.setattr(checkin, "get_supabase", lambda: fake)

    class Explode:
        @staticmethod
        def send(_payload):
            raise AssertionError("dry run must not call Resend")

    monkeypatch.setattr(checkin, "resend", type("R", (), {"api_key": None, "Emails": Explode})())

    out = checkin.send_7day_checkins(dry_run=True)
    assert out["ok"] and out["dry_run"] and out["sent"] == 1, out
    assert fake.updates == [], "dry run must not write"

