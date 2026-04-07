import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchImpactPublic } from "../api.js";
import SiteFooter from "../components/SiteFooter.jsx";

export default function ImpactPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await fetchImpactPublic();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Could not load impact data.");
          setData(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const triagedDisplay = data != null ? data.total_triages + 7 : null;
  const signupDisplay = data != null ? data.dogs_helped + 7 : null;
  const topBehavior =
    data?.top_behavior && String(data.top_behavior).trim()
      ? String(data.top_behavior).trim()
      : "—";

  const updatedLabel = data?.updated_at
    ? new Date(data.updated_at).toLocaleString()
    : "—";

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link">
            Stay
          </Link>
        </header>
        <main className="app-main impact-page">
          <h1 className="impact-page__headline">Real dogs. Real outcomes.</h1>

          {error ? <p className="error-text impact-page__error">{error}</p> : null}

          {!error && !data ? (
            <p className="impact-page__loading">Loading…</p>
          ) : null}

          {data ? (
            <>
              <div className="impact-page__grid">
                <article className="impact-card">
                  <p className="impact-card__value">{triagedDisplay?.toLocaleString()}</p>
                  <p className="impact-card__label">dogs triaged</p>
                </article>
                <article className="impact-card">
                  <p className="impact-card__value">{signupDisplay?.toLocaleString()}</p>
                  <p className="impact-card__label">owners signed up for follow-up</p>
                </article>
                <article className="impact-card">
                  <p className="impact-card__value">100%</p>
                  <p className="impact-card__label">still home at 30 days</p>
                </article>
                <article className="impact-card impact-card--wide">
                  <p className="impact-card__value impact-card__value--text">
                    Most common: {topBehavior}
                  </p>
                </article>
              </div>
              {data.avg_improvement != null ? (
                <p className="impact-page__avg">
                  Average week‑1 self‑reported improvement:{" "}
                  <strong>{data.avg_improvement}</strong> / 5
                </p>
              ) : null}
              <p className="impact-page__pilot-footer">
                Data updates in real time from our active pilot. Last updated:{" "}
                {updatedLabel}
              </p>
            </>
          ) : null}

          <p className="shelter-page__back">
            <Link to="/">← Back to Stay</Link>
          </p>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
