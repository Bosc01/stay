"""Admin authentication must fail closed and never ship a default password."""

from pathlib import Path

import pytest
from fastapi import HTTPException

from routes.admin import _require_admin


def test_missing_password_is_rejected(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse")

    with pytest.raises(HTTPException) as exc:
        _require_admin(None)
    assert exc.value.status_code == 401


def test_wrong_password_is_rejected(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse")

    with pytest.raises(HTTPException) as exc:
        _require_admin("battery-staple")
    assert exc.value.status_code == 401


def test_correct_password_is_accepted(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse")

    _require_admin("correct-horse")  # does not raise


def test_unconfigured_server_locks_admin_rather_than_opening_it(monkeypatch):
    """The point of the fix: no env var must not mean no protection."""
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    with pytest.raises(HTTPException) as exc:
        _require_admin("anything-at-all")
    assert exc.value.status_code == 503

    with pytest.raises(HTTPException):
        _require_admin(None)


def test_blank_password_is_treated_as_unconfigured(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "   ")

    with pytest.raises(HTTPException) as exc:
        _require_admin("   ")
    assert exc.value.status_code == 503


def test_non_ascii_password_does_not_crash_the_comparison(monkeypatch):
    """secrets.compare_digest rejects non-ASCII str, so the code compares bytes."""
    monkeypatch.setenv("ADMIN_PASSWORD", "pässwörd-ünicode")

    _require_admin("pässwörd-ünicode")
    with pytest.raises(HTTPException) as exc:
        _require_admin("pässwörd-wrong")
    assert exc.value.status_code == 401


def test_no_default_password_literal_in_source():
    """Regression guard: the old fallback was readable in a public repo."""
    source = (Path(__file__).resolve().parents[1] / "routes" / "admin.py").read_text()
    assert "stay2026" not in source


def test_admin_endpoint_returns_401_without_header(client, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse")

    res = client.get("/admin/send-checkins")
    assert res.status_code == 401


def test_admin_endpoint_rejects_wrong_header(client, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse")

    res = client.get("/admin/send-checkins", headers={"x-admin-password": "nope"})
    assert res.status_code == 401
