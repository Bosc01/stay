import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Link, useSearchParams } from "react-router-dom";
import { fetchFollowupSession, submitWeeklyCheckin } from "../api.js";
import logoUrl from "../assets/stay-logo.png";

const SCALE = [
  { score: 1, label: "😰" },
  { score: 2, label: "😟" },
  { score: 3, label: "😐" },
  { score: 4, label: "🙂" },
  { score: 5, label: "😄" },
];

const SHARE_DISPLAY_URL = "trystay.org";

export default function CheckInPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session") || "";
  const weekRaw = Number(params.get("week"));
  const weekNumber = Number.isFinite(weekRaw) && weekRaw >= 1 && weekRaw <= 4 ? weekRaw : 1;

  const shareCaptureRef = useRef(null);

  const [dogName, setDogName] = useState("your dog");
  const [behaviorClassification, setBehaviorClassification] = useState("");
  const [originalSeverityLabel, setOriginalSeverityLabel] = useState("");
  const [score, setScore] = useState(3);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    (async () => {
      try {
        const row = await fetchFollowupSession(sessionId);
        if (cancelled) return;
        const n = (row?.dog_name || row?.intake?.dog_name || "").trim();
        if (n) setDogName(n);
        const triage = row?.result && typeof row.result === "object" ? row.result : {};
        const bc = String(triage.behavior_classification || "").trim();
        setBehaviorClassification(bc);
        const sevLabel = String(triage.severity_label || "").trim();
        const sevRaw = String(triage.severity || "").trim();
        setOriginalSeverityLabel(
          sevLabel || (sevRaw ? sevRaw.charAt(0).toUpperCase() + sevRaw.slice(1) : "")
        );
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

  const originalSeverityDisplay =
    originalSeverityLabel.trim() || "your original triage";

  const behaviorForShare = behaviorClassification.trim() || "behavior";

  const celebrationLines = useMemo(
    () => ({
      progress: `${dogName} is making progress`,
      week: `Week ${weekNumber}: ${selected.label} — ${
        behaviorClassification.trim() || "this behavior"
      }`,
      journey: `from ${originalSeverityDisplay} to improving`,
    }),
    [
      dogName,
      weekNumber,
      selected.label,
      behaviorClassification,
      originalSeverityDisplay,
    ]
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

  const handleShareProgress = async () => {
    const el = shareCaptureRef.current;
    if (!el || shareBusy) return;
    setShareBusy(true);
    const shareText = `${dogName} is making real progress with their ${behaviorForShare}. ${SHARE_DISPLAY_URL} helped us understand what was really going on.`;
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 1)
      );
      if (!blob) throw new Error("Could not create image");

      const file = new File([blob], "stay-progress.png", { type: "image/png" });

      if (navigator.share) {
        try {
          const payload = { files: [file], title: "Stay — progress", text: shareText };
          if (!navigator.canShare || navigator.canShare(payload)) {
            await navigator.share(payload);
            return;
          }
        } catch (shareErr) {
          if (shareErr?.name === "AbortError") return;
          console.warn("navigator.share failed, trying fallbacks", shareErr);
        }
        try {
          const filesOnly = { files: [file], title: "Stay — progress" };
          if (!navigator.canShare || navigator.canShare(filesOnly)) {
            await navigator.share(filesOnly);
            return;
          }
        } catch (shareErr2) {
          if (shareErr2?.name === "AbortError") return;
        }
        try {
          await navigator.share({
            title: "Stay — progress",
            text: shareText,
            url: "https://trystay.org",
          });
          return;
        } catch (shareErr3) {
          if (shareErr3?.name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stay-progress.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setShareBusy(false);
    }
  };

  const showCelebration = saved && score >= 4;

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
            {saved && !showCelebration ? (
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

            {showCelebration ? (
              <>
                <div className="checkin-celebration">
                  <div className="checkin-celebration-card">
                    <div className="share-result-capture__row">
                      <img
                        className="share-result-capture__logo"
                        src={logoUrl}
                        alt=""
                        width={40}
                        height={40}
                      />
                      <p className="share-checkin-capture__progress">
                        {celebrationLines.progress}
                      </p>
                    </div>
                    <p className="share-checkin-capture__week">{celebrationLines.week}</p>
                    <p className="share-checkin-capture__journey">
                      {celebrationLines.journey}
                    </p>
                    <p className="share-result-capture__url">{SHARE_DISPLAY_URL}</p>
                  </div>
                  <div className="result-share-row">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "100%" }}
                      disabled={shareBusy}
                      onClick={handleShareProgress}
                    >
                      {shareBusy ? "Preparing image…" : "Share"}
                    </button>
                  </div>
                </div>
                <div
                  ref={shareCaptureRef}
                  className="share-checkin-capture"
                  aria-hidden="true"
                >
                  <div className="share-result-capture__row">
                    <img
                      className="share-result-capture__logo"
                      src={logoUrl}
                      alt=""
                      width={44}
                      height={44}
                    />
                    <p className="share-checkin-capture__progress">
                      {celebrationLines.progress}
                    </p>
                  </div>
                  <p className="share-checkin-capture__week">{celebrationLines.week}</p>
                  <p className="share-checkin-capture__journey">
                    {celebrationLines.journey}
                  </p>
                  <p className="share-result-capture__url">{SHARE_DISPLAY_URL}</p>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
