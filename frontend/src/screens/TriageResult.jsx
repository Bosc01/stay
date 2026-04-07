import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import TriageBadge from "../components/TriageBadge.jsx";
import {
  fetchNearbyResources,
  fetchSimilarStories,
  submitFollowup,
  submitFollowupQuestion,
  submitUserInterview,
} from "../api.js";
import { getBehaviorEducation } from "../data/behaviorEducation.js";
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

function computeIntakeConfidenceSignals(intake) {
  let signals = 0;
  if (String(intake?.behavior_type || "").trim()) signals += 1;
  if (String(intake?.behavior_description || "").trim()) signals += 1;
  const triggers = Array.isArray(intake?.triggers) ? intake.triggers : [];
  if (triggers.length > 0) signals += triggers.length;
  if (String(intake?.duration || "").trim()) signals += 1;
  if (String(intake?.already_tried || "").length > 20) signals += 1;
  if (String(intake?.dog_name || "").trim()) signals += 1;
  if (String(intake?.owner_experience || "").trim()) signals += 1;
  return signals;
}

function confidenceLevelFromSignals(signals) {
  if (signals <= 3) return "low";
  if (signals <= 6) return "medium";
  return "high";
}

const CONFIDENCE_TOOLTIPS = {
  low: "Low: Add more detail about when it happens and what you've tried for a more accurate triage.",
  medium:
    "Medium: More detail about when it happens and what you've tried can improve triage accuracy.",
  high: "High: You shared enough detail for a solid triage.",
};

