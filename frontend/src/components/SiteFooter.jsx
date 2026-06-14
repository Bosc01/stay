import { Link } from "react-router-dom";

export default function SiteFooter({ className = "" }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <Link to="/impact" className="site-footer__link">
        Pilot impact
      </Link>
      <span className="site-footer__sep" aria-hidden="true">·</span>
      <Link to="/case-study" className="site-footer__link">
        Case study
      </Link>
    </footer>
  );
}
