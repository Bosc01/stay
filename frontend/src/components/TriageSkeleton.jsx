export default function TriageSkeleton() {
  return (
    <div className="triage-skeleton" aria-busy="true" aria-label="Loading triage result">
      <div className="result-badge-row">
        <span className="triage-skeleton__pill" />
      </div>
      <div className="triage-skeleton__heading" />
      <div className="triage-skeleton__card" />
      <div className="triage-skeleton__card" />
    </div>
  );
}
