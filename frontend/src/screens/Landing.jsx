import { useEffect, useState } from "react";
import { fetchRecentStories } from "../api.js";
import logo from "../assets/stay-logo.png";

/** Normalize ?ref= value to the same slug shape as shelter partner links. */
function refKeyFromParam(ref) {
  return String(ref || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const REF_TO_SHELTER_DISPLAY_NAME = {
  "austin-pets-alive": "Austin Pets Alive",
  "austin-animal-center": "Austin Animal Center",
  "apa": "Austin Pets Alive",
  "town-lake-animal-center": "Austin Animal Center",
  "houston-spca": "Houston SPCA",
  "san-antonio-animal-care-services": "San Antonio Animal Care Services",
};

export default function Landing({ setScreen }) {
  const [stories, setStories] = useState([]);
  const [isIOS, setIsIOS] = useState(false);
  const [referralShelterDisplayName, setReferralShelterDisplayName] = useState(null);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    if (!ref) {
      setReferralShelterDisplayName(null);
      return;
    }
    const key = refKeyFromParam(ref);
    setReferralShelterDisplayName(
      REF_TO_SHELTER_DISPLAY_NAME[key] ?? "your shelter"
    );
  }, []);

  return (
    <div className="screen landing-page">
      <div className="landing-hero">
        {referralShelterDisplayName ? (
          <p className="landing-referral">
            Referred by {referralShelterDisplayName}
          </p>
        ) : null}

        <p className="landing-eyebrow">Stay</p>

        <div className="landing-logo-wrap">
          <span className="landing-logo-glow" aria-hidden="true" />
          <img src={logo} alt="Stay" className="landing-logo" />
        </div>

        <h2 className="landing-headline">
          Something happened with <em>your dog.</em>
        </h2>

        <p className="landing-sub">
          Answer a few questions and we'll help you figure out what's driving it
          - and what to try today.
        </p>

        <button
          type="button"
          className="btn btn-primary landing-cta"
          onClick={() => setScreen("q1")}
        >
          Tell us what's going on
        </button>

        <button
          type="button"
          onClick={() => setScreen("ask")}
          style={{
            background: "none",
            border: "none",
            color: "#8a7a6a",
            fontSize: 14,
            cursor: "pointer",
            marginTop: 12,
            textDecoration: "underline",
            fontFamily: "inherit",
          }}
        >
          Already know what you want to ask?
        </button>

        <p className="landing-meta">
          Free
          <span className="landing-meta-divider" aria-hidden="true" />
          No account required
        </p>
        <p className="landing-meta">
          18 dogs helped
          <span className="landing-meta-divider" aria-hidden="true" />
          2 minutes
          <span className="landing-meta-divider" aria-hidden="true" />
          Austin Pets Alive pilot
        </p>

        {isIOS ? (
          <p className="landing-ios-hint">
            iPhone users: tap Share &rarr; "Add to Home Screen" for the full
            app experience
          </p>
        ) : null}
      </div>

      {stories.length > 0 ? (
        <section
          className="landing-stories"
          aria-label="Recent stories from the community"
        >
          <h3 className="landing-stories-heading">From owners this week</h3>
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
