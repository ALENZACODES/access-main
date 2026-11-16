import { expect, test } from "@playwright/test";

import { auditReducedMotion, auditTextEnlargement } from "./preferences-round4";

const documentFixture = `<!doctype html><html lang="en"><head><title>Preferences</title>
<style>
  button { min-width: 44px; min-height: 44px; }
  @keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }
  .motion { animation: pulse 2s infinite; }
  @media (prefers-reduced-motion: reduce) {
    .motion { animation: none; transition: none; }
  }
</style></head><body><main><h1>Preferences</h1>
<button id="action">Continue</button>
<div id="decoration" class="motion" data-a11y-decorative-motion>Visual indicator</div>
</main></body></html>`;

const codes = (items: readonly { code: string }[]): string[] => items.map((item) => item.code);

test.describe("P16D input preferences", () => {
  test("ordinary content survives 200% root text enlargement", async ({ page }) => {
    await page.setContent(documentFixture);
    expect(await auditTextEnlargement(page)).toEqual([]);
  });

  test("text enlargement restores original inline root size", async ({ page }) => {
    await page.setContent(documentFixture);
    await page.locator("html").evaluate((node) => { node.style.fontSize = "113%"; });
    await auditTextEnlargement(page);
    const size = await page.locator("html").evaluate((node) => node.style.fontSize);
    expect(size).toBe("113%");
  });

  test("overflow-hidden text truncation is reported", async ({ page }) => {
    await page.setContent(documentFixture);
    await page.locator("#action").evaluate((node) => {
      node.textContent = "A long control label describing an important interaction";
      node.style.cssText = "width:48px; max-width:48px; overflow:hidden; white-space:nowrap";
    });
    expect(codes(await auditTextEnlargement(page))).toContain("text-clipped-horizontally");
  });

  test("reduced motion disables opt-in decorative animations", async ({ page }) => {
    await page.setContent(documentFixture);
    expect(await auditReducedMotion(page)).toEqual([]);
  });

  test("continuous decorative animation disregarding preference fails", async ({ page }) => {
    await page.setContent(documentFixture);
    await page.locator("head").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<style>
        @media (prefers-reduced-motion: reduce) {
          #decoration { animation: pulse 2s infinite !important; }
        }
      </style>`);
    });
    expect(codes(await auditReducedMotion(page))).toContain("continuous-decorative-motion");
  });

  test("long decorative transitions disregarding preference fail", async ({ page }) => {
    await page.setContent(documentFixture);
    await page.locator("head").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<style>
        @media (prefers-reduced-motion: reduce) {
          #decoration { transition: opacity 1s !important; }
        }
      </style>`);
    });
    expect(codes(await auditReducedMotion(page))).toContain("long-decorative-transition");
  });

  test("prefers-reduced-motion is restored after audit", async ({ page }) => {
    await page.setContent(documentFixture);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await auditReducedMotion(page);
    const isReduce = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(isReduce).toBe(false);
  });
});
