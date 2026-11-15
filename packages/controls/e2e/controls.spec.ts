import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const LANGS = ["en", "fr"] as const;
const WIDTHS = [1280, 320] as const;
const MODES = ["keyboard", "switch", "voice", "gaze"] as const;
const WORDS = {
  en: { next: "next", choose: "choose", confirm: "confirm", unknown: "dance" },
  fr: { next: "suivant", choose: "choisir", confirm: "confirmer", unknown: "danser" },
} as const;

async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const results = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  });
}

const widget = (page: Page) => page.getByTestId("widget");

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test.describe(`${lang} at ${width}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/?lang=${lang}`);
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
      });

      test("axe: 0 violations in every mode, before and after using the widget", async ({ page }) => {
        for (const mode of MODES) {
          await page.getByTestId(`mode-${mode}`).check();
          expect(await axeViolations(page), `${mode} initial`).toEqual([]);
        }
        await page.getByRole("option").nth(1).click();
        await page.getByTestId("chooser").focus();
        expect(await axeViolations(page), "after choosing").toEqual([]);
      });

      test("page does not scroll sideways", async ({ page }) => {
        for (const mode of MODES) {
          await page.getByTestId(`mode-${mode}`).check();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, mode).toBeLessThanOrEqual(0);
        }
      });

      test("keyboard mode reaches every action", async ({ page }) => {
        await page.getByTestId("chooser").focus();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(widget(page)).toHaveAttribute("data-chosen", "b");
        await page.keyboard.press("c");
        await expect(widget(page)).toHaveAttribute("data-confirmed", "true");
        await page.keyboard.press("ArrowUp");
        await expect(widget(page)).toHaveAttribute("data-focus", "0");
        await page.keyboard.press("Escape");
        await expect(widget(page)).toHaveAttribute("data-chosen", "");
      });

      test("keyboard mode: focus is visible everywhere and never trapped", async ({ page }) => {
        const seen: number[] = [];
        let left = false;
        for (let i = 0; i < 30; i++) {
          await page.keyboard.press("Tab");
          const info = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return { index: -1, width: 0, style: "none" };
            const css = getComputedStyle(el);
            return { index: Array.from(document.querySelectorAll("*")).indexOf(el), width: parseFloat(css.outlineWidth), style: css.outlineStyle };
          });
          if (info.index === -1) {
            left = true;
            break;
          }
          expect(info.style, "outline style").not.toBe("none");
          expect(info.width, "outline width").toBeGreaterThanOrEqual(2);
          expect(seen.at(-1)).not.toBe(info.index);
          seen.push(info.index);
        }
        expect(left, "Tab leaves the page after the last control").toBe(true);
        expect(new Set(seen).size).toBeGreaterThanOrEqual(6);
      });

      test("switch mode reaches every action with 44 by 44 targets", async ({ page }) => {
        await page.getByTestId("mode-switch").check();
        for (const id of ["switch-step", "switch-select"]) {
          const box = await page.getByTestId(id).boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
        const step = page.getByTestId("switch-step");
        const select = page.getByTestId("switch-select");
        await select.click(); // next
        await step.click();
        await step.click();
        await select.click(); // choose
        await expect(widget(page)).toHaveAttribute("data-chosen", "b");
        await step.click();
        await select.click(); // confirm
        await expect(widget(page)).toHaveAttribute("data-confirmed", "true");
        await step.click();
        await select.click(); // clear
        await expect(widget(page)).toHaveAttribute("data-chosen", "");
        await step.click(); // wraps to next
        await step.click();
        await select.click(); // previous
        await expect(widget(page)).toHaveAttribute("data-focus", "0");
      });

      test("voice mode reaches every action and refuses an unknown command", async ({ page }) => {
        const words = WORDS[lang];
        await page.getByTestId("mode-voice").check();
        const send = async (text: string) => {
          await page.getByTestId("voice-input").fill(text);
          await page.getByTestId("voice-send").click();
        };
        await send(words.next);
        await send(words.choose);
        await expect(widget(page)).toHaveAttribute("data-chosen", "b");
        await send(words.unknown);
        await expect(widget(page)).toHaveAttribute("data-chosen", "b");
        await expect(page.getByTestId("announcement")).toContainText(words.unknown);
        await send(words.confirm);
        await expect(widget(page)).toHaveAttribute("data-confirmed", "true");
      });

      test("gaze simulator dwell-selects the same actions", async ({ page }) => {
        await page.getByTestId("mode-gaze").check();
        await page.getByTestId("gaze-next").hover();
        await expect(widget(page)).toHaveAttribute("data-focus", "1", { timeout: 4000 });
        await page.getByTestId("gaze-choose").hover();
        await expect(widget(page)).toHaveAttribute("data-chosen", "b", { timeout: 4000 });
        await page.getByTestId("gaze-confirm").hover();
        await expect(widget(page)).toHaveAttribute("data-confirmed", "true", { timeout: 4000 });
        await page.mouse.move(0, 0);
      });

      test("mode switcher is keyboard operable", async ({ page }) => {
        await page.getByTestId("mode-keyboard").focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId("mode-switch")).toBeChecked();
        await expect(page.getByTestId("mode-switch")).toBeFocused();
      });

      test("mode labels are at least 44 px tall", async ({ page }) => {
        for (const mode of MODES) {
          const box = await page.locator("label.mode-option", { has: page.getByTestId(`mode-${mode}`) }).boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
      });
    });
  }
}

test("reduced motion: transitions are off and the state is still shown as text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const duration = await page.getByRole("option").first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe("0s");
  await page.getByRole("option").nth(2).click();
  await expect(page.getByTestId("widget-summary")).toContainText("Option C");
  await expect(page.getByTestId("announcement")).toContainText("Option C");
});
