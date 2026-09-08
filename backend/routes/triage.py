import json
import logging
import uuid
from datetime import datetime, timedelta

import anthropic
from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from db import get_supabase
from models import TriageIntake, TriageResult
from prompts.system import OWNER_CONTEXT, SUDDEN_ONSET_PRIORITY, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

router = APIRouter()
client = anthropic.Anthropic()

_rate_limit: dict[str, list[datetime]] = {}
RATE_LIMIT = 10  # requests
RATE_WINDOW = 3600  # 1 hour in seconds
MAX_TRACKED_IPS = 10_000  # backstop so the limiter cannot grow without bound


def _client_ip(request: Request) -> str:
    """The owner's address, not the proxy's.

    Railway forwards through its edge, and uvicorn only trusts X-Forwarded-For
    from 127.0.0.1 unless told otherwise, so request.client.host is the proxy.
    Keying on that would put every owner in one shared bucket.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _prune(now: datetime) -> None:
    """Drop buckets whose hits have all aged out, then cap what is left."""
    window_start = now - timedelta(seconds=RATE_WINDOW)
    for ip in [k for k, hits in _rate_limit.items() if not hits or hits[-1] <= window_start]:
        del _rate_limit[ip]

    overflow = len(_rate_limit) - MAX_TRACKED_IPS
    if overflow > 0:
        # Evict least recently seen rather than refusing new callers.
        for ip, _ in sorted(_rate_limit.items(), key=lambda kv: kv[1][-1])[:overflow]:
            del _rate_limit[ip]


def _record_and_check(ip: str, now: datetime) -> bool:
    """Record this hit. Returns True when the caller is over the limit."""
    window_start = now - timedelta(seconds=RATE_WINDOW)
    hits = [t for t in _rate_limit.get(ip, []) if t > window_start]

    over_limit = len(hits) >= RATE_LIMIT
    if not over_limit:
        hits.append(now)
    _rate_limit[ip] = hits

    # Prune after writing, so the cap holds counting the entry just added.
    _prune(now)
    return over_limit


@router.post("/triage")
async def triage(intake: TriageIntake, request: Request):
    if _record_and_check(_client_ip(request), datetime.now()):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )

    user_message = json.dumps(intake.model_dump(), indent=2)

    # SYSTEM_PROMPT is identical on every request, so it is sent as its own
    # cached block. Everything that varies per owner goes in later blocks, after
    # the cache breakpoint, otherwise the prefix changes and nothing ever hits.
    system_blocks: list[dict] = [
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
        system_blocks.append(
            {"type": "text", "text": SUDDEN_ONSET_PRIORITY.strip()}
        )

    try:
        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=1024,
            thinking={"type": "disabled"},
            system=system_blocks,
            messages=[{"role": "user", "content": user_message}],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    try:
        raw_text = response.content[0].text
    except (AttributeError, IndexError, TypeError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Claude response did not include text at content[0]: {e}",
        )

    # Cache reads cost about a tenth of base input price. If read stays 0 across
    # requests, the cached prefix is being invalidated or is under the model's
    # minimum cacheable size, and the breakpoint above is doing nothing.
    usage = getattr(response, "usage", None)
    if usage is not None:
        logger.info(
            "cache read=%s write=%s uncached=%s",
            getattr(usage, "cache_read_input_tokens", 0),
            getattr(usage, "cache_creation_input_tokens", 0),
            getattr(usage, "input_tokens", 0),
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

    # v2 - json serialize fix active
    session_id = str(uuid.uuid4())

    try:
        supabase = get_supabase()
        now = datetime.now()

        intake_data = json.loads(json.dumps(intake.model_dump(), default=str))
        result_data = json.loads(json.dumps(result.model_dump(), default=str))

        # Intake text and the dog's name are the owner's, so they are not
        # logged. Severity and behavior type are enough to spot a bad pattern.
        logger.debug(
            "storing session behavior_type=%s severity=%s",
            intake.behavior_type,
            result.severity,
        )

        insert_res = supabase.table("triage_sessions").insert(
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

    return {**result.model_dump(), "session_id": session_id}
