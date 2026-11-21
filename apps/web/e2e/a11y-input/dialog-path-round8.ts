import { expect, type Locator, type Page } from "@playwright/test";

export interface DialogFinding {
  readonly code: string;
  readonly target: string;
  readonly message: string;
}

export interface DialogState {
  readonly name: string;
  readonly type: "native" | "role" | "alertdialog";
  readonly modal: boolean;
  readonly focusContained: boolean;
  readonly labelled: boolean;
  readonly descriptionRefsValid: boolean;
  readonly visible: boolean;
}

export interface DialogEscapeResult {
  readonly before: DialogState;
  readonly closed: boolean;
  readonly returnedFocus: boolean;
  readonly outsideTabStops: readonly string[];
  readonly problems: readonly DialogFinding[];
}

/**
 * Probe only explicitly marked dialog openers. Never activate an unknown
 * button on a live route: it might save, send or delete information.
 */
export function safeDialogTriggers(page: Page): Locator {
  return page.locator(
    '[aria-haspopup="dialog"]:visible:not([disabled]):not([aria-disabled="true"])',
  );
}

export function openDialogLocator(page: Page): Locator {
  return page.locator(
    'dialog[open]:visible,[role="dialog"]:visible,[role="alertdialog"]:visible',
  );
}

/** Check visible and hidden dialog contracts without inventing expected copy. */
export async function inspectDialogMarkup(page: Page): Promise<DialogFinding[]> {
  return page.evaluate(() => {
    const findings: DialogFinding[] = [];
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
      "dialog,[role='dialog'],[role='alertdialog']",
    ));
    const display = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" &&
        rect.width > 0 && rect.height > 0;
    };
    for (const [index, dialog] of dialogs.entries()) {
      if (!display(dialog)) continue;
      const target = dialog.id ? `#${dialog.id}` : `dialog[${index}]`;
      const labelledBy = (dialog.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const labels = labelledBy.map((id) => document.getElementById(id));
      const name = dialog.getAttribute("aria-label")?.trim() ||
        labels.map((node) => node?.textContent?.trim() ?? "").join(" ").trim();
      if (!name) findings.push({ code: "dialog-name", target,
        message: "Open dialog lacks an accessible name" });
      for (const [i, label] of labels.entries()) {
        if (!label) findings.push({ code: "dialog-label-reference", target,
          message: `Missing label target ${labelledBy[i]}` });
      }
      const describedBy = (dialog.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      for (const id of describedBy) {
        if (!document.getElementById(id)) findings.push({ code: "dialog-description-reference", target,
          message: `Missing description target ${id}` });
      }
      if (dialog.matches("[inert],[aria-hidden='true']") ||
          dialog.closest("[inert],[aria-hidden='true']")) {
        findings.push({ code: "dialog-hidden-ancestor", target,
          message: "Open dialog is hidden from assistive technology" });
      }
      const native = dialog instanceof HTMLDialogElement;
      const modal = dialog.getAttribute("aria-modal") === "true" ||
        (native && dialog.matches(":modal"));
      if (modal && !dialog.contains(document.activeElement) &&
          document.activeElement !== dialog) {
        findings.push({ code: "modal-focus-outside", target,
          message: "Modal does not contain keyboard focus" });
      }
      if (dialog.getAttribute("aria-modal") !== null &&
          !["true", "false"].includes(dialog.getAttribute("aria-modal") ?? "")) {
        findings.push({ code: "dialog-modal-value", target,
          message: "aria-modal must be true or false" });
      }
    }
    return findings;
  });
}

/** Detect malformed openers without triggering their behaviour. */
export async function inspectDialogTriggers(page: Page): Promise<DialogFinding[]> {
  return page.evaluate(() => {
    const findings: DialogFinding[] = [];
    const controls = Array.from(document.querySelectorAll<HTMLElement>("[aria-haspopup='dialog']"));
    for (const [index, node] of controls.entries()) {
      const target = node.id ? `#${node.id}` : `opener[${index}]`;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" ||
        rect.width === 0 || rect.height === 0) continue;
      const name = node.getAttribute("aria-label")?.trim() ||
        node.getAttribute("title")?.trim() || node.textContent?.trim() || "";
      if (!name) findings.push({ code: "dialog-opener-name", target,
        message: "Dialog opener has no accessible name" });
      const tab = node.getAttribute("tabindex");
      const natural = node.matches("button,a[href],input,select,textarea");
      if (!natural && (tab === null || Number(tab) < 0)) {
        findings.push({ code: "dialog-opener-keyboard", target,
          message: "Dialog opener is not sequentially focusable" });
      }
      if (tab !== null && Number(tab) > 0) findings.push({
        code: "dialog-opener-tabindex", target,
        message: "Positive tabindex changes focus order",
      });
      const expanded = node.getAttribute("aria-expanded");
      if (expanded !== null && expanded !== "true" && expanded !== "false") {
        findings.push({ code: "dialog-opener-expanded", target,
          message: `Invalid expanded state ${expanded}` });
      }
      const ref = node.getAttribute("aria-controls");
      if (ref && !document.getElementById(ref)) {
        findings.push({ code: "dialog-opener-controls", target,
          message: `Missing controlled dialog ${ref}` });
      }
    }
    return findings;
  });
}

