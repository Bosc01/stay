import { Link } from "react-router-dom";
import StayHeaderLogo from "./StayHeaderLogo.jsx";

const CONTACT_EMAIL = "hello@trystay.org";

export default function SiteFooter({ className = "" }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <StayHeaderLogo />
          <p className="site-footer__tagline">
            Stay helps dog owners understand what&apos;s going on with their dog
            and what to try next.
          </p>
        </div>

        <nav className="site-footer__group" aria-labelledby="footer-learn">
          <h2 className="site-footer__group-title" id="footer-learn">
            Learn
          </h2>
          <ul className="site-footer__list">
            <li>
              <Link to="/case-study" className="site-footer__link">
                Case study
              </Link>
            </li>
            <li>
              <Link to="/impact" className="site-footer__link">
                Pilot impact
              </Link>
            </li>
          </ul>
        </nav>

        <nav className="site-footer__group" aria-labelledby="footer-contact">
          <h2 className="site-footer__group-title" id="footer-contact">
            Contact
          </h2>
          <ul className="site-footer__list">
            <li>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="site-footer__link"
              >
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="site-footer__bottom">
        <p className="site-footer__copyright">
          &copy; {new Date().getFullYear()} Stay
        </p>
      </div>
    </footer>
  );
}
