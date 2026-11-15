import { expect, test } from "@playwright/test";
import {
  LANGS,
  LOCALES,
  STATIC_ROUTES,
  VIEWPORTS,
  dynamicRoutes,
  expectNoHorizontalScroll,
  expectNoPendingSections,
  openRoute,
  releaseEnabled,
} from "./support";

test.skip(!releaseEnabled(), "The release gate runs through playwright.release.config.ts");

for (const lang of LANGS) {
  for (const viewport of VIEWPORTS) {
    test.describe(`routes in ${lang} at ${viewport.width}px`, () => {
      test.use({ locale: LOCALES[lang], viewport });

      for (const route of STATIC_ROUTES) {
        test(`/${route.path} renders with no pending section`, async ({ page }) => {
          await openRoute(page, route.path, lang);
          await expectNoPendingSections(page);
          await expectNoHorizontalScroll(page);
        });
      }

      test("parameter and wildcard routes render with no pending section", async ({ page, request }) => {
        test.setTimeout(180_000);
        const families = await dynamicRoutes(page, request, lang);
        for (const family of families) {
          expect(family.paths.length, `no real page found for ${family.name}: the fixture pack or the index links are missing`).toBeGreaterThan(0);
          for (const routePath of family.paths) {
            await test.step(`${family.name} -> /${routePath}`, async () => {
              await openRoute(page, routePath, lang);
              await expectNoPendingSections(page);
              await expectNoHorizontalScroll(page);
            });
          }
        }
      });
    });
  }
}
