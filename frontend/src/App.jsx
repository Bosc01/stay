import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Landing from "./screens/Landing.jsx";
import Question1 from "./screens/Question1.jsx";
import Question2 from "./screens/Question2.jsx";
import Question3 from "./screens/Question3.jsx";
import TriageResult from "./screens/TriageResult.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const SCREENS = ["landing", "q1", "q2", "q3", "result"];

const INITIAL_INTAKE = {
  behavior_type: "",
  behavior_intensity: 2,
  behavior_description: null,
  dog_name: null,
  owner_experience: null,
  prior_training: null,
  referral_source: null,
  sudden_onset: false,
  triggers: [],
  duration: "",
  already_tried: "",
  email: null,
};

const IOS_INSTALL_BANNER_KEY = "stay_ios_install_banner_dismissed";

export default function App() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState("landing");
  const [intake, setIntake] = useState(INITIAL_INTAKE);
  const [result, setResult] = useState(null);
  const [showIosInstallBanner, setShowIosInstallBanner] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (ref) {
      setIntake((prev) => ({ ...prev, referral_source: ref }));
    }
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(IOS_INSTALL_BANNER_KEY) === "1") return;
      const ua = navigator.userAgent || "";
      if (!/iPhone/.test(ua)) return;
      if (window.navigator.standalone !== false) return;
      setShowIosInstallBanner(true);
    } catch {
      /* ignore */
    }
  }, []);

  const update = (fields) => setIntake((prev) => ({ ...prev, ...fields }));
  const currentStep = SCREENS.indexOf(screen);

  const resetToStart = () => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim() || null;
    setIntake({ ...INITIAL_INTAKE, referral_source: ref });
    setResult(null);
    setScreen("landing");
    try {
      sessionStorage.removeItem("stay_q3_support_banner");
    } catch {
      /* ignore */
    }
  };

  const props = { intake, update, setScreen, result, setResult, currentStep };

  const dismissIosInstallBanner = () => {
    try {
      sessionStorage.setItem(IOS_INSTALL_BANNER_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowIosInstallBanner(false);
  };

  return (
    <div className="app">
      {showIosInstallBanner ? (
        <div className="ios-install-banner" role="region" aria-label="Install app">
          <p className="ios-install-banner__text">
            <span aria-hidden="true">⬆ </span>
            Tap the share button below, then "Add to Home Screen"
          </p>
          <button
            type="button"
            className="ios-install-banner__dismiss"
            aria-label="Dismiss"
            onClick={dismissIosInstallBanner}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="app-frame">
        <header className="app-header">
          <h1
            className="logo"
            onClick={() => {
              navigate("/");
              setScreen("landing");
            }}
          >
            Stay
          </h1>
        </header>
        <main className="app-main">
          {screen === "landing" && (
            <ErrorBoundary>
              <Landing {...props} />
            </ErrorBoundary>
          )}
          {screen === "q1" && (
            <ErrorBoundary>
              <Question1 {...props} />
            </ErrorBoundary>
          )}
          {screen === "q2" && (
            <ErrorBoundary>
              <Question2 {...props} />
            </ErrorBoundary>
          )}
          {screen === "q3" && (
            <ErrorBoundary>
              <Question3 {...props} />
            </ErrorBoundary>
          )}
          {screen === "result" && (
            <ErrorBoundary>
              <TriageResult
                {...props}
                sessionId={result?.session_id ?? null}
                resetToStart={resetToStart}
              />
            </ErrorBoundary>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

