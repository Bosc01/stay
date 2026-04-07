import { Link } from "react-router-dom";

export default function SiteFooter({ className = "" }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <Link to="/impact" className="site-footer__link">
        Pilot impact
      </Link>
    </footer>
  );
}