export default function TriageResult({
  result,
  intake,
  update,
  sessionId: sessionIdProp,
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
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [followupQuestionLoading, setFollowupQuestionLoading] = useState(false);
  const [followupQuestionError, setFollowupQuestionError] = useState(null);
  const [followupQuestionAnswer, setFollowupQuestionAnswer] = useState("");
  const [hasAskedFollowupQuestion, setHasAskedFollowupQuestion] = useState(false);
  const [sessionId, setSessionId] = useState(
    sessionIdProp ?? result?.session_id ?? null
  );
  const [similarStories, setSimilarStories] = useState([]);
  const [nearbyResources, setNearbyResources] = useState([]);
  const [showEducation, setShowEducation] = useState(false);
  const [showNextSteps, setShowNextSteps] = useState(false);
  const [redGateDismissed, setRedGateDismissed] = useState(false);
  const section2Ref = useRef(null);

  const [interviewEverHandled, setInterviewEverHandled] = useState(false);
  const [interviewDeadlinePassed, setInterviewDeadlinePassed] = useState(false);
  const [interviewFlowPhase, setInterviewFlowPhase] = useState(null);
  const [interviewQ1, setInterviewQ1] = useState("");
  const [interviewQ2, setInterviewQ2] = useState("");
  const [interviewQ3, setInterviewQ3] = useState("");
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [interviewError, setInterviewError] = useState(null);

  if (!result) return null;

  const resourceTags = result.resource_tags ?? [];
  const severityRaw = String(result.severity ?? "").toLowerCase();
  const severityKey = ["green", "yellow", "red"].includes(severityRaw)
    ? severityRaw
    : "yellow";
  const hasSessionId = sessionId !== null && sessionId !== undefined;

  useEffect(() => {
    setSessionId(sessionIdProp ?? result?.session_id ?? null);
  }, [result, sessionIdProp]);

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

  useEffect(() => {
    let cancelled = false;
    const classification = String(result?.behavior_classification || "").trim();
    if (!classification) {
      setSimilarStories([]);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const data = await fetchSimilarStories(classification);
        const list = Array.isArray(data?.stories) ? data.stories : [];
        const normalized = list
          .filter((s) => s && typeof s === "object" && String(s.update_text || "").trim())
          .slice(0, 3);
        if (!cancelled) setSimilarStories(normalized);
      } catch {
        if (!cancelled) setSimilarStories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.behavior_classification]);

  useEffect(() => {
    let cancelled = false;
    if (!["yellow", "red"].includes(severityKey)) {
      setNearbyResources([]);
      return () => {
        cancelled = true;
      };
    }

    const setRows = (data) => {
      const rows = Array.isArray(data?.resources) ? data.resources.slice(0, 3) : [];
      if (!cancelled) setNearbyResources(rows);
    };

    const fallbackNational = async () => {
      try {
        const data = await fetchNearbyResources();
        setRows(data);
      } catch {
        if (!cancelled) setNearbyResources([]);
      }
    };

    if (!navigator.geolocation) {
      fallbackNational();
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const data = await fetchNearbyResources({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          setRows(data);
        } catch {
          await fallbackNational();
        }
      },
      async () => {
        await fallbackNational();
      },
      { timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );

    return () => {
      cancelled = true;
    };
  }, [severityKey]);

  const signalCount =
    (Array.isArray(intake.triggers) ? intake.triggers.length : 0) +
    1 +
    (String(intake.behavior_description || "").trim() ? 1 : 0) +
    (String(intake.already_tried || "").trim() ? 1 : 0);
  const confidenceSignals = computeIntakeConfidenceSignals(intake);
  const confidenceLevel = confidenceLevelFromSignals(confidenceSignals);
  const confidenceLabel =
    confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1);
  const behaviorEducation = getBehaviorEducation(result.behavior_classification);

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
      const msg = err.message || "Could not get an answer right now.";
      setFollowupQuestionError(msg);
      if (msg.toLowerCase().includes("already asked")) {
        setHasAskedFollowupQuestion(true);
      }
    } finally {
      setFollowupQuestionLoading(false);
    }
  };

  const handleNextStepsClick = () => {
    setShowNextSteps(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        section2Ref.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
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
      await submitUserInterview({
        session_id: sessionId,
        q1: interviewQ1.trim(),
        q2: interviewQ2.trim(),
        q3: interviewQ3.trim(),
      });
      try {
        sessionStorage.setItem(`stay_user_interview_${sessionId}`, "submitted");
      } catch {
        /* ignore */
      }
      setInterviewFlowPhase("thanks");
    } catch (e) {
      setInterviewError(e.message || "Something went wrong");
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
              Immediate attention needed
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
              Your dog needs professional support before anything else.
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
              certified professional — not because your dog can&apos;t be helped,
              but because they can.
            </p>
            <a
              className="btn btn-primary"
              href="https://dacvb.org/find-a-diplomate"
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              Find a certified behaviorist →
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
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            textAlign: "center",
            cursor: "help",
          }}
          title={CONFIDENCE_TOOLTIPS[confidenceLevel]}
        >
          Confidence: {confidenceLabel} — based on {confidenceSignals} signals
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            textAlign: "center",
          }}
        >
          Based on {signalCount} behavioral signals
        </p>
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

      {resourceTags.length > 0 && (
        <div className="resource-pills" aria-label="Resource tags">
          {resourceTags.map((tag, i) => (
            <span key={`${String(tag)}-${i}`} className="resource-pill">
              {formatResourceTag(tag)}
            </span>
          ))}
        </div>
      )}

      {behaviorEducation ? (
        <section className="result-card" aria-labelledby="behavior-education-heading">
          <button
            id="behavior-education-heading"
            type="button"
            className="btn btn-secondary"
            style={{
              width: "100%",
              justifyContent: "space-between",
              marginBottom: showEducation ? 12 : 0,
            }}
            onClick={() => setShowEducation((v) => !v)}
            aria-expanded={showEducation}
            aria-controls="behavior-education-content"
          >
            Understand this behavior
            <span aria-hidden="true">{showEducation ? "−" : "+"}</span>
          </button>
          {showEducation ? (
            <div id="behavior-education-content">
              <p className="result-card-label">What</p>
              <p className="result-card-body" style={{ marginBottom: 12 }}>
                {behaviorEducation.what}
              </p>

              <p className="result-card-label">Causes</p>
              <p className="result-card-body" style={{ marginBottom: 12 }}>
                {behaviorEducation.causes}
              </p>

              <p className="result-card-label">Signs</p>
              <p className="result-card-body" style={{ marginBottom: 12 }}>
                {behaviorEducation.signs}
              </p>

              <p className="result-card-label">Myth</p>
              <p className="result-card-body">{behaviorEducation.myth}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {similarStories.length > 0 ? (
        <section
          className="result-card"
          aria-labelledby="similar-stories-heading"
          style={{ marginTop: 2 }}
        >
          <p id="similar-stories-heading" className="result-card-label">
            Others with similar situations
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {similarStories.map((story, i) => (
              <article
                key={`${story.dog_name || "dog"}-${i}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--fg)",
                  }}
                >
                  {`${story.dog_name || "Another dog"} — ${
                    story.behavior_classification || result.behavior_classification
                  }`}
                </p>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {String(story.update_text || "").trim()}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {`${Number(story.weeks_since_triage) || 0} weeks later`}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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

      {["yellow", "red"].includes(severityKey) && nearbyResources.length > 0 ? (
        <section className="result-card" aria-labelledby="nearby-help-heading">
          <p id="nearby-help-heading" className="result-card-label">
            Free help near you
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {nearbyResources.map((r, i) => (
              <article
                key={`${r.name || "resource"}-${i}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                  {r.name}
                </p>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {r.description}
                </p>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13 }}
                >
                  Get help
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="result-next-steps-toggle"
        onClick={handleNextStepsClick}
      >
        What should I do next? →
      </button>

      <div
        className={`result-section-2-wrap${showNextSteps ? " result-section-2-wrap--open" : ""}`}
        inert={!showNextSteps}
      >
        <div ref={section2Ref} className="result-section-2-inner">
          {hasSessionId ? (
            <p className="dog-profile-link-wrap">
              <Link to={`/profile/${sessionId}`}>
                {intake.dog_name?.trim()
                  ? `${intake.dog_name.trim()}'s profile`
                  : "Dog profile"}
              </Link>
            </p>
          ) : null}

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
              Try the step above for one week. Sign up below and we&apos;ll check
              in at day 7 to see how things are going, and again at day 30. No
              spam — just two emails.
            </p>
          </div>

          {!emailSaved ? (
            <div className="followup-section">
              <h3>Get a check-in in 30 days</h3>
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
                  {followupLoading ? "Saving…" : "Sign up"}
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
            <div className="followup-section followup-section--success">
              <p className="followup-success-message">
                You&apos;re signed up — we&apos;ll check in on{" "}
                <strong>{checkInDateLabel ?? "the scheduled date"}</strong>.
              </p>
              <p className="followup-success-7day">
                We&apos;ll also check in after 7 days to see if things are
                improving.
              </p>
            </div>
          )}

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

          <section
            className="result-card"
            aria-labelledby="followup-question-heading"
          >
            <p id="followup-question-heading" className="result-card-label">
              Have a specific question about{" "}
              {intake.dog_name?.trim() || "your dog's"} situation?
            </p>
            <div className="followup-row">
              <input
                type="text"
                className="email-input"
                placeholder="Type your question…"
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
                {followupQuestionLoading ? "Sending…" : "Send"}
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
                  padding: "12px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <p className="result-card-body">{followupQuestionAnswer}</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          textAlign: "center",
          padding: "0 16px",
          lineHeight: 1.5,
          marginTop: 16,
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
        </>
      ) : null}

      {showUserInterviewFloat ? (
        <div className="result-interview-float" role="region" aria-label="Research invite">
          <div className="result-interview-float__card">
            <p className="result-interview-float__text">
              Help us improve Stay — 3 questions, 2 minutes. We read every response.
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
                  Question 1 of 3
                </p>
                <p id="result-interview-dialog-desc" className="result-interview-modal__question">
                  Before you found Stay, what did you try when your dog had this behavior?
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
                  Question 2 of 3
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
                  Question 3 of 3
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
                    disabled={interviewSubmitting}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUserInterviewSubmit}
                    disabled={interviewSubmitting}
                  >
                    {interviewSubmitting ? "Sending…" : "Submit"}
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
