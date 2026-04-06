const LABELS = {
  green: "Low Concern",
  yellow: "Moderate Concern",
  red: "High Concern",
};

export default function TriageBadge({ severity, label }) {
  const s = String(severity ?? "").toLowerCase();
  return (
    <span className={`triage-badge ${s}`}>
      {label ?? LABELS[s] ?? severity}
    </span>
  );
}
