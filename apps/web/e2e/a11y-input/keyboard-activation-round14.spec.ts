import { expect, test } from "@playwright/test";
import { traceTabOrder } from "./focus-lifecycle-round14";

async function activationPage(page: import("@playwright/test").Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Keyboard activation</title><style>button,a,input{min-width:44px;min-height:44px}:focus-visible{outline:3px solid #123}</style></head><body><main><h1>Keyboard activation</h1>${markup}</main></body></html>`);
}
test.describe("P16 round 14 keyboard activation", () => {
  test("native button activates with Enter", async ({ page }) => {
    await activationPage(page, `<button id="action">Run</button><output id="count">0</output><script>let n=0;document.querySelector('#action').onclick=()=>document.querySelector('#count').textContent=String(++n)</script>`);
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#count")).toHaveText("1");
  });
  test("native button activates with Space", async ({ page }) => {
    await activationPage(page, `<button id="action">Run</button><output id="count">0</output><script>let n=0;document.querySelector('#action').onclick=()=>document.querySelector('#count').textContent=String(++n)</script>`);
    await page.locator("#action").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#count")).toHaveText("1");
  });
  test("native link activates with Enter", async ({ page }) => {
    await activationPage(page, `<a id="link" href="#destination">Destination</a><p id="destination">Reached</p>`);
    await page.locator("#link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#destination$/);
  });
  test("native link Space scrolls instead of activating", async ({ page }) => {
    await activationPage(page, `<a id="link" href="#destination">Destination</a><div style="height:1400px"></div><p id="destination">Reached</p>`);
    await page.locator("#link").focus();
    await page.keyboard.press("Space");
    await expect(page).not.toHaveURL(/#destination$/);
  });
  test("checkbox toggles with Space", async ({ page }) => {
    await activationPage(page, `<label><input id="check" type="checkbox">Agree</label>`);
    await page.locator("#check").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#check")).toBeChecked();
  });
  test("checkbox does not toggle with Enter", async ({ page }) => {
    await activationPage(page, `<label><input id="check" type="checkbox">Agree</label>`);
    await page.locator("#check").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#check")).not.toBeChecked();
  });
  test("radio group responds to ArrowRight", async ({ page }) => {
    await activationPage(page, `<fieldset><legend>Mode</legend><label><input type="radio" name="mode" value="one" checked>One</label><label><input type="radio" name="mode" value="two">Two</label></fieldset>`);
    await page.locator("input").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("input").nth(1)).toBeChecked();
  });
  test("radio group responds to ArrowDown", async ({ page }) => {
    await activationPage(page, `<fieldset><legend>Mode</legend><label><input type="radio" name="mode" value="one" checked>One</label><label><input type="radio" name="mode" value="two">Two</label></fieldset>`);
    await page.locator("input").first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("input").nth(1)).toBeChecked();
  });
  test("native range responds to ArrowRight", async ({ page }) => {
    await activationPage(page, `<label for="range">Level</label><input id="range" type="range" min="0" max="5" value="2">`);
    await page.locator("#range").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#range")).toHaveValue("3");
  });
  test("native range responds to Home and End", async ({ page }) => {
    await activationPage(page, `<label for="range">Level</label><input id="range" type="range" min="0" max="5" value="2">`);
    await page.locator("#range").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#range")).toHaveValue("5");
    await page.keyboard.press("Home");
    await expect(page.locator("#range")).toHaveValue("0");
  });
  test("select supports first-letter selection", async ({ page }) => {
    await activationPage(page, `<label for="choice">Choice</label><select id="choice"><option>Apple</option><option>Banana</option></select>`);
    await page.locator("#choice").focus();
    await page.keyboard.press("b");
    await expect(page.locator("#choice")).toHaveValue("Banana");
  });
  test("Tab traversal includes labelled controls in source order", async ({ page }) => {
    await activationPage(page, `<label for="first">First</label><input id="first"><button id="second">Second</button><a id="third" href="#end">Third</a><p id="end">End</p>`);
    const result = await traceTabOrder(page, 12);
    expect(result.items.map(x => x.selector)).toEqual(expect.arrayContaining(["#first", "#second", "#third"]));
  });
});
