import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchFollowupSession, submitWeeklyCheckin } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import SiteFooter from "../components/SiteFooter.jsx";

const SCORE_OPTIONS = [
  { score: 1, emoji: "😰", label: "Much worse" },
  { score: 2, emoji: "😟", label: "About the same" },
  { score: 3, emoji: "😐", label: "Slightly better" },
  { score: 4, emoji: "🙂", label: "Noticeably better" },
  { score: 5, emoji: "😄", label: "A lot better" },
];

const TRIED_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "partially", label: "Partially" },
  { value: "no", label: "No" },
];

const LOW_SCORE_FALLBACK =
  "We could not generate a new suggestion just now. Your check-in was still saved - " +
  "try a smaller version of your original first step for a few days, and consider a " +
  "quick call with a certified trainer if things feel stuck or unsafe.";

export default function WeekOneCheckin() {
  const [params] = useSearchParams();
  const sessionId = params.get("session") || "";
  const weekRaw = Number(params.get("week"));
  const weekNumber =
    Number.isFinite(weekRaw) && weekRaw >= 1 && weekRaw <= 4 ? weekRaw : 1;

  const titleRef = useRef(null);
  const [step, setStep] = useState(1);
  const [dogName, setDogName] = useState("your dog");
  const [score, setScore] = useState(null);
  const [triedFirstStep, setTriedFirstStep] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [revisedFirstStep, setRevisedFirstStep] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    (async () => {
      try {
        const row = await fetchFollowupSession(sessionId);
        if (cancelled) return;
        const n = (row?.dog_name || row?.intake?.dog_name || "").trim();
        if (n) setDogName(n);
      } catch {
        /* session may still 404 on submit */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [step]);

  const handleScoreSelect = (s) => {
    setScore(s);
    setStep(2);
  };

  const handleTriedSelect = (v) => {
    setTriedFirstStep(v);
    setStep(3);
  };

  const handleFinish = async () => {
    if (!sessionId || score == null || !triedFirstStep || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await submitWeeklyCheckin({
        session_id: sessionId,
        week_number: weekNumber,
        score,
        tried_first_step: triedFirstStep,
        note: note.trim() || null,
      });
      const revised =
        typeof data?.revised_first_step === "string" && data.revised_first_step.trim()
          ? data.revised_first_step.trim()
          : null;
      setRevisedFirstStep(revised);
      setStep(4);
      try {
        sessionStorage.setItem(`stay_week1_checkin_done_${sessionId}`, "1");
      } catch {
        /* private mode */
      }
    } catch (e) {
      setError(
        sanitizeApiErrorMessage(e.message || "Could not save check-in")
      );
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="app">
        <div className="app-frame">
          <main className="app-main">
            <div className="screen">
              <h2>Missing check-in link</h2>
              <p className="subtitle">Open the link from your day 7 email again.</p>
              <p className="shelter-page__back">
                <Link to="/">Back to Stay</Link>
              </p>
            </div>
          </main>
          <SiteFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link">
            Stay
          </Link>
        </header>
        <main className="app-main">
          <div className="screen week-one-checkin">
            {step === 1 ? (
              <>
                <h2
                  id="week-checkin-q1"
                  ref={titleRef}
                  tabIndex={-1}
                  className="week-one-checkin__title"
                >
                  How is {dogName} doing?
                </h2>
                <div
                  className="week-one-checkin__scale"
                  role="radiogroup"
                  aria-labelledby="week-checkin-q1"
                >
                  {SCORE_OPTIONS.map((opt) => (
                    <button
                      key={opt.score}
                      type="button"
                      role="radio"
                      aria-checked={score === opt.score}
                      className={`week-one-checkin__emoji-btn${score === opt.score ? " week-one-checkin__emoji-btn--selected" : ""}`}
                      onClick={() => handleScoreSelect(opt.score)}
                    >
                      <span className="week-one-checkin__emoji" aria-hidden="true">
                        {opt.emoji}
                      </span>
                      <span className="week-one-checkin__emoji-label">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2
                  id="week-checkin-q2"
                  ref={titleRef}
                  tabIndex={-1}
                  className="week-one-checkin__title"
                >
                  Did you try the first step we suggested?
                </h2>
                <div
                  className="week-one-checkin__pills"
                  role="radiogroup"
                  aria-labelledby="week-checkin-q2"
                >
                  {TRIED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={triedFirstStep === opt.value}
                      className={`week-one-checkin__pill${triedFirstStep === opt.value ? " week-one-checkin__pill--selected" : ""}`}
                      onClick={() => handleTriedSelect(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h2
                  id="week-checkin-q3"
                  ref={titleRef}
                  tabIndex={-1}
                  className="week-one-checkin__title"
                >
                  Anything specific that happened this week?
                </h2>
                <p className="subtitle week-one-checkin__optional">Optional</p>
                <textarea
                  className="text-input week-one-checkin__textarea"
                  rows={5}
                  placeholder="Even one sentence helps."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={loading}
                  maxLength={4000}
                  aria-labelledby="week-checkin-q3"
                />
                {error ? <p className="error-text">{error}</p> : null}
                <div className="nav-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleFinish}
                    disabled={loading}
                  >
                    {loading ? "Saving…" : "Continue"}
                  </button>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <div className="week-one-checkin__thanks" aria-live="polite">
                <h2 ref={titleRef} tabIndex={-1} className="week-one-checkin__title">
                  Thank you
                </h2>
                {score >= 4 ? (
                  <p className="week-one-checkin__thanks-body">
                    That&apos;s real progress. Keep going - we&apos;ll check in again at day
                    30.
                  </p>
                ) : null}
                {score <= 2 ? (
                  <>
                    <p className="week-one-checkin__thanks-body">
                      That&apos;s honest feedback and it matters. Here&apos;s one adjusted
                      suggestion based on what you told us:
                    </p>
                    <p className="week-one-checkin__revised">
                      {revisedFirstStep || LOW_SCORE_FALLBACK}
                    </p>
                  </>
                ) : null}
                {score === 3 ? (
                  <p className="week-one-checkin__thanks-body">
                    Thanks for checking in. We&apos;ll follow up again at day 30.
                  </p>
                ) : null}
                <p className="shelter-page__back" style={{ marginTop: 24 }}>
                  <Link to="/">Back to Stay</Link>
                </p>
              </div>
            ) : null}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
