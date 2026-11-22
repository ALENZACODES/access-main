import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

function routePaths(): string[] {
  const router = readFileSync(new URL("../../../src/router.tsx", import.meta.url), "utf8");
  const paths = new Set(["/"]);
  for (const match of router.matchAll(/path:\s*"([^"]+)"/g)) {
    const path = match[1];
    if (!path || path === "/" || path === "*" || path.includes(":")) continue;
    paths.add(`/${path.replace(/^\//, "").replace(/\/\*$/, "")}`);
  }
  return [...paths];
}

const controls = "a[href], button, input:not([type=hidden]), select, textarea";

for (const language of ["en", "fr"] as const) {
  test.describe(`Round 15 keyboard routes in ${language}`, () => {
    test.use({ locale: `${language}-CA` });

    for (const path of routePaths()) {
      test(path, async ({ page }) => {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.ok(), `Load ${path} in ${language}`).toBe(true);
        const document = page.locator("html");
        const main = page.getByRole("main");
        await expect(document).toHaveAttribute("lang", language);

        await test.step("The page has one main landmark and one page heading", async () => {
          await expect(main).toHaveCount(1);
          await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        });

        await test.step("First Tab reaches a visible, enabled, named control", async () => {
          await page.keyboard.press("Tab");
          const focused = page.locator(":focus");
          await expect(focused).toBeVisible();
          await expect(focused).toBeEnabled();
          await expect(focused).toHaveAccessibleName(/\S/);
          expect(await focused.evaluate(node => Boolean(node.closest("[inert], [aria-hidden=true]")))).toBe(false);
        });

        await test.step("Shift Tab leaves the first control", async () => {
          const first = page.locator(controls).first();
          await first.focus();
          await expect(first).toBeFocused();
          await page.keyboard.press("Shift+Tab");
          await expect(first).not.toBeFocused();
        });

        await test.step("Focusing navigation does not activate it", async () => {
          const before = page.url();
          const link = page.locator("nav a[href]:not([aria-disabled=true])").first();
          await link.focus();
          await expect(link).toBeFocused();
          expect(page.url()).toBe(before);
        });

        await test.step("Visible controls have accessible names", async () => {
          const visible = await page.locator(controls).filter({ visible: true }).all();
          await Promise.all(visible.map(control => expect(control).toHaveAccessibleName(/\S/)));
        });

        await test.step("Visible controls stay in document tab order", async () => {
          const positive = await page.locator(`${controls}, [tabindex]`).evaluateAll(nodes =>
            nodes.filter(node => node instanceof HTMLElement && node.getClientRects().length > 0 && node.tabIndex > 0)
              .map(node => node.outerHTML.slice(0, 100)));
          expect(positive).toEqual([]);
        });

        await test.step("Escape keeps the current route", async () => {
          const before = page.url();
          await page.keyboard.press("Escape");
          expect(page.url()).toBe(before);
        });

        await test.step("Language remains declared after keyboard navigation", async () => {
          await page.keyboard.press("Tab");
          await expect(document).toHaveAttribute("lang", language);
        });
      });
    }
  });
}
