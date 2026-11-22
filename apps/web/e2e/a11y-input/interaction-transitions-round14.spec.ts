import { expect, test } from "@playwright/test";
import { inspectSemanticSurface } from "./semantic-surface-round14";
import { inspectAnnouncements } from "./announcement-round14";
import { inspectGestureAlternatives } from "./gesture-alternatives-round14";

async function transitionPage(page: import("@playwright/test").Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Interaction transition</title><style>button{min-width:44px;min-height:44px}</style></head><body><main><h1>Interaction transition</h1>${markup}</main></body></html>`);
}
test.describe("P16 round 14 interaction transitions", () => {
  test("disclosure exposes expanded state after activation", async ({ page }) => {
    await transitionPage(page, `<button id="toggle" aria-expanded="false" aria-controls="panel">Show details</button><div id="panel" hidden>Details</div><script>const b=document.querySelector('#toggle'),p=document.querySelector('#panel');b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));p.hidden=!open}</script>`);
    await page.locator("#toggle").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#panel")).toBeVisible();
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("disclosure closes without losing focus", async ({ page }) => {
    await transitionPage(page, `<button id="toggle" aria-expanded="true" aria-controls="panel">Hide details</button><div id="panel">Details</div><script>const b=document.querySelector('#toggle'),p=document.querySelector('#panel');b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));p.hidden=!open}</script>`);
    await page.locator("#toggle").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#toggle")).toBeFocused();
  });
  test("button-driven progress update announces current state", async ({ page }) => {
    await transitionPage(page, `<button id="next">Next</button><p id="status" role="status" aria-live="polite">Step 1 of 2</p><script>document.querySelector('#next').onclick=()=>document.querySelector('#status').textContent='Step 2 of 2'</script>`);
    await page.locator("#next").click();
    await expect(page.locator("#status")).toHaveText("Step 2 of 2");
    expect((await inspectAnnouncements(page)).issues).toEqual([]);
  });
  test("a slider remains operable by keyboard without pointer events", async ({ page }) => {
    await transitionPage(page, `<label for="range">Level</label><input id="range" type="range" min="0" max="8" value="3">`);
    await page.locator("#range").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#range")).toHaveValue("4");
    expect((await inspectGestureAlternatives(page)).issues).toEqual([]);
  });
  test("keyboard-only control remains operable when pointer events are disabled", async ({ page }) => {
    await transitionPage(page, `<button id="action" style="pointer-events:none">Continue</button>`);
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#action")).toBeFocused();
  });
  test("status text changes do not change accessible control names", async ({ page }) => {
    await transitionPage(page, `<button id="action">Save</button><p id="status" role="status" aria-live="polite">Waiting</p>`);
    const before = (await inspectSemanticSurface(page)).controls.find(x => x.selector === "#action")?.name;
    await page.locator("#status").evaluate(node => { node.textContent = "Saved"; });
    const after = (await inspectSemanticSurface(page)).controls.find(x => x.selector === "#action")?.name;
    expect(after).toBe(before);
  });
  test("French status copy can update while language remains French", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>État</title></head><body><main><h1>État</h1><p id="status" role="status" aria-live="polite">En attente</p></main></body></html>`);
    await page.locator("#status").evaluate(node => { node.textContent = "Enregistré"; });
    await expect(page.locator("#status")).toHaveText("Enregistré");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});
