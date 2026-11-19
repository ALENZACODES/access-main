import { expect, test, type Page } from "@playwright/test";
import {
  auditDialogTree,
  auditDialogTriggers,
  exerciseDeclaredDialog,
  type DialogFinding,
} from "./dialog-round4";

const codes = (findings: readonly DialogFinding[]): string[] => findings.map((finding) => finding.code);

const html = `<!doctype html><html lang="en"><head>
<title>Dialog focus lifecycle</title><style>
button, a { min-width: 44px; min-height: 44px; }
:focus-visible { outline: 3px solid navy; outline-offset: 3px; }
</style></head><body>
<button id="other">Other control</button>
<button id="opener" aria-haspopup="dialog" aria-controls="dialog">Open options</button>
<a id="link" href="#content">Main content</a>
<main id="content"><dialog id="dialog" aria-labelledby="title">
<h2 id="title">Options</h2><button id="inside">Continue</button>
<button id="close">Close</button></dialog></main>
<script>
const opener = document.querySelector('#opener');
const dialog = document.querySelector('#dialog');
opener.addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', () => opener.focus());
document.querySelector('#close').addEventListener('click', () => dialog.close());
</script></body></html>`;

async function setup(page: Page): Promise<void> {
  await page.setContent(html);
}

async function observe(page: Page) {
  return exerciseDeclaredDialog(page, page.locator("#opener"));
}

