import { useState } from "react";
import ProgressBar from "../components/ProgressBar.jsx";
import OptionButton from "../components/OptionButton.jsx";

const BEHAVIOR_TYPES = [
  "Aggression (biting, growling, lunging)",
  "Anxiety or fear (hiding, trembling, destructive when alone)",
  "Reactivity (barking, pulling on leash at other dogs/people)",
  "House soiling / potty issues",
  "Excessive barking or whining",
  "Resource guarding (food, toys, space)",
  "Other",
];

const INTENSITY_LABELS = {
  1: "Mild",
  2: "Moderate",
  3: "Severe",
};

const OWNER_EXPERIENCE_OPTIONS = [
  "First-time owner",
  "Some experience",
  "Experienced owner",
];

export default function Question1({ intake, update, setScreen, currentStep }) {
  const [dogShakeKey, setDogShakeKey] = useState(0);
  const [dogNameError, setDogNameError] = useState("");
  const [behaviorShakeKey, setBehaviorShakeKey] = useState(0);

  const intensityValue =
    typeof intake.behavior_intensity === "number" ? intake.behavior_intensity : 2;

  const handleNext = () => {
    if (!String(intake.dog_name || "").trim()) {
      setDogNameError("Please enter your dog's name.");
      setDogShakeKey((k) => k + 1);
      document.getElementById("dog-name-input")?.focus();
      return;
    }
    setDogNameError("");
    if (!intake.behavior_type) {
      setBehaviorShakeKey((k) => k + 1);
      return;
    }
    setScreen("q2");
  };

  return (
    <div className="screen">
      <ProgressBar step={currentStep} total={4} />
      <label className="field-label" htmlFor="dog-name-input">
        What&apos;s your dog&apos;s name?
      </label>
      <div
        key={dogShakeKey}
        className={dogShakeKey > 0 ? "field-shake-once" : undefined}
        style={{ marginBottom: 24 }}
      >
        <input
          id="dog-name-input"
          type="text"
          className="email-input"
          placeholder="e.g. Bruno"
          value={intake.dog_name ?? ""}
          onChange={(e) => {
            if (dogNameError) setDogNameError("");
            update({ dog_name: e.target.value || null });
          }}
          aria-invalid={dogNameError ? "true" : undefined}
          aria-describedby={dogNameError ? "dog-name-error" : undefined}
          required
          style={{ width: "100%" }}
        />
        {dogNameError ? (
          <p id="dog-name-error" className="error-text" style={{ marginTop: 8, marginBottom: 0 }}>
            {dogNameError}
          </p>
        ) : null}
      </div>

      <h2>What's going on?</h2>
      <p className="subtitle">Select the behavior you're most concerned about.</p>

      <div style={{ marginBottom: 12 }}>
        <p className="field-label" style={{ marginBottom: 6 }}>
          Owner experience
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OWNER_EXPERIENCE_OPTIONS.map((opt) => {
            const selected = intake.owner_experience === opt;
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
                    owner_experience: selected ? null : opt,
                  })
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      <div
        key={behaviorShakeKey}
        className={behaviorShakeKey > 0 ? "field-shake-once" : undefined}
      >
        <div className="option-grid question-flow-option-grid">
          {BEHAVIOR_TYPES.map((type) => (
            <OptionButton
              key={type}
              label={type}
              selected={intake.behavior_type === type}
              onClick={() => update({ behavior_type: type })}
            />
          ))}
        </div>
      </div>

      <label className="sudden-onset-toggle">
        <input
          type="checkbox"
          checked={Boolean(intake.sudden_onset)}
          onChange={(e) => update({ sudden_onset: e.target.checked })}
        />
        <span>This started suddenly or my dog seems different lately</span>
      </label>

      {intake.behavior_type && (
        <>
          <label className="field-label" htmlFor="behavior-intensity">
            How intense is it on a bad day?
          </label>
          <input
            id="behavior-intensity"
            type="range"
            min="1"
            max="3"
            step="1"
            value={intensityValue}
            onChange={(e) =>
              update({ behavior_intensity: Number(e.target.value) || 2 })
            }
            style={{
              width: "100%",
              marginBottom: 6,
              accentColor: "#ffffff",
            }}
          />
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              margin: "0 0 16px",
              textAlign: "center",
            }}
          >
            {INTENSITY_LABELS[intensityValue] || "Moderate"}
          </p>
          <label className="field-label" htmlFor="behavior-desc">
            Describe what happens (optional)
          </label>
          <textarea
            id="behavior-desc"
            className="text-input"
            placeholder="e.g. My dog lunges at strangers who come to the door..."
            value={intake.behavior_description || ""}
            onChange={(e) =>
              update({ behavior_description: e.target.value || null })
            }
          />
        </>
      )}

      <div className="nav-row nav-row--question">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setScreen("landing")}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary question-primary-btn"
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}
