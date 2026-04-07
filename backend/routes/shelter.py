from fastapi import APIRouter, HTTPException

from db import get_supabase
from models import ShelterInquiryCreate

router = APIRouter(prefix="/shelter", tags=["shelter"])


@router.post("/inquiry")
async def create_shelter_inquiry(body: ShelterInquiryCreate):
    try:
        res = (
            get_supabase()
            .table("shelter_inquiries")
            .insert(
                {
                    "name": body.name.strip(),
                    "shelter_name": body.shelter_name.strip(),
                    "email": body.email.strip(),
                    "role": body.role.strip() if body.role else None,
                }
            )
            .execute()
        )
    except Exception as e:
        err = str(e).lower()
        if "shelter_inquiries" in err or "relation" in err or "does not exist" in err:
            raise HTTPException(
                status_code=503,
                detail="Shelter inquiries table not configured. Run shelter_inquiries.sql in Supabase.",
            )
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")

    row = res.data[0] if isinstance(res.data, list) else res.data
    return {"status": "ok", "id": row.get("id")}
