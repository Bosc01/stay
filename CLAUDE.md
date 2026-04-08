# Stay — Claude Code Memory

## What this app is
Stay is an AI-powered dog behavior triage tool for 
owners who are scared, overwhelmed, and one bad 
incident away from surrendering their dog. The tone 
is warm, non-judgmental, and human. It should feel 
like a knowledgeable friend, not a chatbot dashboard.

## Core design principle
Every screen should make the user feel: 
"Someone understands what I'm going through."
Never: "I am submitting data to a system."

## Stack
- Frontend: React + Vite, deployed on Vercel
- Backend: FastAPI, deployed on Railway  
- Database: Supabase (triage_sessions, journal_entries, stories)
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Email: Resend

## Structure
stay/
├── frontend/src/screens/   # React screens
├── backend/routes/         # FastAPI routes
├── backend/models.py       # Pydantic models
├── backend/prompts/        # Claude system prompts
└── CLAUDE.md

## Commands
- Frontend dev: cd frontend && npm run dev
- Backend dev: cd backend && uvicorn main:app --reload
- Deploy: git add . && git commit -m "msg" && git push

## Design rules (enforce these in every edit)
- No em dashes anywhere — use hyphens or rewrite
- No "confidence scores", "signal counts", or AI 
  explainability language visible to users
- No resource tag pills visible on result screen
- Dog name must be used wherever possible instead 
  of "your dog"
- Buttons should feel warm: "See what's going on" 
  not "Submit"
- Error states must never say "Session not found" 
  to the user — show "Something went wrong, try again"
- Loading states use human language, not "Processing..."

## Tone rules
- Address the owner directly and warmly
- Never use clinical or algorithmic language in UI copy
- Avoid: "based on N signals", "classification", 
  "severity score", "triage complete"
- Use: "here's what we think is happening", 
  "what to try today", "how serious is this"

