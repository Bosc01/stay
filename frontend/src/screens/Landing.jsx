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
      <div className="landing-hero" style={{ position: "relative" }}>
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
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.15em",
            color: "#888",
            textAlign: "center",
            marginBottom: 16,
            textTransform: "uppercase",
          }}
        >
          Stay
        </div>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            width: 280,
            height: 280,
            background:
              "radial-gradient(circle, rgba(180,130,60,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <img
          src={logo}
          alt="Stay"
          style={{
            position: "relative",
            zIndex: 1,
            width: 180,
            height: 180,
            display: "block",
            margin: "0 auto 40px",
            objectFit: "contain",
          }}
        />
        <h2
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 36,
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            marginBottom: 14,
          }}
        >
          <span>Something happened with </span>
          <span style={{ fontStyle: "italic" }}>your dog.</span>
        </h2>
        <p className="subtitle">
          Answer a few questions and we'll help you figure out what's driving it - and
          what to try today.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setScreen("q1")}
          style={{
            background: "#ffffff",
            color: "#0d0d0b",
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "0.01em",
            padding: "16px 32px",
            borderRadius: 14,
            border: "none",
            width: "100%",
            cursor: "pointer",
            marginTop: 24,
            boxShadow: "0 2px 20px rgba(255,255,255,0.1)",
            transition: "all 0.15s ease",
          }}
        >
          Tell us what's going on
        </button>
        <p className="landing-footnote">Free. No account required.</p>
        <p
          className="landing-social-proof"
          style={{
            fontSize: 12,
            color: "#555",
            textAlign: "center",
            marginTop: 8,
            letterSpacing: "0.03em",
          }}
        >
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
            iPhone users: tap ⬆ Share → &quot;Add to Home Screen&quot; for the full app
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
                <li
                  key={i}
                  className="landing-story-card"
                  style={{
                    background: "#111110",
                    border: "1px solid #1e1e1c",
                    borderRadius: 12,
                    padding: "14px 16px",
                    marginBottom: 10,
                  }}
                >
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
