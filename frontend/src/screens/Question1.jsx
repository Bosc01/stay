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
  const [dogNameError, setDogNameError] = useState("");
  const [behaviorError, setBehaviorError] = useState("");

  const intensityValue =
    typeof intake.behavior_intensity === "number" ? intake.behavior_intensity : 2;

  const handleNext = () => {
    if (!String(intake.dog_name || "").trim()) {
      setDogNameError("Please enter your dog's name.");
      document.getElementById("dog-name-input")?.focus();
      return;
    }
    setDogNameError("");
    if (!intake.behavior_type) {
      setBehaviorError("Please select a behavior type.");
      return;
    }
    setBehaviorError("");
    setScreen("q2");
  };

  return (
    <div className="screen">
      <ProgressBar step={currentStep} total={4} />

      <div className="q-section q-section--first">
        <label className="field-label" htmlFor="dog-name-input">
          What&apos;s your dog&apos;s name?
        </label>
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
        />
        {dogNameError ? (
          <p id="dog-name-error" className="error-text">
            {dogNameError}
          </p>
        ) : null}
      </div>

      <div className="q-section">
        <h2 className="section-heading">What&apos;s going on?</h2>
        <p className="subtitle">Select the behavior you&apos;re most concerned about.</p>

        <label className="field-label">Owner experience</label>
        <div className="q-pill-row" role="group" aria-label="Owner experience">
          {OWNER_EXPERIENCE_OPTIONS.map((opt) => {
            const selected = intake.owner_experience === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`option-btn option-btn--pill${selected ? " selected" : ""}`}
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

        <div className="q-field">
          <div className="option-grid question-flow-option-grid">
            {BEHAVIOR_TYPES.map((type) => (
              <OptionButton
                key={type}
                label={type}
                selected={intake.behavior_type === type}
                onClick={() => {
                  if (behaviorError) setBehaviorError("");
                  update({ behavior_type: type });
                }}
              />
            ))}
          </div>
          {behaviorError ? (
            <p className="error-text">{behaviorError}</p>
          ) : null}
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
              className="q-intensity"
              min="1"
              max="3"
              step="1"
              value={intensityValue}
              onChange={(e) =>
                update({ behavior_intensity: Number(e.target.value) || 2 })
              }
            />
            <p className="q-intensity-label">
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
      </div>

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
