import { expect, test } from "@playwright/test";
import { collectState, inspectState } from "./p20v-state-browser";
import { describeStateIssues } from "./p20v-state-contracts";

const fixture = (body: string): string => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>State fixture</title>
<style>
  body { font-family: system-ui; margin: 16px; }
  button, a, select, input { min-height: 44px; padding: 8px; }
  [hidden] { display: none; }
</style></head><body><main><h1>État des commandes</h1>${body}</main></body></html>`;

const codes = (issues: readonly { code: string }[]) => issues.map((issue) => issue.code);

for (const width of [320, 1280]) {
  test.describe(`P20V browser state fixtures at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 } });

    test("labelled disclosure starts with truthful collapsed state", async ({ page }) => {
      await page.setContent(fixture(`
        <button id="filters" type="button" aria-expanded="false" aria-controls="filter-panel">Filtres</button>
        <section id="filter-panel" hidden><h2>Filtres avancés</h2></section>`));
      const result = await inspectState(page, "/fixture");
      expect(result, describeStateIssues(result)).toEqual([]);
      const snapshot = await collectState(page, "/fixture");
      expect(snapshot.documentLanguage).toBe("fr");
      expect(snapshot.nodes.find((node) => node.id === "filters")?.states["aria-expanded"]).toBe("false");
    });

    test("disclosure state stays correct when opened and closed", async ({ page }) => {
      await page.setContent(fixture(`
        <button id="filters" type="button" aria-expanded="false" aria-controls="filter-panel">Filtres</button>
        <section id="filter-panel" hidden>Choix supplémentaires</section>
        <script>
          const control = document.getElementById('filters');
          const panel = document.getElementById('filter-panel');
          control.addEventListener('click', () => {
            const opened = control.getAttribute('aria-expanded') === 'true';
            control.setAttribute('aria-expanded', String(!opened));
            panel.hidden = opened;
          });
        </script>`));
      expect(await inspectState(page, "/fixture")).toEqual([]);
      await page.locator("#filters").click();
      expect(await page.locator("#filters").getAttribute("aria-expanded")).toBe("true");
      expect(await inspectState(page, "/fixture")).toEqual([]);
      await page.locator("#filters").click();
      expect(await page.locator("#filters").getAttribute("aria-expanded")).toBe("false");
      expect(await inspectState(page, "/fixture")).toEqual([]);
    });

    test("invalid switch role/state is rejected", async ({ page }) => {
      await page.setContent(fixture(`<span id="bad" role="switch" aria-pressed="yes">Mode</span>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("invalid-state");
    });

    test("two current links in one navigation are rejected", async ({ page }) => {
      await page.setContent(fixture(`
        <nav aria-label="Sections">
          <a id="overview" href="#" aria-current="page">Aperçu</a>
          <a id="details" href="#" aria-current="page">Détails</a>
        </nav>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("multiple-current");
    });

    test("separate navigations can each mark one active destination", async ({ page }) => {
      await page.setContent(fixture(`
        <nav aria-label="Sections"><a id="overview" href="#" aria-current="page">Aperçu</a></nav>
        <nav aria-label="Aide"><a id="help" href="#" aria-current="page">Aide</a></nav>`));
      expect(await inspectState(page, "/fixture")).toEqual([]);
    });

    test("two sorted columns are detected within the same table", async ({ page }) => {
      await page.setContent(fixture(`
        <table id="records"><caption>Fiches</caption>
          <thead><tr>
            <th id="name" aria-sort="ascending">Nom</th>
            <th id="date" aria-sort="descending">Date</th>
          </tr></thead><tbody><tr><td>Exemple</td><td>2026</td></tr></tbody>
        </table>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("multiple-sort");
    });

    test("two sorted tables are independent", async ({ page }) => {
      await page.setContent(fixture(`
        <table id="a"><tr><th id="a-head" aria-sort="ascending">Nom</th></tr><tr><td>A</td></tr></table>
        <table id="b"><tr><th id="b-head" aria-sort="descending">Nom</th></tr><tr><td>B</td></tr></table>`));
      expect(await inspectState(page, "/fixture")).toEqual([]);
    });

    test("active descendant must exist", async ({ page }) => {
      await page.setContent(fixture(`
        <div id="choices" role="listbox" aria-activedescendant="missing">
          <div id="other" role="option">Autre choix</div>
        </div>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("active-target-count");
    });

    test("contained active option has a proper relationship", async ({ page }) => {
      await page.setContent(fixture(`
        <div id="choices" role="listbox" aria-activedescendant="active">
          <div id="active" role="option" aria-selected="true">Premier</div>
          <div id="inactive" role="option" aria-selected="false">Deuxième</div>
        </div>`));
      expect(await inspectState(page, "/fixture")).toEqual([]);
    });

    test("active option outside the owner without ownership is rejected", async ({ page }) => {
      await page.setContent(fixture(`
        <div id="choices" role="listbox" aria-activedescendant="active"></div>
        <div id="active" role="option">Premier</div>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("active-unowned");
    });

    test("hidden active option is rejected", async ({ page }) => {
      await page.setContent(fixture(`
        <div id="choices" role="listbox" aria-activedescendant="active">
          <div id="active" role="option" hidden>Premier</div>
        </div>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("active-hidden");
    });

    test("duplicate IDs are caught even when second instance is hidden", async ({ page }) => {
      await page.setContent(fixture(`
        <button id="same">Ouvrir</button><div id="same" hidden>Cache</div>`));
      expect(codes(await inspectState(page, "/fixture"))).toContain("duplicate-id");
    });
  });
}
