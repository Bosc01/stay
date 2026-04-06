import { useState } from "react";
import TriageBadge from "../components/TriageBadge.jsx";
import { submitFollowup } from "../api.js";

function formatFollowUpDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

/** Turn snake_case API tags into Title Case labels for display. */
function formatResourceTag(tag) {
  return String(tag)
    .trim()
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function TriageResult({
  result,
  intake,
  update,
  setScreen,
  resetToStart,
}) {
  const [email, setEmail] = useState(intake.email || "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState(null);
  const [checkInDateLabel, setCheckInDateLabel] = useState(null);

  if (!result) return null;

  const resourceTags = result.resource_tags ?? [];
  const sessionId = result.session_id;

  const handleFollowupSubmit = async () => {
    if (!sessionId) {
      setFollowupError(
        "We couldn't save your session for email updates. Please start over and try again."
      );
      return;
    }
    setFollowupLoading(true);
    setFollowupError(null);
    try {
      const data = await submitFollowup({ session_id: sessionId, email });
      update({ email });
      const label =
        formatFollowUpDate(data.follow_up_send_at) ||
        formatFollowUpDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        );
      setCheckInDateLabel(label);
      setEmailSaved(true);
    } catch (err) {
      setFollowupError(err.message || "Something went wrong. Please try again.");
    } finally {
      setFollowupLoading(false);
    }
  };

  return (
    <div className="screen result-screen">
      <div className="result-badge-row">
        <TriageBadge severity={result.severity} label={result.severity_label} />
      </div>

      <h2 className="result-behavior-heading">{result.behavior_classification}</h2>

      <section className="result-card" aria-labelledby="label-root-cause">
        <p id="label-root-cause" className="result-card-label">
          What&apos;s driving it
        </p>
        <p className="result-card-body">{result.root_cause}</p>
      </section>

      <section className="result-card result-card--first-step" aria-labelledby="label-first-step">
        <p id="label-first-step" className="result-card-label">
          Try this today
        </p>
        <p className="result-card-body">{result.first_step}</p>
      </section>

      {result.honest_note && (
        <section className="result-card result-card--honest" aria-labelledby="label-honest">
          <p id="label-honest" className="result-card-label result-card-label--muted">
            Honest assessment
          </p>
          <p className="result-card-body result-card-body--muted">{result.honest_note}</p>
        </section>
      )}

      {result.escalation_needed && (
        <section className="escalation-card" aria-labelledby="escalation-title">
          <h3 id="escalation-title" className="escalation-card-title">
            Professional support recommended
          </h3>
          {result.escalation_reason ? (
            <p className="escalation-card-body">{result.escalation_reason}</p>
          ) : null}
        </section>
      )}

      {resourceTags.length > 0 && (
        <div className="resource-pills" aria-label="Resource tags">
          {resourceTags.map((tag, i) => (
            <span key={`${String(tag)}-${i}`} className="resource-pill">
              {formatResourceTag(tag)}
            </span>
          ))}
        </div>
      )}

      {!emailSaved ? (
        <div className="followup-section">
          <h3>Get a check-in in 30 days</h3>
          <p>
            We'll email you to see how things are going and whether your dog is
            still home.
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
              className="btn btn-primary"
              disabled={
                !email.includes("@") || followupLoading || !sessionId
              }
              onClick={handleFollowupSubmit}
            >
              {followupLoading ? "Saving…" : "Sign up"}
            </button>
          </div>
          {!sessionId && (
            <p className="followup-hint">
              Email signup isn&apos;t available because this session wasn&apos;t
              saved. Your triage above is still valid.
            </p>
          )}
          {followupError && <p className="error-text">{followupError}</p>}
        </div>
      ) : (
        <div className="followup-section followup-section--success">
          <p className="followup-success-message">
            You&apos;re signed up — we&apos;ll check in on{" "}
            <strong>{checkInDateLabel ?? "the scheduled date"}</strong>.
          </p>
        </div>
      )}

      <div className="nav-row">
        <button type="button" className="btn btn-secondary" onClick={resetToStart}>
          Start Over
        </button>
      </div>
    </div>
  );
}
