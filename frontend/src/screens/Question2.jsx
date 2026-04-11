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
  const [triggersShakeKey, setTriggersShakeKey] = useState(0);
  const [durationShakeKey, setDurationShakeKey] = useState(0);

  const selectedCount = intake.triggers?.length ?? 0;

  const handleNext = () => {
    if (intake.triggers.length === 0) {
      setTriggersShakeKey((k) => k + 1);
      return;
    }
    if (!intake.duration) {
      setDurationShakeKey((k) => k + 1);
      return;
    }
    setScreen("q3");
  };

  const toggleTrigger = (trigger) => {
    const current = intake.triggers;
    const next = current.includes(trigger)
      ? current.filter((t) => t !== trigger)
      : [...current, trigger];
    update({ triggers: next });
  };

  return (
    <div className="screen">
      <ProgressBar step={currentStep} total={4} />
      <p className="subtitle" style={{ marginTop: 8 }}>
        Now tell us what's been happening.
      </p>

      <h2>When does it happen?</h2>
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

      <div
        key={triggersShakeKey}
        className={triggersShakeKey > 0 ? "field-shake-once" : undefined}
      >
        <div className="option-grid">
          {TRIGGERS.map((t) => (
            <OptionButton
              key={t}
              label={t}
              selected={intake.triggers.includes(t)}
              onClick={() => toggleTrigger(t)}
            />
          ))}
        </div>
      </div>

      <h2 className="section-heading">How long has this been going on?</h2>
      <p className="subtitle">Select the closest estimate.</p>

      <div
        key={durationShakeKey}
        className={durationShakeKey > 0 ? "field-shake-once" : undefined}
      >
        <div className="option-grid">
          {DURATIONS.map((d) => (
            <OptionButton
              key={d}
              label={d}
              selected={intake.duration === d}
              onClick={() => update({ duration: d })}
            />
          ))}
        </div>
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
