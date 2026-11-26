import { expect, test, type Page } from "@playwright/test";

async function waitForInstalledShell(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");
}

async function openFileCheck(page: Page) {
  const opener = page.getByRole("button", { name: "Open offline startup file check", exact: true });
  await opener.click();
  await page.getByRole("button", { name: "Check startup files", exact: true }).click();
  await expect(page.getByRole("heading", { name: "File check results", exact: true })).toBeVisible();
}

test.describe("offline startup file inspection", () => {
  test.use({ locale: "en-CA", serviceWorkers: "allow" });

  test("the first offline visit can inspect the installed shell without a region pack", async ({ page, context }) => {
    await waitForInstalledShell(page);
    await context.setOffline(true);
    const offline = await context.newPage();
    await page.close();

    const response = await offline.goto("/offline");
    expect(response?.fromServiceWorker()).toBe(true);
    await openFileCheck(offline);

    const documentList = offline.getByRole("list", { name: "Page document", exact: true });
    await expect(documentList.getByRole("listitem")).toHaveText("index.html — Saved");
    const scripts = offline.getByRole("list", { name: "Startup scripts", exact: true });
    await expect(scripts.getByRole("listitem").first()).toContainText(" — Saved");
    const styles = offline.getByRole("list", { name: "Style sheets", exact: true });
    await expect(styles.getByRole("listitem").first()).toContainText(" — Saved");
    expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
  });

  test("checking again sees an evicted entry even while its script still runs in the tab", async ({ page }) => {
    await waitForInstalledShell(page);
    await page.goto("/offline");
    await openFileCheck(page);
    const scripts = page.getByRole("list", { name: "Startup scripts", exact: true });
    const file = scripts.getByRole("listitem").first();
    await expect(file).toContainText(" — Saved");
    const path = await file.locator("code").innerText();

    // This isolated browser context models eviction after the page loaded the script.
    const removed = await page.evaluate(async (relativePath) => {
      const registration = await navigator.serviceWorker.ready;
      const cacheName = "workbox-precache-v2-" + registration.scope;
      if (!await caches.has(cacheName)) return false;
      const cache = await caches.open(cacheName);
      return cache.delete(new URL(relativePath, registration.scope).href);
    }, path);
    expect(removed).toBe(true);

    await page.getByRole("button", { name: "Check startup files again", exact: true }).click();
    await expect(file).toContainText(" — Missing");
    await page.getByRole("combobox", { name: "Show files" }).selectOption("missing");
    await expect(scripts.getByText(path, { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Page document" })).toHaveCount(0);
  });
});

test.describe("browser without worker control", () => {
  test.use({ locale: "en-CA", serviceWorkers: "block" });

  test("a page loaded over the network reports unavailable cache evidence", async ({ page }) => {
    await page.goto("/offline");
    await openFileCheck(page);
    const documentList = page.getByRole("list", { name: "Page document" });
    await expect(documentList.getByRole("listitem")).toHaveText("index.html — UNKNOWN");
    await page.getByRole("combobox", { name: "Show files" }).selectOption("unknown");
    await expect(documentList.getByRole("listitem")).toBeVisible();
  });
});
