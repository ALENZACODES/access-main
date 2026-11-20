import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers.ts";
import { captureBrowser, captureFindings } from "./p20am-browser.ts";
import { requiredCoverage, coverageFindings } from "./p20am-custody.ts";
import { reportFindings, safeRoute } from "./p20am-model.ts";
import { libraryFindings } from "./p20am-copy.ts";

/** Playwright discovery mounts this file without changing the application router. */
const ROUTES = appRoutes();
test("P20AM route inventory uses the mounted application route table", () => {
  expect(ROUTES.length).toBeGreaterThan(0);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  for (const route of ROUTES) {
    expect(safeRoute(route), `Unexpected route in appRoutes: ${route}`).toBe(true);
  }
  for (const route of ["/", "/help", "/journey", "/places"]) {
    expect(ROUTES).toContain(route);
  }
  const expected = requiredCoverage(ROUTES);
  expect(coverageFindings(expected, expected)).toEqual([]);
});
test("P20AM bilingual diagnostic copy passes the typography contract", () => {
  const findings = libraryFindings();
  expect(findings, reportFindings(findings)).toEqual([]);
});
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AM read-only browser observation ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("home route is named and has no horizontal overflow", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const captured = await captureBrowser(page, { route: "/", language });
        const issues = captureFindings(captured, language);
        expect(issues, reportFindings(issues)).toEqual([]);
        expect(captured.screen.language).toBe(language);
        expect(captured.screen.route).toBe("/");
        expect(captured.screen.records).toEqual([]);
      });
      test("offline evidence is not synthesized from an empty screen", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        await page.context().setOffline(true);
        try {
          const captured = await captureBrowser(page, { route: "/", language, connection: "offline" });
          expect(captured.screen.connection).toBe("offline");
          expect(captured.screen.records).toEqual([]);
          expect(captured.screen.resources).toEqual([]);
        } finally {
          await page.context().setOffline(false);
        }
      });
    });
  }
}
