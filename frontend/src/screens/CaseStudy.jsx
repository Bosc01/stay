import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

const SECTION_HEADING_STYLE = {
  fontFamily: '"Instrument Serif", Georgia, serif',
  fontStyle: "italic",
  fontWeight: 400,
  fontSize: 24,
  lineHeight: 1.2,
  color: "var(--paper-50)",
  margin: "0 0 14px",
  letterSpacing: "-0.005em",
};

const BACK_LINK_STYLE = {
  display: "inline-block",
  margin: "0 0 18px",
  fontFamily: '"Fraunces", serif',
  fontSize: 14,
  color: "var(--paper-300)",
  textDecoration: "none",
};

const CTA_WRAP_STYLE = {
  margin: "28px 0 8px",
  display: "flex",
  justifyContent: "center",
};

const SECTIONS = [
  {
    heading: "The problem",
    body:
      "28% of dogs surrendered to shelters are given up because of behavioral issues. Most of those issues are fixable. The owners just did not have anyone to tell them that at the right moment. Stay is built for that moment: right after adoption, when the owner is scared and Googling at midnight.",
  },
  {
    heading: "What it does",
    body:
      "Owners answer 3 questions about their dog's behavior. Stay returns a plain-language explanation of what is probably driving it, a severity classification (manageable at home, try this but consider support, or get help now), and one specific first step to try today. A follow-up question feature lets owners ask Claude directly about their specific situation after reading their result.",
  },
  {
    heading: "Key product decision",
    body:
      "The severity system is not cosmetic. A red classification overrides the standard result and tells the owner to contact a professional directly. The app does not try to handle cases it should not handle. That boundary was a deliberate product safety decision, not a technical limitation.",
  },
  {
    heading: "What the data shows",
    body:
      "58% of cases classified as yellow, owners who needed support but not an emergency intervention. Fear-based reactivity accounts for 58% of all presenting issues, consistent with what shelter intake data shows nationally. The pilot is early and ongoing. Distribution started through dog owner communities in June 2026.",
  },
  {
    heading: "Stack",
    body:
      "React and Vite on Vercel. FastAPI on Render. Supabase for session persistence. Anthropic Claude API for triage and follow-up questions. Resend for email follow-ups. Built and deployed solo over roughly 6 weeks while in school full time.",
  },
];

export default function CaseStudy() {
  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link" aria-label="Stay — home">
            <StayHeaderLogo />
          </Link>
        </header>
        <main className="app-main">
          <Link to="/" style={BACK_LINK_STYLE}>
            ← Back to Stay
          </Link>

          <h1 className="result-behavior-heading">How Stay was built</h1>

          {SECTIONS.map((section) => (
            <section key={section.heading} className="result-card">
              <h2 style={SECTION_HEADING_STYLE}>{section.heading}</h2>
              <p className="result-card-body">{section.body}</p>
            </section>
          ))}

          <div style={CTA_WRAP_STYLE}>
            <a
              className="btn btn-primary"
              href="https://trystay.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Try Stay
            </a>
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
