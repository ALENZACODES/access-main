import { expect, test as base, type Page } from "@playwright/test";

export const test = base.extend<{ firstOfflinePage: Page }>({
  firstOfflinePage: async ({ page, context }, runTest) => {
    // Only the home page is visited online. The new tab starts with no evaluated modules.
    await page.goto("/");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    const installedPaths = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) => name.includes("precache"));
      const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
      return requests.flat().map(({ url }) => new URL(url).pathname);
    });
    expect(installedPaths.length).toBeGreaterThan(0);
    await context.setOffline(true);
    const offline = await context.newPage();
    const requestedAssets = new Set<string>();
    offline.on("request", (request) => {
      if (["script", "stylesheet"].includes(request.resourceType())) {
        requestedAssets.add(new URL(request.url()).pathname);
      }
    });
    await page.close();
    const response = await offline.goto("/offline");
    expect(response?.fromServiceWorker()).toBe(true);
    expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
    await runTest(offline);

    // A runtime cache hit cannot substitute for a first-install entry.
    expect(requestedAssets.size).toBeGreaterThan(0);
    expect([...requestedAssets].filter((path) => !installedPaths.includes(path))).toEqual([]);
  },
});
