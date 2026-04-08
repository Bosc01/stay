import { useEffect, useRef, useState } from "react";
import ProgressBar from "../components/ProgressBar.jsx";
import TriageSkeleton from "../components/TriageSkeleton.jsx";
import { submitTriage } from "../api.js";

const ALREADY_TRIED_SUPPORT_KEYWORDS = [
  "surrender",
  "give up",
  "rehome",
  "can't do this",
  "giving up",
  "last resort",
  "run out of options",
  "don't know what to do",
];

function alreadyTriedHasSupportKeyword(text) {
  const lower = String(text || "").toLowerCase();
  return ALREADY_TRIED_SUPPORT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Once set in-session, support banner stays eligible for this tab until cleared (e.g. Start Over). */
const Q3_SUPPORT_BANNER_SESSION_KEY = "stay_q3_support_banner";

const PRIOR_TRAINING_OPTIONS = [
  "Never",
  "Yes, didn't help",
  "Yes, it helped",
];
const LOADING_MESSAGES = (dogName) => [
  "Reading what you shared...",
  `Thinking about ${dogName || "your dog"}'s situation...`,
  "Putting together what we know...",
  "Almost ready...",
];

export default function Question3({
  intake,
  update,
  setScreen,
  setResult,
  currentStep,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [error, setError] = useState(null);
  const [showSupportBanner, setShowSupportBanner] = useState(false);
  const supportBannerLockedRef = useRef(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(Q3_SUPPORT_BANNER_SESSION_KEY) === "1") {
        supportBannerLockedRef.current = true;
        setShowSupportBanner(true);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (supportBannerLockedRef.current) return;
    if (!alreadyTriedHasSupportKeyword(intake.already_tried)) return;
    supportBannerLockedRef.current = true;
    setShowSupportBanner(true);
    try {
      sessionStorage.setItem(Q3_SUPPORT_BANNER_SESSION_KEY, "1");
    } catch {
      /* private mode */
    }
  }, [intake.already_tried]);

  useEffect(() => {
    if (!loading) {
      setLoadingMessageIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % 4);
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [loading]);

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = { ...intake };
      if (!payload.owner_experience) delete payload.owner_experience;
      if (!payload.prior_training) delete payload.prior_training;

      const res = await submitTriage(payload);
      console.log("submitTriage response:", res);

      const finalSessionId = res.session_id || crypto.randomUUID();
      setResult({ ...res, session_id: finalSessionId });
      setScreen("result");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <ProgressBar step={currentStep} total={4} />

      {loading ? (
        <div className="result-screen">
          <TriageSkeleton />
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              textAlign: "center",
              marginTop: 4,
              animation: "pulse 1.8s ease-in-out infinite",
            }}
          >
            {
              LOADING_MESSAGES(String(intake?.dog_name || "").trim())[
                loadingMessageIndex
              ]
            }
          </p>
        </div>
      ) : (
        <>
          <p className="subtitle" style={{ marginTop: 8 }}>
            Last thing - a bit about{" "}
            {String(intake?.dog_name || "").trim() || "your dog"} and how long this has
            been going on.
          </p>
          <h2>What have you tried so far?</h2>
          <p className="subtitle">
            Tell us about any training, vet visits, or changes you&apos;ve already
            made.
          </p>

          <div style={{ marginBottom: 12 }}>
            <p className="field-label" style={{ marginBottom: 6 }}>
              Has your dog seen a trainer?
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PRIOR_TRAINING_OPTIONS.map((opt) => {
                const selected = intake.prior_training === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`option-btn${selected ? " selected" : ""}`}
                    style={{
                      width: "auto",
                      padding: "6px 12px",
                      fontSize: 13,
                      borderRadius: 999,
                    }}
                    onClick={() =>
                      update({
                        prior_training: selected ? null : opt,
                      })
                    }
                    disabled={loading}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {showSupportBanner ? (
            <div
              role="note"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.12)",
                borderLeft: "3px solid #4ade80",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 12,
                fontSize: 13,
                color: "var(--color-text-secondary)",
                lineHeight: 1.6,
              }}
            >
              You&apos;re not out of options. Most behavioral issues are more workable than they
              feel in the moment. Let&apos;s figure out what&apos;s actually going on.
            </div>
          ) : null}

          <textarea
            className="text-input"
            placeholder="e.g. We tried a trainer for 3 sessions, vet said no medical issues..."
            value={intake.already_tried}
            onChange={(e) => update({ already_tried: e.target.value })}
            style={{ minHeight: 140 }}
            disabled={loading}
          />
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="nav-row">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => setScreen("q2")}
        >
          Back
        </button>
        <button
          type="button"
          className={`btn btn-primary${loading ? " btn-analyzing" : ""}`}
          disabled={!intake.already_tried.trim() || loading}
          onClick={handleSubmit}
        >
          {loading ? "Analyzing..." : "Get My Triage"}
        </button>
      </div>
    </div>
  );
}
