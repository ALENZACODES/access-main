import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
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
        navigateFallbackDenylist: [/^\/packs\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // Offline packs are stored in IndexedDB on purpose. They are not kept in the page cache,
            // so deleting a pack removes it.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && !url.pathname.startsWith("/packs/"),
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
