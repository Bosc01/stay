from dotenv import load_dotenv

load_dotenv("backend/.env")

from contextlib import asynccontextmanager

from anyio import to_thread
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from logging_config import configure_logging

configure_logging()

from routes.triage import router as triage_router
from routes.followup import router as followup_router
from routes.referrals import router as referrals_router
from routes.profile import router as profile_router
from routes.stories import router as stories_router
from routes.resources import router as resources_router
from routes.followup_question import router as followup_question_router
from routes.ask import router as ask_router
from routes.admin import router as admin_router
from routes.shelter import router as shelter_router
from routes.user_interview import router as user_interview_router
from routes.impact import router as impact_router
from routes.events import router as events_router

# Every handler but two is sync, and a thinking-path triage can hold a thread
# for tens of seconds, so AnyIO's default of 40 threads runs out first.
THREADPOOL_SIZE = 100


@asynccontextmanager
async def lifespan(app: FastAPI):
    to_thread.current_default_thread_limiter().total_tokens = THREADPOOL_SIZE
    yield


app = FastAPI(title="Stay - Dog Behavior Triage", lifespan=lifespan)

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
app.include_router(ask_router)
app.include_router(admin_router)
app.include_router(shelter_router)
app.include_router(user_interview_router)
app.include_router(impact_router)
app.include_router(events_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
