import { expect, type Page } from "@playwright/test";

export interface FocusGeometry {
  readonly element: string;
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly viewport: { width: number; height: number };
  readonly occluded: boolean;
  readonly clipped: boolean;
  readonly indicatorPresent: boolean;
  readonly scrollableParent: boolean;
}

export interface FocusGeometryIssue {
  readonly step: number;
  readonly code: string;
  readonly target: string;
}

/** Measure focus after actual keyboard navigation rather than calling focus(). */
export async function measureActiveFocus(page: Page): Promise<FocusGeometry | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return null;
    const rect = element.getBoundingClientRect();
    const focusStyle = getComputedStyle(element);
    // Compare against an unfocused clone so static borders or underlines
    // are not treated as a focus indicator.
    const probe = element.cloneNode(false) as HTMLElement;
    probe.removeAttribute("id");
    probe.setAttribute("tabindex", "-1");
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    probe.style.pointerEvents = "none";
    element.parentElement?.appendChild(probe);
    const style = getComputedStyle(probe);
    const unfocusedDecoration = style.textDecorationLine;
    const unfocusedShadow = style.boxShadow;
    const unfocusedOutline = style.outlineStyle;
    probe.remove();
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(4, rect.width / 2), rect.top + Math.min(4, rect.height / 2)],
      [rect.right - Math.min(4, rect.width / 2), rect.bottom - Math.min(4, rect.height / 2)],
    ];
    let visibleHit = false;
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === element || element.contains(hit) || hit.contains(element))) {
        visibleHit = true;
        break;
      }
    }
    let scrollableParent = false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (/(auto|scroll)/.test(parentStyle.overflowY + parentStyle.overflowX)) {
        scrollableParent = true;
        break;
      }
    }
    const outline = focusStyle.outlineStyle !== "none" &&
      focusStyle.outlineStyle !== unfocusedOutline &&
      Number.parseFloat(focusStyle.outlineWidth) > 0 &&
      focusStyle.outlineColor !== "transparent";
    const shadow = focusStyle.boxShadow !== "none" &&
      focusStyle.boxShadow !== unfocusedShadow;
    const decoration = focusStyle.textDecorationLine !== "none" &&
      focusStyle.textDecorationLine !== unfocusedDecoration;
    // Explicit focus appearance can also use a changed border or background.
    // Compare with ordinary computed style to avoid treating a static border as focus styling.
    const focusedBorder = Number.parseFloat(focusStyle.borderTopWidth) > 0 ||
      Number.parseFloat(focusStyle.borderRightWidth) > 0 ||
      Number.parseFloat(focusStyle.borderBottomWidth) > 0 ||
      Number.parseFloat(focusStyle.borderLeftWidth) > 0;
    const restingBorder = Number.parseFloat(style.borderTopWidth) > 0 ||
      Number.parseFloat(style.borderRightWidth) > 0 ||
      Number.parseFloat(style.borderBottomWidth) > 0 ||
      Number.parseFloat(style.borderLeftWidth) > 0;
    const borderChanged = (focusedBorder || restingBorder) && (
      focusStyle.borderColor !== style.borderColor ||
      focusStyle.borderWidth !== style.borderWidth
    );
    const transparent = (value: string): boolean =>
      value === "transparent" || value === "rgba(0, 0, 0, 0)";
    const backgroundChanged = focusStyle.backgroundColor !== style.backgroundColor &&
      !transparent(focusStyle.backgroundColor);
    return {
      element: element.id ? `${element.localName}#${element.id}` : element.localName,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport,
      clipped: rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewport.width ||
        rect.top >= viewport.height,
      occluded: !visibleHit,
      indicatorPresent: outline || shadow || decoration || borderChanged || backgroundChanged,
      scrollableParent,
    };
  });
}

/**
 * Enumerate one pass through the page. DOM identity rather than a string
 * signature is used to detect wraparound; otherwise duplicate buttons with
 * identical text can accidentally terminate an audit early.
 */
