import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Measure client-requested chunks independently of service-worker installation.
test.use({ serviceWorkers: "block", viewport: { width: 320, height: 720 } });

for (const locale of ["en", "fr"] as const) {
  test(`source review opens on demand and retains a draft in ${locale}`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/\/assets\/RecoverySourceRefreshPanel-[^/]+\.js$/.test(request.url())) {
        requests.push(request.url());
      }
    });
    await page.goto("/offline");
    if (locale === "fr") await page.getByRole("button", { name: "Français" }).first().click();
    const title = locale === "en" ? "Source refresh review" : "Examen de l’actualité des sources";
    const heading = page.getByRole("heading", { name: title, exact: true });
    const disclosure = page.locator("details").filter({ has: page.locator("summary", { hasText: title }) });
    const summary = disclosure.locator("summary");
    await expect(summary).toBeVisible();
    await expect(heading).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await summary.focus();
    await summary.press("Enter");
    await expect(heading).toBeVisible();
    expect(requests).toHaveLength(1);

    const target = await summary.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    expect(target?.width).toBeGreaterThanOrEqual(44);
    const filter = disclosure.getByRole("textbox", {
      name: locale === "en" ? "Search local entries" : "Rechercher des dossiers locaux",
    });
    await filter.fill("test-pack");
    const download = page.waitForEvent("download");
    await disclosure.getByRole("button", {
      name: locale === "en" ? "Export JSON" : "Exporter le JSON", exact: true,
    }).click();
    expect((await download).suggestedFilename()).toBe("recovery-source-refresh.json");
    const results = await new AxeBuilder({ page }).include("details[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);

    await summary.press("Space");
    await expect(filter).toBeHidden();
    await summary.press("Enter");
    await expect(filter).toHaveValue("test-pack");
    await expect(summary).toBeFocused();
    expect(requests).toHaveLength(1);
  });
}
