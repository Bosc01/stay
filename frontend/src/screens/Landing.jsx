import logo from "../assets/stay-logo.png";

export default function Landing({ setScreen }) {
  return (
    <div className="screen landing-hero">
      <img
        src={logo}
        alt="Stay"
        style={{
          width: 80,
          height: 80,
          display: "block",
          margin: "0 auto 24px",
        }}
      />
      <h2>Something happened with your dog.</h2>
      <p className="subtitle">
        Tell us what's going on. We'll help you understand what it means and what
        to do first — no judgment.
      </p>
      <button className="btn btn-primary" onClick={() => setScreen("q1")}>
        Tell us what happened
      </button>
      <p className="landing-footnote">Free. No account required.</p>
    </div>
  );
}
