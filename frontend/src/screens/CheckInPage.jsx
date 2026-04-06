import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchFollowupSession, submitWeeklyCheckin } from "../api.js";

const SCALE = [
  { score: 1, label: "😰" },
  { score: 2, label: "😟" },
  { score: 3, label: "😐" },
  { score: 4, label: "🙂" },
  { score: 5, label: "😄" },
];

export default function CheckInPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session") || "";
  const weekRaw = Number(params.get("week"));
  const weekNumber = Number.isFinite(weekRaw) && weekRaw >= 1 && weekRaw <= 4 ? weekRaw : 1;

  const [dogName, setDogName] = useState("your dog");
  const [score, setScore] = useState(3);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    (async () => {
      try {
        const row = await fetchFollowupSession(sessionId);
        const n = (row?.dog_name || row?.intake?.dog_name || "").trim();
        if (!cancelled && n) setDogName(n);
      } catch {
        /* fail silently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const selected = useMemo(
    () => SCALE.find((s) => s.score === score) || SCALE[2],
    [score]
  );

  const handleSubmit = async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      await submitWeeklyCheckin({
        session_id: sessionId,
        week_number: weekNumber,
        score,
        note: note.trim() || null,
      });
      setSaved(true);
    } catch (e) {
      setError(e.message || "Could not save check-in");
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="app">
        <div className="app-frame">
          <main className="app-main">
            <div className="screen">
              <h2>Missing check-in session</h2>
              <p className="subtitle">Please open your check-in link again.</p>
              <p className="shelter-page__back">
                <Link to="/">Back to Stay</Link>
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link">
            Stay
          </Link>
        </header>
        <main className="app-main">
          <div className="screen">
            <h2>How is {dogName} doing this week?</h2>
            <p className="subtitle">Week {weekNumber} check-in</p>

            <div className="option-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
              {SCALE.map((s) => (
                <button
                  key={s.score}
                  type="button"
                  className={`option-btn${score === s.score ? " selected" : ""}`}
                  onClick={() => setScore(s.score)}
                  disabled={loading || saved}
                  style={{ justifyContent: "center", textAlign: "center" }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <p
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "var(--color-text-secondary)",
                margin: "0 0 14px",
              }}
            >
              Selected: {selected.score} {selected.label}
            </p>

            <textarea
              className="text-input"
              rows={4}
              placeholder="Optional note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading || saved}
              maxLength={4000}
            />

            {error ? <p className="error-text">{error}</p> : null}
            {saved ? (
              <p style={{ marginTop: 12, color: "var(--color-text-secondary)" }}>
                Thanks — your weekly check-in is saved.
              </p>
            ) : null}

            <div className="nav-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading || saved}
              >
                {loading ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
