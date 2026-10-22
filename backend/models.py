from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator


class TriageIntake(BaseModel):
    # Every field is stored and sent to the model, so each one is capped.
    behavior_type: str = Field(..., max_length=200)
    behavior_intensity: int | None = Field(default=None, ge=1, le=3)
    behavior_description: str | None = Field(default=None, max_length=4000)
    dog_name: str | None = Field(default=None, max_length=200)
    owner_experience: str | None = Field(default=None, max_length=100)
    prior_training: str | None = Field(default=None, max_length=100)
    referral_source: str | None = Field(default=None, max_length=128)
    sudden_onset: bool = False
    triggers: list[Annotated[str, StringConstraints(max_length=200)]] = Field(..., max_length=10)
    duration: str = Field(..., max_length=100)
    already_tried: str = Field(..., max_length=4000)
    email: str | None = Field(default=None, max_length=320)
    # Minted by the browser at intake start so the funnel can follow the
    # session. Excluded from model_dump, so it never reaches the prompt or the
    # stored intake.
    session_id: str | None = Field(default=None, exclude=True)


class Source(BaseModel):
    """A piece of professional guidance the advice was grounded in.

    Set by the backend from backend/knowledge/, never by the model, so the
    name and link always point at a real document.
    """

    name: str
    org: str
    url: str


class TriageResult(BaseModel):
    severity: str
    severity_label: str
    behavior_classification: str
    root_cause: str
    first_step: str
    week_ahead: list[str] = Field(default_factory=list)
    honest_note: str
    escalation_needed: bool
    escalation_reason: str | None
    resource_tags: list[str]
    sources: list[Source] = Field(default_factory=list)


class TriageWithSession(TriageResult):
    session_id: str | None = None


class FollowUpRequest(BaseModel):
    session_id: str
    email: str | None = Field(default=None, max_length=320)
    dog_still_home: bool | None = None
    improvement_score: int | None = None


class CheckInRequest(BaseModel):
    session_id: str
    improvement_score: int | None = Field(default=None, ge=1, le=5)
    dog_still_home: bool | None = None

    @model_validator(mode="after")
    def at_least_one_answer(self):
        if self.improvement_score is None and self.dog_still_home is None:
            raise ValueError("send improvement_score and/or dog_still_home")
        return self


class WeeklyCheckInRequest(BaseModel):
    session_id: str
    week_number: int = Field(..., ge=1, le=4)
    score: int = Field(..., ge=1, le=5)
    tried_first_step: str = Field(..., min_length=1, max_length=20)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("tried_first_step")
    @classmethod
    def normalize_tried_first_step(cls, v: str) -> str:
        allowed = {"yes", "partially", "no"}
        key = (v or "").strip().lower()
        if key not in allowed:
            raise ValueError("tried_first_step must be one of: yes, partially, no")
        return key


class ProfileSessionUpdate(BaseModel):
    # The profile screen accepts photos up to 1.5 MB and sends them as a
    # base64 data URL, which is just under 2.1 million characters. Only an
    # inline PNG, JPEG, or WebP passes, never a link the page would load.
    photo_url: str | None = Field(
        default=None,
        max_length=2_100_000,
        pattern=r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$",
    )
    dog_name: str | None = Field(default=None, max_length=200)


class SessionHistoryRequest(BaseModel):
    session_ids: list[str]

    @field_validator("session_ids")
    @classmethod
    def cap_session_ids(cls, v: list[str]) -> list[str]:
        cleaned = [str(x).strip() for x in v if str(x).strip()]
        return list(dict.fromkeys(cleaned))[:40]


class JournalEntryCreate(BaseModel):
    session_id: str
    body: str = Field(..., min_length=1, max_length=8000)


class FollowupQuestionRequest(BaseModel):
    session_id: str
    question: str = Field(..., min_length=1, max_length=3000)
    original_triage: dict


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=3000)


class ShelterInquiryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    shelter_name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    role: str | None = Field(default=None, max_length=200)


class UserInterviewCreate(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    q1: str = Field(default="", max_length=8000)
    q2: str = Field(default="", max_length=8000)
    q3: str = Field(default="", max_length=8000)


class ReviewImport(BaseModel):
    """A review sample CSV after a trainer or vet has marked it."""

    reviewer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    csv_text: str = Field(..., min_length=1, max_length=1_000_000)


class OutreachUpdate(BaseModel):
    status: str | None = None
    drafted_body: str | None = Field(default=None, max_length=8000)

    @field_validator("status")
    @classmethod
    def normalize_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        allowed = {"drafted", "approved", "rejected", "sent"}
        key = (v or "").strip().lower()
        if key not in allowed:
            raise ValueError(f"status must be one of {sorted(allowed)}")
        return key
