import { expect, test } from "@playwright/test";
import { exerciseEscapeAndRestore, inspectDialogFocus } from "./dialog-focus-round14";

async function dialogPage(page: import("@playwright/test").Page, html: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Dialog cycle</title></head><body><main><h1>Dialog cycle</h1>${html}</main></body></html>`);
}
test.describe("P16 round 14 dialog focus cycles", () => {
  test("native modal opens and focuses its first control", async ({ page }) => {
    await dialogPage(page, `<button id="open">Open</button><dialog id="dialog" aria-label="Preferences"><button id="first">First</button><button id="last">Last</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    await expect(page.locator("#dialog")).toBeVisible();
    expect(await page.locator("#dialog").evaluate(node => node.contains(document.activeElement))).toBe(true);
  });
  test("native modal blocks focus from background controls", async ({ page }) => {
    await dialogPage(page, `<button id="open">Open</button><button id="background">Background</button><dialog id="dialog" aria-label="Preferences"><button id="inside">Inside</button><button id="last">Last</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    await page.locator("#last").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#inside")).toBeFocused();
    expect(await page.locator("#dialog").evaluate(node => node.contains(document.activeElement))).toBe(true);
  });
  test("Escape restores focus to the invoking button", async ({ page }) => {
    await dialogPage(page, `<button id="open" aria-haspopup="dialog" aria-controls="dialog">Open preferences</button><dialog id="dialog" aria-label="Preferences"><button>Close</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await exerciseEscapeAndRestore(page, page.locator("#open"));
  });
  test("two simultaneous native modal dialogs are not silently accepted", async ({ page }) => {
    await dialogPage(page, `<dialog id="one" aria-label="One"><button>One</button></dialog><dialog id="two" aria-label="Two"><button>Two</button></dialog>`);
    await page.locator("#one").evaluate(node => (node as HTMLDialogElement).showModal());
    await page.locator("#two").evaluate(node => (node as HTMLDialogElement).showModal());
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-multiple-open");
  });
  test("trigger with missing aria-controls is reported", async ({ page }) => {
    await dialogPage(page, `<button aria-haspopup="dialog">Open</button>`);
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-trigger-target");
  });
  test("trigger with aria-label is accepted", async ({ page }) => {
    await dialogPage(page, `<button aria-label="Open preferences" aria-haspopup="dialog" aria-controls="dialog"></button><dialog id="dialog" aria-label="Preferences"></dialog>`);
    expect((await inspectDialogFocus(page)).issues).toEqual([]);
  });
});
