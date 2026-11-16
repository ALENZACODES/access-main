import { expect, type Page } from "@playwright/test";

export interface ContinuityFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/** Check important navigation contracts without following external destinations. */
export async function auditRouteContinuity(page: Page): Promise<ContinuityFinding[]> {
  return page.evaluate(() => {
    const findings: ContinuityFinding[] = [];
    const report = (code: string, node: Element, detail: string): void => {
      findings.push({ code, target: node.id || node.localName, detail });
    };
    const seen = new Set<string>();
    const visible = (node: Element): boolean => {
      if (node.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const css = getComputedStyle(node);
      return css.display !== "none" && css.visibility !== "hidden" && node.getBoundingClientRect().width > 0;
    };
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    for (const link of links) {
      if (!visible(link)) continue;
      const raw = link.getAttribute("href") || "";
      if (raw === "#" || /^javascript:/i.test(raw)) {
        report("link-placeholder", link, "Link has no navigable destination");
      }
      if (raw.startsWith("#") && raw.length > 1) {
        const id = decodeURIComponent(raw.slice(1));
        if (!document.getElementById(id)) report("fragment-target-missing", link, id);
      }
      if (link.target === "_blank" && !/\bnoopener\b/.test(link.rel)) {
        report("external-new-window", link, "New window link omits noopener");
      }
      if (link.hasAttribute("download") && !link.textContent?.trim() &&
          !link.getAttribute("aria-label")?.trim()) {
        report("unnamed-download", link, "Download action has no accessible name");
      }
    }
    const currents = Array.from(document.querySelectorAll<HTMLElement>("[aria-current]"));
    for (const item of currents) {
      if (!visible(item)) continue;
      const value = item.getAttribute("aria-current") || "";
      if (!["page", "step", "location", "date", "time", "true", "false"].includes(value)) {
        report("aria-current-value", item, value);
      }
      const nav = item.closest("nav,[role='navigation']");
      if (!nav || value === "false") continue;
      const key = nav.id || Array.from(document.querySelectorAll("nav,[role='navigation']")).indexOf(nav).toString();
      const designation = `${key}:${value}`;
      if (seen.has(designation) && value === "page") {
        report("multiple-current-pages", item, "Navigation has more than one current page");
      }
      seen.add(designation);
    }
    for (const navigation of Array.from(document.querySelectorAll<HTMLElement>("nav,[role='navigation']"))) {
      if (!visible(navigation)) continue;
      const all = Array.from(document.querySelectorAll("nav,[role='navigation']")).filter(visible);
      if (all.length <= 1) break;
      const ownName = navigation.getAttribute("aria-label")?.trim();
      const ids = (navigation.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      const fromIds = ids.map((id) => document.getElementById(id)?.textContent?.trim() || "").join(" ");
      if (!ownName && !fromIds.trim()) {
        report("navigation-name", navigation, "Multiple navigation landmarks require distinguishing names");
      }
    }
    for (const skip of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-a11y-skip-link]"))) {
      const target = skip.getAttribute("href") || "";
      if (!target.startsWith("#") || target.length < 2) {
        report("skip-link-destination", skip, "Skip link must have a local target");
        continue;
      }
      const element = document.getElementById(target.slice(1));
      if (!element) report("skip-link-target", skip, "Skip link target not found");
      else if (element.closest("[hidden],[inert],[aria-hidden='true']")) {
        report("skip-link-hidden", skip, "Skip target is not reachable");
      }
    }
    return findings;
  });
}

/**
 * Only opted-in client-side links are exercised. Their destination is restricted
 * to the current origin, and the harness restores the original page afterwards.
 */
export async function exerciseSafeRouteLinks(page: Page): Promise<ContinuityFinding[]> {
  const issues: ContinuityFinding[] = [];
  const initial = page.url();
  const links = page.locator("a[href][data-a11y-route-test='safe']");
  const number = await links.count();
  for (let index = 0; index < number; index += 1) {
    await page.goto(initial, { waitUntil: "domcontentloaded" });
    const link = links.nth(index);
    if (!(await link.count()) || !(await link.isVisible())) continue;
    const target = await link.getAttribute("href");
    const label = (await link.getAttribute("id")) || `link-${index}`;
    if (!target) {
      issues.push({ code: "safe-link-href", target: label, detail: "Empty destination" });
      continue;
    }
    const destination = new URL(target, initial);
    if (destination.origin !== new URL(initial).origin) {
      issues.push({ code: "safe-link-cross-origin", target: label, detail: "Test may not leave the application origin" });
      continue;
    }
    await link.focus();
    await page.keyboard.press("Enter");
    try {
      await expect.poll(() => page.url(), { timeout: 3000 }).toBe(destination.toString());
    } catch {
      issues.push({ code: "route-keyboard-activation", target: label, detail: destination.pathname });
      continue;
    }
    const landmarks = await page.getByRole("main").count();
    if (landmarks !== 1) {
      issues.push({ code: "route-main-landmark", target: label, detail: String(landmarks) });
    }
    if (!(await page.title()).trim()) {
      issues.push({ code: "route-title", target: label, detail: "Destination title is empty" });
    }
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return "body";
      return element.localName;
    });
    if (!focused) issues.push({ code: "route-focus-lost", target: label, detail: "No active element" });
  }
  await page.goto(initial, { waitUntil: "domcontentloaded" });
  return issues;
}

export async function assertRouteContinuity(page: Page): Promise<void> {
  expect(await auditRouteContinuity(page), "Navigation and link integrity").toEqual([]);
  expect(await exerciseSafeRouteLinks(page), "Opted-in route transitions").toEqual([]);
}
