import { useState } from "react";
import ProgressBar from "../components/ProgressBar.jsx";
import { submitTriage } from "../api.js";

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
      const res = await submitTriage(intake);
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

      <h2>What have you tried so far?</h2>
      <p className="subtitle">
        Tell us about any training, vet visits, or changes you've already made.
      </p>

      <textarea
        className="text-input"
        placeholder="e.g. We tried a trainer for 3 sessions, vet said no medical issues..."
        value={intake.already_tried}
        onChange={(e) => update({ already_tried: e.target.value })}
        style={{ minHeight: 140 }}
        disabled={loading}
      />

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

      {loading && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          This usually takes 10–15 seconds.
        </p>
      )}
    </div>
  );
}
