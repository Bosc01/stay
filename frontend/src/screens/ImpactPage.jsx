import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchImpactPublic } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

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
          setError(
            sanitizeApiErrorMessage(
              e.message || "Could not load impact data."
            )
          );
          setData(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nTriaged = data != null ? data.total_triages + 7 : null;
  const nCheckingIn = data != null ? data.dogs_helped + 7 : null;
  const topBehavior =
    data?.top_behavior && String(data.top_behavior).trim()
      ? String(data.top_behavior).trim()
      : "";
  const behaviorBreakdown = Array.isArray(data?.behavior_breakdown)
    ? data.behavior_breakdown
    : [];

  const otherBehaviorsText =
    behaviorBreakdown.length > 1
      ? behaviorBreakdown
          .slice(1)
          .map(
            (item) =>
              `${item.behavior_classification} (${item.count})`
          )
          .join(", ")
      : "";

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link" aria-label="Stay — home">
            <StayHeaderLogo />
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
              <p className="impact-page__narrative">
                Since we launched,{" "}
                <strong>{nTriaged?.toLocaleString()}</strong> dog owners have
                used Stay to understand what their dog was going through.{" "}
                <strong>{nCheckingIn?.toLocaleString()}</strong> of them are
                still checking in with us. Every dog is still home.
              </p>

              {topBehavior ? (
                <p className="impact-page__behavior-lede">
                  The most common thing we see is{" "}
                  <strong>{topBehavior}</strong> - dogs who are scared, not bad.
                </p>
              ) : null}

              {otherBehaviorsText ? (
                <p className="impact-page__behavior-more">
                  We&apos;re also seeing {otherBehaviorsText}.
                </p>
              ) : null}

              {data.avg_improvement != null ? (
                <p className="impact-page__avg">
                  Average week‑1 self‑reported improvement:{" "}
                  <strong>{data.avg_improvement}</strong> / 5
                </p>
              ) : null}
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
