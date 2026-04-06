import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import TriageBadge from "../components/TriageBadge.jsx";
import { submitFollowup } from "../api.js";
import { rememberProfileSession } from "../profileHistory.js";
import logoUrl from "../assets/stay-logo.png";

const SHARE_DISPLAY_URL = "trystay.org";

const FRIEND_SHARE_URL = "https://trystay.org";
const FRIEND_SHARE_TITLE = "Stay — free dog behavior triage";

function prefersMobileShare() {
  if (typeof navigator.share !== "function") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

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
  resetToStart,
}) {
  const shareCaptureRef = useRef(null);
  const [shareBusy, setShareBusy] = useState(false);

  const [email, setEmail] = useState(intake.email || "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState(null);
  const [checkInDateLabel, setCheckInDateLabel] = useState(null);
  const [friendShareCopied, setFriendShareCopied] = useState(false);
  const [sessionId, setSessionId] = useState(result?.session_id ?? null);

  if (!result) return null;

  const resourceTags = result.resource_tags ?? [];
  const hasSessionId = sessionId !== null && sessionId !== undefined;

  useEffect(() => {
    setSessionId(result?.session_id ?? null);
  }, [result]);

  useEffect(() => {
    if (hasSessionId) rememberProfileSession(sessionId);
  }, [hasSessionId, sessionId]);

  const severityRaw = String(result.severity ?? "").toLowerCase();
  const severityKey = ["green", "yellow", "red"].includes(severityRaw)
    ? severityRaw
    : "yellow";

  const shareHeadlineParts = [];
  if (intake.dog_name?.trim()) shareHeadlineParts.push(intake.dog_name.trim());
  if (result.behavior_classification)
    shareHeadlineParts.push(result.behavior_classification);
  const shareHeadline =
    shareHeadlineParts.join(" — ") || result.behavior_classification || "Stay";

  const handleShareResults = async () => {
    const el = shareCaptureRef.current;
    if (!el || shareBusy) return;
    setShareBusy(true);
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 1)
      );
      if (!blob) throw new Error("Could not create image");

      const file = new File([blob], "stay-triage.png", { type: "image/png" });

      if (navigator.share) {
        try {
          const payload = { files: [file], title: "Stay triage" };
          if (!navigator.canShare || navigator.canShare(payload)) {
            await navigator.share(payload);
            return;
          }
        } catch (shareErr) {
          if (shareErr?.name === "AbortError") return;
          console.warn("navigator.share failed, falling back to download", shareErr);
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stay-triage.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setShareBusy(false);
    }
  };

  const handleSendToFriend = async () => {
    const dogName = intake.dog_name?.trim();
    const friendShareText = `I just used Stay to understand ${dogName || "my dog"}'s behavior. It's free and takes 2 minutes — no judgment.`;
    if (prefersMobileShare()) {
      try {
        await navigator.share({
          title: "Stay — free dog behavior triage",
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
      {intake.dog_name?.trim() ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            textAlign: "center",
            margin: "0 0 10px",
          }}
        >
          {intake.dog_name.trim()}'s triage
        </p>
      ) : null}
      <div className="result-badge-row">
        <TriageBadge severity={result.severity} label={result.severity_label} />
      </div>

      <h2 className="result-behavior-heading">{result.behavior_classification}</h2>

      {hasSessionId ? (
        <p className="dog-profile-link-wrap">
          <Link to={`/profile/${sessionId}`}>
            {intake.dog_name?.trim()
              ? `${intake.dog_name.trim()}'s profile`
              : "Dog profile"}
          </Link>
        </p>
      ) : null}

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

      <div
        style={{
          padding: "16px",
          borderRadius: "10px",
          border: "0.5px solid var(--border)",
          marginBottom: 16,
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            margin: "0 0 8px",
            color: "var(--fg)",
          }}
        >
          What happens next
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Try the step above for one week. Sign up below and we'll check in at
          day 7 to see how things are going, and again at day 30. No spam —
          just two emails.
        </p>
      </div>

      <div className="result-share-row">
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: "100%" }}
          disabled={shareBusy}
          onClick={handleShareResults}
        >
          {shareBusy ? "Preparing image…" : "Share your results"}
        </button>
      </div>

      <div
        ref={shareCaptureRef}
        className="share-result-capture"
        aria-hidden="true"
      >
        <div className="share-result-capture__row">
          <img
            className="share-result-capture__logo"
            src={logoUrl}
            alt=""
            width={44}
            height={44}
          />
          <h1 className="share-result-capture__headline">{shareHeadline}</h1>
        </div>
        <div>
          <span className={`share-badge-capture ${severityKey}`}>
            {result.severity_label}
          </span>
        </div>
        <p className="share-result-capture__note">
          {result.honest_note?.trim() || "—"}
        </p>
        <p className="share-result-capture__url">{SHARE_DISPLAY_URL}</p>
      </div>

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
                !email.includes("@") || followupLoading || !hasSessionId
              }
              onClick={handleFollowupSubmit}
            >
              {followupLoading ? "Saving…" : "Sign up"}
            </button>
          </div>
          {!hasSessionId && (
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
          <p className="followup-success-7day">
            We&apos;ll also check in after 7 days to see if things are improving.
          </p>
        </div>
      )}

      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          textAlign: "center",
          padding: "0 16px",
          lineHeight: 1.5,
        }}
      >
        Stay provides educational information only, not professional behavioral
        consultation. For dogs with a bite history, contact a certified
        professional directly.
      </p>

      <div className="nav-row">
        <button type="button" className="btn btn-secondary" onClick={resetToStart}>
          Start Over
        </button>
      </div>

      <section
        className="friend-share-section"
        aria-labelledby="friend-share-heading"
      >
        <h3 id="friend-share-heading" className="friend-share-heading">
          Know someone who needs this?
        </h3>
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
    </div>
  );
}
