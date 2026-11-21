import { expect, type Locator, type Page } from "@playwright/test";

export type DisclosureCode =
  | "invalid-expanded"
  | "expanded-without-target"
  | "missing-controlled-target"
  | "ambiguous-controlled-target"
  | "expanded-target-hidden"
  | "collapsed-target-exposed"
  | "invalid-haspopup"
  | "unnamed-disclosure"
  | "disclosure-not-keyboard-focusable"
  | "invalid-dialog-name"
  | "dialog-description-missing"
  | "modal-outside-focus"
  | "hidden-open-dialog"
  | "dialog-has-no-keyboard-exit"
  | "duplicate-dialog-label"
  | "invalid-details-summary"
  | "details-without-summary"
  | "summary-outside-details"
  | "invalid-popover-target"
  | "popover-state-mismatch"
  | "inert-open-panel"
  | "overlay-with-positive-tabindex"
  | "interactive-hidden-panel"
  | "dialog-outside-trigger"
  | "invalid-modal-state";

export interface DisclosureFinding {
  readonly code: DisclosureCode;
  readonly path: string;
  readonly detail: string;
}
export interface DisclosureReport {
  readonly triggers: number;
  readonly dialogs: number;
  readonly details: number;
  readonly findings: readonly DisclosureFinding[];
}

