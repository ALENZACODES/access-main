import { existsSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appRoutes } from "../a11y-input/helpers.ts";
import { bundledTorontoPackPath, parameterizedRoutes } from "./parameterized-routes.ts";

/**
 * Residual Day 17 / P20 axe sweep: every live app route, in English and
 * French, at 320px and 1280px. Language is forced through localStorage (the
 * same keys the shell uses) before navigation, because detectLanguage() does
 * not read the path or ?lang=. Any axe violation fails CI unless it is on the
 * documented allowlist below, each with a reason.
 *
 * The route list is the live app list from P16's `appRoutes()` (router.tsx
 * plus the Settings and More tables it mounts), not a hand-copied subset.
 * Parameter routes `/places/:id` and `/help/:id` are added from real ids in
 * the bundled Toronto pack (`public/packs/toronto/content.json`).
 */
const ROUTES = appRoutes();
const PARAM_ROUTES = parameterizedRoutes();
const SWEEP_ROUTES = [...ROUTES, ...PARAM_ROUTES];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 1280, height: 900 },
] as const;

type Language = "en" | "fr";
type Route = string;
type ViewportWidth = (typeof VIEWPORTS)[number]["width"];

/** Must match LANGUAGE_STORAGE_KEY / LANGUAGE_SET_KEY in src/i18n/index.ts. */
const LANGUAGE_STORAGE_KEY = "access.language";
const LANGUAGE_SET_KEY = "access.language.set";

const COPY = {
  en: { skip: "Skip to main content", home: "Home", switchTo: "Français" },
  fr: { skip: "Aller au contenu principal", home: "Accueil", switchTo: "English" },
} as const;

/**
 * Documented leftovers only. Every entry needs a reason. An empty list means
 * any axe violation fails the job. Wildcards (`*`) are allowed when the same
 * leftover appears across a dimension; prefer a specific route, language, and
 * viewport, plus a target substring when several nodes share a rule.
 */
const ALLOWLIST: ReadonlyArray<{
  ruleId: string;
  route: Route | "*";
  language: Language | "*";
  viewport: ViewportWidth | "*";
  target?: string;
  reason: string;
}> = [];

interface ViolationHit {
  id: string;
  impact: string | null | undefined;
  target: string;
}

function isAllowed(hit: ViolationHit, route: Route, language: Language, viewport: ViewportWidth): boolean {
  return ALLOWLIST.some(
    (entry) =>
      entry.ruleId === hit.id &&
      (entry.route === "*" || entry.route === route) &&
      (entry.language === "*" || entry.language === language) &&
      (entry.viewport === "*" || entry.viewport === viewport) &&
      (entry.target === undefined || hit.target.includes(entry.target)) &&
      entry.reason.trim().length > 0,
  );
}

function failureDetails(route: Route, language: Language, viewport: ViewportWidth, hits: readonly ViolationHit[]): string {
  return hits
    .map((hit) => `${route} ${language} ${viewport}px: ${hit.id} (${hit.impact ?? "unknown"}) at ${hit.target}`)
    .join("\n");
}

async function forceLanguage(page: Page, language: Language): Promise<void> {
  await page.addInitScript(
    ({ language: lng, storageKey, setKey }) => {
      try {
        localStorage.setItem(storageKey, lng);
        localStorage.setItem(setKey, "1");
      } catch {
        /* Storage can be blocked. html[lang] and visible copy are still asserted. */
      }
    },
    { language, storageKey: LANGUAGE_STORAGE_KEY, setKey: LANGUAGE_SET_KEY },
  );
}

test("axe sweep covers every live app route in EN and FR at 320 and 1280", () => {
  expect(ROUTES).toEqual(appRoutes());
  expect(ROUTES).toEqual(
    expect.arrayContaining([
      "/contribute",
      "/settings/controls",
      "/settings/consent",
      "/settings/caregiver",
      "/settings/sync",
      "/settings/advocacy",
      "/settings/sources",
    ]),
  );
  expect(VIEWPORTS.map((viewport) => viewport.width)).toEqual([320, 1280]);
});

test("axe sweep covers places/:id and help/:id from the bundled Toronto pack", () => {
  const packPath = bundledTorontoPackPath();
  expect(existsSync(packPath)).toBe(true);
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as {
    places?: Array<{ id?: string }>;
    help_numbers?: Array<{ id?: string }>;
  };
  const placeId = pack.places?.find((record) => typeof record.id === "string" && record.id.length > 0)?.id;
  const helpId = pack.help_numbers?.find((record) => typeof record.id === "string" && record.id.length > 0)?.id;
  expect(placeId, "the bundled pack must include a real place id").toEqual(expect.any(String));
  expect(helpId, "the bundled pack must include a real help id").toEqual(expect.any(String));
  expect(placeId).not.toContain(":id");
  expect(helpId).not.toContain(":id");
  expect(PARAM_ROUTES).toEqual([
    `/places/${encodeURIComponent(placeId as string)}`,
    `/help/${encodeURIComponent(helpId as string)}`,
  ]);
  expect(SWEEP_ROUTES).toEqual([...appRoutes(), ...PARAM_ROUTES]);
});

for (const language of ["en", "fr"] as const) {
  for (const viewport of VIEWPORTS) {
    test.describe(`axe sweep ${language} at ${viewport.width}px`, () => {
      test.use({
        locale: language === "fr" ? "fr-CA" : "en-CA",
        viewport: { width: viewport.width, height: viewport.height },
      });

      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await forceLanguage(page, language);
      });

      for (const route of SWEEP_ROUTES) {
        test(`${route} has no unexpected axe violations`, async ({ page }) => {
          test.setTimeout(60_000);
          const response = await page.goto(route, { waitUntil: "domcontentloaded" });
          expect(response?.ok(), `${route} responded with ${response?.status() ?? "no response"}`).toBe(true);
          expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
          await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
          await expect(page.locator("html")).toHaveAttribute("lang", language === "fr" ? /^fr\b/i : /^en\b/i);
          await expect(page.getByRole("link", { name: COPY[language].skip })).toHaveCount(1);
          await expect(page.getByRole("link", { name: COPY[language].home, exact: true })).toBeVisible();
          await expect(page.getByRole("banner").getByRole("button", { name: COPY[language].switchTo })).toBeVisible();
          await expect(page.locator("main [role='status']").filter({ hasText: /^(Loading|Chargement)/ })).toHaveCount(0);

          const result = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
          const hits: ViolationHit[] = result.violations.flatMap((violation) =>
            violation.nodes.map((node) => ({
              id: violation.id,
              impact: violation.impact,
              target: node.target.join(" "),
            })),
          );
          const unexpected = hits.filter((hit) => !isAllowed(hit, route, language, viewport.width));
          expect(unexpected, failureDetails(route, language, viewport.width, unexpected)).toEqual([]);
        });
      }
    });
  }
}
