import { useState } from "react";
import ProgressBar from "../components/ProgressBar.jsx";
import OptionButton from "../components/OptionButton.jsx";

const TRIGGERS = [
  "Strangers or visitors",
  "Other dogs",
  "Children",
  "Loud noises (thunder, fireworks)",
  "Being left alone",
  "Handling or grooming",
  "Food or treats nearby",
  "No clear trigger",
];

const DURATIONS = [
  "Less than 2 weeks",
  "2–8 weeks",
  "2–6 months",
  "6–12 months",
  "Over a year",
];

export default function Question2({ intake, update, setScreen, currentStep }) {
  const [triggersError, setTriggersError] = useState("");
  const [durationError, setDurationError] = useState("");

  const triggersList = intake.triggers ?? [];
  const selectedCount = triggersList.length;

  const handleNext = () => {
    if (selectedCount === 0) {
      setTriggersError("Select at least one trigger.");
      return;
    }
    setTriggersError("");
    if (!intake.duration) {
      setDurationError("Please select how long this has been going on.");
      return;
    }
    setDurationError("");
    setScreen("q3");
  };

  const toggleTrigger = (trigger) => {
    const current = triggersList;
    const next = current.includes(trigger)
      ? current.filter((t) => t !== trigger)
      : [...current, trigger];
    if (triggersError && next.length > 0) setTriggersError("");
    update({ triggers: next });
  };

  return (
    <div className="screen">
      <ProgressBar step={currentStep} total={4} />

      <h2 style={{ animation: "fadeInUp 0.25s ease forwards" }}>When does it happen?</h2>
      {selectedCount > 0 ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-tertiary)",
            marginTop: 6,
            textAlign: "center",
          }}
        >
          {selectedCount} selected
        </p>
      ) : null}
      <p className="subtitle">Select all triggers that apply.</p>

      <div>
        <div className="option-grid question-flow-option-grid">
          {TRIGGERS.map((t) => (
            <OptionButton
              key={t}
              label={t}
              selected={triggersList.includes(t)}
              onClick={() => toggleTrigger(t)}
            />
          ))}
        </div>
        {triggersError ? (
          <p
            id="triggers-error"
            className="error-text"
            role="alert"
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            {triggersError}
          </p>
        ) : null}
      </div>

      <h2 className="section-heading">How long has this been going on?</h2>
      <p className="subtitle">Select the closest estimate.</p>

      <div>
        <div className="option-grid">
          {DURATIONS.map((d) => (
            <OptionButton
              key={d}
              label={d}
              selected={intake.duration === d}
              onClick={() => {
                if (durationError) setDurationError("");
                update({ duration: d });
              }}
            />
          ))}
        </div>
        {durationError ? (
          <p className="error-text" style={{ marginTop: 8 }}>
            {durationError}
          </p>
        ) : null}
      </div>

      <div className="nav-row nav-row--question">
        <button type="button" className="btn btn-secondary" onClick={() => setScreen("q1")}>
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
