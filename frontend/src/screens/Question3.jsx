import { useEffect, useRef, useState } from "react";
import ProgressBar from "../components/ProgressBar.jsx";
import { submitTriage } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";

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

export default function Question3({
  intake,
  update,
  setScreen,
  setResult,
  currentStep,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [triedShakeKey, setTriedShakeKey] = useState(0);
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
      setError(
        sanitizeApiErrorMessage(err?.message) ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePrimaryClick = () => {
    if (loading) return;
    if (!String(intake.already_tried || "").trim()) {
      setTriedShakeKey((k) => k + 1);
      document.getElementById("already-tried-input")?.focus();
      return;
    }
    void handleSubmit();
  };

  return (
    <div className="screen question-screen-mount">
      <ProgressBar step={currentStep} total={4} />

      {loading ? (
        <div
          className="result-screen"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 200,
            padding: "24px 16px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#888",
              textAlign: "center",
            }}
          >
            This usually takes about 10 seconds.
          </p>
        </div>
      ) : (
        <>
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

          <div
            key={triedShakeKey}
            className={triedShakeKey > 0 ? "field-shake-once" : undefined}
          >
            <textarea
              id="already-tried-input"
              className="text-input"
              placeholder="e.g. We tried a trainer for 3 sessions, vet said no medical issues..."
              value={intake.already_tried}
              onChange={(e) => update({ already_tried: e.target.value })}
              style={{ minHeight: 140 }}
              disabled={loading}
            />
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="nav-row nav-row--question">
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
          className="btn btn-primary question-primary-btn"
          disabled={loading}
          onClick={handlePrimaryClick}
        >
          {loading ? "Analyzing..." : "See what's going on"}
        </button>
      </div>
    </div>
  );
}
