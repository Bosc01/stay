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
  const selectedCount = intake.triggers?.length ?? 0;

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

      <h2 className="section-heading">How long has this been going on?</h2>
      <p className="subtitle">Select the closest estimate.</p>

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

      <div className="nav-row">
        <button className="btn btn-secondary" onClick={() => setScreen("q1")}>
          Back
        </button>
        <button
          className="btn btn-primary"
          disabled={intake.triggers.length === 0 || !intake.duration}
          onClick={() => setScreen("q3")}
        >
          Next
        </button>
      </div>
    </div>
  );
}
