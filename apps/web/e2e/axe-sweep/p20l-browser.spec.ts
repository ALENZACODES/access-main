import { expect, test } from "@playwright/test";
import { inspectEvidenceStructure, inspectOfflineState, renderedEvidenceCards } from "./p20l-browser";
import { auditEvidenceCards } from "./p20l-provenance";

for (const language of ["en", "fr"] as const) {
  test.describe(`P20L browser fixture ${language}`, () => {
    test("reads four description fields without fabricating any record", async ({ page }) => {
      await page.goto("/");
      await page.setContent(`<html lang="${language}"><body><main><h1>Example</h1>
        <ul class="result-items"><li><p class="result-name">Example record</p>
          <dl class="result-meta">
            <div><dt>Source</dt><dd>Municipal data</dd></div>
            <div><dt>Licence</dt><dd>CC0-1.0</dd></div>
            <div><dt>Date</dt><dd>2026-11-15</dd></div>
            <div><dt>${language === "fr" ? "Niveau" : "Tier"}</dt><dd>E</dd></div>
          </dl>
        </li></ul>
      </main></body></html>`);
      const cards = await renderedEvidenceCards(page);
      expect(cards).toHaveLength(1);
      expect(auditEvidenceCards(cards, language, "/")).toMatchObject({ total: 1, known: 1, unknown: 0, findings: [] });
      const structure = await inspectEvidenceStructure(page);
      expect(structure).toMatchObject([{ hasList: true, termCount: 4, valueCount: 4, unlabeledValueCount: 0 }]);
    });

    test("an unknown label is retained without elevating the record", async ({ page }) => {
      await page.goto("/");
      await page.setContent(`<html lang="${language}"><body><main><h1>Example</h1>
        <ul class="result-items"><li><p class="result-name">Example record</p>
          <dl class="result-meta">
            <div><dt>Source</dt><dd>${language === "fr" ? "Inconnu" : "Unknown"}</dd></div>
            <div><dt>Licence</dt><dd>ODbL-1.0</dd></div>
            <div><dt>Date</dt><dd>2026-11-15</dd></div>
            <div><dt>${language === "fr" ? "Niveau" : "Tier"}</dt><dd>E</dd></div>
          </dl>
        </li></ul>
      </main></body></html>`);
      const result = auditEvidenceCards(await renderedEvidenceCards(page), language, "/");
      expect(result).toMatchObject({ known: 0, unknown: 1, findings: [] });
    });

    test("missing field markup is reported from the rendered DOM", async ({ page }) => {
      await page.goto("/");
      await page.setContent(`<html lang="${language}"><body><main><h1>Example</h1>
        <ul class="result-items"><li><p class="result-name">Example record</p>
          <dl class="result-meta"><div><dt>Source</dt><dd>Example</dd></div></dl>
        </li></ul></main></body></html>`);
      const result = auditEvidenceCards(await renderedEvidenceCards(page), language, "/");
      expect(result.findings.filter((issue) => issue.code === "missing-field")).toHaveLength(3);
    });

    test("offline observer describes the document but never supplies data", async ({ page }) => {
      await page.goto("/");
      await page.setContent(`<html lang="${language}"><body><main><h1>Offline sample</h1><p role="status">${language === "fr" ? "Hors ligne" : "Offline"}</p></main></body></html>`);
      const state = await inspectOfflineState(page);
      expect(state).toMatchObject({ language, mainCount: 1, headingCount: 1, offlineStatus: true, resultsCount: 0 });
    });
  });
}
