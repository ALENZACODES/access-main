import { expect, test, type Page } from "@playwright/test";
import { probeCurrentFocus } from "./focus-surface-round10";
import { auditNameRelations } from "./name-relations-round10";
import { auditFeedback } from "./feedback-round10";

async function fixture(page: Page, markup: string, script = ""): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Focus transitions</title>
    <style>body{font:18px sans-serif}button,a,input{min-width:44px;min-height:44px}
    :focus-visible{outline:3px solid #69390f;outline-offset:3px}</style>
    </head><body><main><h1>Focus transitions</h1>${markup}</main>
    <script>${script}</script></body></html>`);
}

test.describe("P16 round 10: focus movement and state", () => {
  test("Tab moves through three controls without activating them", async ({ page }) => {
    await fixture(page, `<button id="first">First</button><button id="second">Second</button>
      <button id="third">Third</button>`);
    for (const id of ["first", "second", "third"]) {
      await page.keyboard.press("Tab");
      await expect(page.locator(`#${id}`)).toBeFocused();
    }
  });

  test("Shift+Tab walks the three controls in reverse", async ({ page }) => {
    await fixture(page, `<button id="first">First</button><button id="second">Second</button>
      <button id="third">Third</button>`);
    await page.locator("#third").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#second")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#first")).toBeFocused();
  });

  test("Enter activates the currently focused native button", async ({ page }) => {
    await fixture(page, `<button id="action">Continue</button><output id="count">0</output>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('count').textContent = '1';
      });`);
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#count")).toHaveText("1");
  });

  test("Space activates the currently focused native button", async ({ page }) => {
    await fixture(page, `<button id="action">Continue</button><output id="count">0</output>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('count').textContent = '1';
      });`);
    await page.locator("#action").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#count")).toHaveText("1");
  });

  test("Space toggles a labelled checkbox", async ({ page }) => {
    await fixture(page, `<label><input id="choice" type="checkbox"> Choose</label>`);
    await page.locator("#choice").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#choice")).toBeChecked();
    await page.keyboard.press("Space");
    await expect(page.locator("#choice")).not.toBeChecked();
  });

  test("keyboard focus appearance remains present after reverse traversal", async ({ page }) => {
    await fixture(page, `<button id="first">First</button><button id="second">Second</button>`);
    await page.locator("#second").focus();
    await page.keyboard.press("Shift+Tab");
    const result = await probeCurrentFocus(page);
    expect(result?.id).toBe("first");
    expect(result?.focusVisible).toBe(true);
  });

  test("focus does not cause a button click", async ({ page }) => {
    await fixture(page, `<button id="action">Continue</button><output id="count">0</output>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('count').textContent = '1';
      });`);
    await page.locator("#action").focus();
    await expect(page.locator("#count")).toHaveText("0");
  });

  test("a dynamic announcement does not erase the focused button", async ({ page }) => {
    await fixture(page, `<button id="action">Continue</button><p id="status" role="status">Waiting</p>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('status').textContent = 'Ready';
      });`);
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#action")).toBeFocused();
    await expect(page.locator("#status")).toHaveText("Ready");
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("an invalid name remains detectable after keyboard activation", async ({ page }) => {
    await fixture(page, `<button id="action" aria-label="Open"></button>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('action').removeAttribute('aria-label');
      });`);
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    expect((await auditNameRelations(page)).issues.map((issue) => issue.code)).toContain("unnamed-button");
  });

  test("disabled native button cannot be activated by Enter", async ({ page }) => {
    await fixture(page, `<button id="before">Before</button><button id="action" disabled>Unavailable</button>
      <button id="after">After</button><output id="count">0</output>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('count').textContent = '1';
      });`);
    await page.locator("#before").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#after")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#count")).toHaveText("0");
  });

  test("a language-neutral status role is preserved after a keyboard action", async ({ page }) => {
    await fixture(page, `<button id="action">Afficher</button><p id="status" role="status">UNKNOWN</p>`,
      `document.getElementById('action').addEventListener('click', () => {
        document.getElementById('status').textContent = 'Aucune donnée';
      });`);
    await page.locator("html").evaluate((element) => element.setAttribute("lang", "fr"));
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#status")).toHaveAttribute("role", "status");
    expect((await auditFeedback(page)).issues).toEqual([]);
  });
});
