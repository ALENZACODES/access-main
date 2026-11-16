import { expect, test, type Page } from "@playwright/test";

/**
 * Reverse Tab on /more/diary must retrace the forward Tab order. Each key press waits until focus has
 * stopped moving before it is read, and elements are identified by their position in the document, not
 * by generated ids, so the check does not depend on timing or on react-aria id numbers.
 */
const MAX_STEPS = 80;

/**
 * What the focused element is: tag, type and its label, plus how many identical ones come before it.
 * Empty when nothing but the page has focus. Generated ids and document positions are not used.
 */
async function settledFocus(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const read = () => {
          const el = document.activeElement;
          if (!el || el === document.body || el === document.documentElement) return "";
          const label = (
            el.getAttribute("aria-label") ??
            (el as HTMLInputElement).placeholder ??
            el.textContent ??
            ""
          ).replace(/\s+/g, " ").trim().slice(0, 40);
          const base = `${el.tagName.toLowerCase()}|${el.getAttribute("type") ?? ""}|${el.getAttribute("role") ?? ""}|${label}`;
          const same = Array.from(document.querySelectorAll(el.tagName)).filter((other) => {
            const text = (other.getAttribute("aria-label") ?? (other as HTMLInputElement).placeholder ?? other.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
            return `${other.tagName.toLowerCase()}|${other.getAttribute("type") ?? ""}|${other.getAttribute("role") ?? ""}|${text}` === base;
          });
          return `${base}#${same.indexOf(el)}`;
        };
        let last = read();
        let stable = 0;
        const tick = () => {
          const now = read();
          stable = now === last ? stable + 1 : 0;
          last = now;
          if (stable >= 3) resolve(now);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

async function walk(page: Page, key: "Tab" | "Shift+Tab", steps: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press(key);
    seen.push(await settledFocus(page));
  }
  return seen;
}

for (const language of ["en", "fr"] as const) {
  test(`/more/diary: reverse Tab retraces forward Tab (${language})`, async ({ page }) => {
    await page.addInitScript((lng) => {
      try {
        localStorage.setItem("access.language", lng);
      } catch {
        /* storage can be blocked */
      }
    }, language);
    const open = async () => {
      await page.goto("/more/diary");
      await expect(page.locator("h1")).toBeVisible();
      await page.waitForLoadState("networkidle");
      // The page fills in after it loads; wait until its element count stops changing.
      await page.waitForFunction(
        () =>
          new Promise<boolean>((resolve) => {
            const count = () => document.querySelectorAll("*").length;
            const first = count();
            setTimeout(() => resolve(count() === first), 600);
          }),
        undefined,
        { timeout: 15_000 },
      );
    };
    await open();

    // Forward: Tab until focus leaves the page or returns to a stop already seen.
    const forward: string[] = [];
    for (let i = 0; i < MAX_STEPS; i += 1) {
      await page.keyboard.press("Tab");
      const at = await settledFocus(page);
      if (at === "" || forward.includes(at)) break;
      forward.push(at);
    }
    expect(forward.length, "the page must have Tab stops").toBeGreaterThan(2);
    expect(forward.length, "focus must not be trapped").toBeLessThan(MAX_STEPS);

    // Reverse, on the same visit: the first Shift+Tab after leaving the last stop returns to it, and
    // each one after that lands on the stop before.
    const back = await walk(page, "Shift+Tab", forward.length);
    expect(back).toEqual([...forward].reverse());
  });
}
