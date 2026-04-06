from pydantic import BaseModel


class TriageIntake(BaseModel):
    behavior_type: str
    behavior_description: str | None = None
    dog_name: str | None = None
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
