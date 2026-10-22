"""The welcome email after an email signup on POST /followup. No network."""

import pytest

import routes.followup as followup

SAVED_ROW = {"id": "abc-123", "dog_name": "Rosie", "result": {"first_step": "Toss treats."}}


class SavingQuery:
    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return type("Res", (), {"data": [SAVED_ROW]})()


class SavingDB:
    def table(self, _name):
        return SavingQuery()


def unreachable():
    raise RuntimeError("Supabase unreachable")


@pytest.mark.parametrize("db, emails_expected", [(SavingDB, 1), (unreachable, 0)])
def test_welcome_email_goes_out_only_once_the_signup_is_saved(
    client, monkeypatch, caplog, db, emails_expected
):
    """A failed save used to reach update_res before it was assigned."""
    monkeypatch.setattr(followup, "get_supabase", db)
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    sent = []
    monkeypatch.setattr(followup.resend.Emails, "send", lambda params: sent.append(params))

    res = client.post("/followup", json={"session_id": "abc-123", "email": "owner@example.com"})

    assert res.status_code == 200, res.text
    assert len(sent) == emails_expected
    if sent:
        assert sent[0]["subject"] == "Your triage for Rosie"
    assert not any("Welcome email failed" in r.getMessage() for r in caplog.records)
