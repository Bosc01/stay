import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

const SECTIONS = [
  {
    heading: "The problem",
    body:
      "28% of dogs surrendered to shelters are given up because of behavioral issues. Most of those issues are fixable. The owners just did not have anyone to tell them that at the right moment. Stay is built for that moment: right after adoption, when the owner is scared and Googling at midnight.",
  },
  {
    heading: "What it does",
    body:
      "Owners answer 3 questions about their dog's behavior. Stay returns a plain-language explanation of what is probably driving it, a severity classification (manageable at home, try this but consider support, or get help now), and one specific first step to try today. Owners can also skip the structured flow entirely and ask a direct question from the landing screen, for cases where they already know what they want to understand.",
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
        <main className="app-main app-main--wide">
          <article className="case-article">
            <Link to="/" className="case-article__back">
              ← Back to Stay
            </Link>

            <h1 className="result-behavior-heading">How Stay was built</h1>

            {SECTIONS.map((section) => (
              <section key={section.heading} className="case-article__section">
                <h2 className="case-article__heading">{section.heading}</h2>
                <p className="case-article__body">{section.body}</p>
              </section>
            ))}

            <div className="case-article__cta">
              <a
                className="btn btn-primary"
                href="https://trystay.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Try Stay
              </a>
            </div>
          </article>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
