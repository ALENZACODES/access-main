import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// This standalone report preview does not change the App's PWA or Workbox configuration.
export default defineConfig({ plugins: [react()], server: { port: 5177, strictPort: true } });
