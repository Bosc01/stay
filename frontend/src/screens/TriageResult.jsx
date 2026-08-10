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
        "Something went wrong saving your session. Please start over and try again."
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

  const showRedGate = severityKey === "red" && !redGateDismissed;

  if (!hasSessionId) {
    return (
      <div className="screen result-screen">
        <p className="result-salutation">A note</p>
        <h2 className="result-behavior-heading">Something went wrong.</h2>
        <section className="result-card" role="alert" aria-live="polite">
          <p className="result-card-label">What happened</p>
          <p className="result-card-body">
            We couldn&apos;t hold onto your session, so we can&apos;t continue
            from here. It happens. Please start over and we&apos;ll try again.
          </p>
        </section>
        <div className="nav-row">
          <button
            type="button"
            onClick={resetToStart}
            className="result-start-over"
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
          className="result-red-gate"
          role="alertdialog"
          aria-labelledby="red-gate-heading"
          aria-describedby="red-gate-body"
        >
          <span className="result-red-gate__eyebrow">
            This deserves a real person
          </span>
          <h2 id="red-gate-heading" className="result-red-gate__heading">
            {hasDogName
              ? `${dogName} needs professional support before anything else.`
              : "Your dog needs professional support before anything else."}
          </h2>
          <p id="red-gate-body" className="result-red-gate__body">
            What you&apos;re describing goes beyond what any app should advise
            on. The most important thing you can do right now is contact a
            certified professional - not because{" "}
            {hasDogName
              ? `${dogName} can't be helped,`
              : "your dog can't be helped,"}{" "}
            but because they can.
          </p>
          <a
            className="btn btn-primary"
            href="https://www.dacvb.org/search/custom.asp?id=4803"
            target="_blank"
            rel="noopener noreferrer"
          >
            Find a certified behaviorist
          </a>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setRedGateDismissed(true)}
          >
            See full triage anyway
          </button>
        </div>
      ) : null}

      {!showRedGate ? (
        <>
          {/* Salutation — sets a warm, personal tone before any clinical info */}
          {hasDogName ? (
            <p className="result-salutation">{dogNameSentenceCase}</p>
          ) : (
            <p className="result-salutation">Here&apos;s what we&apos;re seeing.</p>
          )}

          <div className="result-badge-row">
            <TriageBadge severity={result.severity} label={result.severity_label} />
          </div>

          <h2 className="result-behavior-heading">
            {result.behavior_classification}
          </h2>

          {/* What's probably going on — first paragraph of the letter */}
          <section className="result-card" aria-labelledby="label-root-cause">
            <p id="label-root-cause" className="result-card-label">
              What&apos;s probably going on
            </p>
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
              <p className="result-card-body result-card-body--muted">
                {honestNoteText}
              </p>
            ) : null}
          </section>

          <p className="result-disclaimer">
            This is our best read of the situation, not a clinical diagnosis.
            Every dog is different.
          </p>

          {/* What to try today — the second, action-oriented paragraph */}
          <section
            className="result-card result-card--first-step"
            aria-labelledby="label-first-step"
          >
            <p id="label-first-step" className="result-card-label">
              What to try today
            </p>
            <p className="result-card-body">{result.first_step}</p>
          </section>

          <div className="result-letter-divider" aria-hidden="true" />

          {/* Postscripts: check-in, share, ask follow-up */}
          <div className="result-section-2-wrap">
            <div className="result-section-2-inner">
              {!emailSaved ? (
                <div className="followup-section follow-up-section email-section">
                  <h3>Want us to check in after 7 days?</h3>
                  <p>
                    We&apos;ll email you to see how things are going and
                    whether {hasDogName ? dogName : "your dog"} is still home.
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
                  {followupError && (
                    <p className="error-text">{followupError}</p>
                  )}
                  <div className="friend-share-link-row">
                    <button
                      type="button"
                      className="friend-share-link"
                      onClick={handleSendToFriend}
                    >
                      Send to a friend
                    </button>
                    {friendShareCopied ? (
                      <span
                        className="friend-share-link-copied"
                        role="status"
                      >
                        Copied
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="followup-section followup-section--success follow-up-section">
                  <p className="followup-success-message">
                    We&apos;ll check in on{" "}
                    {hasDogName ? dogName : "your dog"} in 7 days.
                  </p>
                  <div className="friend-share-link-row">
                    <button
                      type="button"
                      className="friend-share-link"
                      onClick={handleSendToFriend}
                    >
                      Send to a friend
                    </button>
                    {friendShareCopied ? (
                      <span
                        className="friend-share-link-copied"
                        role="status"
                      >
                        Copied
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

              <section
                className="result-card result-card--followup"
                aria-labelledby="followup-question-heading"
              >
                <p
                  id="followup-question-heading"
                  className="result-card-label"
                >
                  Have a specific question about{" "}
                  {hasDogName ? `${dogNameSentenceCase}'s` : "your dog's"}{" "}
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
                  <p className="error-text">{followupQuestionError}</p>
                ) : null}
                {followupQuestionAnswer ? (
                  <div className="followup-answer result-card-markdown">
                    <ReactMarkdown>{followupQuestionAnswer}</ReactMarkdown>
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          {/* Sign-off */}
          <p className="result-closing">
            If {hasDogName ? dogName : "your dog"} has a bite history, please
            contact a certified trainer directly.
          </p>

          <div className="nav-row nav-row--center">
            <button
              type="button"
              onClick={resetToStart}
              className="result-start-over"
            >
              Start over
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
