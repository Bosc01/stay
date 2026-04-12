import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchShelterImpactStats, submitShelterInquiry } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

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
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get("ref");

  const refFromUrl = useMemo(() => {
    const s = slugifyShelterRef(refParam || "");
    return s || null;
  }, [refParam]);

  const [shelterInput, setShelterInput] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [generatedRefSlug, setGeneratedRefSlug] = useState(null);

  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState(null);

  const [formError, setFormError] = useState(null);
  const [copyDone, setCopyDone] = useState(false);
  const [copiedTemplateId, setCopiedTemplateId] = useState(null);

  const [demoName, setDemoName] = useState("");
  const [demoShelter, setDemoShelter] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoRole, setDemoRole] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [demoError, setDemoError] = useState(null);

  const impactRef = generatedRefSlug ?? refFromUrl;

  const effectiveReferralLink = useMemo(() => {
    if (referralLink) return referralLink;
    if (impactRef) return `${SITE_ORIGIN}?ref=${encodeURIComponent(impactRef)}`;
    return "";
  }, [referralLink, impactRef]);

  const linkForTemplates = effectiveReferralLink || "[referral link]";

  const emailTemplateBody = useMemo(
    () =>
      `Before your appointment, we'd like to offer you a free resource. Stay is a free AI behavior triage that takes 2 minutes - it can help you understand what's driving your dog's behavior and give you one specific thing to try today. Many owners find that with the right approach, the behavior that felt overwhelming becomes manageable.\n\nTry it before your appointment: ${linkForTemplates}`,
    [linkForTemplates]
  );

  const textTemplateBody = useMemo(
    () =>
      `Before your surrender appt - try this free 2-min dog behavior tool: ${linkForTemplates}. Many owners find it changes things.`,
    [linkForTemplates]
  );

  const intakeFormInsert =
    "Would you like a free behavior resource before making your final decision? trystay.org";

  const loadImpact = useCallback(async (slug) => {
    if (!slug) {
      setImpact(null);
      return;
    }
    setImpactLoading(true);
    setImpactError(null);
    try {
      const data = await fetchShelterImpactStats(slug);
      setImpact(data);
    } catch (e) {
      setImpactError(
        sanitizeApiErrorMessage(e.message || "Could not load stats.")
      );
      setImpact(null);
    } finally {
      setImpactLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImpact(impactRef);
  }, [impactRef, loadImpact]);

  const scrollToGenerate = () => {
    document.getElementById("shelter-generate")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleGenerate = () => {
    const slug = slugifyShelterRef(shelterInput);
    if (!slug) {
      setReferralLink("");
      setGeneratedRefSlug(null);
      setFormError("Enter a shelter or rescue name.");
      return;
    }
    setFormError(null);
    const link = `${SITE_ORIGIN}?ref=${encodeURIComponent(slug)}`;
    setReferralLink(link);
    setGeneratedRefSlug(slug);
    setCopyDone(false);
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2500);
    } catch {
      setCopyDone(false);
    }
  };

  const copyTemplate = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTemplateId(id);
      window.setTimeout(() => setCopiedTemplateId(null), 2000);
    } catch {
      setCopiedTemplateId(null);
    }
  };

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setDemoError(null);
    setDemoSuccess(false);
    if (!demoName.trim() || !demoShelter.trim() || !demoEmail.trim()) {
      setDemoError("Name, shelter name, and email are required.");
      return;
    }
    if (!demoEmail.includes("@")) {
      setDemoError("Enter a valid email.");
      return;
    }
    setDemoLoading(true);
    try {
      await submitShelterInquiry({
        name: demoName.trim(),
        shelter_name: demoShelter.trim(),
        email: demoEmail.trim(),
        role: demoRole.trim() || null,
      });
      setDemoSuccess(true);
      setDemoName("");
      setDemoShelter("");
      setDemoEmail("");
      setDemoRole("");
    } catch (err) {
      setDemoError(
        sanitizeApiErrorMessage(err.message || "Something went wrong.")
      );
    } finally {
      setDemoLoading(false);
    }
  };

  const showImpactSection = Boolean(impactRef);

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link" aria-label="Stay — home">
            <StayHeaderLogo />
          </Link>
        </header>
        <main className="app-main shelter-portal">
          <section className="shelter-hero" aria-labelledby="shelter-hero-title">
            <h1 id="shelter-hero-title" className="shelter-hero__title">
              Help owners before they surrender.
            </h1>
            <p className="shelter-hero__sub">
              Stay gives owners a free AI behavior triage in 2 minutes. Give them the link
              before their surrender appointment.
            </p>
            <button type="button" className="btn btn-primary shelter-hero__cta" onClick={scrollToGenerate}>
              Get your free referral link
            </button>
          </section>

          <section className="shelter-section" aria-labelledby="shelter-how-title">
            <h2 id="shelter-how-title" className="shelter-section__title">
              How it works
            </h2>
            <ol className="shelter-steps">
              <li className="shelter-step">
                <span className="shelter-step__num" aria-hidden="true">
                  1
                </span>
                <div className="shelter-step__body">
                  <p className="shelter-step__headline">Share your referral link</p>
                  <p className="shelter-step__text">
                    Give your unique link to an at-risk owner before they come in.
                  </p>
                </div>
              </li>
              <li className="shelter-step">
                <span className="shelter-step__num" aria-hidden="true">
                  2
                </span>
                <div className="shelter-step__body">
                  <p className="shelter-step__headline">They get a free AI diagnosis</p>
                  <p className="shelter-step__text">
                    In about 2 minutes they see what may be driving the behavior and one step
                    to try today.
                  </p>
                </div>
              </li>
              <li className="shelter-step">
                <span className="shelter-step__num" aria-hidden="true">
                  3
                </span>
                <div className="shelter-step__body">
                  <p className="shelter-step__headline">You see how many dogs stayed home</p>
                  <p className="shelter-step__text">
                    Track completions and follow-up outcomes tied to your shelter&apos;s link.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section
            className="shelter-section shelter-section--card"
            id="shelter-generate"
            aria-labelledby="shelter-generate-title"
          >
            <h2 id="shelter-generate-title" className="shelter-section__title">
              Generate your link
            </h2>
            <p className="shelter-section__lede">
              Enter your shelter name. We&apos;ll build a short code for your URL (e.g.{" "}
              <span className="shelter-mono">trystay.org?ref=your-slug</span>).
            </p>
            <label className="field-label" htmlFor="shelter-name">
              Shelter name
            </label>
            <input
              id="shelter-name"
              type="text"
              className="text-input"
              placeholder="e.g. Oak Hill SPCA"
              value={shelterInput}
              onChange={(e) => setShelterInput(e.target.value)}
              autoComplete="organization"
            />
            <button
              type="button"
              className="btn btn-primary shelter-generate-btn"
              onClick={handleGenerate}
            >
              Generate link
            </button>
            {formError ? <p className="error-text">{formError}</p> : null}

            {referralLink ? (
              <div className="shelter-link-output">
                <p className="shelter-link-output__label">Your referral link</p>
                <p className="shelter-link-output__url">{referralLink}</p>
                <button
                  type="button"
                  className="btn btn-secondary shelter-copy-btn"
                  onClick={handleCopyLink}
                >
                  {copyDone ? "Copied!" : "Copy link"}
                </button>
              </div>
            ) : null}
          </section>

          <section className="shelter-section" aria-labelledby="shelter-templates-title">
            <h2 id="shelter-templates-title" className="shelter-section__title">
              Scripts &amp; templates
            </h2>
            <p className="shelter-section__lede">
              Copy-paste messages for owners. Your referral link is inserted automatically when
              you&apos;ve generated it or opened this page with{" "}
              <span className="shelter-mono">?ref=</span> in the URL.
            </p>

            <div className="shelter-template">
              <p className="shelter-template__label">Email template</p>
              <pre className="shelter-template__body">{emailTemplateBody}</pre>
              <button
                type="button"
                className="btn btn-secondary shelter-template__copy"
                onClick={() => copyTemplate("email", emailTemplateBody)}
              >
                {copiedTemplateId === "email" ? "Copied!" : "Copy"}
              </button>
            </div>

            <div className="shelter-template">
              <p className="shelter-template__label">Text message version (shorter)</p>
              <pre className="shelter-template__body">{textTemplateBody}</pre>
              <button
                type="button"
                className="btn btn-secondary shelter-template__copy"
                onClick={() => copyTemplate("text", textTemplateBody)}
              >
                {copiedTemplateId === "text" ? "Copied!" : "Copy"}
              </button>
            </div>

            <div className="shelter-template">
              <p className="shelter-template__label">Intake form insert</p>
              <pre className="shelter-template__body">{intakeFormInsert}</pre>
              <button
                type="button"
                className="btn btn-secondary shelter-template__copy"
                onClick={() => copyTemplate("intake", intakeFormInsert)}
              >
                {copiedTemplateId === "intake" ? "Copied!" : "Copy"}
              </button>
            </div>
          </section>

          {showImpactSection ? (
            <section className="shelter-section" aria-labelledby="shelter-impact-title">
              <h2 id="shelter-impact-title" className="shelter-section__title">
                Your impact
              </h2>
              <p className="shelter-section__lede shelter-impact__ref">
                Referral code: <span className="shelter-mono">{impactRef}</span>
              </p>
              {impactLoading ? (
                <p className="shelter-impact__loading">Loading stats…</p>
              ) : null}
              {impactError ? <p className="error-text">{impactError}</p> : null}
              {!impactLoading && !impactError && impact ? (
                <div className="shelter-impact-grid">
                  <div className="shelter-impact-card">
                    <p className="shelter-impact-card__label">Owners helped</p>
                    <p className="shelter-impact-card__value">
                      {(impact.owners_helped ?? 0).toLocaleString()}
                    </p>
                    <p className="shelter-impact-card__hint">Triage sessions with your ref</p>
                  </div>
                  <div className="shelter-impact-card">
                    <p className="shelter-impact-card__label">Average severity</p>
                    <p className="shelter-impact-card__value">
                      {impact.average_severity_label ?? " - "}
                    </p>
                    {impact.average_severity_score != null ? (
                      <p className="shelter-impact-card__hint">
                        Score {impact.average_severity_score} (1 = low, 3 = high)
                      </p>
                    ) : (
                      <p className="shelter-impact-card__hint">No severity data yet</p>
                    )}
                  </div>
                  <div className="shelter-impact-card">
                    <p className="shelter-impact-card__label">Dogs still home</p>
                    {impact.has_follow_up_data ? (
                      <>
                        <p className="shelter-impact-card__value">
                          {impact.dogs_still_home ?? 0}
                          <span className="shelter-impact-card__suffix">
                            {" "}
                            / {impact.follow_up_answered ?? 0} answered
                          </span>
                        </p>
                        <p className="shelter-impact-card__hint">
                          From follow-up survey (dog still in home)
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="shelter-impact-card__value"> - </p>
                        <p className="shelter-impact-card__hint">
                          No follow-up data yet for this referral code
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            className="shelter-section shelter-section--card shelter-section--demo"
            aria-labelledby="shelter-demo-title"
          >
            <h2 id="shelter-demo-title" className="shelter-section__title">
              Request a demo
            </h2>
            <p className="shelter-section__lede">
              Want a walkthrough for your team? Leave your details and we&apos;ll reach out.
            </p>
            <form className="shelter-demo-form" onSubmit={handleDemoSubmit}>
              <label className="field-label" htmlFor="demo-name">
                Your name
              </label>
              <input
                id="demo-name"
                type="text"
                className="text-input"
                value={demoName}
                onChange={(e) => setDemoName(e.target.value)}
                autoComplete="name"
                disabled={demoLoading}
              />
              <label className="field-label" htmlFor="demo-shelter">
                Shelter name
              </label>
              <input
                id="demo-shelter"
                type="text"
                className="text-input"
                value={demoShelter}
                onChange={(e) => setDemoShelter(e.target.value)}
                autoComplete="organization"
                disabled={demoLoading}
              />
              <label className="field-label" htmlFor="demo-email">
                Email
              </label>
              <input
                id="demo-email"
                type="email"
                className="text-input"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
                autoComplete="email"
                disabled={demoLoading}
              />
              <label className="field-label" htmlFor="demo-role">
                Role <span className="shelter-optional">(optional)</span>
              </label>
              <input
                id="demo-role"
                type="text"
                className="text-input"
                placeholder="e.g. Intake coordinator"
                value={demoRole}
                onChange={(e) => setDemoRole(e.target.value)}
                disabled={demoLoading}
              />
              {demoError ? <p className="error-text">{demoError}</p> : null}
              {demoSuccess ? (
                <p className="shelter-demo-success" role="status">
                  Thanks - we received your request.
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={demoLoading}>
                {demoLoading ? "Sending…" : "Submit request"}
              </button>
            </form>
          </section>

          <p className="shelter-page__back">
            <Link to="/">← Back to Stay</Link>
          </p>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
