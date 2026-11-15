import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

interface AxeResult {
  violations: Array<{ id: string; help: string; nodes: Array<{ target: unknown }> }>;
}

async function axeViolations(page: Page): Promise<AxeResult["violations"]> {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(() =>
    (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<AxeResult> } }).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    }),
  );
  return results.violations;
}

const LOCALES = [
  { code: "en", grant: /^Grant/, status: /Granted on/, heading: "Your privacy choices" },
  { code: "fr", grant: /^Accepter/, status: /Accordé le/, heading: "Vos choix en matière de vie privée" },
] as const;
const WIDTHS = [1280, 320] as const;

for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    test(`axe: 0 violations, ${locale.code} at ${width}px, before and after a grant`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?lang=${locale.code}`);
      await expect(page.getByRole("heading", { level: 1, name: locale.heading })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      await page.getByRole("button", { name: locale.grant }).first().click();
      await expect(page.getByText(locale.status).first()).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("buttons are at least 44 by 44 CSS px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/?lang=en");
  const boxes = await page.getByRole("button").evaluateAll((els) =>
    els.map((el) => {
      const { width, height } = el.getBoundingClientRect();
      return { width, height };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("default is not granted, the full text is visible first, and grant then revoke persist on the device", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.getByText("Not granted. No choice recorded yet.")).toHaveCount(3);
  await expect(page.getByText(/saves your display settings, route preferences/)).toBeVisible();
  await expect(page.getByText("has not been decided yet")).toBeVisible();

  await page.getByRole("button", { name: /^Grant — Keep my preferences/ }).click();
  await expect(page.getByText(/Granted on/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Granted on/)).toBeVisible();

  await page.getByRole("button", { name: /^Revoke — Keep my preferences/ }).click();
  await expect(page.getByText(/Revoked on/)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^Revoked: Keep my preferences/ })).toHaveCount(1);
});

test("French copy is shown and the page language follows it", async ({ page }) => {
  await page.goto("/?lang=fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText("pas encore déterminé")).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("no network request leaves the page's own origin", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4179" && url.protocol.startsWith("http")) foreign.push(request.url());
  });
  await page.goto("/?lang=en");
  await page.getByRole("button", { name: /^Grant/ }).first().click();
  await expect(page.getByText(/Granted on/)).toBeVisible();
  expect(foreign).toEqual([]);
});
