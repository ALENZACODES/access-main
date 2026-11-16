import { expect, test } from "@playwright/test";

/**
 * P4: the Day 22 error and empty states on live routes. Each shows a
 * plain-language heading and sentence, and a next action that works by
 * keyboard. The app is local, so no copy blames a server or "our side".
 */

// Search, journey and finder empty states need a ready module. Until the lanes are
// pinned the shell uses stub modules, so those states are covered with a ready
// module in src/pages/ModulePage.states.dom.test.tsx.

test("offline with no pack offers the pack download and a retry", async ({ page, context }) => {
  await page.goto("/places");
  await expect(page.getByRole("status").filter({ hasText: /^\d+ results?$/ })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const notice = page.locator(".state-notice");
  await expect(notice.getByRole("heading", { name: "No connection and no offline pack" })).toBeVisible({ timeout: 10_000 });
  await expect(notice.locator("[role='alert']")).toHaveCount(1);
  await expect(notice.getByRole("link", { name: "Download an offline pack" })).toHaveAttribute("href", /\/offline$/);
  await expect(notice.getByRole("button", { name: "Try again" })).toBeVisible();
  await context.setOffline(false);
});

test("offline with no pack, in French", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("access.language", "fr");
    localStorage.setItem("access.language.set", "1");
  });
  await page.goto("/finders");
  await expect(page.getByRole("status").filter({ hasText: /^\d+ résultats?$/ })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const notice = page.locator(".state-notice");
  await expect(notice.getByRole("heading", { name: "Pas de connexion ni de pack hors ligne" })).toBeVisible({ timeout: 10_000 });
  await expect(notice).toContainText("Cet appareil est hors ligne et n’a aucun pack hors ligne pour cette région.");
  await expect(notice.getByRole("link", { name: "Télécharger un pack hors ligne" })).toBeVisible();
  await expect(notice).not.toContainText(/service|serveur|notre côté/i);
  await context.setOffline(false);
});
