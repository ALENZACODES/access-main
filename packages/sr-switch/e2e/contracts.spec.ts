import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

async function chooseLanguage(page: Page, lang: "en" | "fr") {
  await page.goto("/");
  if (lang === "fr") await page.locator("#language-fr").check();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

for (const lang of ["en", "fr"] as const) {
  for (const width of [1280, 320]) {
    test(`${lang} at ${width}px: semantic contracts and zero axe violations`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      await chooseLanguage(page, lang);
      const names = lang === "en"
        ? { heading: "Request form", label: "Request label", submit: "Submit request", dialog: "Confirm demonstration action" }
        : { heading: "Formulaire de demande", label: "Libellé de la demande", submit: "Envoyer la demande", dialog: "Confirmer l'action de démonstration" };
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 2, name: names.heading })).toBeVisible();
      await expect(page.getByRole("textbox", { name: names.label })).toHaveValue("");
      await expect(page.getByRole("button", { name: names.submit })).toBeVisible();
      await expect(page.getByRole("list")).toHaveCount(1);
      await expect(page.getByRole("listitem")).toHaveCount(2);
      await expect(page.getByRole("radiogroup")).toHaveCount(2);
      const headings = await page.locator("h1,h2,h3,h4,h5,h6").evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.substring(1))));
      expect(headings[0]).toBe(1);
      for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
      await page.addScriptTag({ content: axe.source });
      const results = await page.evaluate(async () => (window as Window & { axe: typeof axe }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }));
      expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
      await page.locator("#open-dialog").click();
      await expect(page.getByRole("dialog", { name: names.dialog })).toBeVisible();
      const modalResults = await page.evaluate(async () => (window as Window & { axe: typeof axe }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } }));
      expect(modalResults.violations.map((v) => v.id)).toEqual([]);
    });
  }

  test(`${lang}: skip link, errors, roles and focus recovery`, async ({ page }) => {
    await chooseLanguage(page, lang);
    await page.keyboard.press("Tab");
    const skip = page.locator("a.skip");
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
    await page.locator("#submit-request").click();
    await expect(page.locator("#request-label")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#request-error")).not.toBeEmpty();
    await expect(page.locator("#request-error")).toHaveAttribute("aria-live", "assertive");
    await page.locator("#request-label").fill("Sample");
    await page.locator("#submit-request").click();
    await expect(page.locator("main > p[role=status]")).toContainText(lang === "en" ? "submitted" : "envoyée");
    await page.locator("#open-dialog").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#cancel-dialog")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("#open-dialog")).toBeFocused();
  });
}

test("step/select scanner reaches each advertised action and cannot trap switch navigation", async ({ page }) => {
  await chooseLanguage(page, "en");
  const expected = ["language-en", "language-fr", "request-label", "submit-request", "view-summary", "view-details", "open-dialog"];
  const next = page.locator("main .scan-controls button").first();
  const select = page.locator("main .scan-controls button").nth(1);
  for (const [index, id] of expected.entries()) {
    await expect(page.locator(`#${id}`)).toHaveAttribute("data-current-scan", "true");
    await expect(page.locator(`#${id}`)).toBeInViewport();
    if (id === "request-label") {
      await select.click();
      await expect(page.locator("#request-label")).toBeFocused();
      await page.locator("#request-label").fill("Switch sample");
    } else if (id === "submit-request") {
      await select.click();
      await expect(page.locator("main > p[role=status]")).toContainText("submitted");
    } else if (id === "view-details") {
      await select.click();
      await expect(page.locator("#view-details")).toBeChecked();
    } else if (id === "language-fr") {
      await select.click();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await page.locator("#language-en").check();
      // The language control deliberately restarts scanning; advance back to this point.
      await next.click();
      await next.click();
    } else if (id === "open-dialog") {
      await select.click();
      await expect(page.getByRole("dialog")).toBeVisible();
    } else if (id !== "language-en") await select.click();
    if (index < expected.length - 1 && id !== "language-fr") await next.click();
  }
  const dialogNext = page.locator("dialog .scan-controls button").first();
  const dialogSelect = page.locator("dialog .scan-controls button").nth(1);
  await expect(page.locator("#cancel-dialog")).toHaveAttribute("data-current-scan", "true");
  await dialogNext.click();
  await expect(page.locator("#confirm-dialog")).toHaveAttribute("data-current-scan", "true");
  await dialogNext.click();
  await expect(page.locator("#cancel-dialog")).toHaveAttribute("data-current-scan", "true");
  await dialogSelect.click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.locator("#open-dialog").click();
  await dialogNext.click();
  await dialogSelect.click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("main > p[role=status]")).toContainText("confirmed");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCount(1);
});

test("scanner keyboard alternatives and 44px targets with visible focus", async ({ page }) => {
  await chooseLanguage(page, "en");
  await page.keyboard.press("n");
  await expect(page.locator("#language-fr")).toHaveAttribute("data-current-scan", "true");
  await page.keyboard.press("s");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  const metrics = await page.locator("button, input[type=radio], input[type=text], a.skip").evaluateAll((nodes) =>
    nodes.filter((node) => !node.closest("dialog") && !node.matches("a.skip")).map((node) => {
      const target = node instanceof HTMLInputElement && node.type === "radio" ? node.closest("label")! : node;
      const rect = target.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const rect of metrics) { expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44); }
  await expect(page.locator("#language-en")).toHaveCSS("outline-style", "solid");
});
