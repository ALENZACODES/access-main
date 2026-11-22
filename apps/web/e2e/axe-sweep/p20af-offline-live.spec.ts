import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { observeFrame, browserFindings, observeConnection } from "./p20af-browser-observer";
import { matrix, matrixFindings, safeRoute } from "./p20af-transition-ledger";
import { LABELS, translationMatrix } from "./p20af-localized-controls";

/** A bounded live test. The existing full-route axe suite handles broad scans. */
const ROUTES = appRoutes();
const REQUIRED = ["/", "/help", "/places", "/journey"];

test("P20AF route coverage is derived from the current application router", () => {
  expect(ROUTES.length).toBeGreaterThan(0);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  for (const path of ROUTES) expect(safeRoute(path)).toBe(true);
  for (const path of REQUIRED) expect(ROUTES).toContain(path);
  const cells = matrix(ROUTES);
  expect(matrixFindings(cells, cells)).toEqual([]);
  expect(cells).toHaveLength(ROUTES.length * 8);
});

test("P20AF French labels are not forced to equal English ARIA names", () => {
  for (const pair of translationMatrix()) {
    expect(pair.en.trim()).not.toBe("");
    expect(pair.fr.trim()).not.toBe("");
    if (pair.key !== "unknown") expect(pair.differs).toBe(true);
  }
  expect(LABELS.fr.retry).not.toBe(LABELS.en.retry);
});

for (const locale of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AF offline state observation ${locale} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("home route remains readable during a reversible network cutover", async ({ page, context }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, locale);
        await visit(page, "/", locale);
        const before = await observeFrame(page, { route: "/", locale, connection: "online" });
        expect(browserFindings(before, { route: "/", locale })).toEqual([]);
        expect(before.state.facts).toEqual([]);
        try {
          await context.setOffline(true);
          expect(await observeConnection(page)).toBe("offline");
          const offline = await observeFrame(page, { route: "/", locale, connection: "offline" });
          expect(offline.state.connection).toBe("offline");
          expect(offline.state.cache).toBe("unknown");
          expect(offline.state.facts).toEqual([]);
          expect(offline.state.route).toBe("/");
          expect(offline.state.locale).toBe(locale);
        } finally {
          await context.setOffline(false);
        }
        expect(await observeConnection(page)).toBe("online");
        const restored = await observeFrame(page, { route: "/", locale, connection: "online" });
        expect(browserFindings(restored, { route: "/", locale })).toEqual([]);
        expect(restored.state.facts).toEqual(before.state.facts);
      });
    });
  }
}
