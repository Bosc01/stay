import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import CheckInPage from "./screens/CheckInPage.jsx";
import DogProfile from "./screens/DogProfile.jsx";
import ShelterPage from "./screens/ShelterPage.jsx";
import AdminDashboard from "./screens/AdminDashboard.jsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/shelter" element={<ShelterPage />} />
        <Route path="/checkin" element={<CheckInPage />} />
        <Route path="/profile/:sessionId" element={<DogProfile />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
