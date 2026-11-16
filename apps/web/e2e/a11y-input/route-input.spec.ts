import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { chooseLanguage, LANGUAGES, routes, sequentialSelector, VIEWPORTS, visit } from "./helpers";

/**
 * Keyboard, switch and screen-reader structure on every live route, in
 * English and French, at 320 and 1280 CSS pixels. These checks find some
 * failures; they do not prove WCAG 2.2 AA. Manual screen-reader, switch and
 * keyboard testing still follows.
 */

const TARGET_MIN_PX = 44;

function tidy(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "")
    .toLocaleLowerCase();
}

/** Visible controls, marked with data-input-idx, with their visible label and target box. */
async function controls(page: Page) {
  return page.evaluate(() => {
    const selector = "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='link'], [role='switch']";
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden='true']");
      })
      .map((el, index) => {
        el.dataset.inputIdx = String(index);
        const tag = el.tagName.toLowerCase();
        const field = el as HTMLInputElement;
        let label = "";
        if (tag === "a" || tag === "button" || tag === "summary") label = el.innerText;
        else if (tag === "input" || tag === "select" || tag === "textarea") {
          const own = field.labels?.[0];
          if (own) {
            // The visible label is the label text without the control's own content (select options, typed value).
            const copy = own.cloneNode(true) as HTMLElement;
            copy.querySelectorAll("select, textarea, input").forEach((node) => node.remove());
            copy.style.position = "absolute";
            copy.style.left = "-9999px";
            document.body.appendChild(copy);
            label = copy.innerText;
            copy.remove();
          }
        }
        // A wrapping label is part of the target (React Aria radios and checkboxes).
        const wrapping = field.labels ? Array.from(field.labels).find((item) => item.contains(el)) : undefined;
        const box = (wrapping ?? el).getBoundingClientRect();
        const parentText = (el.parentElement?.innerText ?? "").replace(/\s+/g, " ").trim();
        const ownText = (el.innerText ?? "").replace(/\s+/g, " ").trim();
        return {
          index,
          tag,
          disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
          label: label.replace(/\s+/g, " ").trim(),
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
          // A link inside a sentence is exempt from the target size (WCAG 2.5.8 inline exception).
          inline: tag === "a" && getComputedStyle(el).display === "inline" && parentText.length > ownText.length + 10,
        };
      });
  });
}

