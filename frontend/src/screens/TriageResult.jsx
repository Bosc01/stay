import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import TriageBadge from "../components/TriageBadge.jsx";
import { submitFollowup, submitFollowupQuestion } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import { rememberProfileSession } from "../profileHistory.js";

function prefersMobileShare() {
  if (typeof navigator.share !== "function") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/** Split on ". " so the first two segments are the collapsed preview. */
function splitRootCauseSentences(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return { preview: "", rest: "", hasMore: false };
  }
  const segments = raw.split(". ");
  if (segments.length <= 2) {
    return { preview: raw, rest: "", hasMore: false };
  }
  return {
    preview: segments.slice(0, 2).join(". "),
    rest: segments.slice(2).join(". "),
    hasMore: true,
  };
}

export default function TriageResult({
  result,
  intake,
  update,
  sessionId: sessionIdProp,
  resetToStart,
}) {
  const [email, setEmail] = useState(intake.email || "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState(null);
  const [friendShareCopied, setFriendShareCopied] = useState(false);
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [followupQuestionLoading, setFollowupQuestionLoading] = useState(false);
  const [followupQuestionError, setFollowupQuestionError] = useState(null);
  const [followupQuestionAnswer, setFollowupQuestionAnswer] = useState("");
  const [hasAskedFollowupQuestion, setHasAskedFollowupQuestion] = useState(false);
  const [sessionId, setSessionId] = useState(
    sessionIdProp ?? result?.session_id ?? null
  );
  const hasSessionId = sessionId !== null && sessionId !== undefined;
  const [redGateDismissed, setRedGateDismissed] = useState(false);

  const [interviewEverHandled, setInterviewEverHandled] = useState(false);
  const [interviewDeadlinePassed, setInterviewDeadlinePassed] = useState(false);
  const [interviewFlowPhase, setInterviewFlowPhase] = useState(null);
  const [interviewQ1, setInterviewQ1] = useState("");
  const [interviewQ2, setInterviewQ2] = useState("");
  const [interviewQ3, setInterviewQ3] = useState("");
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [interviewError, setInterviewError] = useState(null);
  const [rootCauseExpanded, setRootCauseExpanded] = useState(false);

  useEffect(() => {
    setRootCauseExpanded(false);
  }, [result?.root_cause, result?.honest_note, result?.session_id]);

  useEffect(() => {
    setSessionId(sessionIdProp ?? result?.session_id ?? null);
  }, [result, sessionIdProp]);

  useEffect(() => {
    if (!result) return;
    const data = result;
    console.log("Triage response:", data);
  }, [result]);

  useEffect(() => {
    if (hasSessionId) rememberProfileSession(sessionId);
  }, [hasSessionId, sessionId]);

  useEffect(() => {
    setRedGateDismissed(false);
  }, [result?.session_id]);

  useEffect(() => {
    if (!sessionId) {
      setInterviewEverHandled(false);
      return;
    }
    try {
      const v = sessionStorage.getItem(`stay_user_interview_${sessionId}`);
      setInterviewEverHandled(v === "dismissed" || v === "submitted");
    } catch {
      setInterviewEverHandled(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setInterviewDeadlinePassed(false);
    setInterviewFlowPhase(null);
    setInterviewQ1("");
    setInterviewQ2("");
    setInterviewQ3("");
    setInterviewError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!hasSessionId || interviewEverHandled) return undefined;
    const t = window.setTimeout(() => setInterviewDeadlinePassed(true), 60_000);
    return () => window.clearTimeout(t);
  }, [hasSessionId, sessionId, interviewEverHandled]);

  if (!result) return null;

  const severityRaw = String(result.severity ?? "").toLowerCase();
  const severityKey = ["green", "yellow", "red"].includes(severityRaw)
    ? severityRaw
    : "yellow";
  const dogName = String(intake?.dog_name || "").trim();
  const hasDogName = dogName.length > 0;
  const dogNameSentenceCase = hasDogName
    ? dogName.charAt(0).toUpperCase() + dogName.slice(1)
    : "";
  const rootCauseSplit = splitRootCauseSentences(result.root_cause);
  const honestNoteText = String(result.honest_note ?? "").trim();
  const hasHonestNote = honestNoteText.length > 0;
  const showReadMoreToggle = rootCauseSplit.hasMore || hasHonestNote;

  const handleSendToFriend = async () => {
    const dogName = intake.dog_name?.trim();
    const friendShareText = `I just used Stay to understand ${dogName || "my dog"}'s behavior. It's free and takes 2 minutes - no judgment.`;
    if (prefersMobileShare()) {
      try {
        await navigator.share({
          title: "Stay - free dog behavior triage",
          text: friendShareText,
          url: "https://trystay.org",
        });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(
        `${friendShareText}\nhttps://trystay.org`
      );
      setFriendShareCopied(true);
      window.setTimeout(() => setFriendShareCopied(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFollowupSubmit = async () => {
    if (!hasSessionId) {
      setFollowupError(
        "We couldn't save your session for email updates. Please start over and try again."
      );
      return;
    }
    setFollowupLoading(true);
    setFollowupError(null);
    try {
      await submitFollowup({ session_id: sessionId, email });
      update({ email });
      setEmailSaved(true);
    } catch (err) {
      setFollowupError(
        sanitizeApiErrorMessage(
          err.message || "Something went wrong. Please try again."
        )
      );
    } finally {
      setFollowupLoading(false);
    }
  };

  const handleFollowupQuestionSubmit = async () => {
    const question = followupQuestion.trim();
    if (!hasSessionId || hasAskedFollowupQuestion || !question) return;
    setFollowupQuestionLoading(true);
    setFollowupQuestionError(null);
    try {
      const data = await submitFollowupQuestion({
        session_id: sessionId,
        question,
        original_triage: result,
      });
      setFollowupQuestionAnswer(String(data?.answer || "").trim());
      setHasAskedFollowupQuestion(true);
    } catch (err) {
      const raw = err.message || "Could not get an answer right now.";
      setFollowupQuestionError(sanitizeApiErrorMessage(raw));
      if (raw.toLowerCase().includes("already asked")) {
        setHasAskedFollowupQuestion(true);
      }
    } finally {
      setFollowupQuestionLoading(false);
    }
  };

  const handleUserInterviewDismiss = () => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(`stay_user_interview_${sessionId}`, "dismissed");
    } catch {
      /* ignore */
    }
    setInterviewEverHandled(true);
  };

  const handleUserInterviewAccept = () => {
    setInterviewFlowPhase("q1");
    setInterviewError(null);
  };

  const handleUserInterviewSubmit = async () => {
    if (!sessionId) return;
    setInterviewSubmitting(true);
    setInterviewError(null);
    try {
      try {
        sessionStorage.setItem(`stay_user_interview_${sessionId}`, "submitted");
      } catch {
        /* ignore */
      }
      setInterviewFlowPhase("thanks");
    } catch (e) {
      setInterviewError(
        sanitizeApiErrorMessage(e.message || "Something went wrong")
      );
    } finally {
      setInterviewSubmitting(false);
    }
  };

  const handleUserInterviewModalClose = () => {
    setInterviewFlowPhase(null);
    setInterviewEverHandled(true);
  };

  const showRedGate = severityKey === "red" && !redGateDismissed;
  const showUserInterviewFloat =
    hasSessionId &&
    interviewDeadlinePassed &&
    !showRedGate &&
    !interviewEverHandled &&
    interviewFlowPhase === null;
  const showUserInterviewModal = interviewFlowPhase !== null;

  if (!hasSessionId) {
    return (
      <div className="screen result-screen">
        <div className="result-card" role="alert" aria-live="polite">
          <p className="result-card-label">Session error</p>
          <p className="result-card-body">
            We could not save your session ID, so this result cannot be continued.
            Please start over and try again.
          </p>
        </div>
        <div className="nav-row">
          <button
            type="button"
            onClick={resetToStart}
            style={{
              background: "none",
              border: "none",
              color: "#666",
              fontSize: 14,
              cursor: "pointer",
              padding: "16px 0",
              textDecoration: "underline",
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen result-screen">
      {showRedGate ? (
        <div
          style={{
            minHeight: 400,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            margin: "0 0 16px",
          }}
          role="alertdialog"
          aria-labelledby="red-gate-heading"
          aria-describedby="red-gate-body"
        >
          <div
            style={{
              maxWidth: 360,
              padding: "28px 22px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 16,
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "5px 12px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 999,
                background: "#2e0a0a",
                color: "#f87171",
                border: "1px solid #991b1b",
              }}
            >
              We'd recommend getting some help
            </span>
            <h2
              id="red-gate-heading"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 600,
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
                color: "var(--fg)",
              }}
            >
              {hasDogName
                ? `${dogName} needs professional support before anything else.`
                : "Your dog needs professional support before anything else."}
            </h2>
            <p
              id="red-gate-body"
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--color-text-secondary)",
              }}
            >
              What you&apos;re describing goes beyond what any app should advise
              on. The most important thing you can do right now is contact a
              certified professional - not because{" "}
              {hasDogName ? `${dogName} can&apos;t be helped,` : "your dog can&apos;t be helped,"}
              but because they can.
            </p>
            <a
              className="btn btn-primary"
              href="https://www.dacvb.org/search/custom.asp?id=4803"
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              Find a certified behaviorist
            </a>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%" }}
              onClick={() => setRedGateDismissed(true)}
            >
              See full triage anyway
            </button>
          </div>
        </div>
      ) : null}

      {!showRedGate ? (
        <>
      <div className="result-badge-row" style={{ textAlign: "left" }}>
        {hasDogName ? (
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--color-text-tertiary)",
              letterSpacing: "0.01em",
            }}
          >
            {dogName}
          </p>
        ) : null}
        <TriageBadge severity={result.severity} label={result.severity_label} />
      </div>

      <h2 className="result-behavior-heading">{result.behavior_classification}</h2>

      <section className="result-card" aria-labelledby="label-root-cause">
        <p id="label-root-cause" className="result-card-label">
          What&apos;s probably going on
        </p>
        <div>
          <p className="result-card-body">
            {rootCauseSplit.preview}
            {rootCauseExpanded && rootCauseSplit.hasMore ? (
              <>
                {". "}
                {rootCauseSplit.rest}
              </>
            ) : null}
            {showReadMoreToggle ? (
              <>
                {" "}
                <button
                  type="button"
                  className="result-root-cause-toggle--inline"
                  onClick={() => setRootCauseExpanded((v) => !v)}
                  aria-expanded={rootCauseExpanded}
                >
                  {rootCauseExpanded ? "Read less" : "Read more"}
                </button>
              </>
            ) : null}
          </p>
          {rootCauseExpanded && hasHonestNote ? (
            <p
              className="result-card-body result-card-body--muted"
              style={{ marginTop: 12 }}
            >
              {honestNoteText}
            </p>
          ) : null}
        </div>
      </section>

      <section className="result-card result-card--first-step" aria-labelledby="label-first-step">
        <p id="label-first-step" className="result-card-label">
          What to try today
        </p>
        <p className="result-card-body">{result.first_step}</p>
      </section>

      <div className="result-section-2-wrap">
        <div className="result-section-2-inner">
          {!emailSaved ? (
            <div className="followup-section follow-up-section email-section">
              <h3>Want us to check in after 7 days?</h3>
              <p>
                We&apos;ll email you to see how things are going and whether your
                dog is still home.
              </p>
              <div className="followup-row">
                <input
                  type="email"
                  className="email-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={followupLoading}
                  autoComplete="email"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    !email.includes("@") || followupLoading || !hasSessionId
                  }
                  onClick={handleFollowupSubmit}
                >
                  {followupLoading ? "Saving..." : "Sign up"}
                </button>
              </div>
              {!hasSessionId && (
                <p className="followup-hint">
                  Email signup isn&apos;t available because this session
                  wasn&apos;t saved. Your triage above is still valid.
                </p>
              )}
              {followupError && <p className="error-text">{followupError}</p>}
            </div>
          ) : (
            <div className="followup-section followup-section--success follow-up-section">
              <p className="followup-success-message">
                We will check in on {hasDogName ? dogName : "your dog"} in 7 days.
              </p>
            </div>
          )}

          <section
            className="friend-share-section share-section"
            aria-label="Send Stay to a friend"
          >
            <button
              type="button"
              className="btn btn-secondary friend-share-btn"
              onClick={handleSendToFriend}
            >
              Send to a friend
            </button>
            {friendShareCopied ? (
              <p className="friend-share-copied" role="status">
                Copied to clipboard
              </p>
            ) : null}
          </section>

          <section
            className="result-card"
            aria-labelledby="followup-question-heading"
            style={{ marginTop: 32 }}
          >
            <p id="followup-question-heading" className="result-card-label">
              Have a specific question about{" "}
              {hasDogName
                ? `${dogNameSentenceCase}'s`
                : "your dog's"}{" "}
              situation?
            </p>
            <div className="followup-row">
              <input
                type="text"
                className="email-input"
                placeholder="Type your question..."
                value={followupQuestion}
                onChange={(e) => setFollowupQuestion(e.target.value)}
                disabled={
                  !hasSessionId ||
                  hasAskedFollowupQuestion ||
                  followupQuestionLoading
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleFollowupQuestionSubmit();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !hasSessionId ||
                  hasAskedFollowupQuestion ||
                  followupQuestionLoading ||
                  !followupQuestion.trim()
                }
                onClick={handleFollowupQuestionSubmit}
              >
                {followupQuestionLoading ? "Sending..." : "Send"}
              </button>
            </div>
            {followupQuestionError ? (
              <p className="error-text" style={{ marginTop: 8 }}>
                {followupQuestionError}
              </p>
            ) : null}
            {followupQuestionAnswer ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 20,
                  border: "1px solid var(--card-border)",
                  borderRadius: 16,
                  background: "var(--card-bg)",
                }}
              >
                <ReactMarkdown
                  className="result-card-markdown"
                  components={{
                    strong: ({ node, ...props }) => (
                      <strong
                        {...props}
                        style={{ fontWeight: 600 }}
                      />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul
                        {...props}
                        style={{ margin: "0.5rem 0 0.5rem 1.25rem", listStyleType: "disc" }}
                      />
                    ),
                    li: ({ node, ...props }) => (
                      <li
                        {...props}
                        style={{ marginBottom: "0.25rem" }}
                      />
                    ),
                  }}
                >
                  {followupQuestionAnswer}
                </ReactMarkdown>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "#666",
          textAlign: "center",
          padding: "0 16px",
          lineHeight: 1.5,
          marginTop: 16,
        }}
      >
        If your dog has a bite history, please contact a certified trainer directly.
      </p>

      <div className="nav-row">
        <button
          type="button"
          onClick={resetToStart}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            fontSize: 14,
            cursor: "pointer",
            padding: "16px 0",
            textDecoration: "underline",
          }}
        >
          Start over
        </button>
      </div>
        </>
      ) : null}

      {showUserInterviewFloat ? (
        <div className="result-interview-float" role="region" aria-label="Research invite">
          <div className="result-interview-float__card">
            <p className="result-interview-float__text">
              Help us improve Stay - 3 questions, 2 minutes. We read every response.
            </p>
            <div className="result-interview-float__actions">
              <button
                type="button"
                className="btn btn-primary result-interview-float__btn-primary"
                onClick={handleUserInterviewAccept}
              >
                Sure, I&apos;ll help
              </button>
              <button
                type="button"
                className="btn btn-secondary result-interview-float__btn-dismiss"
                onClick={handleUserInterviewDismiss}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUserInterviewModal ? (
        <div
          className="result-interview-modal__backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && interviewFlowPhase === "thanks") {
              handleUserInterviewModalClose();
            }
          }}
        >
          <div
            className="result-interview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-interview-dialog-title"
            aria-describedby="result-interview-dialog-desc"
          >
            {interviewFlowPhase === "q1" ? (
              <>
                <p id="result-interview-dialog-title" className="result-interview-modal__label">
                  Step 1 of 3
                </p>
                <p id="result-interview-dialog-desc" className="result-interview-modal__question">
                  Before you found Stay, what did you try when{" "}
                  {hasDogName ? `${dogName} had this behavior?` : "your dog had this behavior?"}
                </p>
                <textarea
                  className="text-input result-interview-modal__textarea"
                  rows={5}
                  value={interviewQ1}
                  onChange={(e) => setInterviewQ1(e.target.value)}
                  autoFocus
                  aria-label="Your answer"
                />
                <div className="result-interview-modal__nav">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setInterviewFlowPhase("q2")}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}
            {interviewFlowPhase === "q2" ? (
              <>
                <p id="result-interview-dialog-title" className="result-interview-modal__label">
                  Step 2 of 3
                </p>
                <p id="result-interview-dialog-desc" className="result-interview-modal__question">
                  What almost stopped you from finishing the triage just now?
                </p>
                <textarea
                  className="text-input result-interview-modal__textarea"
                  rows={5}
                  value={interviewQ2}
                  onChange={(e) => setInterviewQ2(e.target.value)}
                  autoFocus
                  aria-label="Your answer"
                />
                <div className="result-interview-modal__nav">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setInterviewFlowPhase("q1")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setInterviewFlowPhase("q3")}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}
            {interviewFlowPhase === "q3" ? (
              <>
                <p id="result-interview-dialog-title" className="result-interview-modal__label">
                  Step 3 of 3
                </p>
                <p id="result-interview-dialog-desc" className="result-interview-modal__question">
                  If this triage was helpful, who&apos;s the first person you&apos;d think to
                  share it with?
                </p>
                <textarea
                  className="text-input result-interview-modal__textarea"
                  rows={5}
                  value={interviewQ3}
                  onChange={(e) => setInterviewQ3(e.target.value)}
                  autoFocus
                  aria-label="Your answer"
                />
                {interviewError ? <p className="error-text">{interviewError}</p> : null}
                <div className="result-interview-modal__nav">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setInterviewFlowPhase("q2")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUserInterviewSubmit}
                    disabled={interviewSubmitting}
                  >
                    {interviewSubmitting ? "Sending..." : "Submit"}
                  </button>
                </div>
              </>
            ) : null}
            {interviewFlowPhase === "thanks" ? (
              <>
                <p id="result-interview-dialog-title" className="result-interview-modal__thanks-title">
                  Thank you
                </p>
                <p id="result-interview-dialog-desc" className="result-interview-modal__thanks-body">
                  We read every response.
                </p>
                <div className="result-interview-modal__nav">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUserInterviewModalClose}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
