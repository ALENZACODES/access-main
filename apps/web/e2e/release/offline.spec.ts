import { expect, test } from "@playwright/test";
import {
  fetchManifest,
  openRoute,
  pickPlace,
  releaseEnabled,
  smallestRegion,
  waitForServiceWorkerControl,
} from "./support";

test.skip(!releaseEnabled(), "The release gate runs through playwright.release.config.ts");

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("/, /help, a downloaded region's place page and /map reload with the network off", async ({ page, context, request }) => {
  test.setTimeout(300_000);
  const manifest = await fetchManifest(request);
  const region = smallestRegion(manifest);
  const place = await pickPlace(request, manifest, { cells: region.cells });
  expect(place, `region ${region.id} has no named place to open offline`).not.toBeNull();
  const placePath = `places/${encodeURIComponent(place!.id)}`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("");
  await waitForServiceWorkerControl(page);

  // Download the smallest region from the Offline page.
  await openRoute(page, "offline", "en");
  const label = escapeRegExp(region.label.en);
  const byName = page.getByRole("button", { name: new RegExp(`download.*${label}|${label}.*download`, "i") });
  const button = (await byName.count()) > 0
    ? byName.first()
    : page.getByRole("listitem").filter({ hasText: region.label.en }).getByRole("button", { name: /download/i }).first();
  await button.click();
  // Wait for this region's own state line. A loose /downloaded/ also matches "Not downloaded", which is shown
  // before the download starts, so the test went on before anything was stored.
  const regionCard = page.locator("li", { has: page.getByRole("heading", { name: region.label.en, exact: true }) });
  await expect(regionCard.getByTestId("region-state")).toHaveText(/^Downloaded, integrity checked$/, { timeout: 240_000 });

  // Visit each page once online so the shell can serve it again.
  const paths = ["", "help", placePath, "map"];
  for (const routePath of paths) await openRoute(page, routePath, "en");

  await context.setOffline(true);
  for (const routePath of paths) {
    await test.step(`offline: /${routePath}`, async () => {
      await page.goto(routePath);
      await expect(page.locator("h1").first()).toBeVisible();
      if (routePath === placePath) {
        await expect(page.getByText(place!.name!, { exact: false }).first()).toBeVisible();
      }
    });
  }
  expect(pageErrors, "no uncaught errors while offline").toEqual([]);
});
