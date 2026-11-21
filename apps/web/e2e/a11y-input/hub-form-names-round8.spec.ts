import { expect, test } from "@playwright/test";
import { visit } from "./helpers";

// The embedded pages contain forms from optional tool packages. They can
// render after the shell. All form landmarks must remain distinguishable;
// accessible names are checked without reading or submitting form values.
for (const route of ["/more/employment", "/more/auditors"] as const) {
  test(`embedded forms have names in English on ${route}`, async ({ page }) => {
    await visit(page, route, "en");
    const forms = page.locator(".hub-tool form");
    await expect(forms.first()).toBeVisible();
    const unnamed = await forms.evaluateAll((nodes) => nodes.filter((node) => {
      const form = node as HTMLFormElement;
      return !form.getAttribute("aria-label")?.trim() &&
        !form.getAttribute("aria-labelledby")?.trim() &&
        !form.getAttribute("title")?.trim();
    }).length);
    expect(unnamed).toBe(0);
  });

  test(`embedded forms retain names after French switch on ${route}`, async ({ page }) => {
    await visit(page, route, "en");
    await expect(page.locator(".hub-tool form").first()).toBeVisible();
    await page.getByRole("button", { name: "Français" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect.poll(async () => page.locator(".hub-tool form").evaluateAll((nodes) =>
      nodes.filter((node) => !node.getAttribute("aria-label")?.trim() &&
        !node.getAttribute("aria-labelledby")?.trim() &&
        !node.getAttribute("title")?.trim()).length,
    )).toBe(0);
  });
}
