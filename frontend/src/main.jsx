import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import WeekOneCheckin from "./screens/WeekOneCheckin.jsx";
import DogProfile from "./screens/DogProfile.jsx";
import ShelterPage from "./screens/ShelterPage.jsx";
import AdminDashboard from "./screens/AdminDashboard.jsx";
import PrintCard from "./screens/PrintCard.jsx";
import ImpactPage from "./screens/ImpactPage.jsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/shelter" element={<ShelterPage />} />
        <Route path="/checkin" element={<WeekOneCheckin />} />
        <Route path="/profile/:sessionId" element={<DogProfile />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/print" element={<PrintCard />} />
        <Route path="/impact" element={<ImpactPage />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
