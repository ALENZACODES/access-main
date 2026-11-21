import { expect, test, type Page } from "@playwright/test";

import {
  auditDialogRoute,
  inspectDialogEscape,
  inspectDialogMarkup,
  inspectDialogTriggers,
  inspectTopDialogEscape,
  observeOpenDialog,
  openDialogLocator,
  safeDialogTriggers,
} from "./dialog-path-round8";

const FIXTURE = `<main><h1>Dialog fixture</h1>
  <button id="opener" aria-haspopup="dialog" aria-controls="editor">Open</button>
  <dialog id="editor" aria-labelledby="dialog-title" aria-describedby="dialog-hint">
    <h2 id="dialog-title">Edit details</h2>
    <p id="dialog-hint">Review before closing.</p>
    <button id="close">Close</button>
  </dialog>
  <button id="outside">Outside</button>
</main>`;

async function fixture(page: Page, markup = FIXTURE): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><style>
    button { min-width:44px; min-height:44px }
    dialog { padding:20px; background:white }
    :focus-visible { outline:3px solid black }
  </style></head><body>${markup}</body></html>`);
}

async function wireNativeDialog(page: Page): Promise<void> {
  await page.locator("#opener").evaluate((button) => {
    const dialog = document.querySelector<HTMLDialogElement>("#editor");
    button.addEventListener("click", () => dialog?.showModal());
    dialog?.addEventListener("close", () => (button as HTMLElement).focus());
    document.querySelector("#close")?.addEventListener("click", () => dialog?.close());
  });
}

test.describe("P16 round eight modal and Escape audit", () => {
  test("a valid closed dialog and opener have no structural defects", async ({ page }) => {
    await fixture(page);
    expect(await auditDialogRoute(page)).toEqual([]);
  });

  test("the explicitly named opener is discovered", async ({ page }) => {
    await fixture(page);
    expect(await safeDialogTriggers(page).count()).toBe(1);
    await expect(safeDialogTriggers(page)).toHaveAttribute("id", "opener");
  });

  test("native modal is named and has a description", async ({ page }) => {
    await fixture(page);
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    const dialog = openDialogLocator(page);
    expect(await dialog.count()).toBe(1);
    const observation = await observeOpenDialog(dialog);
    expect(observation.type).toBe("native");
    expect(observation.modal).toBe(true);
    expect(observation.labelled).toBe(true);
    expect(observation.descriptionRefsValid).toBe(true);
    expect(observation.focusContained).toBe(true);
  });

  test("native modal Escape closes and restores focus", async ({ page }) => {
    await fixture(page);
    await wireNativeDialog(page);
    const result = await inspectDialogEscape(page, page.locator("#opener"));
    expect(result.problems).toEqual([]);
    expect(result.closed).toBe(true);
    expect(result.returnedFocus).toBe(true);
    expect(result.outsideTabStops).toEqual([]);
  });

  test("Escape sampling rejects invalid bounds", async ({ page }) => {
    await fixture(page);
    await wireNativeDialog(page);
    await expect(inspectDialogEscape(page, page.locator("#opener"), 0)).rejects.toThrow(RangeError);
    await expect(inspectDialogEscape(page, page.locator("#opener"), 41)).rejects.toThrow(RangeError);
  });

  test("an unnamed open dialog fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#editor").evaluate((node) => node.removeAttribute("aria-labelledby"));
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    const findings = await inspectDialogMarkup(page);
    expect(findings.map((item) => item.code)).toContain("dialog-name");
  });

  test("a broken dialog label reference fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#editor").evaluate((node) => node.setAttribute("aria-labelledby", "missing"));
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    expect((await inspectDialogMarkup(page)).map((item) => item.code))
      .toContain("dialog-label-reference");
  });

  test("a broken dialog description reference fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#editor").evaluate((node) => node.setAttribute("aria-describedby", "missing"));
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    expect((await inspectDialogMarkup(page)).map((item) => item.code))
      .toContain("dialog-description-reference");
  });

  test("an invalid aria-modal value fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#editor").evaluate((node) => node.setAttribute("aria-modal", "sometimes"));
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    expect((await inspectDialogMarkup(page)).map((item) => item.code))
      .toContain("dialog-modal-value");
  });

  test("aria-hidden open dialog is reported", async ({ page }) => {
    await fixture(page);
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    await page.locator("#editor").evaluate((node) => node.setAttribute("aria-hidden", "true"));
    expect((await inspectDialogMarkup(page)).map((item) => item.code))
      .toContain("dialog-hidden-ancestor");
  });

  test("opener without a name fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#opener").evaluate((node) => { node.textContent = ""; });
    expect((await inspectDialogTriggers(page)).map((item) => item.code))
      .toContain("dialog-opener-name");
  });

  test("an opener without native semantics or tabindex fails", async ({ page }) => {
    await fixture(page, `<main><div aria-haspopup="dialog">Open</div></main>`);
    expect((await inspectDialogTriggers(page)).map((item) => item.code))
      .toContain("dialog-opener-keyboard");
  });

  test("opener with positive tabindex fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#opener").evaluate((node) => node.setAttribute("tabindex", "3"));
    expect((await inspectDialogTriggers(page)).map((item) => item.code))
      .toContain("dialog-opener-tabindex");
  });

  test("opener with invalid aria-expanded fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#opener").evaluate((node) => node.setAttribute("aria-expanded", "open"));
    expect((await inspectDialogTriggers(page)).map((item) => item.code))
      .toContain("dialog-opener-expanded");
  });

  test("opener referencing a missing controlled dialog fails", async ({ page }) => {
    await fixture(page);
    await page.locator("#opener").evaluate((node) => node.setAttribute("aria-controls", "absent"));
    expect((await inspectDialogTriggers(page)).map((item) => item.code))
      .toContain("dialog-opener-controls");
  });

  test("missing open dialog is reported by nested Escape helper", async ({ page }) => {
    await fixture(page);
    const findings = await inspectTopDialogEscape(page);
    expect(findings.map((item) => item.code)).toContain("no-open-dialog");
  });

  test("top dialog closes when Escape is pressed", async ({ page }) => {
    await fixture(page);
    await wireNativeDialog(page);
    await page.locator("#opener").click();
    expect(await inspectTopDialogEscape(page)).toEqual([]);
    await expect(openDialogLocator(page)).toHaveCount(0);
  });

  test("declared modal opener is not an arbitrary action", async ({ page }) => {
    await fixture(page, `<main><button id="save">Save data</button>
      <button id="dialog" aria-haspopup="dialog">Open panel</button></main>`);
    expect(await safeDialogTriggers(page).count()).toBe(1);
    await expect(safeDialogTriggers(page)).toHaveAttribute("id", "dialog");
  });

  test("disabled dialog openers are excluded from interaction", async ({ page }) => {
    await fixture(page, `<main><button disabled aria-haspopup="dialog">Open</button></main>`);
    expect(await safeDialogTriggers(page).count()).toBe(0);
  });
});