/** Accessible names from Chrome's accessibility tree, in control order. */
async function accessibleNames(page: Page, count: number): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const out: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-input-idx="${index}"]` });
    if (!nodeId) {
      out.push("");
      continue;
    }
    const tree = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    const node = tree.nodes.find((item) => !item.ignored) ?? tree.nodes[0];
    out.push(String(node?.name?.value ?? ""));
  }
  await cdp.detach();
  return out;
}

async function activates(page: Page, key: "Enter" | "Space"): Promise<boolean | null> {
  const button = page.locator("main button:not([disabled]):not([aria-disabled='true'])").first();
  if ((await button.count()) === 0 || !(await button.isVisible())) return null;
  await button.focus();
  await expect(button).toBeFocused();
  // Any effect counts: a native click, a form submit, a navigation, a print request, or a DOM change other than
  // focus and press styling. React Aria buttons fire onPress without a native click event.
  // Recorded on window, so a re-render that replaces the button does not lose it.
  await button.evaluate((element) => {
    const win = window as unknown as { inputProbe?: number };
    win.inputProbe = 0;
    const hit = () => { win.inputProbe = 1; };
    const styling = /^data-(focus|focused|focus-visible|hovered|pressed)$/;
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type !== "attributes" || !styling.test(record.attributeName ?? ""))) hit();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    element.addEventListener("click", hit, { once: true, capture: true });
    document.addEventListener("submit", hit, { once: true, capture: true });
    window.addEventListener("popstate", hit, { once: true });
    const { pushState } = history;
    window.print = hit; // The print dialog would block a headless run.
    history.pushState = function (...args: Parameters<History["pushState"]>) { hit(); return pushState.apply(this, args); };
  });
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
  return page.evaluate(() => (window as unknown as { inputProbe?: number }).inputProbe === 1).catch(() => true);
}

const ROUTES = routes();

test("route list covers the live shell", () => {
  if (process.env.A11Y_ROUTES) test.skip(true, "A11Y_ROUTES narrows this run");
  for (const route of ["/", "/map", "/more", "/settings", "/build-card", "/offline", "/journey", "/finders", "/navigator", "/games", "/help", "/data-status", "/places"]) {
    expect(ROUTES, route).toContain(route);
  }
  expect(ROUTES.filter((route) => route.startsWith("/settings/")).length).toBeGreaterThan(0);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${language} at ${viewport.name}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of ROUTES) {
        test(`input and structure on ${route}`, async ({ page }) => {
          test.setTimeout(90_000);
          await chooseLanguage(page, language);
          await visit(page, route, language);

          // Document language, one main landmark, one named h1 and a page title.
          await expect(page.getByRole("main")).toHaveCount(1);
          expect((await page.getByRole("heading", { level: 1 }).innerText()).trim()).not.toBe("");
          expect((await page.title()).trim()).not.toBe("");

          // Unique ids and image alternatives.
          const structure = await page.evaluate(() => {
            const errors: string[] = [];
            const ids = new Set<string>();
            for (const element of document.querySelectorAll<HTMLElement>("[id]")) {
              if (ids.has(element.id)) errors.push(`Duplicate id: ${element.id}`);
              ids.add(element.id);
            }
            for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
              const decorative = image.getAttribute("aria-hidden") === "true" || image.getAttribute("role") === "presentation" || image.getAttribute("role") === "none";
              if (!decorative && !image.hasAttribute("alt")) errors.push(`Image missing alt: ${image.src.slice(0, 60)}`);
            }
            return errors;
          });
          expect(structure, "Structure").toEqual([]);

          // Names, label-in-name (WCAG 2.5.3) and 44 by 44 CSS pixel targets.
          const found = await controls(page);
          const names = await accessibleNames(page, found.length);
          const unnamed: string[] = [];
          const labelNotInName: string[] = [];
          const undersized: string[] = [];
          for (const item of found) {
            const name = names[item.index] ?? "";
            const what = `${item.tag} "${(item.label || name).slice(0, 60)}"`;
            if (!name.trim()) unnamed.push(what);
            if (item.label && name && !tidy(name).includes(tidy(item.label))) labelNotInName.push(`${what} is named "${name}"`);
            if (!item.disabled && !item.inline && (item.width < TARGET_MIN_PX || item.height < TARGET_MIN_PX)) {
              undersized.push(`${what} ${item.width}x${item.height}`);
            }
          }
          expect(unnamed, "Unnamed controls").toEqual([]);
          expect(labelNotInName, "Visible label not in accessible name").toEqual([]);
          expect(undersized, "Targets under 44 by 44 CSS pixels").toEqual([]);

          // axe, WCAG 2.2 AA rule set.
          const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(" ")}`), "axe").toEqual([]);

          // Forward and reverse sequential keyboard navigation.
          expect(await page.locator(sequentialSelector).count()).toBeGreaterThan(0);
          await page.keyboard.press("Tab");
          const first = await page.evaluate(() => {
            const node = document.activeElement;
            if (!(node instanceof HTMLElement) || node === document.body) return "";
            node.dataset.inputFocusProbe = "first";
            return node.innerText.trim();
          });
          expect(first, "First Tab stop").toMatch(/^(Skip to main content|Aller au contenu principal)$/);
          await page.keyboard.press("Tab");
          expect(await page.evaluate(() => document.activeElement?.getAttribute("data-input-focus-probe") === "first"), "Tab must advance focus").toBe(false);
          await page.keyboard.press("Shift+Tab");
          expect(await page.evaluate(() => document.activeElement?.getAttribute("data-input-focus-probe") === "first"), "Shift+Tab must return").toBe(true);

          // Switch-style single activation: the first enabled button in main answers Enter, then Space.
          const enter = await activates(page, "Enter");
          if (enter !== null) {
            expect(enter, "Enter activates the button").toBe(true);
            await visit(page, route, language);
            expect(await activates(page, "Space"), "Space activates the button").not.toBe(false);
          }
        });
      }
    });
  }
}
