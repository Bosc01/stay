import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchFollowupSession, logFunnelEvent, submitCheckinReply } from "../api.js";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

/** Landing for the one-tap links in the day 7 email: /checkin/:sessionId?home=yes&score=4 */
export default function CheckinReply() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();

  const homeRaw = (params.get("home") || "").toLowerCase();
  const stillHome = homeRaw === "yes" ? true : homeRaw === "no" ? false : null;
  const scoreRaw = Number(params.get("score"));
  const score =
    Number.isInteger(scoreRaw) && scoreRaw >= 1 && scoreRaw <= 5 ? scoreRaw : null;

  const titleRef = useRef(null);
  const [dogName, setDogName] = useState("your dog");
  const [state, setState] = useState("saving");

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    logFunnelEvent(sessionId, "visit");
    (async () => {
      try {
        const row = await fetchFollowupSession(sessionId);
        if (cancelled) return;
        const n = (row?.dog_name || row?.intake?.dog_name || "").trim();
        if (n) setDogName(n);
      } catch {
        /* the thank you still works without the name */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId || (stillHome === null && score === null)) {
      setState("bad-link");
      return;
    }
    (async () => {
      try {
        await submitCheckinReply({
          session_id: sessionId,
          dog_still_home: stillHome,
          improvement_score: score,
        });
        if (!cancelled) setState("done");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, stillHome, score]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [state]);

  let body;
  if (state === "saving") {
    body = <h2 className="week-one-checkin__title">One second, saving that...</h2>;
  } else if (state === "bad-link") {
    body = (
      <>
        <h2 ref={titleRef} tabIndex={-1} className="week-one-checkin__title">
          That link did not carry your answer
        </h2>
        <p className="subtitle">Open the link from your check-in email again.</p>
      </>
    );
  } else if (state === "error") {
    body = (
      <>
        <h2 ref={titleRef} tabIndex={-1} className="week-one-checkin__title">
          Something went wrong, try again
        </h2>
        <p className="subtitle">Tap the link in your email once more.</p>
      </>
    );
  } else {
    body = (
      <>
        <h2 ref={titleRef} tabIndex={-1} className="week-one-checkin__title">
          {stillHome === false
            ? "Thank you for telling us. We're sorry it went that way."
            : `Thank you. It's good to know ${dogName} is still home.`}
        </h2>
        <p className="shelter-page__back" style={{ marginTop: 24 }}>
          <Link to="/">
            {stillHome === false
              ? "Start over with another dog"
              : `If something has changed with ${dogName}, start a new triage`}
          </Link>
        </p>
      </>
    );
  }

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link" aria-label="Stay, home">
            <StayHeaderLogo />
          </Link>
        </header>
        <main className="app-main">
          <div className="screen week-one-checkin" aria-live="polite">
            {body}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
