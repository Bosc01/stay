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
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          Referred by {referralShelterDisplayName}
        </div>
      ) : null}
      <img
        src={logo}
        alt="Stay"
        style={{
          width: 140,
          height: 140,
          display: "block",
          margin: "0 auto 40px",
          objectFit: "contain",
        }}
      />
      <h2>Something happened with your dog.</h2>
      <p className="subtitle">
        Answer a few questions and we'll help you figure out what's driving it - and
        what to try today.
      </p>
      <button className="btn btn-primary" onClick={() => setScreen("q1")}>
        Tell us what's going on
      </button>
      <p className="landing-footnote">Free. No account required.</p>
      <p className="landing-social-proof">
        15 dogs helped · 2 minutes · Austin Pets Alive pilot
      </p>
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
      </div>

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
