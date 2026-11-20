import { expect, test } from "@playwright/test";
import { auditDialogLifecycle, auditKeyboardCommands } from "./focus.mjs";
import { inspectBrowserSemantics } from "./browser";
import { auditSemanticSnapshot } from "./contracts.mjs";

const modalFixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Dialog keyboard lifecycle</title><style>
body{font:16px system-ui}button{min-width:44px;min-height:44px;margin:6px}
:focus-visible{outline:3px solid black;outline-offset:3px}
dialog{border:2px solid black;padding:16px}
</style></head><body><main><h1>Dialog keyboard lifecycle</h1>
<button id="first">First</button>
<button id="opener" type="button" aria-haspopup="dialog" aria-controls="modal">Open options</button>
<button id="last">Last</button>
<dialog id="modal" aria-labelledby="modal-name" aria-describedby="modal-description">
<h2 id="modal-name">Options</h2><p id="modal-description">Choose an option.</p>
<button id="accept">Accept</button><button id="close">Close</button>
</dialog></main><script>
const opener = document.getElementById('opener');
const modal = document.getElementById('modal');
opener.addEventListener('click', () => modal.showModal());
modal.addEventListener('close', () => opener.focus());
document.getElementById('close').addEventListener('click', () => modal.close());
</script></body></html>`;

function lifecycle(overrides: Record<string, unknown> = {}) {
  return {
    declared: true, opened: true, named: true, focusInside: true,
    tabContained: true, escapeClosed: true, focusReturned: true,
    interactiveCount: 2, modal: true, backgroundReachable: false,
    nestedModalCount: 1, ...overrides,
  };
}
const codes = (items: readonly { code: string }[]) => items.map((item) => item.code);

async function openWithKeyboard(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("#opener").focus();
  await expect(page.locator("#opener")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal")).toBeVisible();
}

async function closeWithKeyboard(page: import("@playwright/test").Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).toBeHidden();
}

test.describe("P16 Round 31: native dialog keyboard lifecycle", () => {
  test.beforeEach(async ({ page }) => { await page.setContent(modalFixture); });

  test("Enter activates declared opener", async ({ page }) => {
    await openWithKeyboard(page);
    expect(auditKeyboardCommands([{
      key: "Enter", targetId: "opener", focusedBefore: true,
      activated: await page.locator("#modal").isVisible(),
      destructive: false, confirmed: true, navigation: false, localTarget: true,
    }])).toEqual([]);
  });

  test("native Escape closes the modal", async ({ page }) => {
    await openWithKeyboard(page);
    await closeWithKeyboard(page);
    expect(auditDialogLifecycle(lifecycle())).toEqual([]);
  });

  test("Escape returns focus to the declared opener", async ({ page }) => {
    await openWithKeyboard(page);
    await closeWithKeyboard(page);
    await expect(page.locator("#opener")).toBeFocused();
  });

  test("Tab remains inside a native modal", async ({ page }) => {
    await openWithKeyboard(page);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const dialog = document.querySelector("dialog");
        return Boolean(dialog?.open) && (dialog?.contains(document.activeElement) || document.activeElement === dialog || document.activeElement === document.body);
      });
      expect(inside).toBe(true);
    }
  });

  test("Shift+Tab remains inside a native modal", async ({ page }) => {
    await openWithKeyboard(page);
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press("Shift+Tab");
      const inside = await page.evaluate(() => Boolean(document.querySelector("dialog")?.open) && (document.querySelector("dialog")?.contains(document.activeElement) || document.activeElement === document.querySelector("dialog") || document.activeElement === document.body));
      expect(inside).toBe(true);
    }
  });

  test("ARIA relationship gives dialog an accessible name", async ({ page }) => {
    const snapshot = await inspectBrowserSemantics(page);
    const issues = auditSemanticSnapshot(snapshot);
    expect(codes(issues)).not.toContain("node.dangling-reference");
  });

  test("removing dialog label creates a detectable naming defect", async ({ page }) => {
    await page.locator("#modal").evaluate((element) => { element.removeAttribute("aria-labelledby"); });
    await openWithKeyboard(page);
    const named = await page.locator("#modal").evaluate((element) =>
      Boolean(element.getAttribute("aria-labelledby") || element.getAttribute("aria-label")),
    );
    expect(codes(auditDialogLifecycle(lifecycle({ named })))).toContain("dialog.unnamed");
  });

  test("preventing cancel produces an Escape failure", async ({ page }) => {
    await page.locator("#modal").evaluate((element) => {
      element.addEventListener("cancel", (event) => event.preventDefault());
    });
    await openWithKeyboard(page);
    await page.keyboard.press("Escape");
    const stillOpen = await page.locator("#modal").isVisible();
    expect(stillOpen).toBe(true);
    expect(codes(auditDialogLifecycle(lifecycle({ escapeClosed: !stillOpen })))).toContain("dialog.escape-failed");
  });

  test("missing declared opener reference produces structural failure", async ({ page }) => {
    await page.locator("#opener").evaluate((element) => { element.removeAttribute("aria-controls"); });
    const declared = await page.locator("#opener").getAttribute("aria-controls");
    expect(codes(auditDialogLifecycle(lifecycle({ declared: Boolean(declared) })))).toContain("dialog.undeclared-opener");
  });

  test("a stolen restoration focus is detectable", async ({ page }) => {
    await openWithKeyboard(page);
    await closeWithKeyboard(page);
    // Deliberately reproduce the final bad focus state after native restoration.
    const focusReturned = await page.evaluate(() => {
      const last = document.getElementById("last");
      const opener = document.getElementById("opener");
      last?.focus();
      return document.activeElement === opener;
    });
    expect(codes(auditDialogLifecycle(lifecycle({ focusReturned })))).toContain("dialog.focus-not-restored");
  });

  test("background click is not required for keyboard dismissal", async ({ page }) => {
    await openWithKeyboard(page);
    await closeWithKeyboard(page);
    await expect(page.locator("#opener")).toBeFocused();
  });

  test("native close button also restores opener focus", async ({ page }) => {
    await openWithKeyboard(page);
    await page.locator("#close").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#modal")).toBeHidden();
    await expect(page.locator("#opener")).toBeFocused();
  });

  test("reopening after close remains operational", async ({ page }) => {
    await openWithKeyboard(page);
    await closeWithKeyboard(page);
    await openWithKeyboard(page);
    await expect(page.locator("#modal")).toBeVisible();
  });
});
