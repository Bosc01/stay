import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/triage": "http://localhost:8000",
      "/followup": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
