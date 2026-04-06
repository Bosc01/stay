import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TriageBadge from "../components/TriageBadge.jsx";
import {
  createJournalEntry,
  fetchProfileHistory,
  fetchProfileJournal,
  fetchProfileSession,
  patchProfileSession,
} from "../api.js";
import { getProfileSessionIds } from "../profileHistory.js";

const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

function formatHistoryDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function formatJournalDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

export default function DogProfile() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [journalBody, setJournalBody] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoadError(null);
    setBusy(true);
    try {
      const [row, journalRes] = await Promise.all([
        fetchProfileSession(sessionId),
        fetchProfileJournal(sessionId),
      ]);
      setSession(row);
      setNameDraft(
        (row.dog_name || row.intake?.dog_name || "").trim()
      );
      setJournalEntries(journalRes.entries || []);

      const stored = getProfileSessionIds();
      const idSet = new Set([sessionId, ...stored]);
      const hist = await fetchProfileHistory({ session_ids: [...idSet] });
      setHistoryRows(hist.sessions || []);
    } catch (e) {
      setLoadError(e.message || "Could not load profile");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pageTitle = useMemo(() => {
    const n = (session?.dog_name || session?.intake?.dog_name || "").trim();
    return n || "Dog profile";
  }, [session]);

  const latestSeverity = useMemo(() => {
    if (historyRows.length > 0) {
      const h0 = historyRows[0];
      if (h0.severity && h0.severity_label) {
        return { severity: h0.severity, label: h0.severity_label };
      }
    }
    const r = session?.result;
    if (r && typeof r === "object" && r.severity && r.severity_label) {
      return { severity: r.severity, label: r.severity_label };
    }
    return null;
  }, [historyRows, session]);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !sessionId) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setLoadError("Photo is too large. Try an image under 1.5 MB.");
      return;
    }
    setPhotoBusy(true);
    setLoadError(null);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      await patchProfileSession(sessionId, { photo_url: dataUrl });
      await refresh();
    } catch (err) {
      setLoadError(err.message || "Upload failed");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSaveName = async () => {
    if (!sessionId) return;
    setNameSaving(true);
    setLoadError(null);
    try {
      const trimmed = nameDraft.trim();
      await patchProfileSession(sessionId, {
        dog_name: trimmed || null,
      });
      await refresh();
    } catch (e) {
      setLoadError(e.message || "Could not save name");
    } finally {
      setNameSaving(false);
    }
  };

  const handleAddJournal = async () => {
    const body = journalBody.trim();
    if (!body || !sessionId) return;
    setJournalSaving(true);
    setLoadError(null);
    try {
      await createJournalEntry({ session_id: sessionId, body });
      setJournalBody("");
      const journalRes = await fetchProfileJournal(sessionId);
      setJournalEntries(journalRes.entries || []);
    } catch (e) {
      setLoadError(e.message || "Could not save entry");
    } finally {
      setJournalSaving(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="app">
        <div className="app-frame dog-profile-page">
          <p className="dog-profile-error">Missing session.</p>
          <p className="dog-profile-back">
            <Link to="/">Back to Stay</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-frame dog-profile-page">
        <header className="dog-profile-header">
          <p className="dog-profile-back">
            <Link to="/">← Back</Link>
          </p>
          <h1 className="dog-profile-title">{pageTitle}</h1>
        </header>

        {loadError && <p className="error-text dog-profile-banner">{loadError}</p>}

        {busy && !session ? (
          <p className="dog-profile-muted">Loading…</p>
        ) : session ? (
          <>
            <section className="dog-profile-section" aria-labelledby="severity-heading">
              <h2 id="severity-heading" className="dog-profile-section-title">
                Current severity
              </h2>
              {latestSeverity ? (
                <div className="dog-profile-badge-wrap">
                  <TriageBadge
                    severity={latestSeverity.severity}
                    label={latestSeverity.label}
                  />
                </div>
              ) : (
                <p className="dog-profile-muted">No triage data yet.</p>
              )}
            </section>

            <section className="dog-profile-section" aria-labelledby="photo-heading">
              <h2 id="photo-heading" className="dog-profile-section-title">
                Photo
              </h2>
              <div className="dog-profile-photo-row">
                {session.photo_url ? (
                  <img
                    className="dog-profile-photo"
                    src={session.photo_url}
                    alt=""
                    width={160}
                    height={160}
                  />
                ) : (
                  <div className="dog-profile-photo-placeholder">No photo</div>
                )}
                <label className="btn btn-secondary dog-profile-upload-label">
                  {photoBusy ? "Uploading…" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="dog-profile-file-input"
                    disabled={photoBusy}
                    onChange={handlePhoto}
                  />
                </label>
              </div>
            </section>

            <section className="dog-profile-section" aria-labelledby="name-heading">
              <h2 id="name-heading" className="dog-profile-section-title">
                Name on profile
              </h2>
              <div className="dog-profile-name-row">
                <input
                  type="text"
                  className="email-input dog-profile-name-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Dog's name"
                  maxLength={80}
                  disabled={nameSaving}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={nameSaving}
                  onClick={handleSaveName}
                >
                  {nameSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </section>

            <section className="dog-profile-section" aria-labelledby="history-heading">
              <h2 id="history-heading" className="dog-profile-section-title">
                Triage history
              </h2>
              {historyRows.length === 0 ? (
                <p className="dog-profile-muted">No past triages in this browser.</p>
              ) : (
                <ul className="dog-profile-history">
                  {historyRows.map((row) => (
                    <li key={row.id} className="dog-profile-history-item">
                      <span className="dog-profile-history-date">
                        {formatHistoryDate(row.created_at)}
                      </span>
                      <span className="dog-profile-history-class">
                        {row.behavior_classification || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dog-profile-section" aria-labelledby="journal-heading">
              <h2 id="journal-heading" className="dog-profile-section-title">
                Journal
              </h2>
              <textarea
                className="dog-profile-journal-input"
                rows={4}
                placeholder="How is your dog doing?"
                value={journalBody}
                onChange={(e) => setJournalBody(e.target.value)}
                disabled={journalSaving}
                maxLength={8000}
              />
              <button
                type="button"
                className="btn btn-primary dog-profile-journal-submit"
                disabled={journalSaving || !journalBody.trim()}
                onClick={handleAddJournal}
              >
                {journalSaving ? "Saving…" : "Add entry"}
              </button>
              {journalEntries.length === 0 ? (
                <p className="dog-profile-muted dog-profile-journal-empty">
                  No entries yet.
                </p>
              ) : (
                <ul className="dog-profile-journal-timeline">
                  {journalEntries.map((ent) => (
                    <li key={ent.id} className="dog-profile-journal-item">
                      <time className="dog-profile-journal-time">
                        {formatJournalDate(ent.created_at)}
                      </time>
                      <p className="dog-profile-journal-body">{ent.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="dog-profile-muted">Session not found.</p>
        )}
      </div>
    </div>
  );
}
