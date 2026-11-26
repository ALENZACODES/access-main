// Shared helpers for the release gate. These specs only run through
// playwright.release.config.ts (RELEASE_E2E=1) against `vite preview` of a build
// made with VITE_BASE=/access-main/ and staged by scripts/stage-pages.mjs.
import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

function normalizeBase(value: string): string {
  const withLead = value.startsWith("/") ? value : `/${value}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

export const BASE = normalizeBase(process.env.VITE_BASE ?? "/access-main/");
export const ORIGIN = process.env.RELEASE_ORIGIN ?? "http://127.0.0.1:4174";
/** B4: no third-party map tile or style server. Off-origin hosts are never allowed. */
export const BASEMAP_HOSTS: readonly string[] = [];

export const PRECACHE_BUDGET_BYTES = 4_718_592; // 4.5 MiB
export const releaseEnabled = (): boolean => process.env.RELEASE_E2E === "1";

export const LANGS = ["en", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export const LOCALES: Record<Lang, string> = { en: "en-CA", fr: "fr-CA" };
export const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 1280, height: 900 },
] as const;
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

/** Routes from the integration contract that have a fixed path. Paths are relative to the base. */
export const STATIC_ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "home", path: "" },
  { name: "places", path: "places" },
  { name: "map", path: "map" },
  { name: "journey", path: "journey" },
  { name: "finders", path: "finders" },
  { name: "navigator", path: "navigator" },
  { name: "games", path: "games" },
  { name: "help", path: "help" },
  { name: "contribute", path: "contribute" },
  { name: "settings", path: "settings" },
  { name: "more", path: "more" },
  { name: "offline", path: "offline" },
  { name: "data-status", path: "data-status" },
];

// --- pack access (through the same origin the app uses) ----------------------

export interface PackManifest {
  regions: Array<{ id: string; label: { en: string; fr: string }; cells: string[] }>;
  tranches: Record<string, { cells: Record<string, { parts: Array<{ bytes: number }> }> }>;
  search: Record<string, { path: string; bytes: number }>;
}
export interface SearchEntry {
  id: string;
  tranche: string;
  name: string | null;
  nameNorm: string | null;
  lat: number;
  lon: number;
}

export async function fetchManifest(request: APIRequestContext): Promise<PackManifest> {
  const response = await request.get("data/pack/v1/manifest.json");
  expect(response.ok(), "data/pack/v1/manifest.json must be served under the base path").toBeTruthy();
  return (await response.json()) as PackManifest;
}

function maybeGunzip(body: Buffer): Buffer {
  return body.length > 2 && body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
}

export async function readSearchCell(request: APIRequestContext, manifest: PackManifest, cell: string): Promise<SearchEntry[]> {
  const entry = manifest.search[cell];
  if (!entry) return [];
  const response = await request.get(`data/${entry.path}`);
  expect(response.ok(), `search index ${entry.path} must be served`).toBeTruthy();
  return JSON.parse(maybeGunzip(await response.body()).toString("utf8")) as SearchEntry[];
}

export function regionBytes(manifest: PackManifest, region: PackManifest["regions"][number]): number {
  let total = 0;
  for (const cell of region.cells) {
    total += manifest.search[cell]?.bytes ?? 0;
    for (const tranche of Object.values(manifest.tranches)) {
      for (const part of tranche.cells[cell]?.parts ?? []) total += part.bytes;
    }
  }
  return total;
}

export function smallestRegion(manifest: PackManifest): PackManifest["regions"][number] {
  const regions = manifest.regions.filter((region) => region.cells.length > 0);
  expect(regions.length, "the manifest must list at least one region with cells").toBeGreaterThan(0);
  return [...regions].sort((a, b) => regionBytes(manifest, a) - regionBytes(manifest, b))[0];
}

/** First named place in the given cells (all cells when none are given), optionally matching a normalised name fragment. */
export async function pickPlace(
  request: APIRequestContext,
  manifest: PackManifest,
  opts: { cells?: string[]; nameIncludes?: string } = {},
): Promise<SearchEntry | null> {
  for (const cell of opts.cells ?? Object.keys(manifest.search)) {
    for (const entry of await readSearchCell(request, manifest, cell)) {
      if (!entry.name || !entry.nameNorm) continue;
      if (opts.nameIncludes && !entry.nameNorm.includes(opts.nameIncludes)) continue;
      return entry;
    }
  }
  return null;
}

// --- page helpers ------------------------------------------------------------

/** Opens a route (path relative to the base) and waits for its first level-one heading. */
export async function openRoute(page: Page, routePath: string, lang: Lang): Promise<void> {
  const response = await page.goto(routePath);
  expect(response?.ok() ?? false, `${routePath || "/"} must load`).toBeTruthy();
  await expect(page.locator("h1").first(), `${routePath || "/"} needs a visible h1`).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", lang === "fr" ? /^fr/i : /^en/i);
}

export async function expectNoPendingSections(page: Page): Promise<void> {
  await expect(page.locator('[data-section-status="pending"]')).toHaveCount(0);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page must reflow without horizontal scrolling").toBeLessThanOrEqual(0);
}

/** Same-origin links on the current page whose path starts with `<base><prefix>/`, as base-relative paths. */
export async function linksUnder(page: Page, prefix: string, limit = 40): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  const origin = new URL(page.url()).origin;
  const lead = `${BASE}${prefix}/`;
  const found = new Set<string>();
  for (const href of hrefs) {
    const url = new URL(href);
    if (url.origin === origin && url.pathname.startsWith(lead) && url.pathname.length > lead.length) {
      found.add(url.pathname.slice(BASE.length));
    }
  }
  return [...found].slice(0, limit);
}

/** Routes with a parameter or wildcard in the contract, resolved from real data and real links. */
export async function dynamicRoutes(page: Page, request: APIRequestContext, lang: Lang): Promise<Array<{ name: string; paths: string[] }>> {
  const manifest = await fetchManifest(request);
  const place = await pickPlace(request, manifest);
  const families: Array<{ name: string; paths: string[] }> = [];
  families.push({ name: "places/:id", paths: place ? [`places/${encodeURIComponent(place.id)}`] : [] });
  for (const [name, index] of [
    ["help/:id", "help"],
    ["settings/*", "settings"],
    ["more/*", "more"],
  ] as const) {
    await openRoute(page, index, lang);
    families.push({ name, paths: await linksUnder(page, index) });
  }
  return families;
}

// --- axe ---------------------------------------------------------------------

const requireFromHere = createRequire(path.join(process.cwd(), "package.json"));
const AXE_PATH = requireFromHere.resolve("axe-core/axe.min.js");

export interface AxeViolation {
  id: string;
  impact: string | null;
  targets: string[];
}

export async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: [...tags] } });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
    }));
  }, WCAG_TAGS);
}

// --- service worker ----------------------------------------------------------

export async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20_000 })
    .toBe(true);
}

export function parsePrecacheUrls(source: string): string[] {
  const start = source.indexOf("precacheAndRoute(");
  const open = start < 0 ? -1 : source.indexOf("[", start);
  const close = open < 0 ? -1 : source.indexOf("]", open);
  if (close < 0) return [];
  const urls = new Set<string>();
  for (const match of source.slice(open, close + 1).matchAll(/(?:\burl|"url"|'url')\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
    urls.add(match[1].slice(1, -1).replace(/\\(.)/g, "$1"));
  }
  return [...urls];
}
