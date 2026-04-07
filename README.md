# Stay - AI Dog Surrender Prevention

Stay is a free AI-powered behavior triage tool 
that helps dog owners understand what is driving 
their dog's behavior and what to do about it
before they reach the point of surrender.

## The problem
28% of dog surrenders are driven by behavioral 
issues. Most are preventable with early, 
accessible guidance. No product exists that 
intercepts owners before they walk into a shelter.

## What it does
1. Owner describes their dog's behavior (1 min)
2. Claude AI diagnoses the root cause
3. Owner gets a plain-language explanation + 
   one specific step to try today
4. 30-day follow-up tracks whether the dog 
   stayed home

## Tech stack
- Frontend: React + Vite, deployed on Vercel
- Backend: FastAPI (Python), deployed on Railway
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Database: Supabase (PostgreSQL)
- Email: Resend
- Domain: trystay.org

## Key features
- AI behavior triage with severity classification 
  (green/yellow/red)
- Hard-coded safety rules: bite history or child 
  involved → mandatory professional referral
- Shareable result cards for organic distribution
- 30-day follow-up email pipeline
- Shelter partner portal with referral tracking
- Weekly behavior check-ins
- Dog profile with triage history
- Behavior education cards
- Follow-up question to Claude

## North star metric
% of beta users whose dog is still home at 30 days

## Running locally

### Backend
cd backend
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...
export SUPABASE_URL=...
export SUPABASE_KEY=...
uvicorn main:app --reload

### Frontend
cd frontend
npm install
npm run dev

## Pilot
Currently piloting with Austin Pets Alive 
(Austin, TX). Recruiting 10+ beta users to 
validate retention impact.

## Built by
Harekas Bindra — CS + Linguistics student, 
UT Austin
linkedin.com/in/harekas
