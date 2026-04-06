import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Landing from "./screens/Landing.jsx";
import Question1 from "./screens/Question1.jsx";
import Question2 from "./screens/Question2.jsx";
import Question3 from "./screens/Question3.jsx";
import TriageResult from "./screens/TriageResult.jsx";

const SCREENS = ["landing", "q1", "q2", "q3", "result"];

const INITIAL_INTAKE = {
  behavior_type: "",
  behavior_description: null,
  dog_name: null,
  referral_source: null,
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
          {screen === "landing" && <Landing {...props} />}
          {screen === "q1" && <Question1 {...props} />}
          {screen === "q2" && <Question2 {...props} />}
          {screen === "q3" && <Question3 {...props} />}
          {screen === "result" && (
            <TriageResult {...props} resetToStart={resetToStart} />
          )}
        </main>
      </div>
    </div>
  );
}

