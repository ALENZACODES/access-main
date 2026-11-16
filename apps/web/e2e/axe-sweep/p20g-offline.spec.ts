import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseLanguage, LANGUAGES, VIEWPORTS } from "../a11y-input/helpers";
import { offlineFindings, report, type Context } from "./p20g-contracts";
import { inspectControls, inspectLandmarks, inspectOffline, settleRoute } from "./p20g-browser";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * The offline probe tests an actual browser reload with network disabled.
 * It makes no assumption that the downloaded offline pack contains particular
 * place records. A failed reload must not be silently counted as coverage.
 */
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20G offline ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("cached shell retains a labelled, accessible state", async ({ page, context }) => {
        test.setTimeout(100_000);
        const ctx: Context = { route: "/offline", language, viewport: viewport.width };
        await chooseLanguage(page, language);
        await settleRoute(page, "/offline", language);
        const before = await inspectLandmarks(page);
        expect(before.pageText.length).toBeGreaterThan(0);
        // Allow the service worker to become ready, then reload once online
        // to give it an opportunity to take control of the document.
        await page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return;
          await Promise.race([
            navigator.serviceWorker.ready.catch(() => undefined),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ]);
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${language}(?:-|$)`, "i"));
        await context.setOffline(true);
        let documentLoaded = false;
        let networkError = false;
        try {
          const response = await page.reload({ waitUntil: "domcontentloaded", timeout: 12000 });
          documentLoaded = Boolean(response?.ok());
          networkError = !documentLoaded;
        } catch {
          networkError = true;
        }
        const result = await inspectOffline(page, documentLoaded, networkError);
        const issues = offlineFindings(result, ctx);
        expect(issues, report(issues)).toEqual([]);
        if (!documentLoaded) return;
        const controls = await inspectControls(page);
        expect(controls.length).toBeGreaterThan(0);
        const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(axe.violations.map((violation) => violation.id),
          `Offline axe failures for ${language} at ${viewport.width}px`).toEqual([]);
      });
    });
  }
}
