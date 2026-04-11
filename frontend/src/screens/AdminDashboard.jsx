import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminStats } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import SiteFooter from "../components/SiteFooter.jsx";

const ADMIN_PASSWORD = "stay2026";
const SESSION_STORAGE_KEY = "stay_admin_password";
const REFRESH_MS = 60_000;

function loadStoredPassword() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function savePassword(pw) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, pw);
  } catch {
    /* ignore */
  }
}

function clearStoredPassword() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function AdminDashboard() {
  const [storedPassword, setStoredPassword] = useState(loadStoredPassword);
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  const authed = storedPassword === ADMIN_PASSWORD;

  const loadStats = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await fetchAdminStats(storedPassword);
      setStats(data);
    } catch (e) {
      if (e?.status === 401) {
        clearStoredPassword();
        setStoredPassword("");
        setStats(null);
        setLoadError("Session expired - sign in again.");
        return;
      }
      setLoadError(
        sanitizeApiErrorMessage(e.message || "Failed to load stats")
      );
    } finally {
      setLoading(false);
    }
  }, [authed, storedPassword]);

  useEffect(() => {
    if (!authed) return;
    loadStats();
    const id = window.setInterval(loadStats, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [authed, loadStats]);

  const handleGateSubmit = (e) => {
    e.preventDefault();
    setGateError("");
    if (gateInput !== ADMIN_PASSWORD) {
      setGateError("Incorrect password.");
      return;
    }
    savePassword(gateInput);
    setStoredPassword(gateInput);
    setGateInput("");
  };

  const handleLogout = () => {
    clearStoredPassword();
    setStoredPassword("");
    setStats(null);
    setLoadError("");
  };

  if (!authed) {
    return (
      <div className="app">
        <div className="app-frame">
          <header className="app-header">
            <Link to="/" className="logo logo-link">
              Stay
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

  const sev = stats?.severity_breakdown || {};
  const sevGreen = Number(sev.green) || 0;
  const sevYellow = Number(sev.yellow) || 0;
  const sevRed = Number(sev.red) || 0;
  const sevSum = sevGreen + sevYellow + sevRed;
  const sevUnknown = Math.max(
    0,
    (stats?.total_triages ?? 0) - sevSum
  );
  const pctOfTotal = (n) =>
    stats?.total_triages
      ? Math.round((n / stats.total_triages) * 1000) / 10
      : 0;
  const stackedPct = (n) =>
    sevSum > 0 ? Math.round((n / sevSum) * 10000) / 100 : 0;

  const behaviorRows = stats?.behavior_breakdown || [];
  const dailyRows = stats?.daily_triages || [];
  const maxDailyCount = Math.max(1, ...dailyRows.map((d) => d.count || 0));

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header admin-header">
          <Link to="/" className="logo logo-link">
            Stay
          </Link>
          <button type="button" className="btn btn-secondary admin-logout" onClick={handleLogout}>
            Sign out
          </button>
        </header>
        <main className="app-main">
          <div className="screen admin-screen">
            <div className="admin-dashboard-head">
              <h2>Dashboard</h2>
              <p className="subtitle admin-subtitle">
                Live metrics from Supabase. Refreshes every 60 seconds.
                {loading && stats ? <span className="admin-refresh-hint"> Updating…</span> : null}
              </p>
            </div>

            {loadError ? <p className="error-text">{loadError}</p> : null}

            {!stats && loading ? (
              <p className="admin-loading">Loading stats…</p>
            ) : null}

            {stats ? (
              <div className="admin-metric-grid">
                <div className="admin-metric-card">
                  <p className="admin-metric-label">Total triages</p>
                  <p className="admin-metric-value">{stats.total_triages.toLocaleString()}</p>
                </div>
                <div className="admin-metric-card">
                  <p className="admin-metric-label">Triages today (UTC)</p>
                  <p className="admin-metric-value">{stats.triages_today.toLocaleString()}</p>
                </div>
                <div className="admin-metric-card">
                  <p className="admin-metric-label">Email capture rate</p>
                  <p className="admin-metric-value">
                    {(stats.email_capture_rate * 100).toFixed(1)}%
                  </p>
                  <p className="admin-metric-hint">
                    {stats.email_captured_count?.toLocaleString()} with email /{" "}
                    {stats.total_triages?.toLocaleString()} total
                  </p>
                </div>
                <div className="admin-metric-card">
                  <p className="admin-metric-label">Week 1 improvement (avg)</p>
                  <p className="admin-metric-value">
                    {stats.week1_improvement_average != null
                      ? stats.week1_improvement_average
                      : " - "}
                  </p>
                  <p className="admin-metric-hint">
                    {stats.week1_scores_count != null
                      ? `${stats.week1_scores_count} session(s) with score`
                      : null}
                  </p>
                </div>
                <div className="admin-metric-card">
                  <p className="admin-metric-label">Dog retention</p>
                  <p className="admin-metric-value">
                    {stats.dog_retention_rate != null
                      ? `${(stats.dog_retention_rate * 100).toFixed(1)}%`
                      : " - "}
                  </p>
                  <p className="admin-metric-hint">
                    {stats.dog_still_home_answered
                      ? `${stats.dog_still_home_true ?? 0} still home / ${stats.dog_still_home_answered} answered follow-up`
                      : "No follow-up answers yet"}
                  </p>
                </div>
              </div>
            ) : null}

            {stats ? (
              <section
                className="admin-breakdown"
                aria-labelledby="admin-breakdown-heading"
              >
                <h3 id="admin-breakdown-heading" className="admin-breakdown__title">
                  Behavior &amp; activity
                </h3>
                <p className="admin-breakdown__hint">
                  From stored triage results (classification &amp; severity) and session
                  dates (UTC).
                </p>

                <div className="admin-breakdown__block">
                  <h4 className="admin-breakdown__subhead">Behavior types</h4>
                  {behaviorRows.length > 0 ? (
                    <ol className="admin-behavior-list">
                      {behaviorRows.map((row, idx) => (
                        <li key={`${row.classification}-${idx}`} className="admin-behavior-row">
                          <span className="admin-behavior-name">{row.classification}</span>
                          <span className="admin-behavior-badge">{row.count}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="admin-breakdown__empty">No classifications recorded yet.</p>
                  )}
                </div>

                <div className="admin-breakdown__block">
                  <h4 className="admin-breakdown__subhead">Severity split</h4>
                  {sevSum > 0 ? (
                    <>
                      <div
                        className="admin-severity-stack"
                        role="img"
                        aria-label={`Severity: ${sevGreen} green, ${sevYellow} yellow, ${sevRed} red`}
                      >
                        {sevGreen > 0 ? (
                          <div
                            className="admin-severity-stack__seg admin-severity-stack__seg--green"
                            style={{ width: `${stackedPct(sevGreen)}%` }}
                          />
                        ) : null}
                        {sevYellow > 0 ? (
                          <div
                            className="admin-severity-stack__seg admin-severity-stack__seg--yellow"
                            style={{ width: `${stackedPct(sevYellow)}%` }}
                          />
                        ) : null}
                        {sevRed > 0 ? (
                          <div
                            className="admin-severity-stack__seg admin-severity-stack__seg--red"
                            style={{ width: `${stackedPct(sevRed)}%` }}
                          />
                        ) : null}
                      </div>
                      <ul className="admin-severity-inline-legend">
                        <li>
                          <span className="admin-dot admin-dot--green" />
                          Green <strong>{sevGreen}</strong>
                          <span className="admin-severity-pct">
                            ({pctOfTotal(sevGreen)}% of all triages)
                          </span>
                        </li>
                        <li>
                          <span className="admin-dot admin-dot--yellow" />
                          Yellow <strong>{sevYellow}</strong>
                          <span className="admin-severity-pct">
                            ({pctOfTotal(sevYellow)}% of all triages)
                          </span>
                        </li>
                        <li>
                          <span className="admin-dot admin-dot--red" />
                          Red <strong>{sevRed}</strong>
                          <span className="admin-severity-pct">
                            ({pctOfTotal(sevRed)}% of all triages)
                          </span>
                        </li>
                      </ul>
                    </>
                  ) : (
                    <p className="admin-breakdown__empty">No severity data yet.</p>
                  )}
                  {sevUnknown > 0 ? (
                    <p className="admin-breakdown__footnote">
                      Unknown / missing severity: {sevUnknown}
                    </p>
                  ) : null}
                </div>

                <div className="admin-breakdown__block">
                  <h4 className="admin-breakdown__subhead">Daily triages (UTC)</h4>
                  {dailyRows.length > 0 ? (
                    <ul className="admin-daily-list">
                      {dailyRows.map((row) => (
                        <li key={row.date} className="admin-daily-row">
                          <span className="admin-daily-date">{row.date}</span>
                          <div className="admin-daily-bar-wrap">
                            <div
                              className="admin-daily-bar"
                              style={{
                                width: `${((row.count || 0) / maxDailyCount) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="admin-daily-count">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-breakdown__empty">No dated sessions yet.</p>
                  )}
                </div>
              </section>
            ) : null}

            {stats ? (
              <section className="admin-interviews" aria-labelledby="admin-interviews-heading">
                <h3 id="admin-interviews-heading" className="admin-interviews__title">
                  Recent user interviews
                </h3>
                <p className="admin-interviews__hint">
                  Five most recent responses (help us improve Stay).
                </p>
                {(stats.recent_user_interviews || []).length > 0 ? (
                  stats.recent_user_interviews.map((row) => (
                    <article key={row.id} className="admin-interview-card">
                      <p className="admin-interview-card__meta">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : " - "}
                        {row.session_id ? (
                          <>
                            {" · "}
                            <span style={{ wordBreak: "break-all" }}>{row.session_id}</span>
                          </>
                        ) : null}
                      </p>
                      <p className="admin-interview-card__q">Before Stay</p>
                      <p className="admin-interview-card__a">
                        {String(row.q1 || "").trim() || " - "}
                      </p>
                      <p className="admin-interview-card__q">Almost stopped</p>
                      <p className="admin-interview-card__a">
                        {String(row.q2 || "").trim() || " - "}
                      </p>
                      <p className="admin-interview-card__q">Share with</p>
                      <p className="admin-interview-card__a">
                        {String(row.q3 || "").trim() || " - "}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="admin-interviews__hint">No interview responses yet.</p>
                )}
              </section>
            ) : null}

            {stats?.updated_at ? (
              <p className="admin-updated">
                Last updated: {new Date(stats.updated_at).toLocaleString()}
              </p>
            ) : null}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
