from dotenv import load_dotenv

load_dotenv("backend/.env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.triage import router as triage_router
from routes.followup import router as followup_router

app = FastAPI(title="Stay — Dog Behavior Triage")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(triage_router)
app.include_router(followup_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
