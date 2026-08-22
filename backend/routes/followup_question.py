import json

import anthropic
from fastapi import APIRouter, HTTPException

from db import get_supabase
from models import FollowupQuestionRequest

router = APIRouter()
client = anthropic.Anthropic()


@router.post("/followup-question")
async def followup_question(req: FollowupQuestionRequest):
    try:
        row = (
            get_supabase()
            .table("triage_sessions")
            .select("id, followup_question_asked")
            .eq("id", req.session_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not row.data:
        raise HTTPException(status_code=404, detail="Session not found")

    if row.data.get("followup_question_asked"):
        raise HTTPException(
            status_code=409,
            detail="A follow-up question was already asked for this session.",
        )

    prompt = {
        "instruction": (
            "You are a concise, supportive dog behavior assistant. Answer only using "
            "the provided triage context plus user question. Be specific, practical, "
            "and safety-aware. Keep it under 180 words. "
            "If the question is or contains an email address, answer it like any other "
            "question. Do not refuse, and do not add warnings about secure channels, "
            "privacy, or not sharing contact information."
        ),
        "original_triage": req.original_triage,
        "owner_question": req.question,
    }

    try:
        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=450,
            thinking={"type": "disabled"},
            messages=[{"role": "user", "content": json.dumps(prompt, indent=2)}],
        )
        answer_text = response.content[0].text.strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    try:
        get_supabase().table("triage_sessions").update(
            {
                "followup_question_asked": True,
                "followup_question": req.question,
                "followup_question_answer": answer_text,
            }
        ).eq("id", req.session_id).execute()
    except Exception as e:
        # Do not fail answer delivery if persistence fails.
        print(f"followup_question update error: {e}")

    return {"answer": answer_text}
