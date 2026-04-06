import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminStats } from "../api.js";

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
        setLoadError("Session expired — sign in again.");
        return;
      }
      setLoadError(e.message || "Failed to load stats");
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
        </div>
      </div>
    );
  }

  const rawSb = stats?.severity_breakdown;
  const sb = {
    green: rawSb?.green ?? 0,
    yellow: rawSb?.yellow ?? 0,
    red: rawSb?.red ?? 0,
    counts: {
      green: 0,
      yellow: 0,
      red: 0,
      unknown: 0,
      ...(rawSb?.counts && typeof rawSb.counts === "object" ? rawSb.counts : {}),
    },
  };
  const counts = sb.counts;

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
                <div className="admin-metric-card admin-metric-card--wide">
                  <p className="admin-metric-label">Severity breakdown</p>
                  <p className="admin-metric-hint admin-metric-hint--below-label">
                    % of all triages (green / yellow / red)
                  </p>
                  <div className="admin-severity-bar" aria-hidden="true">
                    <div
                      className="admin-severity-bar__seg admin-severity-bar__seg--green"
                      style={{ flexGrow: Math.max(sb.green, 0.1) }}
                      title={`Green ${sb.green}%`}
                    />
                    <div
                      className="admin-severity-bar__seg admin-severity-bar__seg--yellow"
                      style={{ flexGrow: Math.max(sb.yellow, 0.1) }}
                      title={`Yellow ${sb.yellow}%`}
                    />
                    <div
                      className="admin-severity-bar__seg admin-severity-bar__seg--red"
                      style={{ flexGrow: Math.max(sb.red, 0.1) }}
                      title={`Red ${sb.red}%`}
                    />
                  </div>
                  <ul className="admin-severity-legend">
                    <li>
                      <span className="admin-dot admin-dot--green" /> Green {sb.green}% (
                      {counts?.green ?? 0})
                    </li>
                    <li>
                      <span className="admin-dot admin-dot--yellow" /> Yellow {sb.yellow}% (
                      {counts?.yellow ?? 0})
                    </li>
                    <li>
                      <span className="admin-dot admin-dot--red" /> Red {sb.red}% ({counts?.red ?? 0})
                    </li>
                    {counts?.unknown > 0 ? (
                      <li className="admin-severity-unknown">
                        Unknown / missing: {counts.unknown}
                      </li>
                    ) : null}
                  </ul>
                </div>
                <div className="admin-metric-card admin-metric-card--wide">
                  <p className="admin-metric-label">Top behavior classifications</p>
                  <ol className="admin-top-list">
                    {(stats.top_behaviors || []).map((row) => (
                      <li key={row.classification}>
                        <span className="admin-top-name">{row.classification}</span>
                        <span className="admin-top-count">{row.count}</span>
                      </li>
                    ))}
                    {(!stats.top_behaviors || stats.top_behaviors.length === 0) && (
                      <li className="admin-metric-hint">No data yet</li>
                    )}
                  </ol>
                </div>
                <div className="admin-metric-card">
                  <p className="admin-metric-label">Week 1 improvement (avg)</p>
                  <p className="admin-metric-value">
                    {stats.week1_improvement_average != null
                      ? stats.week1_improvement_average
                      : "—"}
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
                      : "—"}
                  </p>
                  <p className="admin-metric-hint">
                    {stats.dog_still_home_answered
                      ? `${stats.dog_still_home_true ?? 0} still home / ${stats.dog_still_home_answered} answered follow-up`
                      : "No follow-up answers yet"}
                  </p>
                </div>
              </div>
            ) : null}

            {stats?.updated_at ? (
              <p className="admin-updated">
                Last updated: {new Date(stats.updated_at).toLocaleString()}
              </p>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
