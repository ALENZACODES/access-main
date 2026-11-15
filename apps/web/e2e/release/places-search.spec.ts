import { expect, test } from "@playwright/test";
import { fetchManifest, openRoute, pickPlace, releaseEnabled } from "./support";

test.skip(!releaseEnabled(), "The release gate runs through playwright.release.config.ts");

test("the fixture pack has a place named Union", async ({ request }) => {
  const manifest = await fetchManifest(request);
  const place = await pickPlace(request, manifest, { nameIncludes: "union" });
  expect(place, "no indexed place name contains 'union' in the pack that is being published").not.toBeNull();
});

test("Places search for 'Union' returns a real result that opens", async ({ page, request }) => {
  const manifest = await fetchManifest(request);
  const expected = await pickPlace(request, manifest, { nameIncludes: "union" });
  expect(expected).not.toBeNull();

  await openRoute(page, "places", "en");
  const box = page.getByRole("searchbox").or(page.getByRole("textbox", { name: /search/i })).first();
  await box.fill("Union");
  await box.press("Enter");

  const result = page.getByRole("link", { name: /union/i }).first();
  await expect(result, "a result link containing 'Union' must appear").toBeVisible({ timeout: 20_000 });
  expect(await result.getAttribute("href")).toMatch(/\/places\/[^/]+$/);

  await result.click();
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page).toHaveURL(/\/places\/[^/]+$/);
});
