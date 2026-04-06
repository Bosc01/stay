import { useState } from "react";
import ProgressBar from "../components/ProgressBar.jsx";
import TriageSkeleton from "../components/TriageSkeleton.jsx";
import { submitTriage } from "../api.js";

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
      setResult(res);
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
            }}
          >
            This usually takes 10–15 seconds.
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
