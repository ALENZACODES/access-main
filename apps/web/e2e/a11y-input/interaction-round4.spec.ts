import { expect, test } from "@playwright/test";

import {
  auditKeyboardGeometry, auditReflow, auditSkipLink, measureActiveFocus,
} from "./focus-geometry-round4";
import {
  auditDialogEscapeOnPage, auditDialogTree, auditDialogTriggers,
  exerciseDeclaredDialog,
} from "./dialog-round4";

const markup = `<!doctype html><html lang="en"><head><title>Interaction audit</title>
<style>
  body { margin: 0; font: 16px system-ui; }
  main { max-width: 100%; box-sizing: border-box; padding: 16px; }
  button, a { display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; min-width: 44px; margin: 4px; }
  :focus-visible { outline: 3px solid #1a355c; outline-offset: 3px; }
  dialog { min-width: 250px; padding: 20px; }
</style></head><body>
<a id="skip" href="#content">Skip to content</a>
<main id="content" tabindex="-1"><h1>Interaction audit</h1>
<button id="first">First</button>
<button id="open" aria-haspopup="dialog" aria-controls="modal">Open dialog</button>
<button id="last">Last</button>
<dialog id="modal" aria-labelledby="modal-title">
<h2 id="modal-title">Options</h2>
<button id="accept">Accept</button><button id="close">Close</button>
</dialog>
</main>
<script>
  const trigger = document.querySelector('#open');
  const dialog = document.querySelector('#modal');
  trigger.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', () => trigger.focus());
  document.querySelector('#close').addEventListener('click', () => dialog.close());
</script></body></html>`;

const codes = (items: readonly { code: string }[]): string[] => items.map((item) => item.code);

async function setup(page: import("@playwright/test").Page): Promise<void> {
  await page.setContent(markup);
}

test.describe("P16D dialog state and input lifecycle", () => {
  test("closed dialog produces no structural findings", async ({ page }) => {
    await setup(page);
    expect(await auditDialogTree(page)).toEqual([]);
  });

  test("declared opener has a matching target", async ({ page }) => {
    await setup(page);
    expect(await auditDialogTriggers(page)).toEqual([]);
  });

  test("native modal works with Enter, cycling Tab, Escape, and focus return", async ({ page }) => {
    await setup(page);
    const result = await exerciseDeclaredDialog(page, page.locator("#open"));
    expect(result.findings).toEqual([]);
    expect(result.opened).toBe(true);
    expect(result.escaped).toBe(true);
    expect(result.named).toBe(true);
    expect(result.returnedToTrigger).toBe(true);
    expect(result.innerTabStops).toBeGreaterThan(0);
  });

  test("missing target reference is a structural failure", async ({ page }) => {
    await setup(page);
    await page.locator("#open").evaluate((node) => node.removeAttribute("aria-controls"));
    expect(codes(await auditDialogTriggers(page))).toContain("dialog-trigger-no-controls");
  });

  test("reference to an unrelated element fails", async ({ page }) => {
    await setup(page);
    await page.locator("#open").evaluate((node) => node.setAttribute("aria-controls", "first"));
    expect(codes(await auditDialogTriggers(page))).toContain("dialog-trigger-invalid-controls");
  });

  test("a trigger outside the sequential focus order fails", async ({ page }) => {
    await setup(page);
    await page.locator("#open").evaluate((node) => node.setAttribute("tabindex", "-1"));
    expect(codes(await auditDialogTriggers(page))).toContain("dialog-trigger-unreachable");
  });

  test("visible dialog without a name fails", async ({ page }) => {
    await setup(page);
    await page.locator("#modal").evaluate((node) => node.removeAttribute("aria-labelledby"));
    await page.locator("#open").press("Enter");
    expect(codes(await auditDialogTree(page))).toContain("unnamed-dialog");
  });

  test("modal with invalid description reference fails", async ({ page }) => {
    await setup(page);
    await page.locator("#modal").evaluate((node) => node.setAttribute("aria-describedby", "missing"));
    await page.locator("#open").press("Enter");
    expect(codes(await auditDialogTree(page))).toContain("dialog-description-missing");
  });

  test("alertdialog without description fails", async ({ page }) => {
    await setup(page);
    await page.locator("#modal").evaluate((node) => node.setAttribute("role", "alertdialog"));
    await page.locator("#open").press("Enter");
    expect(codes(await auditDialogTree(page))).toContain("alertdialog-description-missing");
  });

  test("Escape closes an already open native modal", async ({ page }) => {
    await setup(page);
    await page.locator("#open").press("Enter");
    expect(await auditDialogEscapeOnPage(page)).toEqual([]);
    await expect(page.locator("#modal")).not.toBeVisible();
  });

  test("non-dismissible modal is reported", async ({ page }) => {
    await setup(page);
    await page.locator("#modal").evaluate((node) => {
      node.addEventListener("cancel", (event) => event.preventDefault());
    });
    await page.locator("#open").press("Enter");
    expect(codes(await auditDialogEscapeOnPage(page))).toContain("open-dialog-not-dismissible");
  });

  test("opener without controls does not fake dialog coverage", async ({ page }) => {
    await setup(page);
    await page.locator("#open").evaluate((node) => node.removeAttribute("aria-controls"));
    const result = await exerciseDeclaredDialog(page, page.locator("#open"));
    expect(result.opened).toBe(false);
    expect(codes(result.findings)).toContain("missing-controls");
  });

  test("dialog that cannot open from Enter is reported", async ({ page }) => {
    await setup(page);
    await page.locator("#open").evaluate((node) => {
      const replacement = node.cloneNode(true);
      node.replaceWith(replacement);
    });
    const result = await exerciseDeclaredDialog(page, page.locator("#open"));
    expect(result.opened).toBe(false);
    expect(codes(result.findings)).toContain("dialog-not-opened");
  });

  test("Escape cancellation fails lifecycle contract", async ({ page }) => {
    await setup(page);
    await page.locator("#modal").evaluate((node) => {
      node.addEventListener("cancel", (event) => event.preventDefault());
    });
    const result = await exerciseDeclaredDialog(page, page.locator("#open"));
    expect(result.escaped).toBe(false);
    expect(codes(result.findings)).toContain("dialog-escape-failed");
  });

  test("focus moved away after close violates the restore contract", async ({ page }) => {
    await setup(page);
    await page.locator("#modal").evaluate((node) => {
      // Native dialogs restore focus after the close event. Steal it afterwards,
      // which is how an application would actually override the restore.
      node.addEventListener("close", () => {
        queueMicrotask(() => {
          (document.querySelector("#last") as HTMLElement).focus();
        });
      });
    });
    const result = await exerciseDeclaredDialog(page, page.locator("#open"));
    expect(codes(result.findings)).toContain("dialog-focus-not-restored");
  });

});

