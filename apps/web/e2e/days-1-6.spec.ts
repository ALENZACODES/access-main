/**
 * Master plan, Part 5, Day 6: browser acceptance checks for the device profile.
 * Each test title starts with its check id from the access-help day catalogue.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function press(page: Page, name: string, role: "radio" | "checkbox" = "radio") {
  const control = page.getByRole(role, { name, exact: role === "radio" });
  await control.focus();
  await page.keyboard.press("Space");
  await expect(control).toBeChecked();
}

async function saveManualChair(page: Page) {
  await page.goto("/profile");
  await press(page, "Manual wheelchair");
  await press(page, "Store these preferences on this device only", "checkbox");
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Saved on this device. Nothing was uploaded.")).toBeVisible();
}

test("D06-1 a manual chair profile loads after reload and the privacy notice is visible", async ({ page }) => {
  await saveManualChair(page);
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Equipment" }).getByRole("radio", { name: "Manual wheelchair" })).toBeChecked();
  await expect(page.getByText("These preferences stay on this device. They are optional.")).toBeVisible();
  await expect(page.getByText(/does not store a diagnosis, an injury level, or a location history/)).toBeVisible();
});

test("D06-4 the plain-text export downloads only the entered fields", async ({ page }) => {
  await saveManualChair(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export preferences as text" }).click(),
  ]);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
  expect(lines[0]).toBe("the App — preferences entered on this device");
  expect(lines).toContain("Equipment: Manual wheelchair");
  expect(lines.some((line) => line.startsWith("Consent to store on this device: "))).toBe(true);
  expect(lines.join("\n")).not.toMatch(/Not set|null|undefined|width|Transfer/i);
});

test("D06-5 deleting the profile asks for confirmation, removes stored data, and shows the empty state", async ({ page }) => {
  await saveManualChair(page);
  await page.getByRole("button", { name: "Delete preferences" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete preferences" }).click();
  await expect(page.getByText("Preferences were deleted from this device.")).toBeFocused();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Manual wheelchair" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Store these preferences on this device only" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Delete preferences" })).toBeDisabled();
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("access-app");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const count = database.transaction("profiles", "readonly").objectStore("profiles").count();
          count.onsuccess = () => {
            database.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
  expect(stored).toBe(0);
  await page.goto("/data-status");
  await expect(page.getByText("No preferences record is stored.")).toBeVisible();
});

test("D06-6 the profile flow works by keyboard with visible focus", async ({ page }) => {
  await page.goto("/profile");
  const seen: string[] = [];
  for (let step = 0; step < 80; step += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const visible = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) || style.boxShadow !== "none";
      const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
      return { label: label.slice(0, 60), visible, tag: element.tagName };
    });
    if (!focus) continue;
    expect(focus.visible, `no visible focus on ${focus.tag} ${focus.label}`).toBe(true);
    seen.push(focus.label);
    if (focus.label === "Save on this device") break;
  }
  expect(seen).toContain("Save on this device");

  // Choose and save using only the keyboard.
  await press(page, "Power wheelchair");
  await press(page, "Store these preferences on this device only", "checkbox");
  await page.getByRole("button", { name: "Save on this device" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved on this device. Nothing was uploaded.")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
