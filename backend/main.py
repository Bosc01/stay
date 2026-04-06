from dotenv import load_dotenv

load_dotenv("backend/.env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.triage import router as triage_router
from routes.followup import router as followup_router
from routes.referrals import router as referrals_router
from routes.profile import router as profile_router
from routes.stories import router as stories_router
from routes.resources import router as resources_router
from routes.followup_question import router as followup_question_router
from routes.admin import router as admin_router

app = FastAPI(title="Stay — Dog Behavior Triage")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(triage_router)
app.include_router(followup_router)
app.include_router(referrals_router)
app.include_router(profile_router)
app.include_router(stories_router)
app.include_router(resources_router)
app.include_router(followup_question_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
