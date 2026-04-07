import json
import uuid
from datetime import datetime, timedelta

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from db import get_supabase
from models import TriageIntake, TriageResult
from prompts.system import SUDDEN_ONSET_PRIORITY, SYSTEM_PROMPT

router = APIRouter()
client = anthropic.Anthropic()


@router.post("/triage")
async def triage(intake: TriageIntake):
    user_message = json.dumps(intake.model_dump(), indent=2)

    system_prompt = SYSTEM_PROMPT
    if intake.sudden_onset:
        system_prompt = f"{SYSTEM_PROMPT.rstrip()}\n\n{SUDDEN_ONSET_PRIORITY.strip()}\n"

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_prompt,
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

    print("--- Claude raw response (before JSON parse) ---")
    print(raw_text)
    print("--- end raw response ---")

    try:
        raw_text = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result_data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=(
                "Claude did not return valid JSON. "
                f"{e.msg} (line {e.lineno}, column {e.colno}). "
                "The full raw response was printed to the server console."
            ),
        )

    try:
        result = TriageResult(**result_data)
    except ValidationError as e:
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

        print(f"[triage] intake_data: {intake_data}")
        print(f"[triage] result_data: {result_data}")

        insert_res = supabase.table("triage_sessions").insert(
            {
                "id": session_id,
                "intake": intake_data,
                "result": result_data,
                "email": None,
                "referral_source": intake.referral_source,
                "dog_name": intake.dog_name,
                "photo_url": None,
            }
        ).execute()

        print(f"[triage] Insert response: {insert_res.data}")

    except Exception as e:
        print(f"[triage] Supabase insert error: {e}")
        session_id = None

    print(f"[triage] Returning session_id={session_id}")
    return {**result.dict(), "session_id": session_id}
