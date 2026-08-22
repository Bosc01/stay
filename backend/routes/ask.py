import anthropic
from fastapi import APIRouter, HTTPException

from models import AskRequest

router = APIRouter()
client = anthropic.Anthropic()

SYSTEM_PROMPT = (
    "You are a knowledgeable dog behavior assistant. The owner has come "
    "directly with a question about their dog's behavior. Answer warmly "
    "and specifically. Give a direct answer first, then explain the "
    "reasoning. Keep it under 200 words. No em dashes. No bullet points "
    "unless essential."
)


@router.post("/ask")
async def ask(req: AskRequest):
    try:
        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=500,
            thinking={"type": "disabled"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": req.question}],
        )
        answer_text = response.content[0].text.strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    return {"answer": answer_text}
