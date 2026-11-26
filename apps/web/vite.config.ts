import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { SHELL_CONTRACT_VERSION } from "../../packages/shared/src/modules.ts";
import { BUILD_MANIFEST_FILE, createBuildManifest } from "./src/release/manifest.ts";

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
const UNLINKED = new Set(["@access-tools/games", "@access-tools/navigator"]);
const laneAliases = lock.packages
  // @access-tools/place is resolved by placeLaneAlias so finders search does not load Ajv.
  .filter((pkg) => pkg.alias !== "@access-tools/place")
  .map((pkg) => {
    const repo = pkg.repo.split("/")[1];
    if (!repo) throw new Error(`lanes.lock.json repo must look like owner/name, got ${pkg.repo}`);
    const pkgRoot = path.join(repoRoot, ".lanes", repo, ...pkg.path.split("/"));
    const real = path.join(pkgRoot, "src", "index.ts");
    const resolved = UNLINKED.has(pkg.alias) ? fallbacks : existsSync(real) ? real : fallbacks;
    return { find: new RegExp(`^${escapeRegExp(pkg.alias)}$`), replacement: resolved };
  });
const slimLaneAlias = (find: RegExp, repo: string, pkgPath: string, file: string, fallback: string) => {
  const real = path.join(repoRoot, ".lanes", repo, ...pkgPath.split("/"), file);
  return { find, replacement: existsSync(real) ? real : fallback };
};

/**
 * pack-finders only needs adultChangeVerdict from pack/alias-resolve.ts. The place
 * package barrel also re-exports schema.ts, which compiles Ajv at module load.
 * Resolving the barrel from the finders search graph would put ~250 kB of Ajv on
 * the Day 22 washroom-finder first-result path. PlaceDetailPage still uses the
 * full package via a separate lazy import.
 */
function placeLaneAlias() {
  const full = path.join(repoRoot, ".lanes", "access-tools", "packages", "place", "src", "index.ts");
  const slim = path.join(repoRoot, ".lanes", "access-tools", "packages", "place", "src", "pack", "alias-resolve.ts");
  const resolvedFull = existsSync(full) ? full : fallbacks;
  const resolvedSlim = existsSync(slim) ? slim : resolvedFull;
  return {
    find: /^@access-tools\/place$/,
    replacement: resolvedFull,
    customResolver(_id: string, importer: string | undefined) {
      if (importer && /[/\\]packages[/\\]finders[/\\]/.test(importer)) return resolvedSlim;
      return resolvedFull;
    },
  };
}

const slimLaneAliases = [
  slimLaneAlias(/^@access-tools\/finders\/shell$/, "access-tools", "packages/finders", "src/shell.ts", path.join(root, "src/modules/finders-shell-fallback.ts")),
  slimLaneAlias(/^@access\/help\/shell$/, "access-help", "packages/help", "src/shell.ts", path.join(root, "src/modules/help-shell-fallback.ts")),
  // The games and navigator module routes load only the list adapters, not the package screens.
  slimLaneAlias(/^@access-tools\/games\/shell$/, "access-tools", "packages/games", "src/shell.ts", path.join(root, "src/modules/games-shell-fallback.ts")),
  slimLaneAlias(/^@access-tools\/games\/library$/, "access-tools", "packages/games", "src/library.ts", path.join(root, "src/modules/games-shell-fallback.ts")),
  slimLaneAlias(/^@access-tools\/navigator\/shell$/, "access-tools", "packages/navigator", "src/shell.ts", path.join(root, "src/modules/navigator-shell-fallback.ts")),
  placeLaneAlias(),
];

const dataClientReal = path.join(repoRoot, "packages/data-client/src/index.ts");
const dataClientAlias = {
  find: /^@access-main\/data-client$/,
  replacement: existsSync(dataClientReal) ? dataClientReal : path.join(root, "src/modules/data-client-fallback.ts"),
};

