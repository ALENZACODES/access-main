import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

const WIDTHS = [1280, 320] as const;
const LANGS = ["en", "fr"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function check(page: Page, label: string) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(
    (tags) => (window as unknown as { axe: typeof axe }).axe.run(document, { runOnly: { type: "tag", values: tags } }),
    TAGS,
  );
  const found = results.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(found).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal scroll`).toBeLessThanOrEqual(0);
}

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`no axe violations: ${lang} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?lang=${lang}&store=memory`);
      await page.locator("#grants-heading").waitFor();
      await check(page, "owner, nothing shared");

      await page.locator("#caregiver-name").fill("Sam");
      await page.getByRole("radio").nth(2).check();
      await page.getByRole("checkbox").first().check();
      await page.getByRole("checkbox").nth(1).check();
      await page.locator("form button[type=submit]").click();
      await page.locator("ul.cards").waitFor();
      await check(page, "owner, one grant");

      await page.getByRole("button", { name: lang === "fr" ? /Vue de l'aidant/ : /Caregiver view/ }).click();
      await page.locator("dl").waitFor();
      await check(page, "caregiver, shared item");

      await page.getByRole("button", { name: lang === "fr" ? /Gérer le partage/ : /Manage sharing/ }).click();
      await page.locator("button.danger").click();
      await page.getByRole("button", { name: lang === "fr" ? /Vue de l'aidant/ : /Caregiver view/ }).click();
      await page.locator("[role=status]").getByText(/./).first().waitFor();
      await check(page, "caregiver, after revoke");
    });
  }
}
