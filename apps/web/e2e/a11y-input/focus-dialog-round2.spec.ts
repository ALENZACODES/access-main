import { expect, test, type Page } from "@playwright/test";

const DEFAULT_ORIGIN = "http://127.0.0.1:3000";

function routes(): string[] {
  const paths = (process.env.A11Y_ROUTES ?? "/")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  if (paths.length === 0 || paths.some((path) => !/^\/(?!\/)[^\\#]*$/.test(path))) {
    throw new Error("A11Y_ROUTES must contain local paths beginning with /.");
  }
  return [...new Set(paths)];
}

async function visit(page: Page, path: string, baseURL?: string): Promise<void> {
  const origin = new URL(process.env.A11Y_BASE_URL ?? baseURL ?? DEFAULT_ORIGIN);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("A11Y_BASE_URL must be HTTP(S).");
  }
  const response = await page.goto(new URL(path, origin).href, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.ok(), `The route ${path} must load successfully`).toBe(true);
}

/** A bounded keyboard walk makes focus-order regressions fail, not hang. */
async function tabToNext(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  await expect.poll(async () => page.evaluate(() =>
    document.activeElement !== null && document.activeElement !== document.body,
  )).toBe(true);
}

for (const path of routes()) {
  test.describe(`Keyboard focus and dialogs: ${path}`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await visit(page, path, baseURL);
    });

    test("reverse tab returns to the preceding focus target", async ({ page }) => {
      // Starting outside a focusable control avoids inheriting browser state.
      await page.locator("body").click({ position: { x: 0, y: 0 } });
      await tabToNext(page);
      const first = await page.locator(":focus").elementHandle();
      expect(first).not.toBeNull();

      await tabToNext(page);
      const secondIsFirst = await first?.evaluate(
        (element) => element === document.activeElement,
      );
      test.skip(secondIsFirst === true, "Route has only one sequential focus target.");

      await page.keyboard.press("Shift+Tab");
      expect(await first?.evaluate(
        (element) => element === document.activeElement,
      )).toBe(true);
    });

    test("Escape closes an opened dialog and restores the opener", async ({ page }) => {
      // Only activate controls explicitly declaring a dialog. Never infer
      // whether an arbitrary control launches a modal or performs an action.
      const opener = page.locator('[aria-haspopup="dialog"]:visible:not([disabled])').first();
      test.skip((await opener.count()) === 0, "No declared dialog opener on this route.");
      await opener.focus();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog").filter({ visible: true }).first();
      await expect(dialog, "The declared opener must display a dialog").toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog, "Escape must close the dialog").toBeHidden();
      await expect(opener, "Focus must return to the dialog opener").toBeFocused();
    });
  });
}

// Deterministic regression fixture: exercised even when the app route has no
// dialog. It checks both backward tab navigation and the native Escape path.
test("native dialog returns focus after Escape; Tab order reverses", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="en"><head><title>Input fixture</title></head><body>
      <main><h1>Input fixture</h1>
        <button id="first" type="button">First</button>
        <button id="opener" type="button" aria-haspopup="dialog">Open</button>
        <dialog aria-labelledby="dialog-title">
          <h2 id="dialog-title">Options</h2>
          <button id="inside" type="button">Close</button>
        </dialog>
      </main>
      <script>
        const opener = document.getElementById("opener");
        const dialog = document.querySelector("dialog");
        opener.addEventListener("click", () => dialog.showModal());
        dialog.addEventListener("close", () => opener.focus());
        document.getElementById("inside").addEventListener("click", () => dialog.close());
      </script>
    </body></html>
  `);

  await page.keyboard.press("Tab");
  await expect(page.locator("#first")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#opener")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#first")).toBeFocused();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#inside")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#opener")).toBeFocused();
});
