import { expect, test, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import type { PackManifest } from "../../../packages/data-client/src/types";
import { footprintCopy } from "../src/offline/robust/packFootprintCopy";

function examplePack(): PackManifest {
  const shared = "junction";
  const makeRegion = (id: string, en: string, fr: string) => ({
    id, label: { en, fr }, cells: [shared, id], bbox: [-80, 43, -79, 44] as [number, number, number, number],
  });
  const searchPart = (id: string, bytes: number) => ({
    path: "search/" + id + ".json.gz",
    sha256: createHash("sha256").update(id).digest("hex"),
    bytes,
    count: 1,
  });
  return {
    version: 1,
    builtAt: "2026-09-15T12:00:00Z",
    sourceCommit: "footprint-journey",
    regions: [makeRegion("north", "North", "Nord"), makeRegion("south", "South", "Sud")],
    sources: [],
    tranches: {},
    tiles: {},
    search: { junction: searchPart(shared, 20), north: searchPart("north", 41), south: searchPart("south", 65) },
    counts: { records: 0, byTranche: {}, bySource: {} },
  };
}

function definition(container: Locator, label: string) {
  return container.locator("dt").filter({ hasText: new RegExp("^" + label + "$") }).locator("+ dd");
}

for (const language of ["en", "fr"] as const) {
  test.describe(language, () => {
    test.use({ locale: language + "-CA", serviceWorkers: "allow", viewport: { width: 320, height: 800 } });

    test("compares an IndexedDB manifest after a cold offline reopen", async ({ context, page }) => {
      const pack = examplePack();
      let partRequests = 0;
      await context.route("**/data/**", async (route) => {
        if (new URL(route.request().url()).pathname.endsWith("/pack/v1/manifest.json")) {
          await route.fulfill({ json: pack });
        } else {
          partRequests++;
          await route.fulfill({ status: 404 });
        }
      });
      const launchName = language === "en" ? "Compare regional download sizes" : "Comparer la taille des téléchargements régionaux";
      // Visiting /offline saves the manifest to the real pack client database.
      // The comparison chunk has never been opened in either page.
      await page.goto("/offline");
      await expect(page.getByRole("button", { name: launchName })).toBeVisible();
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await context.unroute("**/data/**");
      await context.setOffline(true);
      const offline = await context.newPage();
      await page.close();
      const response = await offline.goto("/offline");
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(offline.locator("html")).toHaveAttribute("lang", language);
      const open = offline.getByRole("button", { name: launchName, exact: true });
      await open.focus();
      await offline.keyboard.press("Enter");
      const w = footprintCopy[language];
      const panel = offline.getByRole("region", { name: w.title, exact: true });
      await expect(panel).toBeVisible();
      const chooser = panel.getByLabel(w.choose, { exact: true });
      for (const region of pack.regions) {
        await chooser.selectOption(region.id);
        await panel.getByRole("button", { name: w.add, exact: true }).click();
      }
      const summary = panel.getByRole("region", { name: w.summary });
      await expect(definition(summary, w.footprint)).toContainText("126");
      await expect(definition(summary, w.duplicated)).toContainText("20");
      await expect(definition(summary, w.maximum)).toContainText("126");

      const list = panel.getByRole("list", { name: w.order, exact: true });
      const southName = pack.regions[1]!.label[language];
      const move = list.getByRole("button", { name: w.earlier + " — " + southName });
      await move.focus();
      await offline.keyboard.press("Space");
      const first = list.locator(":scope > li").first();
      await expect(first.getByRole("heading", { name: southName })).toBeFocused();
      await expect(definition(first, w.additional)).toContainText("85");
      await expect(definition(first, w.omitted)).toContainText("65");
      await panel.getByLabel(w.filesFilter, { exact: true }).selectOption("shared");
      const inspector = panel.getByRole("region", { name: w.parts });
      await expect(definition(inspector, w.digest)).toHaveText(pack.search.junction!.sha256);
      await expect(definition(inspector, w.owners)).toContainText(southName);
      await expect(inspector.getByRole("button", { name: w.nextFile })).toBeDisabled();

      const metrics = await panel.evaluate(el => ({
        width: document.documentElement.clientWidth,
        right: el.getBoundingClientRect().right,
        client: el.clientWidth,
        scroll: el.scrollWidth,
        targets: [...el.querySelectorAll("button,select")].map(node => {
          const { width, height } = node.getBoundingClientRect();
          return { width, height };
        }),
      }));
      expect(metrics.right).toBeLessThanOrEqual(metrics.width + 1);
      expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
      for (const target of metrics.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
      const id = await panel.getAttribute("aria-labelledby");
      expect(id).toBeTruthy();
      const audit = await new AxeBuilder({ page: offline })
        .include('[aria-labelledby="' + id + '"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(audit.violations).toEqual([]);
      expect(partRequests).toBe(0);
      expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
    });
  });
}
