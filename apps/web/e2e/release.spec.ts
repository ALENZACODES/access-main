import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Days 19, 22, and 24 checks for the shell: keyboard-only core flow on the
 * built shell, error states with a working next action, no console errors on
 * core flows, and one build identifier and one count everywhere they appear.
 */
const ROUTES = ["/", "/about", "/onboarding", "/profile", "/data-status", "/places", "/journey", "/finders", "/navigator", "/games", "/help", "/no-such-page"];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${page.url()} ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${page.url()} ${error.message}`));
  return errors;
}

/** Presses Tab until the target has focus. Fails instead of looping forever. */
async function tabTo(page: Page, target: Locator, limit = 60): Promise<void> {
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function seedRecords(page: Page, count: number): Promise<void> {
  await page.evaluate(async (total) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("access-app");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cacheEntries", "readwrite");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        for (let index = 0; index < total; index += 1) {
          tx.objectStore("cacheEntries").put({
            id: `rec-release-${index}`,
            kind: "place",
            title: `Synthetic test record ${index + 1}`,
            stored_at: "2026-11-14T12:00:00.000Z",
            provenance: {
              source_name: "Synthetic test fixture",
              source_url: null,
              licence: "UNKNOWN",
              licence_url: null,
              source_date: "2026-11-14",
              retrieved_at: "2026-11-14T12:00:00.000Z",
              tier: 0,
              prototype_label: "PROTOTYPE-UNVERIFIED",
              freshness: "unknown",
            },
            contains_live_status: false,
            payload: {},
          });
        }
      };
    });
  }, count);
}

test("core routes log no console errors in English or French", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  for (const language of ["English", "Français"] as const) {
    await page.goto("/");
    await page.getByRole("button", { name: language }).click();
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  }
  expect(errors).toEqual([]);
});

test("build identifier and record counts agree on the footer, About, data status, and the manifest", async ({ page, request }) => {
  const manifest = (await (await request.get("/build-manifest.json")).json()) as { buildId: string; contractVersion: string };
  expect(manifest.buildId).toBe("e2e");

  await page.goto("/about");
  await seedRecords(page, 2);
  await page.reload();
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText(`Build ${manifest.buildId}`)).toBeVisible();
  await expect(footer.getByText(`Shell contract ${manifest.contractVersion}`)).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText(`Build ${manifest.buildId}`)).toBeVisible();
  await expect(main.getByText("2 records stored on this device")).toBeVisible();

  await page.goto("/data-status");
  await expect(page.getByRole("main").getByText("2 records stored on this device")).toBeVisible();
  await expect(page.getByText("Synthetic test record 1")).toBeVisible();

  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("contentinfo").getByText(`Version ${manifest.buildId}`)).toBeVisible();
  await page.goto("/about");
  await expect(page.getByRole("main").getByText(`Version ${manifest.buildId}`)).toBeVisible();
});

test("an unknown address explains itself and its next actions work by keyboard", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByText("Check the address, or use one of these links.")).toBeVisible();
  const help = page.getByRole("main").getByRole("link", { name: "Open help" });
  await tabTo(page, help);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeFocused();

  await page.goto("/no-such-page");
  await page.getByRole("main").getByRole("link", { name: "Go to the home page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("refused storage shows plain language, a retry, and a help link", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.addInitScript(() => {
    const refuse = () => {
      throw new DOMException("Storage refused for this test", "SecurityError");
    };
    Object.defineProperty(window.indexedDB, "open", { value: refuse, configurable: true });
  });
  await page.goto("/data-status");
  await expect(page.getByText("This browser did not allow on-device storage.")).toBeVisible();
  await expect(page.getByText("You can still read help, or try again.")).toBeVisible();
  const retry = page.getByRole("button", { name: "Check storage again" });
  await retry.click();
  await expect(page.getByText("This browser did not allow on-device storage.")).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole("link", { name: "Read where preferences go" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Where preferences go" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the core setup flow completes by keyboard alone", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await tabTo(page, page.getByRole("link", { name: "Set up on this device" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Set up on this device" })).toBeVisible();

  for (let step = 0; step < 4; step += 1) {
    const next = page.getByRole("button", { name: "Continue" });
    await tabTo(page, next);
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { level: 2, name: "Review" })).toBeFocused();
  await tabTo(page, page.getByRole("checkbox", { name: "Store these preferences on this device only" }));
  await page.keyboard.press("Space");
  await tabTo(page, page.getByRole("button", { name: "Save on this device" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeFocused();
  await expect(page.getByText("Preferences are stored on this device.")).toBeVisible();

  await tabTo(page, page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Data status" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Data status" })).toBeFocused();
  await expect(page.getByText(/A preferences record is on this device/)).toBeVisible();

  await tabTo(page, page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Help" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeFocused();
  expect(errors).toEqual([]);
});
