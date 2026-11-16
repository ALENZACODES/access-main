import { expect, test } from "@playwright/test";

import { routes, sequentialSelector, visit } from "./helpers";

for (const route of routes()) {
  test.describe(`Accessible input on ${route}`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await visit(page, route, baseURL);
    });

    test("provides document language, a main landmark and a named heading", async ({ page }) => {
      await expect(page.locator("html[lang]")).toHaveCount(1);
      const language = await page.locator("html").getAttribute("lang");
      expect(language).toMatch(/^(en|fr)(-[A-Za-z0-9]+)*$/i);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const heading = page.getByRole("heading", { level: 1 });
      expect((await heading.innerText()).trim()).not.toBe("");
      expect((await page.title()).trim()).not.toBe("");
    });

    test("has accessible names for visible buttons, links and fields", async ({ page }) => {
      const unnamed = await page.evaluate(() => {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button, a[href], input:not([type='hidden']), select, textarea, [role='button'], [role='link'], [role='switch']",
          ),
        );
        return controls.flatMap((element, index) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") {
            return [];
          }
          const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ");
          const labels = "labels" in element
            ? Array.from((element as HTMLInputElement).labels ?? [])
                .map((label) => label.textContent ?? "")
                .join(" ")
            : "";
          const input = element as HTMLInputElement;
          const imageAlternatives = Array.from(element.querySelectorAll("img[alt]"))
            .map((image) => image.getAttribute("alt") ?? "")
            .join(" ");
          const name = [
            element.getAttribute("aria-label"),
            labelledBy,
            labels,
            element.getAttribute("title"),
            element.textContent,
            imageAlternatives,
            input.type === "submit" || input.type === "button" ? input.value : "",
          ].join(" ").trim();
          return name ? [] : [`${index}: ${element.tagName.toLowerCase()}`];
        });
      });
      expect(unnamed, "Unnamed interactive controls").toEqual([]);
    });

    test("provides image alternatives and unique identifiers", async ({ page }) => {
      const issues = await page.evaluate(() => {
        const errors: string[] = [];
        const ids = new Set<string>();
        for (const element of document.querySelectorAll<HTMLElement>("[id]")) {
          if (ids.has(element.id)) errors.push(`Duplicate id: ${element.id}`);
          ids.add(element.id);
        }
        for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
          const decorative = image.getAttribute("aria-hidden") === "true" ||
            image.getAttribute("role") === "presentation" ||
            image.getAttribute("role") === "none";
          if (!decorative && !image.hasAttribute("alt")) {
            errors.push("Image missing alt attribute");
          }
        }
        return errors;
      });
      expect(issues).toEqual([]);
    });

    test("allows forward and reverse sequential keyboard navigation", async ({ page }) => {
      const candidates = page.locator(sequentialSelector);
      expect(await candidates.count()).toBeGreaterThan(0);
      await page.keyboard.press("Tab");
      const firstFocused = await page.evaluate(() => document.activeElement !== document.body &&
        document.activeElement !== null);
      expect(firstFocused).toBe(true);

      const first = await page.evaluate(() => {
        const node = document.activeElement;
        if (!(node instanceof HTMLElement)) return "";
        node.dataset.a11yFocusProbe = "first";
        return node.tagName;
      });
      expect(first).not.toBe("");
      await page.keyboard.press("Tab");
      const secondIsFirst = await page.evaluate(() =>
        document.activeElement?.getAttribute("data-a11y-focus-probe") === "first");
      expect(secondIsFirst, "Tab must advance focus").toBe(false);
      await page.keyboard.press("Shift+Tab");
      const returned = await page.evaluate(() =>
        document.activeElement?.getAttribute("data-a11y-focus-probe") === "first");
      expect(returned, "Shift+Tab must return to the prior control").toBe(true);
    });

    test("native button supports Enter and Space switch-style activation", async ({ page }) => {
      const button = page.locator("button:not([disabled])").first();
      if (await button.count() === 0 || !(await button.isVisible())) {
        test.skip(true, "No visible enabled native button on this route");
      }
      await button.focus();
      await expect(button).toBeFocused();
      await button.evaluate((element) => {
        (element as HTMLElement).dataset.a11yClickProbe = "0";
        element.addEventListener("click", () => {
          const current = Number((element as HTMLElement).dataset.a11yClickProbe ?? "0");
          (element as HTMLElement).dataset.a11yClickProbe = String(current + 1);
        });
      });
      await page.keyboard.press("Enter");
      expect(Number(await button.getAttribute("data-a11y-click-probe"))).toBeGreaterThan(0);

      // The first activation may navigate or remove the button; retry on a fresh route.
      await page.reload({ waitUntil: "domcontentloaded" });
      const spaceButton = page.locator("button:not([disabled])").first();
      await expect(spaceButton).toBeVisible();
      await spaceButton.focus();
      await spaceButton.evaluate((element) => {
        (element as HTMLElement).dataset.a11yClickProbe = "0";
        element.addEventListener("click", () => {
          const current = Number((element as HTMLElement).dataset.a11yClickProbe ?? "0");
          (element as HTMLElement).dataset.a11yClickProbe = String(current + 1);
        });
      });
      await page.keyboard.press("Space");
      expect(Number(await spaceButton.getAttribute("data-a11y-click-probe"))).toBeGreaterThan(0);
    });

    test("provides 44 by 44 CSS pixel button and form targets", async ({ page }) => {
      const undersized = await page.evaluate(() => {
        const controls = document.querySelectorAll<HTMLElement>(
          "button, input:not([type='hidden']), select, textarea, [role='button'], [role='switch']",
        );
        return Array.from(controls).flatMap((element, index) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" ||
              element.hasAttribute("disabled")) return [];
          if (rect.width >= 44 && rect.height >= 44) return [];
          return [`${index}: ${element.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)}`];
        });
      });
      expect(undersized, "Undersized control targets").toEqual([]);
    });
  });
}
