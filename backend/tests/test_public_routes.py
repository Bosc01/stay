"""Routes that take no auth must not hand out owner data. No network, no Supabase."""

import json

import pytest

import routes.followup as followup
import routes.profile as profile

STORED_SESSION = {
    "id": "abc-123",
    "created_at": "2026-10-01T12:00:00+00:00",
    "dog_name": "Rosie",
    "photo_url": None,
    "intake": {"dog_name": "Rosie", "email": "owner@example.com"},
    "result": {"severity": "yellow"},
    "email": "owner@example.com",
    "follow_up_send_at": "2026-10-31T12:00:00",
}


class SessionQuery:
    """Returns only the selected columns, the way PostgREST does."""

    def __init__(self):
        self._columns = "*"
        self._single = False

    def select(self, columns):
        self._columns = columns
        return self

    def single(self):
        self._single = True
        return self

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        names = [c.strip() for c in self._columns.split(",")]
        row = dict(STORED_SESSION) if names == ["*"] else {c: STORED_SESSION[c] for c in names}
        return type("Res", (), {"data": row if self._single else [row]})()


class SessionDB:
    def table(self, _name):
        return SessionQuery()


@pytest.mark.parametrize(
    "path, module",
    [("/profile/session/abc-123", profile), ("/followup/abc-123", followup)],
)
def test_session_reads_never_return_the_owner_email(client, monkeypatch, path, module):
    monkeypatch.setattr(module, "get_supabase", SessionDB)

    res = client.get(path)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dog_name"] == "Rosie" and body["intake"]["dog_name"] == "Rosie"
    assert "owner@example.com" not in json.dumps(body)


def test_admin_stats_with_a_ref_still_needs_the_admin_password(client):
    """?ref= used to skip auth. Public shelter stats live at /impact/shelter/{ref}."""
    res = client.get("/admin/stats", params={"ref": "austin-pets-alive"})

    assert res.status_code == 401


def test_cors_answers_only_listed_origins(client, monkeypatch):
    from main import allowed_origins

    allowed = client.get("/health", headers={"Origin": "https://www.trystay.org"})
    assert allowed.headers.get("access-control-allow-origin") == "https://www.trystay.org"

    other = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers

    monkeypatch.setenv("ALLOWED_ORIGINS", " https://preview.example/ , https://www.trystay.org")
    assert allowed_origins() == ["https://preview.example", "https://www.trystay.org"]
