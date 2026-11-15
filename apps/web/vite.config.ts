import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { SHELL_CONTRACT_VERSION } from "../../packages/shared/src/modules.ts";
import { BUILD_MANIFEST_FILE, createBuildManifest } from "./src/release/manifest.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Writes build-manifest.json beside index.html so a deployed copy can be checked against its tag. */
function buildManifest(): Plugin {
  return {
    name: "access-build-manifest",
    apply: "build",
    generateBundle() {
      const manifest = createBuildManifest({
        buildId: process.env.VITE_BUILD_ID,
        commit: process.env.VITE_BUILD_COMMIT,
        contractVersion: SHELL_CONTRACT_VERSION,
      });
      this.emitFile({ type: "asset", fileName: BUILD_MANIFEST_FILE, source: `${JSON.stringify(manifest, null, 2)}\n` });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    buildManifest(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "the App",
        short_name: "the App",
        description: "Prototype. Every record is unverified. Each shows its source, licence, date, and verification tier.",
        theme_color: "#083734",
        background_color: "#f4f1ea",
        display: "standalone",
        lang: "en",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin }) => sameOrigin,
            handler: "NetworkFirst",
            options: {
              cacheName: "shell-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@access/shared": path.resolve(root, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
  },
});
