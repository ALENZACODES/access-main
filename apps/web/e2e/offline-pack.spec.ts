import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `${label} ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

async function controlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
}

test("Day 11: download, use offline, report offline, and delete the Toronto pack by keyboard", async ({ page, context }) => {
  const manifest = await (await page.request.get("/packs/toronto/manifest.json")).json();
  const kb = (manifest.size_bytes / 1024).toFixed(1);

  await page.goto("/offline");
  await controlled(page);
  await expect(page.getByRole("heading", { level: 1, name: "Offline pack" })).toBeVisible();
  await expect(page.getByText(`Size: ${kb} KB`)).toBeVisible();
  await expect(page.getByText(`Places: ${manifest.counts.places}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Saved journeys: 0", { exact: true })).toBeVisible();
  await expect(page.getByText(/OpenStreetMap, Geofabrik Ontario extract\. Licence: ODbL-1\.0\. Retrieved 2026-11-13\./)).toBeVisible();
  await expect(page.getByText(/No pack is saved on this device/)).toBeVisible();
  await axeClean(page, "before download");

  const download = page.getByRole("button", { name: "Download the Toronto pack" });
  await download.focus();
  await page.keyboard.press("Enter");
  const complete = page.getByText(/^Download complete\./);
  await expect(complete).toBeFocused();
  await expect(complete).toHaveText(
    `Download complete. The pack matches its list: ${manifest.counts.places} places, ${manifest.counts.help_numbers} help numbers, ${manifest.counts.elevator_status} elevator status copies, ${kb} KB.`,
  );
  await expect(page.getByRole("progressbar", { name: "Download progress" })).toHaveAttribute("value", String(manifest.size_bytes));
  await expect(page.getByText(`Downloaded ${kb} of ${kb} KB (100%).`)).toBeVisible();
  await axeClean(page, "after download");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "You are offline. The saved pack still opens." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved places" })).toBeVisible();
  await expect(page.locator(".record-list").getByText("Sankofa Square", { exact: true })).toBeVisible();
  await expect(page.getByText("Wheelchair tag: Unknown. A tag is not a measurement.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "911" })).toHaveAttribute("href", "tel:911");
  await expect(page.getByText(/No journey is in this pack\./)).toBeVisible();
  await expect(page.getByText("Cedarvale. Last checked Nov 13, 2026, 14:48.")).toBeVisible();
  await expect(page.getByText(/They are not live and may be out of date\./)).toBeVisible();
  await axeClean(page, "offline");

  await page.getByLabel("Place", { exact: true }).selectOption({ label: "Sankofa Square" });
  await page.getByLabel("What you saw").fill("The ramp was blocked by a sign.");
  await page.getByLabel("When you saw it").fill("2026-11-13T09:15");
  await page.getByRole("button", { name: "Queue the report" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Report queued on this device. It has not been sent.")).toBeVisible();
  await expect(page.getByText("Observed Nov 13, 2026, 09:15. Written offline and queued on this device. Not sent.")).toBeVisible();

  const remove = page.getByRole("button", { name: "Delete the pack" });
  await remove.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Delete the Toronto pack?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep the pack" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Delete the pack" })).toBeFocused();
  await page.keyboard.press("Enter");
  const empty = page.getByText(/The pack was deleted\. No pack is saved on this device\. To get it again, connect to the network and choose Download the Toronto pack\./);
  await expect(empty).toBeFocused();
  await expect(page.getByRole("heading", { name: "Saved places" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download the Toronto pack" })).toBeDisabled();
  await axeClean(page, "after delete");

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Download the Toronto pack" })).toBeEnabled();
});

test("Day 11: the pack page renders in French and axe is clean", async ({ page }) => {
  await page.goto("/offline");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Données hors ligne" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Télécharger les données de Toronto" })).toBeVisible();
  await page.getByRole("button", { name: "Télécharger les données de Toronto" }).click();
  await expect(page.getByText(/^Téléchargement terminé\./)).toBeVisible();
  await expect(page.getByText(/Dernière vérification le/).first()).toBeVisible();
  await axeClean(page, "french");
});
