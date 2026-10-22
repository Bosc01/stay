import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOutreachTargets, patchOutreachTarget } from "../api.js";
import {
  clearStoredPassword,
  loadStoredPassword,
  savePassword,
} from "../adminAuth.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

// Starting point for the Gmail subject line. Edit it here if it is not right.
const MAILTO_SUBJECT = "A free behavior tool for your adopters";

const FILTERS = [
  { key: "drafted", label: "Drafted" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "", label: "All" },
];

function mailtoHref(target, body) {
  const q = new URLSearchParams({ subject: MAILTO_SUBJECT, body: body || "" });
  return `mailto:${encodeURIComponent(target.contact_email)}?${q.toString()}`;
}

export default function AdminOutreach() {
  const [storedPassword, setStoredPassword] = useState(loadStoredPassword);
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [filter, setFilter] = useState("drafted");
  const [targets, setTargets] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [notice, setNotice] = useState("");

  // The backend is the only judge of the password; a 401 sends you back here.
  const authed = Boolean(storedPassword);

  const loadTargets = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await fetchOutreachTargets(storedPassword, filter);
      setTargets(data.targets || []);
    } catch (e) {
      if (e?.status === 401) {
        clearStoredPassword();
        setStoredPassword("");
        setTargets([]);
        setGateError("That password did not work.");
        return;
      }
      setLoadError(sanitizeApiErrorMessage(e.message || "Failed to load outreach"));
    } finally {
      setLoading(false);
    }
  }, [authed, storedPassword, filter]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  const handleGateSubmit = (e) => {
    e.preventDefault();
    setGateError("");
    if (!gateInput) {
      setGateError("Enter the dashboard password.");
      return;
    }
    savePassword(gateInput);
    setStoredPassword(gateInput);
    setGateInput("");
  };

  const applyPatch = async (target, body, message) => {
    setNotice("");
    try {
      const data = await patchOutreachTarget(storedPassword, target.id, body);
      setTargets((prev) =>
        prev.map((t) => (t.id === target.id ? { ...t, ...data.target } : t))
      );
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setLoadError(sanitizeApiErrorMessage(e.message || "Update failed"));
      return false;
    }
  };

  const handleApprove = async (target) => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(target.drafted_body || "");
      copied = true;
    } catch {
      copied = false;
    }
    await applyPatch(
      target,
      { status: "approved" },
      copied
        ? `Copied the ${target.org_name} draft. Approved.`
        : `Approved ${target.org_name}. The clipboard was blocked, so copy the text by hand.`
    );
  };

  const handleSaveEdit = async (target) => {
    const ok = await applyPatch(
      target,
      { drafted_body: editBody },
      `Saved the ${target.org_name} draft.`
    );
    if (ok) setEditingId(null);
  };

  if (!authed) {
    return (
      <div className="app">
        <div className="app-frame">
          <header className="app-header">
            <Link to="/" className="logo logo-link" aria-label="Stay, home">
              <StayHeaderLogo />
            </Link>
          </header>
          <main className="app-main">
            <div className="screen admin-screen">
              <h2>Admin</h2>
              <p className="subtitle">Enter the dashboard password.</p>
              <form onSubmit={handleGateSubmit} className="admin-gate-form">
                <input
                  type="password"
                  className="text-input"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={gateInput}
                  onChange={(e) => setGateInput(e.target.value)}
                />
                {gateError ? <p className="error-text">{gateError}</p> : null}
                <button type="submit" className="btn btn-primary">
                  Continue
                </button>
              </form>
              <p className="shelter-page__back">
                <Link to="/">Back to Stay</Link>
              </p>
            </div>
          </main>
          <SiteFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-frame app-frame--wide">
        <header className="app-header admin-header">
          <Link to="/" className="logo logo-link" aria-label="Stay, home">
            <StayHeaderLogo />
          </Link>
          <Link to="/admin" className="btn btn-secondary admin-logout">
            Dashboard
          </Link>
        </header>
        <main className="app-main">
          <div className="screen admin-screen">
            <div className="admin-dashboard-head">
              <h2>Outreach queue</h2>
              <p className="subtitle admin-subtitle">
                Check the research before you send. Approve copies the body to your
                clipboard. You send from Gmail.
              </p>
            </div>

            <div className="outreach-filters" role="group" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <button
                  key={f.key || "all"}
                  type="button"
                  className={`outreach-filter${filter === f.key ? " is-active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {notice ? <p className="outreach-notice">{notice}</p> : null}
            {loadError ? <p className="error-text">{loadError}</p> : null}
            {loading ? <p className="admin-loading">Loading queue…</p> : null}

            {!loading && targets.length === 0 ? (
              <p className="admin-breakdown__empty">
                Nothing here. Run scripts/find_shelters.py to fill the queue.
              </p>
            ) : null}

            {targets.map((target) => (
              <article key={target.id} className="outreach-card">
                <div className="outreach-card__head">
                  <div>
                    <h3 className="outreach-card__org">
                      {target.website ? (
                        <a href={target.website} target="_blank" rel="noreferrer">
                          {target.org_name}
                        </a>
                      ) : (
                        target.org_name
                      )}
                    </h3>
                    <p className="outreach-card__meta">
                      {target.city} · {target.contact_name}
                      {target.contact_title ? `, ${target.contact_title}` : ""}
                    </p>
                    <p className="outreach-card__meta">
                      {target.contact_email || "No public email found, look it up"}
                    </p>
                  </div>
                  <span className={`outreach-status outreach-status--${target.status}`}>
                    {target.status}
                  </span>
                </div>

                <div className="outreach-card__detail">
                  <p className="outreach-card__label">The detail this email claims</p>
                  <p>{target.specific_detail}</p>
                  <a
                    className="outreach-card__source"
                    href={target.detail_source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Check the source
                  </a>
                </div>

                {editingId === target.id ? (
                  <textarea
                    className="text-input outreach-card__editor"
                    rows={14}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                ) : (
                  <pre className="outreach-card__body">{target.drafted_body}</pre>
                )}

                <div className="outreach-card__actions">
                  {editingId === target.id ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleSaveEdit(target)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleApprove(target)}
                      >
                        Approve and copy
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingId(target.id);
                          setEditBody(target.drafted_body || "");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          applyPatch(
                            target,
                            { status: "rejected" },
                            `Rejected ${target.org_name}.`
                          )
                        }
                      >
                        Reject
                      </button>
                      {target.contact_email ? (
                        <a
                          className="btn btn-secondary"
                          href={mailtoHref(target, target.drafted_body)}
                        >
                          Open in mail
                        </a>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