export async function observeOpenDialog(dialog: Locator): Promise<DialogState> {
  return dialog.evaluate((node) => {
    const element = node as HTMLElement;
    const idrefs = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    const label = element.getAttribute("aria-label")?.trim() ||
      idrefs.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
    const descriptions = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const native = element instanceof HTMLDialogElement;
    const role = element.getAttribute("role");
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      name: label,
      type: role === "alertdialog" ? "alertdialog" : native ? "native" : "role",
      modal: element.getAttribute("aria-modal") === "true" || (native && element.matches(":modal")),
      focusContained: element.contains(document.activeElement) || element === document.activeElement,
      labelled: Boolean(label),
      descriptionRefsValid: descriptions.every((id) => document.getElementById(id) !== null),
      visible: style.visibility !== "hidden" && style.display !== "none" &&
        rect.width > 0 && rect.height > 0,
    };
  });
}

async function focusInside(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((element) => element.contains(document.activeElement) ||
    element === document.activeElement);
}

/**
 * Exercise Escape and Tab on opted-in modal opening controls. The opener must
 * be a declared dialog trigger; the helper never discovers arbitrary actions.
 */
export async function inspectDialogEscape(
  page: Page,
  opener: Locator,
  steps = 8,
): Promise<DialogEscapeResult> {
  if (!Number.isInteger(steps) || steps < 1 || steps > 40) {
    throw new RangeError("Dialog Tab sample must contain 1 to 40 steps");
  }
  await expect(opener).toBeVisible();
  await expect(opener).toBeEnabled();
  const target = await opener.getAttribute("id") ?? "dialog-opener";
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = openDialogLocator(page).last();
  await expect(dialog).toBeVisible();
  await expect.poll(() => focusInside(dialog)).toBe(true);
  const before = await observeOpenDialog(dialog);
  const outsideTabStops: string[] = [];
  if (before.modal) {
    for (let index = 0; index < steps; index += 1) {
      await page.keyboard.press(index % 2 === 0 ? "Tab" : "Shift+Tab");
      const outside = await dialog.evaluate((element) => {
        const active = document.activeElement;
        if (element.contains(active) || element === active) return "";
        if (active === document.body || active === document.documentElement) return "";
        return active instanceof HTMLElement ? active.id || active.localName : "unknown";
      });
      if (outside) outsideTabStops.push(outside);
    }
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const closed = await dialog.isHidden();
  const returnedFocus = await opener.evaluate((node) => node === document.activeElement);
  const problems: DialogFinding[] = [];
  if (!before.labelled) problems.push({ code: "dialog-unlabelled", target,
    message: "Opened dialog lacks an accessible name" });
  if (!before.descriptionRefsValid) problems.push({ code: "dialog-broken-description", target,
    message: "Opened dialog references an absent description" });
  if (!before.focusContained) problems.push({ code: "dialog-initial-focus", target,
    message: "Focus was not placed inside dialog" });
  if (!closed) problems.push({ code: "dialog-escape", target,
    message: "Escape did not close the dialog" });
  if (!returnedFocus) problems.push({ code: "dialog-focus-return", target,
    message: "Focus did not return to the opener" });
  if (outsideTabStops.length) problems.push({ code: "modal-tab-leak", target,
    message: `Tab reached ${outsideTabStops.join(", ")}` });
  return { before, closed, returnedFocus, outsideTabStops, problems };
}

/** Observe a declared nested-dialog hierarchy without closing a background layer. */
export async function inspectTopDialogEscape(page: Page): Promise<DialogFinding[]> {
  const dialogs = openDialogLocator(page);
  const count = await dialogs.count();
  if (count === 0) return [{ code: "no-open-dialog", target: "document",
    message: "Nested escape check requires an open dialog" }];
  await page.keyboard.press("Escape");
  await expect.poll(() => openDialogLocator(page).count()).toBe(count - 1);
  const after = await openDialogLocator(page).count();
  return after === count - 1 ? [] : [{ code: "top-dialog-not-closed", target: "document",
    message: "Escape did not close exactly the top dialog" }];
}

/** Structural validation is safe to run against every currently mounted route. */
export async function auditDialogRoute(page: Page): Promise<DialogFinding[]> {
  return [...await inspectDialogTriggers(page), ...await inspectDialogMarkup(page)];
}
