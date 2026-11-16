import { expect, test } from "@playwright/test";
import { chooseLanguage, LANGUAGES, VIEWPORTS } from "./a11y-input/helpers";

/** Each of these tools initializes to English internally, regardless of props. */
const ROUTES = ["/more/housing", "/more/diary", "/more/auditors"] as const;

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`embedded first paint ${language} ${viewport.width}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of ROUTES) {
        test(`${route} exposes only the selected language`, async ({ page }) => {
          const response = await page.goto("/", { waitUntil: "domcontentloaded" });
          expect(response?.ok()).toBe(true);
          await chooseLanguage(page, language);
          // A real navigation must not expose an English tool heading on the
          // first visible frame while the shell is in French.
          await page.addInitScript(() => {
            const visibleHeadings: string[] = [];
            Object.assign(window, { embeddedVisibleHeadings: visibleHeadings });
            const record = () => {
              for (const heading of document.querySelectorAll("main main h1")) {
                const rect = heading.getBoundingClientRect();
                if (rect.width && rect.height && getComputedStyle(heading).visibility === "visible") {
                  const text = heading.textContent?.trim() ?? "";
                  if (text) visibleHeadings.push(text);
                }
              }
            };
            document.addEventListener("DOMContentLoaded", () => {
              const observer = new MutationObserver(record);
              observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
              requestAnimationFrame(record);
            }, { once: true });
          });
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("lang", language);
          await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
          const tool = page.locator("main main").first();
          await expect(tool).toBeVisible();
          const chooser = tool.locator("select").filter({ has: page.locator('option[value="fr"]') }).first();
          await expect(chooser).toHaveValue(language);
          const title = (await tool.locator("h1").first().textContent())?.trim();
          expect(title).toBeTruthy();
          const exposed = await page.evaluate(() =>
            (window as unknown as { embeddedVisibleHeadings?: string[] }).embeddedVisibleHeadings ?? []);
          expect(exposed.every((text) => text === title),
            `A different-language tool heading was exposed: ${exposed.join(" | ")}`).toBe(true);
          if (language === "fr") {
            // After selecting English, the tools must render another title.
            await chooser.selectOption("en");
            await expect(page.locator("html")).toHaveAttribute("lang", "en");
            await expect(tool.locator("h1")).not.toHaveText(title!);
          }
        });
      }
    });
  }
}