/** The existing route uses the same checker. These tests isolate event order. */
test.describe("P16 dialog close focus restoration regressions", () => {
  test("a normal native close returns focus to its opener", async ({ page }) => {
    await setup(page);
    const result = await observe(page);
    expect(result.opened).toBe(true);
    expect(result.escaped).toBe(true);
    expect(result.returnedToTrigger).toBe(true);
    expect(codes(result.findings)).not.toContain("dialog-focus-not-restored");
    await expect(page.locator("#opener")).toBeFocused();
  });

  test("microtask diversion after close is recorded", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("close", () => {
        queueMicrotask(() => document.querySelector<HTMLElement>("#other")?.focus());
      });
    });
    const result = await observe(page);
    expect(codes(result.findings)).toContain("dialog-focus-not-restored");
    expect(result.returnedToTrigger).toBe(false);
  });

  test("a second microtask still counts as a diversion", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("close", () => {
        queueMicrotask(() => queueMicrotask(() => {
          document.querySelector<HTMLElement>("#link")?.focus();
        }));
      });
    });
    const result = await observe(page);
    expect(codes(result.findings)).toContain("dialog-focus-not-restored");
  });

  test("a transient diversion remains a finding even if focus is later restored", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("close", () => {
        queueMicrotask(() => {
          document.querySelector<HTMLElement>("#other")?.focus();
          document.querySelector<HTMLElement>("#opener")?.focus();
        });
      });
    });
    const result = await observe(page);
    expect(codes(result.findings)).toContain("dialog-focus-not-restored");
    expect(result.returnedToTrigger).toBe(false);
  });

  test("a focus move during the open dialog does not count as post-close diversion", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("focusin", () => {
        // No action: ordinary Tab navigation inside the modal is allowed.
      });
    });
    const result = await observe(page);
    expect(codes(result.findings)).not.toContain("dialog-focus-not-restored");
  });

  test("the audit leaves no focus-diversion marker behind", async ({ page }) => {
    await setup(page);
    await observe(page);
    await expect(page.locator("[data-a11y-round4-diverted-focus]")).toHaveCount(0);
  });

  test("the audit removes its observer after a failed restoration", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("close", () => {
        queueMicrotask(() => document.querySelector<HTMLElement>("#last-missing")?.focus());
      });
    });
    await observe(page);
    await expect(page.locator("[data-a11y-round4-diverted-focus]")).toHaveCount(0);
  });

  test("a second independent exercise does not inherit previous focus findings", async ({ page }) => {
    await setup(page);
    const first = await observe(page);
    const second = await observe(page);
    expect(first.returnedToTrigger).toBe(true);
    expect(second.returnedToTrigger).toBe(true);
    expect(codes(second.findings)).not.toContain("dialog-focus-not-restored");
  });

  test("missing target declaration reports missing-controls without activating", async ({ page }) => {
    await setup(page);
    await page.locator("#opener").evaluate((button) => button.removeAttribute("aria-controls"));
    const result = await observe(page);
    expect(result.opened).toBe(false);
    expect(codes(result.findings)).toContain("missing-controls");
    await expect(page.locator("#dialog")).not.toBeVisible();
  });

  test("an unreachable opener is reported by the structural audit", async ({ page }) => {
    await setup(page);
    await page.locator("#opener").evaluate((button) => button.setAttribute("tabindex", "-1"));
    expect(codes(await auditDialogTriggers(page))).toContain("dialog-trigger-unreachable");
  });

  test("an opener pointing to a normal element is not a dialog target", async ({ page }) => {
    await setup(page);
    await page.locator("#opener").evaluate((button) => button.setAttribute("aria-controls", "other"));
    expect(codes(await auditDialogTriggers(page))).toContain("dialog-trigger-invalid-controls");
  });

  test("an open modal with missing accessible name is a structural error", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => dialog.removeAttribute("aria-labelledby"));
    await page.locator("#opener").press("Enter");
    expect(codes(await auditDialogTree(page))).toContain("unnamed-dialog");
  });

  test("a valid named modal is free of structural errors", async ({ page }) => {
    await setup(page);
    await page.locator("#opener").press("Enter");
    expect(await auditDialogTree(page)).toEqual([]);
  });

  test("preventing Escape still reports an incomplete close lifecycle", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("cancel", (event) => event.preventDefault());
    });
    const result = await observe(page);
    expect(result.escaped).toBe(false);
    expect(codes(result.findings)).toContain("dialog-escape-failed");
  });

  test("sequential keyboard movement stays within a native modal", async ({ page }) => {
    await setup(page);
    const result = await observe(page);
    expect(result.innerTabStops).toBeGreaterThan(0);
    expect(codes(result.findings)).not.toContain("dialog-tab-escaped");
  });

  test("the focus tracker does not alter the opener label or target", async ({ page }) => {
    await setup(page);
    const before = await page.locator("#opener").getAttribute("aria-controls");
    const label = await page.locator("#opener").textContent();
    await observe(page);
    expect(await page.locator("#opener").getAttribute("aria-controls")).toBe(before);
    expect(await page.locator("#opener").textContent()).toBe(label);
  });

  test("the focus tracker never marks another open dialog as available", async ({ page }) => {
    await setup(page);
    const result = await observe(page);
    expect(result.named).toBe(true);
    expect(result.findings.every((finding) => finding.target.length > 0)).toBe(true);
  });

  test("a cancelled close still removes temporary diagnostic attributes", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.addEventListener("cancel", (event) => event.preventDefault());
    });
    await observe(page);
    await expect(page.locator("[data-a11y-round4-diverted-focus]")).toHaveCount(0);
  });

  test("a changed target reference remains an explicit mismatch", async ({ page }) => {
    await setup(page);
    await page.locator("#opener").evaluate((button) => {
      button.setAttribute("aria-controls", "another-dialog");
    });
    const result = await observe(page);
    expect(codes(result.findings)).toContain("dialog-target-mismatch");
    expect(result.opened).toBe(true);
  });

  test("an invalid description reference is not ignored", async ({ page }) => {
    await setup(page);
    await page.locator("#dialog").evaluate((dialog) => {
      dialog.setAttribute("aria-describedby", "missing-description");
    });
    await page.locator("#opener").press("Enter");
    expect(codes(await auditDialogTree(page))).toContain("dialog-description-missing");
  });

  test("the observer does not leave focus markers after repeated runs", async ({ page }) => {
    await setup(page);
    for (let index = 0; index < 3; index += 1) {
      const result = await observe(page);
      expect(result.returnedToTrigger).toBe(true);
      await expect(page.locator("[data-a11y-round4-diverted-focus]")).toHaveCount(0);
    }
  });

  test("explicit option validation prevents an unbounded Tab scan", async ({ page }) => {
    await setup(page);
    await expect(exerciseDeclaredDialog(page, page.locator("#opener"), { maxTabSteps: 0 }))
      .rejects.toThrow("maxTabSteps");
    await expect(exerciseDeclaredDialog(page, page.locator("#opener"), { maxTabSteps: 201 }))
      .rejects.toThrow("maxTabSteps");
  });
});
