import { useState } from "react";
import { Link } from "react-router-dom";
import { fetchReferralStats } from "../api.js";

const SITE_ORIGIN = "https://trystay.org";

function slugifyShelterRef(name) {
  const s = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 64);
}

export default function ShelterPage() {
  const [shelterInput, setShelterInput] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [activeRef, setActiveRef] = useState("");
  const [helpedCount, setHelpedCount] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [statsFetchError, setStatsFetchError] = useState(null);
  const [copyDone, setCopyDone] = useState(false);
  const [previewText, setPreviewText] = useState("");

  const handleGenerate = async () => {
    const slug = slugifyShelterRef(shelterInput);
    if (!slug) {
      setReferralLink("");
      setActiveRef("");
      setHelpedCount(null);
      setFormError("Enter a shelter or rescue name.");
      setCopyDone(false);
      setPreviewText("");
      return;
    }
    setFormError(null);
    setStatsFetchError(null);
    const link = `${SITE_ORIGIN}?ref=${encodeURIComponent(slug)}`;
    setReferralLink(link);
    setActiveRef(slug);
    setPreviewText(`trystay.org?ref=${slug}`);
    setStatsLoading(true);
    setHelpedCount(null);

    try {
      await navigator.clipboard.writeText(link);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      // Fail silently — link still shown.
      setCopyDone(false);
    }

    try {
      const data = await fetchReferralStats(slug);
      setHelpedCount(typeof data.count === "number" ? data.count : 0);
    } catch (e) {
      setStatsFetchError(e.message || "Could not load stats.");
      setHelpedCount(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link">
            Stay
          </Link>
        </header>
        <main className="app-main">
          <div className="screen shelter-page">
            <h2 className="shelter-page__title">
              For shelter staff and rescue coordinators
            </h2>
            <p className="subtitle shelter-page__sub">
              Refer owners to Stay before their surrender appointment. It takes 2
              minutes and gives them a diagnosis and one step to try today —
              free.
            </p>

            <label className="field-label" htmlFor="shelter-name">
              Shelter or rescue name
            </label>
            <input
              id="shelter-name"
              type="text"
              className="email-input"
              placeholder="e.g. Oak Hill SPCA"
              value={shelterInput}
              onChange={(e) => setShelterInput(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", marginBottom: 20 }}
              onClick={handleGenerate}
            >
              Generate referral link
            </button>

            {formError && <p className="error-text">{formError}</p>}

            {referralLink && (
              <div className="shelter-page__link-box">
                <p className="shelter-page__link-label">Your link</p>
                <p className="shelter-page__link-url">{referralLink}</p>
                {previewText ? (
                  <>
                    <p className="shelter-page__link-label" style={{ marginTop: 14 }}>
                      Preview
                    </p>
                    <p className="shelter-page__link-url">{previewText}</p>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "100%", marginTop: 10 }}
                  onClick={handleCopyLink}
                >
                  {copyDone ? "Link copied" : "Copy link"}
                </button>
              </div>
            )}

            {activeRef && (
              <section className="shelter-page__stats" aria-live="polite">
                {statsLoading && (
                  <p className="loading-text">Loading stats…</p>
                )}
                {!statsLoading && statsFetchError && (
                  <p className="error-text">{statsFetchError}</p>
                )}
                {!statsLoading && !statsFetchError && helpedCount !== null && (
                  <p className="shelter-page__stats-count">
                    <strong>{helpedCount}</strong> owner
                    {helpedCount === 1 ? "" : "s"} helped through your referrals
                  </p>
                )}
              </section>
            )}

            <p className="shelter-page__back">
              <Link to="/">← Back to triage</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
