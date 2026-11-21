import { expect, test } from "@playwright/test";
import { inspectDialogFocus } from "./dialog-focus-round14";
import { inspectSemanticSurface } from "./semantic-surface-round14";

async function dialogFixture(page: import("@playwright/test").Page, content: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Modal focus checks</title><style>
  button{min-width:44px;min-height:44px}:focus-visible{outline:3px solid #123}
  </style></head><body><main><h1>Modal focus checks</h1>${content}</main></body></html>`);
}
test.describe("P16 round 14 modal focus containment", () => {
  test("showModal moves focus into the dialog", async ({ page }) => {
    await dialogFixture(page, `<button id="open">Open</button><dialog id="dialog" aria-label="Preferences"><button id="first">First</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    expect(await page.locator("#dialog").evaluate(node => node.contains(document.activeElement))).toBe(true);
  });
  test("Escape closes modal and browser restores focus", async ({ page }) => {
    await dialogFixture(page, `<button id="open">Open</button><dialog id="dialog" aria-label="Preferences"><button>Close</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#dialog")).toBeHidden();
    await expect(page.locator("#open")).toBeFocused();
  });
  test("Tab from final dialog control remains within modal", async ({ page }) => {
    await dialogFixture(page, `<button id="open">Open</button><button id="background">Background</button><dialog id="dialog" aria-label="Preferences"><button id="first">First</button><button id="last">Last</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    await page.locator("#last").focus();
    await page.keyboard.press("Tab");
    expect(await page.locator("#dialog").evaluate(node => node.contains(document.activeElement))).toBe(true);
  });
  test("Shift Tab from first dialog control remains within modal", async ({ page }) => {
    await dialogFixture(page, `<button id="open">Open</button><dialog id="dialog" aria-label="Preferences"><button id="first">First</button><button id="last">Last</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    await page.locator("#first").focus();
    await page.keyboard.press("Shift+Tab");
    expect(await page.locator("#dialog").evaluate(node => node.contains(document.activeElement))).toBe(true);
  });
  test("dialog heading can name dialog through aria-labelledby", async ({ page }) => {
    await dialogFixture(page, `<dialog id="dialog" open aria-labelledby="title"><h2 id="title">Preferences</h2><button>Close</button></dialog>`);
    await page.locator("dialog button").focus();
    expect((await inspectDialogFocus(page)).issues).toEqual([]);
  });
  test("dialog name does not rely on hidden heading", async ({ page }) => {
    await dialogFixture(page, `<dialog id="dialog" open aria-labelledby="title"><h2 id="title" hidden>Preferences</h2><button>Close</button></dialog>`);
    await page.locator("dialog button").focus();
    expect((await inspectDialogFocus(page)).issues.map(x => x.code)).toContain("dialog-name-empty");
  });
  test("dialog trigger focus remains on opener before activation", async ({ page }) => {
    await dialogFixture(page, `<button id="open" aria-haspopup="dialog" aria-controls="dialog">Open</button><dialog id="dialog" aria-label="Preferences"></dialog>`);
    await page.locator("#open").focus();
    await expect(page.locator("#open")).toBeFocused();
    expect((await inspectDialogFocus(page)).issues).toEqual([]);
  });
  test("dialog open state is reflected by the native element", async ({ page }) => {
    await dialogFixture(page, `<dialog id="dialog" open aria-label="Notice"><p>Notice</p></dialog>`);
    await expect(page.locator("#dialog")).toBeVisible();
    expect(await page.locator("#dialog").evaluate(node => (node as HTMLDialogElement).open)).toBe(true);
  });
  test("closing dialog does not leave focus inside detached content", async ({ page }) => {
    await dialogFixture(page, `<button id="open">Open</button><dialog id="dialog" aria-label="Preferences"><button id="inside">Inside</button></dialog><script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`);
    await page.locator("#open").click();
    await page.locator("#dialog").evaluate(node => (node as HTMLDialogElement).close());
    await expect(page.locator("#open")).toBeFocused();
  });
  test("modal focus and document semantics remain separate", async ({ page }) => {
    await dialogFixture(page, `<button id="open">Open</button><dialog id="dialog" open aria-label="Preferences"><button id="inside">Inside</button></dialog>`);
    await page.locator("#inside").focus();
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
});