export async function auditKeyboardGeometry(
  page: Page,
  options: { readonly maxSteps?: number; readonly requireIndicator?: boolean } = {},
): Promise<FocusGeometryIssue[]> {
  const maxSteps = options.maxSteps ?? 160;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1000) {
    throw new Error("maxSteps must be an integer between 1 and 1000");
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.focus();
  });
  const issues: FocusGeometryIssue[] = [];
  const observed = await page.evaluate(() => {
    const marker = "data-a11y-round4-focus-identity";
    for (const element of Array.from(document.querySelectorAll(`[${marker}]`))) {
      element.removeAttribute(marker);
    }
    return marker;
  });
  const visited = new Set<string>();
  let completed = false;
  try {
    for (let index = 0; index < maxSteps; index += 1) {
      await page.keyboard.press("Tab");
      const identity = await page.evaluate((marker) => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || active === document.body) return null;
        let id = active.getAttribute(marker);
        if (!id) {
          id = String(document.querySelectorAll(`[${marker}]`).length + 1);
          active.setAttribute(marker, id);
        }
        return id;
      }, observed);
      if (!identity) {
        completed = true;
        break;
      }
      if (visited.has(identity)) {
        completed = true;
        break;
      }
      visited.add(identity);
      const geometry = await measureActiveFocus(page);
      if (!geometry) {
        issues.push({ step: index + 1, code: "missing-focus", target: identity });
        continue;
      }
      if (geometry.clipped) {
        issues.push({ step: index + 1, code: "focus-outside-viewport", target: geometry.element });
      }
      if (geometry.occluded) {
        issues.push({ step: index + 1, code: "focus-fully-obscured", target: geometry.element });
      }
      if (options.requireIndicator !== false && !geometry.indicatorPresent) {
        issues.push({ step: index + 1, code: "focus-indicator-missing", target: geometry.element });
      }
    }
    if (!completed) {
      issues.push({ step: maxSteps, code: "focus-scan-incomplete", target: "document" });
    }
  } finally {
    await page.evaluate((marker) => {
      for (const element of Array.from(document.querySelectorAll(`[${marker}]`))) {
        element.removeAttribute(marker);
      }
    }, observed);
  }
  return issues;
}

export async function assertKeyboardGeometry(page: Page): Promise<void> {
  expect(await auditKeyboardGeometry(page), "Keyboard focus geometry and indicator").toEqual([]);
}

/**
 * Reflow is evaluated at an effective 320 CSS-pixel viewport. No horizontal
 * scrolling is expected for ordinary content; genuinely two-dimensional
 * content may be marked with a test-only exemption in the host app.
 */
export async function auditReflow(page: Page): Promise<FocusGeometryIssue[]> {
  const original = page.viewportSize();
  if (!original) throw new Error("Reflow audit requires a viewport");
  try {
    await page.setViewportSize({ width: 320, height: 720 });
    return page.evaluate(() => {
      const findings: { step: number; code: string; target: string }[] = [];
      const root = document.documentElement;
      if (root.scrollWidth > root.clientWidth + 1) {
        findings.push({ step: 0, code: "horizontal-document-overflow", target: `document:${root.scrollWidth}` });
      }
      const selector = "main,header,footer,nav,form,section,article";
      for (const [index, element] of Array.from(document.querySelectorAll<HTMLElement>(selector)).entries()) {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (element.closest("[data-a11y-two-dimensional-content]")) continue;
        const box = element.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        if (box.left < -1 || box.right > root.clientWidth + 1) {
          findings.push({
            step: index + 1,
            code: "landmark-overflow",
            target: element.id ? `${element.localName}#${element.id}` : element.localName,
          });
        }
      }
      return findings;
    });
  } finally {
    await page.setViewportSize(original);
  }
}

/** Test that the first link intended to bypass navigation actually works. */
export async function auditSkipLink(page: Page): Promise<FocusGeometryIssue[]> {
  const skip = page.locator("a[href^='#']").first();
  if (await skip.count() === 0) return [];
  const href = await skip.getAttribute("href");
  const label = (await skip.innerText()).toLowerCase();
  if (!href || !/(skip|passer|aller|content|contenu)/.test(label)) return [];
  const targetId = decodeURIComponent(href.slice(1));
  const target = page.locator(`[id=${JSON.stringify(targetId)}]`);
  if (await target.count() !== 1) {
    return [{ step: 0, code: "skip-target-not-unique", target: targetId }];
  }
  await skip.focus();
  await page.keyboard.press("Enter");
  const hash = await page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
  if (hash !== targetId) {
    return [{ step: 0, code: "skip-navigation-failed", target: targetId }];
  }
  const arrived = await page.evaluate((id) => {
    const targetElement = document.getElementById(id);
    const focused = document.activeElement;
    if (!targetElement) return false;
    if (focused === targetElement || targetElement.contains(focused)) return true;
    const rect = targetElement.getBoundingClientRect();
    return rect.top >= -1 && rect.top < window.innerHeight;
  }, targetId);
  return arrived ? [] : [{ step: 0, code: "skip-target-not-reached", target: targetId }];
}
