import { useEffect, useState } from "react";
import { fetchRecentStories } from "../api.js";
import logo from '../assets/stay-logo.png';

export default function Landing({ setScreen }) {
  const [stories, setStories] = useState([]);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRecentStories();
        const list = Array.isArray(data?.stories) ? data.stories : [];
        const trimmed = list
          .filter(
            (s) =>
              s &&
              typeof s === "object" &&
              (String(s.dog_name || "").trim() ||
                String(s.behavior_type || "").trim() ||
                String(s.update_text || "").trim())
          )
          .slice(0, 3);
        if (!cancelled) setStories(trimmed);
      } catch {
        if (!cancelled) setStories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      const shouldShow = /iPhone/.test(ua) && window.navigator.standalone === false;
      setIsIOS(shouldShow);
    } catch {
      setIsIOS(false);
    }
  }, []);

  return (
    <div className="screen landing-hero">
      <img
        src={logo}
        alt="Stay"
        style={{
          width: 120,
          height: 120,
          display: "block",
          margin: "0 auto 24px",
          objectFit: "contain",
        }}
      />
      <h2>Something happened with your dog.</h2>
      <p className="subtitle">
        Tell us what's going on. We'll help you understand what it means and what
        to do first — no judgment.
      </p>
      <button className="btn btn-primary" onClick={() => setScreen("q1")}>
        Tell us what happened
      </button>
      <p className="landing-footnote">Free. No account required.</p>
      {isIOS ? (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          iPhone users: tap ⬆ Share → "Add to Home Screen" for the full app
          experience
        </p>
      ) : null}

      {stories.length > 0 ? (
        <section
          className="landing-stories"
          aria-label="Recent stories from the community"
        >
          <h3 className="landing-stories-heading">Recent stories</h3>
          <ul className="landing-stories-list">
            {stories.map((story, i) => {
              const meta = [story.dog_name, story.behavior_type]
                .map((x) => String(x || "").trim())
                .filter(Boolean)
                .join(" · ");
              const text = String(story.update_text || "").trim();
              return (
                <li key={i} className="landing-story-card">
                  {meta ? <p className="landing-story-meta">{meta}</p> : null}
                  {text ? <p className="landing-story-text">{text}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
