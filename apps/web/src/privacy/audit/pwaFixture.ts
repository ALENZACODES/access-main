// Shared text for the install-settings tests: a configuration that matches the register in pwaRegister.ts closely, and
// ways of changing one part of it. Node only (tests), never shipped.

export const dataDecl = "const dataPath = new RegExp(`${escapeRegExp(base)}data/`);";

export const GOOD_MANIFEST = `{
  name: "the App",
  short_name: "the App",
  description: "Prototype for people in Ontario.",
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
}`;

export const GOOD_RUNTIME = `[
  { urlPattern: dataPath, handler: "NetworkOnly" },
  {
    urlPattern: ({ sameOrigin, url }) => sameOrigin && !url.pathname.startsWith("/packs/"),
    handler: "NetworkFirst",
    options: {
      cacheName: "shell-pages",
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
    },
  },
]`;

export const GOOD_WORKBOX = `{
  globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
  globIgnores: ["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"],
  navigateFallback: "index.html",
  navigateFallbackDenylist: [/^\\/packs\\//, dataPath],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  runtimeCaching: ${GOOD_RUNTIME},
}`;

export interface Parts {
  registerType?: string | null;
  includeAssets?: string | null;
  manifest?: string | null;
  workbox?: string | null;
  devOptions?: string | null;
  extra?: string;
}

/** The options object of VitePWA with every part given, or the good one for a part left out. A part set to null is left out. */
export function options(p: Parts = {}): string {
  const lines: string[] = [];
  const add = (k: string, v: string | null | undefined, dflt: string): void => {
    const val = v === undefined ? dflt : v;
    if (val !== null) lines.push(`  ${k}: ${val},`);
  };
  add("registerType", p.registerType, '"prompt"');
  add("includeAssets", p.includeAssets, '["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"]');
  add("manifest", p.manifest, GOOD_MANIFEST);
  add("workbox", p.workbox, GOOD_WORKBOX);
  add("devOptions", p.devOptions, "{ enabled: false }");
  if (p.extra !== undefined) lines.push(`  ${p.extra}`);
  return `{\n${lines.join("\n")}\n}`;
}

/** A whole configuration file around the options. */
export function configFile(opts: string = options()): string {
  return [`import { VitePWA } from "vite-plugin-pwa";`, `const base = "/";`, dataDecl, `export default {`, `  plugins: [VitePWA(${opts})],`, `};`, ""].join("\n");
}

/** The good configuration with the manifest changed by replacing text in it. */
export function withManifest(from: string, to: string): string {
  if (!GOOD_MANIFEST.includes(from)) throw new Error(`the good manifest has no ${from}`);
  return configFile(options({ manifest: GOOD_MANIFEST.replace(from, to) }));
}

/** The good configuration with the workbox part changed by replacing text in it. */
export function withWorkbox(from: string, to: string): string {
  if (!GOOD_WORKBOX.includes(from)) throw new Error(`the good workbox has no ${from}`);
  return configFile(options({ workbox: GOOD_WORKBOX.replace(from, to) }));
}

/** The good configuration with the runtime rules replaced. */
export function withRuntime(rules: string): string {
  return configFile(options({ workbox: GOOD_WORKBOX.replace(GOOD_RUNTIME, rules) }));
}
