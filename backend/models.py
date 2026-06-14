from pydantic import BaseModel, Field, field_validator


class TriageIntake(BaseModel):
    behavior_type: str
    behavior_intensity: int | None = Field(default=None, ge=1, le=3)
    behavior_description: str | None = None
    dog_name: str | None = None
    owner_experience: str | None = None
    prior_training: str | None = None
    referral_source: str | None = None
    sudden_onset: bool = False
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
    week_ahead: list[str] = Field(default_factory=list)
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
