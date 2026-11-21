import { expect, test } from "@playwright/test";
import { routes, visit } from "./helpers";
import { assertLanguageToggle, inspectLocaleContract } from "./locale-contract-round14";

test.describe("P16 round 14 live language round-trip", () => {
  test("home language toggle is keyboard operable in both directions", async ({ page }) => {
    await visit(page, "/", "en");
    await assertLanguageToggle(page);
  });
  for (const route of routes()) {
    test(`French document language can be selected on ${route}`, async ({ page }) => {
      await visit(page, route, "en");
      const toggle = page.getByRole("button", { name: "Français" }).first();
      if (await toggle.count() === 0) test.skip(true, "No language toggle on this route");
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      expect(await inspectLocaleContract(page)).toEqual([]);
    });
  }
});
