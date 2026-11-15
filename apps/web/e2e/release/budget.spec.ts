import { expect, test } from "@playwright/test";
import { PRECACHE_BUDGET_BYTES, parsePrecacheUrls, releaseEnabled, waitForServiceWorkerControl } from "./support";

test.skip(!releaseEnabled(), "The release gate runs through playwright.release.config.ts");

test("first-install precache is at most 3.95 MiB and never holds pack data", async ({ page, request }) => {
  const sw = await request.get("sw.js");
  expect(sw.ok(), "sw.js must be served under the base path").toBeTruthy();
  const listed = parsePrecacheUrls(await sw.text());
  expect(listed.length, "the service worker must list precache entries").toBeGreaterThan(0);

  await page.goto("");
  await waitForServiceWorkerControl(page);

  const cached = await page.evaluate(async () => {
    const entries: Array<{ url: string; bytes: number }> = [];
    for (const name of await caches.keys()) {
      if (!name.includes("precache")) continue;
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        entries.push({ url: req.url, bytes: res ? (await res.clone().blob()).size : 0 });
      }
    }
    return entries;
  });

  const total = cached.reduce((sum, entry) => sum + entry.bytes, 0);
  expect(cached.length, "the precache must be populated after install").toBeGreaterThanOrEqual(listed.length);
  expect(total, `precache is ${total} bytes (${(total / 1048576).toFixed(2)} MiB)`).toBeLessThanOrEqual(PRECACHE_BUDGET_BYTES);
  expect(cached.filter((entry) => /\/data\//.test(new URL(entry.url).pathname)), "pack and tiles are never precached").toEqual([]);
});
