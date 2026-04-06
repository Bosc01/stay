from pydantic import BaseModel, Field, field_validator


class TriageIntake(BaseModel):
    behavior_type: str
    behavior_intensity: int | None = Field(default=None, ge=1, le=3)
    behavior_description: str | None = None
    dog_name: str | None = None
    referral_source: str | None = None
    triggers: list[str]
    duration: str
    already_tried: str
    email: str | None = None


class TriageResult(BaseModel):
    severity: str
    severity_label: str
    behavior_classification: str
    root_cause: str
    first_step: str
    honest_note: str
    escalation_needed: bool
    escalation_reason: str | None
    resource_tags: list[str]


class TriageWithSession(TriageResult):
    session_id: str | None = None


class FollowUpRequest(BaseModel):
    session_id: str
    email: str | None = None
    dog_still_home: bool | None = None
    improvement_score: int | None = None


class CheckInRequest(BaseModel):
    session_id: str
    improvement_score: int = Field(..., ge=1, le=5)


class ProfileSessionUpdate(BaseModel):
    photo_url: str | None = None
    dog_name: str | None = None


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
