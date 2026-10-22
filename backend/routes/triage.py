import json
import logging
import uuid

import anthropic
from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from db import get_supabase
from models import Source, TriageIntake, TriageResult
from prompts.system import (
    OWNER_CONTEXT,
    REFERENCE_MATERIAL_INSTRUCTIONS,
    SUDDEN_ONSET_PRIORITY,
    SYSTEM_PROMPT,
)
from ratelimit import allow_request, client_ip
from retrieval import format_reference_block, select_sources

logger = logging.getLogger(__name__)

router = APIRouter()
client = anthropic.Anthropic()

MODEL = "claude-sonnet-5"
MAX_TOKENS = 1024
# Adaptive thinking spends tokens on reasoning before the JSON, so the ceiling
# has to leave room for both.
MAX_TOKENS_THINKING = 6000

def needs_deeper_reasoning(intake: TriageIntake) -> bool:
    """True for the cases where a wrong answer does real harm.

    Everything else stays on the cheaper no-thinking path. Kept separate from
    run_triage so the split can be tested without calling the API.
    """
    return bool(
        intake.sudden_onset
        or intake.behavior_intensity == 3
        or "aggress" in (intake.behavior_type or "").lower()
    )


def build_system_blocks(intake: TriageIntake, docs: list) -> list[dict]:
    """The system prompt as content blocks.

    SYSTEM_PROMPT is identical on every request, so it is sent as its own
    cached block. Everything that varies per owner goes in later blocks, after
    the cache breakpoint, otherwise the prefix changes and nothing ever hits.
    """
    blocks: list[dict] = [
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": OWNER_CONTEXT.replace(
                "{owner_experience}", intake.owner_experience or "Not specified"
            ).replace("{prior_training}", intake.prior_training or "Not specified"),
        },
    ]
    if intake.sudden_onset:
        blocks.append({"type": "text", "text": SUDDEN_ONSET_PRIORITY.strip()})
    if docs:
        blocks.append(
            {
                "type": "text",
                "text": f"{REFERENCE_MATERIAL_INSTRUCTIONS.strip()}\n\n{format_reference_block(docs)}",
            }
        )
    return blocks


def run_triage(
    intake: TriageIntake, dry_run: bool = False
) -> tuple[TriageResult, str | None]:
    """Call Claude, parse and validate the triage, and store the session.

    dry_run skips the Supabase insert entirely and returns session_id None,
    so evals and local runs never touch production data.
    Raises HTTPException on an upstream or parse failure.
    """
    docs = select_sources(intake)
    deeper = needs_deeper_reasoning(intake)

    # Sonnet 5 thinks unless told not to, so the standard path turns thinking
    # off explicitly. Each path keeps one fixed setting: a thinking change
    # between requests invalidates the cache, so mixing them per request would
    # cost the cached prefix every time.
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS_THINKING if deeper else MAX_TOKENS,
            thinking={"type": "adaptive"} if deeper else {"type": "disabled"},
            system=build_system_blocks(intake, docs),
            messages=[{"role": "user", "content": json.dumps(intake.model_dump(), indent=2)}],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    # Cache reads cost about a tenth of base input price. If read stays 0 across
    # requests, the cached prefix is being invalidated or is under the model's
    # minimum cacheable size, and the breakpoint above is doing nothing.
    usage = getattr(response, "usage", None)
    logger.info(
        "triage path=%s sources=%s cache read=%s write=%s uncached=%s",
        "thinking" if deeper else "standard",
        [d.slug for d in docs],
        getattr(usage, "cache_read_input_tokens", 0),
        getattr(usage, "cache_creation_input_tokens", 0),
        getattr(usage, "input_tokens", 0),
    )

    # On the thinking path content[0] is a thinking block, so find the text one.
    raw_text = next(
        (b.text for b in response.content if getattr(b, "type", None) == "text"),
        None,
    )
    if raw_text is None:
        raise HTTPException(
            status_code=502,
            detail="Claude response contained no text block.",
        )

    raw_text = raw_text.replace("—", "-").replace("–", "-")

    try:
        raw_text = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result_data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        # Logged here rather than on every request: this is the one moment the
        # raw text is worth the space it takes in the log.
        logger.error("Claude returned unparseable JSON: %s\n%s", e, raw_text)
        raise HTTPException(
            status_code=502,
            detail=(
                "Claude did not return valid JSON. "
                f"{e.msg} (line {e.lineno}, column {e.colno}). "
                "The full raw response was written to the server log."
            ),
        )

    try:
        result = TriageResult(**result_data)
    except ValidationError as e:
        logger.error("Claude JSON failed TriageResult validation: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Claude JSON could not be validated as TriageResult: {e}",
        )

    # Sources come from retrieval, not from the model, so the link is always real.
    result.sources = [Source(name=d.name, org=d.org, url=d.url) for d in docs]

    if dry_run:
        return result, None

    session_id = str(uuid.uuid4())

    try:
        supabase = get_supabase()

        intake_data = json.loads(json.dumps(intake.model_dump(), default=str))
        result_data = json.loads(json.dumps(result.model_dump(), default=str))

        # Intake text and the dog's name are the owner's, so they are not
        # logged. Severity and behavior type are enough to spot a bad pattern.
        logger.debug(
            "storing session behavior_type=%s severity=%s",
            intake.behavior_type,
            result.severity,
        )

        supabase.table("triage_sessions").insert(
            {
                "id": session_id,
                "intake": intake_data,
                "result": result_data,
                "email": None,
                "referral_source": intake.referral_source,
                "dog_name": intake.dog_name,
            }
        ).execute()

        logger.info("stored triage session %s", session_id)

    except Exception:
        # The owner still gets their triage; only the session record is lost.
        logger.exception("Supabase insert failed for session %s", session_id)
        session_id = None

    return result, session_id


@router.post("/triage")
async def triage(intake: TriageIntake, request: Request):
    if not allow_request(client_ip(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )

    result, session_id = run_triage(intake)
    return {**result.model_dump(), "session_id": session_id}
