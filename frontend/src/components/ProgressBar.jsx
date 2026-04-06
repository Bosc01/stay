export default function ProgressBar({ step, total }) {
  const pct = (step / total) * 100;
  return (
    <div className="progress-bar">
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
