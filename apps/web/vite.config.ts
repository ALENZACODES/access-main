import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "../..");

/** "/" for a root deploy, "/access-main/" for GitHub Pages. Always starts and ends with a slash. */
function normaliseBase(value: string | undefined): string {
  const raw = (value ?? "/").trim() || "/";
  const lead = raw.startsWith("/") ? raw : `/${raw}`;
  return lead.endsWith("/") ? lead : `${lead}/`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const base = normaliseBase(process.env.VITE_BASE ?? "/");
const dataPath = new RegExp(`${escapeRegExp(base)}data/`);

interface LanePackage {
  repo: string;
  path: string;
  alias: string;
}

/** Each pulled package is compiled from source in .lanes/<repo>/<path>/src/index.ts. */
const lock = JSON.parse(readFileSync(path.join(repoRoot, "lanes.lock.json"), "utf8")) as { packages: LanePackage[] };
const fallbacks = path.join(root, "src/modules/lane-fallbacks.ts");
const laneAliases = lock.packages.map((pkg) => {
  const real = path.join(repoRoot, ".lanes", pkg.repo.split("/")[1], ...pkg.path.split("/"), "src", "index.ts");
  return { find: new RegExp(`^${escapeRegExp(pkg.alias)}$`), replacement: existsSync(real) ? real : fallbacks };
});
const dataClientReal = path.join(repoRoot, "packages/data-client/src/index.ts");
const dataClientAlias = {
  find: /^@access-main\/data-client$/,
  replacement: existsSync(dataClientReal) ? dataClientReal : path.join(root, "src/modules/data-client-fallback.ts"),
};

export default defineConfig({
  base,
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
        start_url: base,
        scope: base,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        globIgnores: ["data/**", "**/*.pmtiles"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [dataPath],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          // Data pack files are never cached here. The data client keeps its own copy in IndexedDB.
          { urlPattern: dataPath, handler: "NetworkOnly" },
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
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@access/shared", replacement: path.resolve(root, "../../packages/shared/src/index.ts") },
      ...laneAliases,
      dataClientAlias,
    ],
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
