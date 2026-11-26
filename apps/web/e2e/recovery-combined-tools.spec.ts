import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { recoveryGuidedCopy } from "../src/recovery/recoveryGuidedCopy";
import { recoverySourceRefreshCopy } from "../src/recovery/recoverySourceRefreshCopy";
import { recoverySupportCopy } from "../src/recovery/recoverySupportCopy";

for (const locale of ["en", "fr"] as const) {
  test.describe(`combined recovery tools in ${locale}`, () => {
    test.use({ locale: `${locale}-CA`, serviceWorkers: "allow", viewport: { width: 320, height: 720 } });

    test("three local tools coexist on the first offline visit and keep separate inputs", async ({ page, context }) => {
      const guided = recoveryGuidedCopy(locale);
      const brief = recoverySupportCopy(locale);
      const sources = recoverySourceRefreshCopy(locale);
      const tools = [
        { title: guided.heading, label: guided.search, query: "review-example" },
        { title: brief.title, label: brief.search, query: "brief-example" },
        { title: sources.title, label: sources.search, query: "source-example" },
      ] as const;

      await page.goto("/");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await context.setOffline(true);
      const offline = await context.newPage();
      await page.close();
      expect((await offline.goto("/offline"))?.fromServiceWorker()).toBe(true);
      await expect(offline.locator("html")).toHaveAttribute("lang", locale);

      for (const tool of tools) {
        const summary = offline.locator("summary").filter({ hasText: tool.title });
        await expect(offline.getByRole("heading", { name: tool.title, exact: true })).toHaveCount(0);
        await summary.press("Enter");
        const region = offline.getByRole("region", { name: tool.title, exact: true });
        await expect(region).toHaveAttribute("lang", locale);
        await region.getByRole("textbox", { name: tool.label, exact: true }).fill(tool.query);
      }

      // An individual tool can pass axe while its headings, landmarks or
      // IDs conflict with another open tool. Check the complete offline page.
      const audit = await new AxeBuilder({ page: offline })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      expect(await offline.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )).toBe(true);

      // Collapsing the middle disclosure must leave its neighbours usable.
      const briefSummary = offline.locator("summary").filter({ hasText: brief.title });
      await briefSummary.press("Space");
      await expect(offline.getByRole("region", { name: brief.title, exact: true })).toHaveCount(0);
      for (const tool of [tools[0], tools[2]]) {
        await expect(offline.getByRole("textbox", { name: tool.label, exact: true })).toHaveValue(tool.query);
      }

      await briefSummary.press("Enter");
      const briefRegion = offline.getByRole("region", { name: brief.title, exact: true });
      await expect(briefRegion.getByRole("textbox", { name: brief.search })).toHaveValue("brief-example");
      await briefRegion.getByRole("button", { name: brief.clear, exact: true }).press("Enter");
      await expect(briefRegion.getByRole("textbox", { name: brief.search })).toHaveValue("");
      await expect(offline.getByRole("textbox", { name: guided.search, exact: true })).toHaveValue("review-example");
      await expect(offline.getByRole("textbox", { name: sources.search, exact: true })).toHaveValue("source-example");
    });
  });
}
