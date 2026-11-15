import { expect, test } from "@playwright/test";

test("the shell opens again with the network off", { annotation: { type: "check", description: "G2-offline-shell" } }, async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeVisible();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await page.goto("/data-status");
  await expect(page.getByText("Live elevator and disruption status is unavailable")).toBeVisible();
});
