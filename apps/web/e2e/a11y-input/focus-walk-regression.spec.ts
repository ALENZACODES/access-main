import { expect, test } from "@playwright/test";

import {
  assertWalk,
  inspectTargetSizes,
  walkSequentialFocus,
} from "./navigation-audit";

// Exercise the actual browser Tab algorithm, including its interaction with
// browser chrome. These fixtures are independent of the application's routes.
test.describe("Sequential focus walk regression", () => {
  test("a three-control cycle reverses exactly, without resetting focus", async ({ page }) => {
    await page.setContent(`
      <main>
        <a id="one" href="#one">One</a>
        <button id="two" type="button">Two</button>
        <input id="three" aria-label="Three" />
      </main>
    `);
    const walk = await walkSequentialFocus(page, 20);
    assertWalk(walk);
    expect(walk.forward.map((item) => item.selector)).toEqual([
      "#one", "#two", "#three",
    ]);
    expect(walk.backwards.map((item) => item.selector)).toEqual([
      "#two", "#one",
    ]);
  });

  test("single focus target does not disappear after Tab wraps", async ({ page }) => {
    await page.setContent('<main><button id="only">Only</button></main>');
    const walk = await walkSequentialFocus(page, 10);
    assertWalk(walk);
    expect(walk.forward.map((item) => item.selector)).toEqual(["#only"]);
    expect(walk.backwards).toHaveLength(0);
  });

  test("a changed reverse order remains a hard failure", async ({ page }) => {
    await page.setContent(`
      <main>
        <button id="one">One</button>
        <button id="two">Two</button>
        <button id="three">Three</button>
      </main>
      <script>
        document.querySelector('#three').addEventListener('focus', () => {
          // Focus traversal cannot be considered symmetric if a control
          // is removed from the reverse tab sequence.
          document.querySelector('#two').tabIndex = -1;
        });
      </script>
    `);
    const walk = await walkSequentialFocus(page, 20);
    expect(walk.error).not.toBeNull();
    expect(() => assertWalk(walk)).toThrow();
  });

  test("undersized controls still fail the target-size audit", async ({ page }) => {
    await page.setContent(`
      <main>
        <button id="small" style="width:22px;height:22px;padding:0">+</button>
      </main>
    `);
    expect((await inspectTargetSizes(page)).map((issue) => issue.selector))
      .toContain("#small");
  });

  test("44-by-44 controls pass the unchanged target-size audit", async ({ page }) => {
    await page.setContent(`
      <main>
        <button id="large" style="width:44px;height:44px;padding:0">+</button>
        <a id="large-link" href="#large" style="display:inline-flex;min-width:44px;min-height:44px">Go</a>
      </main>
    `);
    expect(await inspectTargetSizes(page)).toEqual([]);
  });
});
