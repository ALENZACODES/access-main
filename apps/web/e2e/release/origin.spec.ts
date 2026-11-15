import { expect, test } from "@playwright/test";
import {
  STATIC_ROUTES,
  dynamicRoutes,
  openRoute,
  releaseEnabled,
} from "./support";

test.skip(!releaseEnabled(), "The release gate runs through playwright.release.config.ts");

test("no request leaves the origin", async ({ page, context, request, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const offOrigin = new Map<string, string>();
  context.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.origin !== origin) offOrigin.set(url.host, req.url());
  });

  for (const route of STATIC_ROUTES) await openRoute(page, route.path, "en");
  for (const family of await dynamicRoutes(page, request, "en")) {
    for (const routePath of family.paths.slice(0, 5)) await openRoute(page, routePath, "en");
  }
  // Let late fetches (fonts, tiles, analytics-style beacons) show up before judging.
  await page.waitForLoadState("networkidle").catch(() => undefined);

  expect(
    [...offOrigin.entries()].map(([host, sample]) => `${host} (e.g. ${sample})`),
    "Only same-origin requests are allowed (B4: no third-party map tile or style server). Agency trip-planner links are followed by the person, never by the App.",
  ).toEqual([]);
});
