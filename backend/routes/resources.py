import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/resources", tags=["resources"])

_RESOURCE_FILE = Path(__file__).resolve().parent.parent / "data" / "resources_austin.json"

try:
    _ALL_RESOURCES = json.loads(_RESOURCE_FILE.read_text())
except Exception:
    _ALL_RESOURCES = []


@router.get("/nearby")
async def nearby_resources(lat: float | None = None, lon: float | None = None):
    # For now we serve static Austin + national data.
    # If geolocation is missing/denied, return national-only fallback.
    if lat is None or lon is None:
        rows = [r for r in _ALL_RESOURCES if r.get("is_national")]
        return {"resources": rows}

    return {"resources": _ALL_RESOURCES}
