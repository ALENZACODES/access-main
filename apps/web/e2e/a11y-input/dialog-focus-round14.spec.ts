import { expect, test } from "@playwright/test";
import { assertDialogFocus, exerciseEscapeAndRestore, inspectDialogFocus } from "./dialog-focus-round14";

async function fixture(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Dialog fixture</title><style>button{min-width:44px;min-height:44px}</style></head><body><main><h1>Dialog fixture</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 dialog focus", () => {
  test("closed dialog is not treated as open", async ({ page }) => {
    await fixture(page, `<dialog id="dialog" aria-label="Settings"><button>Close</button></dialog>`);
    expect((await inspectDialogFocus(page)).issues).toEqual([]);
  });
  test("open named native dialog is accepted when focused inside", async ({ page }) => {
    await fixture(page, `<dialog id="dialog" open aria-label="Settings"><button id="inside">Close</button></dialog>`);
    await page.locator("#dialog").evaluate(node => (node as HTMLDialogElement).showModal());
    await page.locator("#dialog").evaluate(node => (node as HTMLDialogElement).showModal());
    await page.locator("#inside").focus();
    expect((await inspectDialogFocus(page)).issues).toEqual([]);
  });
  test("open unnamed dialog is rejected", async ({ page }) => {
    await fixture(page, `<dialog><button>Close</button></dialog>`);
    await page.locator("dialog").evaluate(node => (node as HTMLDialogElement).showModal());
    await page.locator("dialog button").focus();
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-name-empty");
  });
  test("open dialog with focus outside is rejected", async ({ page }) => {
    await fixture(page, `<button id="outside">Outside</button><dialog open aria-label="Settings"><button>Inside</button></dialog>`);
    await page.locator("#outside").focus();
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-focus-outside");
  });
  test("role dialog without modal state is rejected", async ({ page }) => {
    await fixture(page, `<div role="dialog" aria-label="Settings" style="display:block">Dialog</div>`);
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-not-modal");
  });
  test("named modal role dialog is accepted", async ({ page }) => {
    await fixture(page, `<div role="dialog" aria-label="Settings" aria-modal="true" style="display:block"><button>Close</button></div>`);
    await page.locator("[role='dialog'] button").focus();
    expect((await inspectDialogFocus(page)).issues).toEqual([]);
  });
  test("trigger must reference an existing dialog", async ({ page }) => {
    await fixture(page, `<button aria-haspopup="dialog" aria-controls="missing">Open</button>`);
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-trigger-target");
  });
  test("native dialog Escape restores focus to trigger", async ({ page }) => {
    await fixture(page, `<button id="open" aria-haspopup="dialog" aria-controls="settings">Open settings</button>
      <dialog id="settings" aria-label="Settings"><button>Close</button></dialog>
      <script>document.querySelector('#open').addEventListener('click',()=>document.querySelector('#settings').showModal())</script>`);
    await exerciseEscapeAndRestore(page, page.locator("#open"));
  });
  test("dialog trigger needs accessible name", async ({ page }) => {
    await fixture(page, `<button aria-haspopup="dialog" aria-controls="dialog"></button><dialog id="dialog" aria-label="Notice"></dialog>`);
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-trigger-name");
  });
  test("dialog surface assertion passes with no dialogs", async ({ page }) => {
    await fixture(page, `<p>No dialog is open.</p>`);
    await assertDialogFocus(page);
  });
});
