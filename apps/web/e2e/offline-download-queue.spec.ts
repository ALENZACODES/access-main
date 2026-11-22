import { expect, test, type Locator, type Page } from "@playwright/test";
import { regionDownloadQueueFixture } from "./support/regionDownloadQueueFixture";

function button(scope: Page | Locator, name: string) {
  return scope.getByRole("button", { name, exact: true });
}

function regionState(page: Page, name: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name, exact: true }),
  }).getByTestId("region-state");
}

test.describe("checksummed region downloads in browser storage", () => {
  // The fixture supplies the pack endpoint; Chromium still verifies and stores the real bytes.
  test.use({ serviceWorkers: "block" });

  test("reorders two regions, recovers a partial region, and reads both back after a reload", async ({ page }) => {
    const fixture = regionDownloadQueueFixture();
    const requests: string[] = [];
    let servingManifest = true;
    let damaged = true;
    await page.route("**/data/pack/v1/manifest.json", (route) =>
      servingManifest ? route.fulfill({ json: fixture.manifest }) : route.fulfill({ status: 503 }));
    await page.route("**/data/venues/queue-test/*", async (route) => {
      const path = new URL(route.request().url()).pathname.split("/data/")[1] ?? "";
      requests.push(path);
      const stored = fixture.parts.get(path);
      if (!stored) {
        await route.fulfill({ status: 404 });
        return;
      }
      const bytes = Buffer.from(stored);
      if (damaged && path === fixture.north[1]) bytes[0] = (bytes[0] ?? 0) ^ 1;
      await route.fulfill({ body: bytes, contentType: "application/octet-stream" });
    });

    await page.goto("/offline");
    await button(page, "Open region download queue").click();
    const panel = page.getByRole("region", { name: "Region download queue", exact: true });
    const select = panel.getByRole("combobox", { name: "Region to add" });
    for (const id of ["sample-south", "sample-north"]) {
      await select.selectOption(id);
      await button(panel, "Add to queue").click();
    }
    await button(panel, "Move North sample up").press("Enter");
    const entries = panel.getByRole("list", { name: "Queued regions" }).getByRole("listitem");
    await expect(entries.first()).toContainText(fixture.northLabel.en);
    await expect(entries.last()).toContainText(fixture.southLabel.en);
    expect(requests).toEqual([]);

    await button(panel, "Start downloads").press("Enter");
    const resume = button(panel, "Continue downloads");
    await expect(resume).toBeEnabled();
    await expect(entries.first()).toContainText("Download stopped");
    await expect(entries.last()).toContainText("Waiting");
    await expect(regionState(page, fixture.northLabel.en)).toContainText(/partial|part/i);
    // The pack client independently makes a second, cache-bypassing request on a SHA mismatch.
    expect(requests).toEqual([...fixture.north, fixture.north[1]]);

    damaged = false;
    await resume.click();
    await expect(panel.getByRole("status", { name: "Download queue status" })).toContainText("The region queue finished.");
    const expected = [...fixture.north, fixture.north[1], fixture.north[1], ...fixture.south];
    expect(requests).toEqual(expected);
    servingManifest = false;
    await page.reload();
    for (const name of [fixture.northLabel.en, fixture.southLabel.en]) {
      await expect(regionState(page, name)).toHaveText("Downloaded, integrity checked");
    }
    await button(page, "Open region download queue").click();
    await expect(panel.getByRole("combobox", { name: "Region to add" })).toBeDisabled();
    await expect(panel.getByRole("status", { name: "Download queue status" })).toHaveText("The queue is empty.");
    expect(requests).toEqual(expected);
  });
});

test.describe("the installed offline shell", () => {
  test.use({ serviceWorkers: "allow", locale: "fr-CA", viewport: { width: 320, height: 800 } });

  test("opens the queue for the first time offline and keeps an empty queue idle on reconnect", async ({ context, page }) => {
    await page.goto("/");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    const offline = await context.newPage();
    const navigation = await offline.goto("/offline");
    expect(navigation?.fromServiceWorker()).toBe(true);
    await expect(offline.locator("html")).toHaveAttribute("lang", "fr");

    const launcher = button(offline, "Ouvrir la file de téléchargement des régions");
    await launcher.press("Enter");
    const panel = offline.getByRole("region", { name: "File de téléchargement des régions", exact: true });
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText("File de téléchargement des régions");
    await expect(panel.getByText(/Vous pouvez organiser la liste hors ligne/)).toBeVisible();
    const start = button(panel, "Lancer les téléchargements");
    await expect(start).toBeDisabled();
    await context.setOffline(false);
    await expect(panel.getByText(/Vous pouvez organiser la liste hors ligne/)).toHaveCount(0);
    await expect(start).toBeDisabled();
    await expect(panel.getByRole("status", { name: "État de la file de téléchargement" })).toHaveText("La file est vide.");
    await button(offline, "Fermer la file de téléchargement des régions").press("Enter");
    await expect(launcher).toBeFocused();
    await expect(panel).toHaveCount(0);
  });
});
