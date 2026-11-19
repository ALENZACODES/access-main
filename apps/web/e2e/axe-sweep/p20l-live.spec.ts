import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { inspectEvidenceStructure, inspectOfflineState, renderedEvidenceCards } from "./p20l-browser";
import { auditEvidenceCards, formatFindings, routeInventoryFindings } from "./p20l-provenance";

const EVIDENCE_ROUTES = ["/places", "/journey", "/finders", "/navigator", "/help"] as const;
const REQUIRED = ["/", "/places", "/journey", "/finders", "/navigator", "/help", "/offline", "/more", "/settings"] as const;

test("P20L inventory covers core journeys without a magic route count", () => {
  const found = appRoutes();
  expect(routeInventoryFindings(found, REQUIRED)).toEqual([]);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20L evidence ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of EVIDENCE_ROUTES) {
        test(`displayed records retain source and uncertainty on ${route}`, async ({ page }) => {
          test.setTimeout(90_000);
          await page.goto("/", { waitUntil: "domcontentloaded" });
          await chooseLanguage(page, language);
          await visit(page, route, language);

          const cards = await renderedEvidenceCards(page);
          const report = auditEvidenceCards(cards, language, route);
          expect(report.total).toBe(report.known + report.unknown);
          expect(report.findings, formatFindings(report.findings)).toEqual([]);

          const structure = await inspectEvidenceStructure(page);
          for (const item of structure) {
            expect(item.name, `${item.location}: missing name`).not.toBe("");
            // A game or explicitly unsourced item can show UNKNOWN rather
            // than inventing four evidence fields. A present metadata list,
            // however, must pair every term with one corresponding value.
            if (item.hasList) {
              expect(item.termCount, item.location).toBeGreaterThanOrEqual(4);
              expect(item.termCount, item.location).toBe(item.valueCount);
              expect(item.unlabeledValueCount, item.location).toBe(0);
            }
          }
        });
      }

      test("loss of connectivity does not silently change the chosen language", async ({ page, context }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/places", language);
        const online = await inspectOfflineState(page);
        expect(online.language).toBe(language);
        expect(online.headingCount).toBeGreaterThan(0);
        await context.setOffline(true);
        try {
          await expect(page.locator("html")).toHaveAttribute("lang", language);
          const disconnected = await inspectOfflineState(page);
          expect(disconnected.language).toBe(language);
          expect(disconnected.headingCount).toBeGreaterThan(0);
          const audit = auditEvidenceCards(await renderedEvidenceCards(page), language, "/places");
          expect(audit.findings, formatFindings(audit.findings)).toEqual([]);
        } finally {
          await context.setOffline(false);
        }
      });
    });
  }
}
