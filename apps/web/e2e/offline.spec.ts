import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function goOffline(page: Page, context: BrowserContext): Promise<void> {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
  await context.setOffline(true);
}

test("the shell opens again with the network off", async ({ page, context }) => {
  await goOffline(page, context);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeVisible();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await page.goto("/data-status");
  await expect(page.getByText("Live elevator and disruption status is unavailable")).toBeVisible();
});

test("a fresh offline copy still supports the core help flow in English and French", async ({ page, context }) => {
  await goOffline(page, context);
  const routes: Array<[string, string]> = [
    ["/help", "Help"],
    ["/about", "About"],
    ["/data-status", "Data status"],
    ["/no-such-page", "Page not found"],
  ];
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 2, name: "What unverified means" })).toBeVisible();
  await expect(page.getByText("the App does not give medical advice and does not decide benefits eligibility.")).toBeVisible();

  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Aide" })).toBeVisible();
  await expect(page.getByText("Hors ligne", { exact: true })).toBeVisible();
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1, name: "À propos" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
});