/** I13 More hub packages, synced by scripts/sync-hub.mjs into .lanes/. */
const hubAliases = (
  [
    ["@access-tools/employment", "access-tools", "employment"],
    ["@access-tools/housing", "access-tools", "housing"],
    ["@access-tools/safety", "access-tools", "safety"],
    ["@access-tools/timing", "access-tools", "timing"],
    ["@access-tools/diary", "access-tools", "diary"],
    ["@access-tools/auditors", "access-tools", "auditors"],
    ["@access-tools/handoff", "access-tools", "handoff"],
    ["@hub/handoff-fixtures", "access-tools", "handoff", "src/fixtures.ts"],
    ["@access/peers", "access-help", "peers"],
    ["@hub/peers-ui", "access-help", "peers", "src/ui/index.ts"],
    ["@access/event-access", "access-help", "event-access"],
    ["@hub/event-access-ui", "access-help", "event-access", "src/ui/index.ts"],
    ["@access/outings", "access-help", "outings"],
    ["@access-maps/conditions", "access-maps", "conditions"],
    ["@hub/wav-dataset", "access-maps", "conditions", "datasets/wav-services.json"],
    ["@hub/games", "access-tools", "games"],
  ] as Array<[string, string, string] | [string, string, string, string]>
)
  .map(([find, repo, pkg, entry = "src/index.ts"]) => ({
    find,
    replacement: path.join(repoRoot, ".lanes", repo, "packages", pkg, entry),
  }))
  .concat([
    // This repository's own advocacy package: the report tables screen and its labelled demonstration set.
    { find: "@hub/advocacy-reports", replacement: path.join(repoRoot, "packages/advocacy/src/ui/ReportsPanel.tsx") },
    { find: "@hub/advocacy-demo", replacement: path.join(repoRoot, "packages/advocacy/src/reports/demo.ts") },
  ]);

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

// Panels mounted only by states/PackPlaces.tsx; see manualChunks.
const PLACE_TOOLS = new Set(["AroundPlace", "CallScript", "LetterJump", "ListTransfer", "MeetUp", "NameLanguages", "NearGroups", "NoteReading", "NoteTopics", "OutingPlanner", "PackBands", "PackCategories", "PackFingerprint", "PackNoteBrowser", "PackSearchHelp", "PackSort", "PackSpotCheck", "PackWords", "PlaceSheet", "PointPaste", "PossibleRepeats", "SameName", "Shortlist", "StreetIndex", "TagNoteCheck", "TagNoteReads", "TextMap", "VenueGroups", "ViewCode", "VisitMarks", "WalkGroups", "WritingCheck"]);

export default defineConfig({
  base,
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
        // The /dev/narrow audit page is a developer tool: its chunk is built, and fetched when the page is opened,
        // but it is not precached, so it is not part of the first install. It does not work offline.
        globIgnores: ["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/packs\//, dataPath],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          // Data pack files are never cached here. The data client keeps its own copy in IndexedDB.
          { urlPattern: dataPath, handler: "NetworkOnly" },
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
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@access/shared", replacement: path.resolve(root, "../../packages/shared/src/index.ts") },
      ...slimLaneAliases,
      ...laneAliases,
      ...hubAliases,
      dataClientAlias,
    ],
  },
  build: {
    // Keep every production asset in the install accounting. Stronger minification
    // reduces actual downloaded bytes; lazy route chunks remain independently loaded.
    minify: "terser",
    terserOptions: {
      // All emitted JS chunks are ESM. Top-level symbol compression can safely
      // shorten module-local names without changing the precache or budget guard.
      module: true,
      toplevel: true,
      compress: { passes: 5, toplevel: true, pure_getters: "strict", hoist_funs: true },
      mangle: { toplevel: true },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The place-list tools are imported only by PackPlaces. Chunks of their own keep the places page
          // well under the 512 KiB per-file cap. They are still precached and load with the page as before.
          const tool = /\/src\/states\/([A-Za-z]+)\.tsx$/.exec(id)?.[1];
          if (tool !== undefined && PLACE_TOOLS.has(tool)) return tool < "O" ? "place-tools-1" : tool < "PackS" ? "place-tools-2" : tool < "S" ? "place-tools-3" : "place-tools-4";
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react-aria-components/") ||
            id.includes("/@react-aria/") ||
            id.includes("/@react-stately/") ||
            id.includes("/@react-types/") ||
            id.includes("/@internationalized/")
          ) {
            return "react-aria";
          }
          if (id.includes("/node_modules/react-aria/")) return "react-aria";
          // Schema validation (Settings feature packages) and ZIP export (Contribute) are only used
          // on those routes. In their own chunks they stay out of the start-up preload set.
          if (/\/node_modules\/(ajv|ajv-formats|fast-uri|fast-deep-equal|json-schema-traverse|require-from-string)\//.test(id)) return "ajv";
          if (id.includes("/node_modules/fflate/")) return "fflate";
          if (id.includes("/react-dom/")) return "react-dom";
          if (id.includes("/react-router") || id.includes("/@remix-run/")) return "router";
          if (id.includes("/i18next") || id.includes("/react-i18next/")) return "i18n";
          if (id.includes("/dexie")) return "dexie";
          if (id.includes("/workbox-")) return "workbox";
          if (id.includes("/react/")) return "react";
          // MapLibre and pmtiles are loaded only on /map and exceed the 512 KiB
          // first-install JS budget, so they stay out of the vendor and precache sets.
          if (id.includes("/maplibre-gl") || id.includes("/pmtiles")) return "maplibre";
          return "vendor";
        },
      },
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
