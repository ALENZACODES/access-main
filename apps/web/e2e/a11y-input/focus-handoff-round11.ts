import { expect, type Page } from "@playwright/test";

export type HandoffCode =
  | "focus-disappeared"
  | "focus-hidden"
  | "focus-inert"
  | "focus-disabled"
  | "focus-obscured"
  | "focus-outside-viewport"
  | "focus-not-visible"
  | "focus-positive-tabindex"
  | "focus-target-too-small"
  | "focus-on-no-role"
  | "focus-in-closed-details"
  | "focus-in-closed-dialog"
  | "focus-no-name"
  | "navigation-replaced-focus"
  | "focus-race-after-settle"
  | "reverse-order-broken"
  | "forward-order-broken";

export interface HandoffFinding {
  readonly code: HandoffCode;
  readonly target: string;
  readonly detail: string;
}
export interface HandoffSnapshot {
  readonly target: string;
  readonly tag: string;
  readonly name: string;
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly findings: readonly HandoffFinding[];
}

/**
 * Snapshot the focused element. With inertSelector, that element is made inert inside the same
 * evaluation, so no frame runs between the change and the reading: a current Chromium moves focus
 * off an inert subtree on the next frame, which made a separate step race the browser.
 */
export async function observeHandoffFocusRound11(page: Page, inertSelector?: string): Promise<HandoffSnapshot> {
  return page.evaluate((inertTarget) => {
    if (inertTarget) document.querySelector(inertTarget)?.setAttribute("inert", "");
    type Code = HandoffCode;
    const findings: HandoffFinding[] = [];
    const active = document.activeElement;
    const target = active instanceof HTMLElement ? (active.id ? `#${CSS.escape(active.id)}` : active.localName) : "none";
    const report = (code: Code, detail = ""): void => { findings.push({ code, target, detail }); };
    if (!(active instanceof HTMLElement) || active === document.body || active === document.documentElement) {
      report("focus-disappeared");
      return { target, tag: active?.localName ?? "none", name: "", rect: { x: 0, y: 0, width: 0, height: 0 }, visible: false, interactive: false, findings };
    }
    const rect = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    const hidden = active.closest("[hidden],[aria-hidden='true']") !== null || style.display === "none" || style.visibility === "hidden" || !rect.width || !rect.height;
    const inert = active.closest("[inert]") !== null;
    const disabled = active.matches(":disabled,[aria-disabled='true']");
    if (hidden) report("focus-hidden");
    if (inert) report("focus-inert");
    if (disabled) report("focus-disabled");
    const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    if (!inViewport) report("focus-outside-viewport");
    const tabIndex = active.getAttribute("tabindex");
    if (tabIndex !== null && Number(tabIndex) > 0) report("focus-positive-tabindex", tabIndex);
    if (active.closest("details:not([open])") && active.localName !== "summary") report("focus-in-closed-details");
    if (active.closest("dialog:not([open])")) report("focus-in-closed-dialog");
    const interactive = active.matches("a[href],button,input:not([type='hidden']),select,textarea,summary,[role='button'],[role='link'],[role='tab'],[role='checkbox'],[role='switch'],[role='radio'],[tabindex]");
    if ((!interactive || (active.matches("div,span") && !active.getAttribute("role"))) && active !== document.querySelector("main") && !active.matches("h1,h2,h3")) report("focus-on-no-role");
    const name = active.getAttribute("aria-label")?.trim() ||
      (active.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim() ||
      active.textContent?.trim() || active.getAttribute("title")?.trim() || "";
    if (!name && active.matches("a[href],button,[role='button'],[role='link'],[role='tab']")) report("focus-no-name");
    if (interactive && active.matches("button,a[href],[role='button'],[role='tab']") && (rect.width < 44 || rect.height < 44)) {
      report("focus-target-too-small", `${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
    const focusVisible = active.matches(":focus-visible");
    const outlineVisible = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
    const borderVisible = style.boxShadow !== "none";
    if (focusVisible && !outlineVisible && !borderVisible && !active.matches("input,textarea,select")) report("focus-not-visible");
    if (!hidden && inViewport) {
      const centerX = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const centerY = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const topmost = document.elementFromPoint(centerX, centerY);
      if (topmost && topmost !== active && !active.contains(topmost) && !topmost.contains(active)) {
        const above = getComputedStyle(topmost);
        if (above.pointerEvents !== "none" && above.visibility !== "hidden") report("focus-obscured", topmost.localName);
      }
    }
    return {
      target, tag: active.localName, name,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: !hidden && !inert,
      interactive, findings,
    };
  }, inertSelector ?? null);
}

export interface FocusHandoffResult {
  readonly before: HandoffSnapshot;
  readonly reverse: HandoffSnapshot;
  readonly returned: HandoffSnapshot;
  readonly issues: readonly HandoffFinding[];
}

/** Focus one link, reverse to its predecessor and return without navigating. */
export async function exerciseFocusNeighbourRound11(page: Page): Promise<FocusHandoffResult> {
  const original = await observeHandoffFocusRound11(page);
  await page.keyboard.press("Tab");
  const before = await observeHandoffFocusRound11(page);
  await page.keyboard.press("Shift+Tab");
  const reverse = await observeHandoffFocusRound11(page);
  await page.keyboard.press("Tab");
  const returned = await observeHandoffFocusRound11(page);
  const issues: HandoffFinding[] = [...before.findings, ...reverse.findings, ...returned.findings];
  if (returned.target !== before.target) {
    issues.push({ code: "forward-order-broken", target: before.target, detail: `Returned to ${returned.target}` });
  }
  if (reverse.target !== original.target) {
    issues.push({ code: "reverse-order-broken", target: original.target, detail: `Reversed to ${reverse.target}` });
  }
  return { before, reverse, returned, issues };
}

export async function assertHandoffStaysFocusedRound11(page: Page, expectedTarget: string): Promise<void> {
  await expect.poll(async () => (await observeHandoffFocusRound11(page)).target).toBe(expectedTarget);
  const snapshot = await observeHandoffFocusRound11(page);
  expect(snapshot.findings, "Focused control must remain keyboard reachable").toEqual([]);
}

export async function assertNoRouteFocusStealRound11(page: Page): Promise<void> {
  const before = await observeHandoffFocusRound11(page);
  await page.waitForLoadState("networkidle");
  const after = await observeHandoffFocusRound11(page);
  expect(after.target, "Asynchronous preloads must not steal keyboard focus").toBe(before.target);
  expect(after.findings).toEqual([]);
}
