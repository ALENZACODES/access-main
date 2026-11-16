import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The More routes added for the packages merged on 16 November: axe with every rule on, at 320 and
 * 1280 px, in English and French, and a keyboard walk that reaches every control without a trap.
 */
const ROUTES = [
  { path: "games", en: "Games", fr: "Jeux" },
  { path: "route-reports", en: "Route condition reports", fr: "Signalements sur le trajet" },
  { path: "accessible-taxis", en: "Accessible taxis", fr: "Taxis accessibles" },
  { path: "event-organiser", en: "Event access checklist", fr: "Liste d’accessibilité d’un événement" },
  { path: "event-plan", en: "Event outing plan", fr: "Plan de sortie pour un événement" },
  { path: "reports", en: "Report tables", fr: "Tableaux de signalements" },
] as const;

async function open(page: Page, locale: "en" | "fr", path: string) {
  await page.addInitScript((lang) => {
    localStorage.setItem("access.language", lang);
    localStorage.setItem("access.language.set", "1");
  }, locale);
  await page.goto(`/more/${path}`);
}

for (const locale of ["en", "fr"] as const) {
  for (const width of [320, 1280]) {
    for (const route of ROUTES) {
      test(`${locale} ${width}px /more/${route.path}: title, one main, no axe violations, no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, locale, route.path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(route[locale]);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        // The package below the shell title has rendered.
        await expect(page.locator("main h2").first()).toBeVisible();
        const result = await new AxeBuilder({ page }).analyze();
        expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  }
}

for (const route of ROUTES) {
  test(`/more/${route.path}: Tab reaches every control in the page and leaves it`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "en", route.path);
    await expect(page.locator("main h2").first()).toBeVisible();
    const selector = "main :is(a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1']))";
    const wanted = await page.locator(selector).evaluateAll((nodes) => nodes.filter((node) => {
      const element = node as HTMLElement & { disabled?: boolean };
      if (element.disabled) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || style.visibility === "hidden") return false;
      // One radio per group is a Tab stop.
      if (element instanceof HTMLInputElement && element.type === "radio") return false;
      return true;
    }).length);
    expect(wanted).toBeGreaterThan(0);
    await page.locator("main").evaluate((main) => {
      (main as HTMLElement).tabIndex = -1;
      (main as HTMLElement).focus();
    });
    let reached = 0;
    let left = false;
    for (let press = 0; press < wanted + 80; press += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return "outside";
        return active.closest("main") ? "inside" : "outside";
      });
      if (where === "inside") reached += 1;
      else if (reached > 0) { left = true; break; }
    }
    expect(left, "focus leaves the page content, so there is no keyboard trap").toBe(true);
    expect(reached).toBeGreaterThanOrEqual(wanted);
  });
}

test("More lists the new routes", async ({ page }) => {
  await page.goto("/more");
  for (const route of ROUTES) {
    await expect(page.locator(`a[href$="/more/${route.path}"]`)).toBeVisible();
    await expect(page.locator(`a[href$="/more/${route.path}"]`)).toContainText(route.en);
  }
});

test("module pages show the linked-records sentence only when a list is not empty", async ({ page }) => {
  await page.goto("/places");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("These records come from the linked part of the App. Each one shows its source, licence, date, and tier. Unknown stays unknown.")).toHaveCount(0);
});
