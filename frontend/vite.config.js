import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/triage": "http://localhost:8000",
      "/followup": "http://localhost:8000",
      "/health": "http://localhost:8000",
      "/checkin": "http://localhost:8000",
      "/referral-stats": "http://localhost:8000",
      "/profile": "http://localhost:8000",
      "/stories": "http://localhost:8000",
    },
  },
});