test.describe("P16D focus geometry, reflow, and bypass navigation", () => {
  test("a focused button has visible coordinates", async ({ page }) => {
    await setup(page);
    await page.locator("#first").focus();
    const geometry = await measureActiveFocus(page);
    expect(geometry).not.toBeNull();
    expect(geometry?.occluded).toBe(false);
    expect(geometry?.clipped).toBe(false);
  });

  test("an unmodified document passes a full sequential focus walk", async ({ page }) => {
    await setup(page);
    const issues = await auditKeyboardGeometry(page);
    expect(issues).toEqual([]);
  });

  test("a fixed overlay can obscure focused controls", async ({ page }) => {
    await setup(page);
    await page.locator("body").evaluate((node) => {
      const cover = document.createElement("div");
      cover.id = "cover";
      cover.style.cssText = "position:fixed;inset:0;background:white;z-index:9999;";
      node.appendChild(cover);
    });
    const issues = await auditKeyboardGeometry(page);
    expect(codes(issues)).toContain("focus-fully-obscured");
  });

  test("missing visible focus appearance is a failure", async ({ page }) => {
    await setup(page);
    await page.locator("head").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<style>
        *:focus, *:focus-visible { outline: none !important; box-shadow: none !important;
          text-decoration: none !important; border-color: inherit !important;
          background-color: inherit !important; }
      </style>`);
    });
    expect(codes(await auditKeyboardGeometry(page))).toContain("focus-indicator-missing");
  });

  test("the scan fails closed when its step cap is exceeded", async ({ page }) => {
    await setup(page);
    expect(codes(await auditKeyboardGeometry(page, { maxSteps: 1 })))
      .toContain("focus-scan-incomplete");
  });

  test("the scan validates maximum bounds", async ({ page }) => {
    await setup(page);
    await expect(auditKeyboardGeometry(page, { maxSteps: 0 }))
      .rejects.toThrow("maxSteps");
  });

  test("the reflow audit restores the initial viewport", async ({ page }) => {
    await setup(page);
    const before = page.viewportSize();
    expect(await auditReflow(page)).toEqual([]);
    expect(page.viewportSize()).toEqual(before);
  });

  test("reflow detects excessively wide content", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.style.width = "1100px";
      node.style.maxWidth = "none";
    });
    expect(codes(await auditReflow(page))).toContain("horizontal-document-overflow");
  });

  test("a working skip link reaches its target", async ({ page }) => {
    await setup(page);
    expect(await auditSkipLink(page)).toEqual([]);
    expect(new URL(page.url()).hash).toBe("#content");
  });

  test("a broken skip link fails", async ({ page }) => {
    await setup(page);
    await page.locator("#skip").evaluate((node) => node.setAttribute("href", "#nowhere"));
    expect(codes(await auditSkipLink(page))).toContain("skip-target-not-unique");
  });

  test("the scan cleans up temporary focus identifiers", async ({ page }) => {
    await setup(page);
    await auditKeyboardGeometry(page);
    const leaked = await page.locator("[data-a11y-round4-focus-identity]").count();
    expect(leaked).toBe(0);
  });

  test("no skip link is not mistaken for a broken skip link", async ({ page }) => {
    await setup(page);
    await page.locator("#skip").evaluate((node) => node.remove());
    expect(await auditSkipLink(page)).toEqual([]);
  });
});