/** Read-only check of authored panels, dialogs and their keyboard contracts. */
export async function auditDisclosureContractsRound11(page: Page): Promise<DisclosureReport> {
  return page.evaluate(() => {
    type Code = DisclosureCode;
    const findings: DisclosureFinding[] = [];
    const pathOf = (node: Element): string => {
      if (node.id) return `#${CSS.escape(node.id)}`;
      const pieces: string[] = [];
      let active: Element | null = node;
      while (active && pieces.length < 6) {
        const parent: Element | null = active.parentElement;
        const siblings = parent ? Array.from(parent.children).filter((child) => child.localName === active!.localName) : [active];
        pieces.unshift(`${active.localName}:nth-of-type(${siblings.indexOf(active) + 1})`);
        active = parent;
      }
      return pieces.join(" > ");
    };
    const add = (code: Code, element: Element, detail = ""): void => { findings.push({ code, path: pathOf(element), detail }); };
    const rendered = (node: Element): boolean => {
      if (node.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const styles = getComputedStyle(node);
      return styles.display !== "none" && styles.visibility !== "hidden" && styles.visibility !== "collapse";
    };
    const nameOf = (node: Element): string => {
      const direct = node.getAttribute("aria-label")?.trim();
      if (direct) return direct;
      const ids = node.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [];
      const linked = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      return linked || node.getAttribute("title")?.trim() || node.textContent?.trim() || "";
    };
    const focusable = (node: HTMLElement): boolean => {
      if (node.matches(":disabled,[aria-disabled='true']")) return false;
      return node.tabIndex >= 0 && rendered(node);
    };
    const triggers = Array.from(document.querySelectorAll<HTMLElement>(
      "[aria-expanded],[aria-haspopup],[popovertarget]",
    ));
    for (const trigger of triggers) {
      if (!rendered(trigger)) continue;
      const expanded = trigger.getAttribute("aria-expanded");
      const controls = trigger.getAttribute("aria-controls")?.trim().split(/\s+/).filter(Boolean) ?? [];
      const popup = trigger.getAttribute("aria-haspopup");
      const popTarget = trigger.getAttribute("popovertarget");
      if (expanded !== null && !["true", "false", "undefined"].includes(expanded)) add("invalid-expanded", trigger, expanded);
      if (popup !== null && !["true", "false", "menu", "listbox", "tree", "grid", "dialog"].includes(popup)) add("invalid-haspopup", trigger, popup);
      if (expanded === "true" && controls.length === 0 && !popTarget && trigger.getAttribute("role") !== "combobox") {
        add("expanded-without-target", trigger, "Expanded control has no authored region reference");
      }
      if (!nameOf(trigger)) add("unnamed-disclosure", trigger);
      if (!focusable(trigger) && !trigger.matches("[hidden]")) add("disclosure-not-keyboard-focusable", trigger);
      for (const id of controls) {
        const matches = Array.from(document.querySelectorAll<HTMLElement>("[id]")).filter((node) => node.id === id);
        if (!matches.length) { add("missing-controlled-target", trigger, id); continue; }
        if (matches.length > 1) { add("ambiguous-controlled-target", trigger, id); continue; }
        const target = matches[0]!;
        if (expanded === "true" && !rendered(target)) add("expanded-target-hidden", trigger, id);
        if (expanded === "false" && trigger.hasAttribute("data-a11y-collapses-panel") && rendered(target)) {
          add("collapsed-target-exposed", trigger, id);
        }
        if (expanded === "true" && target.closest("[inert]")) add("inert-open-panel", trigger, id);
      }
      if (popTarget !== null) {
        const target = document.getElementById(popTarget);
        if (!(target instanceof HTMLElement) || !target.hasAttribute("popover")) add("invalid-popover-target", trigger, popTarget);
        else if (expanded === "true" && !target.matches(":popover-open")) add("popover-state-mismatch", trigger, popTarget);
      }
    }
    const detailsElements = Array.from(document.querySelectorAll<HTMLDetailsElement>("details"));
    for (const details of detailsElements) {
      const directSummaries = Array.from(details.children).filter((child) => child.localName === "summary");
      if (!directSummaries.length) add("details-without-summary", details);
      if (directSummaries.length > 1 || (directSummaries[0] && !nameOf(directSummaries[0]))) add("invalid-details-summary", details);
    }
    for (const summary of Array.from(document.querySelectorAll("summary"))) {
      if (summary.parentElement?.localName !== "details") add("summary-outside-details", summary);
    }
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>("dialog[open],[role='dialog'],[role='alertdialog']"));
    const named = new Map<string, HTMLElement[]>();
    for (const dialog of dialogs) {
      if (dialog.matches("dialog[open][aria-hidden='true'],[role='dialog'][aria-hidden='true'],[role='alertdialog'][aria-hidden='true']")) {
        add("hidden-open-dialog", dialog);
        continue;
      }
      if (!rendered(dialog)) continue;
      const name = dialog.getAttribute("aria-label")?.trim() ||
        (dialog.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      if (!name) add("invalid-dialog-name", dialog);
      else named.set(name, [...(named.get(name) ?? []), dialog]);
      for (const id of (dialog.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) add("dialog-description-missing", dialog, id);
      }
      const modal = dialog.getAttribute("aria-modal");
      if (modal !== null && modal !== "true" && modal !== "false") add("invalid-modal-state", dialog, modal);
      if ((modal === "true" || dialog.matches("dialog:modal")) && !dialog.contains(document.activeElement) && document.activeElement !== dialog) {
        add("modal-outside-focus", dialog);
      }
      if (dialog.matches("[aria-hidden='true'],[inert]")) add("hidden-open-dialog", dialog);
      if (Array.from(dialog.querySelectorAll<HTMLElement>("[tabindex]")).some((node) => Number(node.getAttribute("tabindex")) > 0)) {
        add("overlay-with-positive-tabindex", dialog);
      }
      const exits = Array.from(dialog.querySelectorAll<HTMLElement>("button,[role='button'],input[type='button']")).filter((node) =>
        rendered(node) && (node.hasAttribute("data-a11y-dialog-close") || node.getAttribute("aria-label")?.toLowerCase().includes("close") || node.getAttribute("aria-label")?.toLowerCase().includes("fermer")),
      );
      if (dialog.hasAttribute("data-a11y-requires-close-button") && !exits.length) add("dialog-has-no-keyboard-exit", dialog);
      if (dialog.hasAttribute("data-a11y-trigger") && !document.getElementById(dialog.getAttribute("data-a11y-trigger") ?? "")) {
        add("dialog-outside-trigger", dialog);
      }
    }
    for (const [name, matches] of named) {
      if (matches.length > 1) for (const entry of matches.slice(1)) add("duplicate-dialog-label", entry, name);
    }
    for (const panel of Array.from(document.querySelectorAll<HTMLElement>("[data-a11y-collapsed-panel]"))) {
      if (!rendered(panel)) continue;
      const focusableChildren = Array.from(panel.querySelectorAll<HTMLElement>("button,a[href],input,select,textarea,[tabindex]"))
        .filter((node) => node.tabIndex >= 0 && rendered(node));
      if (focusableChildren.length) add("interactive-hidden-panel", panel, `${focusableChildren.length} active controls in declared collapsed panel`);
    }
    return { triggers: triggers.length, dialogs: dialogs.length, details: detailsElements.length, findings };
  });
}

export interface DialogEscapeObservation {
  readonly opened: boolean;
  readonly initiallyInside: boolean;
  readonly trapped: boolean;
  readonly closedByEscape: boolean;
  readonly focusRestored: boolean;
}
/** Activate only opted-in, non-destructive triggers. */
export async function exerciseOptInDialogRound11(page: Page, trigger: Locator): Promise<DialogEscapeObservation> {
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog[open]:visible,[role='dialog']:visible,[role='alertdialog']:visible").last();
  const opened = await dialog.isVisible();
  if (!opened) return { opened: false, initiallyInside: false, trapped: false, closedByEscape: false, focusRestored: false };
  const initiallyInside = await dialog.evaluate((node) => node === document.activeElement || node.contains(document.activeElement));
  let trapped = true;
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((node) => node === document.activeElement || node.contains(document.activeElement) || document.activeElement === document.body);
    if (!inside) { trapped = false; break; }
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const focusRestored = await trigger.evaluate((node) => node === document.activeElement);
  return { opened, initiallyInside, trapped, closedByEscape: true, focusRestored };
}
