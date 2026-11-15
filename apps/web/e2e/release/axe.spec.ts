import { expect, test } from "@playwright/test";
import { LANGS, LOCALES, STATIC_ROUTES, VIEWPORTS, dynamicRoutes, openRoute, releaseEnabled, runAxe } from "./support";

test.skip(!releaseEnabled(), "The release gate runs through playwright.release.config.ts");

for (const lang of LANGS) {
  for (const viewport of VIEWPORTS) {
    test.describe(`axe wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa in ${lang} at ${viewport.width}px`, () => {
      test.use({ locale: LOCALES[lang], viewport });

      for (const route of STATIC_ROUTES) {
        test(`/${route.path} has 0 violations`, async ({ page }) => {
          await openRoute(page, route.path, lang);
          const violations = await runAxe(page);
          expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
        });
      }

      test("parameter and wildcard routes have 0 violations", async ({ page, request }) => {
        test.setTimeout(180_000);
        for (const family of await dynamicRoutes(page, request, lang)) {
          expect(family.paths.length, `no real page found for ${family.name}`).toBeGreaterThan(0);
          for (const routePath of family.paths) {
            await openRoute(page, routePath, lang);
            const violations = await runAxe(page);
            expect(violations, `/${routePath}\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
          }
        }
      });
    });
  }
}
