import { useState } from "react";
import Landing from "./screens/Landing.jsx";
import Question1 from "./screens/Question1.jsx";
import Question2 from "./screens/Question2.jsx";
import Question3 from "./screens/Question3.jsx";
import TriageResult from "./screens/TriageResult.jsx";
import "./App.css";

const SCREENS = ["landing", "q1", "q2", "q3", "result"];

const INITIAL_INTAKE = {
  behavior_type: "",
  behavior_description: null,
  dog_name: null,
  triggers: [],
  duration: "",
  already_tried: "",
  email: null,
};

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [intake, setIntake] = useState(INITIAL_INTAKE);
  const [result, setResult] = useState(null);

  const update = (fields) => setIntake((prev) => ({ ...prev, ...fields }));
  const currentStep = SCREENS.indexOf(screen);

  const resetToStart = () => {
    setIntake({ ...INITIAL_INTAKE });
    setResult(null);
    setScreen("landing");
  };

  const props = { intake, update, setScreen, result, setResult, currentStep };

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <h1 className="logo" onClick={() => setScreen("landing")}>
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
