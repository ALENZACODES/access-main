import { expect, type Locator, type Page } from "@playwright/test";

export interface DialogFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface DialogExercise {
  readonly opened: boolean;
  readonly named: boolean;
  readonly escaped: boolean;
  readonly returnedToTrigger: boolean;
  readonly innerTabStops: number;
  readonly findings: readonly DialogFinding[];
}

/** Inspect visible dialogs, including native modals and ARIA dialog roots. */
export async function auditDialogTree(page: Page): Promise<DialogFinding[]> {
  return page.evaluate(() => {
    const findings: DialogFinding[] = [];
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
      "dialog[open],[role='dialog'],[role='alertdialog']",
    ));
    const visible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return !element.closest("[hidden],[inert],[aria-hidden='true']") &&
        style.display !== "none" && style.visibility !== "hidden" &&
        box.width > 0 && box.height > 0;
    };
    const active = dialogs.filter(visible);
    for (const [index, dialog] of active.entries()) {
      const target = dialog.id || `dialog[${index}]`;
      const ariaLabel = dialog.getAttribute("aria-label")?.trim();
      const labelledBy = dialog.getAttribute("aria-labelledby")?.trim();
      const referencedName = labelledBy?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean).join(" ");
      if (!ariaLabel && !referencedName) {
        findings.push({ code: "unnamed-dialog", target, detail: "Dialog needs a name" });
      }
      if (dialog.getAttribute("aria-modal") === "true" ||
          (dialog instanceof HTMLDialogElement && dialog.matches(":modal"))) {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && !dialog.contains(focused)) {
          findings.push({ code: "modal-focus-outside", target, detail: focused.localName });
        }
      }
      const describedBy = dialog.getAttribute("aria-describedby");
      if (describedBy) {
        for (const id of describedBy.split(/\s+/)) {
          if (!document.getElementById(id)) {
            findings.push({ code: "dialog-description-missing", target, detail: id });
          }
        }
      }
      if (dialog.getAttribute("role") === "alertdialog" && !describedBy) {
        findings.push({ code: "alertdialog-description-missing", target, detail: "Description required" });
      }
    }
    const modals = active.filter((dialog) => dialog.getAttribute("aria-modal") === "true" ||
      (dialog instanceof HTMLDialogElement && dialog.matches(":modal")));
    if (modals.length > 1) {
      findings.push({ code: "multiple-modals", target: "document", detail: String(modals.length) });
    }
    return findings;
  });
}

/** A dialog opener must declare a real, unique target. */
export async function auditDialogTriggers(page: Page): Promise<DialogFinding[]> {
  return page.evaluate(() => {
    const findings: DialogFinding[] = [];
    const triggers = Array.from(document.querySelectorAll<HTMLElement>(
      "[aria-haspopup='dialog'],[data-a11y-dialog-trigger]",
    ));
    for (const [index, trigger] of triggers.entries()) {
      const label = trigger.id || `opener[${index}]`;
      const ids = trigger.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
      if (!ids.length) {
        findings.push({ code: "dialog-trigger-no-controls", target: label, detail: "Missing target reference" });
        continue;
      }
      for (const id of ids) {
        const target = document.getElementById(id);
        if (!target || !target.matches("dialog,[role='dialog'],[role='alertdialog']")) {
          findings.push({ code: "dialog-trigger-invalid-controls", target: label, detail: id });
        }
      }
      if (trigger.tabIndex < 0 || trigger.closest("[inert],[aria-hidden='true']")) {
        findings.push({ code: "dialog-trigger-unreachable", target: label, detail: "Cannot enter by Tab" });
      }
      if (trigger.getAttribute("aria-haspopup") && trigger.getAttribute("aria-haspopup") !== "dialog") {
        findings.push({ code: "dialog-trigger-invalid-popup", target: label, detail: "Expected dialog" });
      }
    }
    return findings;
  });
}

async function visibleDialog(page: Page): Promise<Locator> {
  return page.locator("dialog[open], [role='dialog'], [role='alertdialog']")
    .filter({ visible: true }).first();
}

/**
 * Observe post-close focus moves before asking whether focus was restored.
 * A final-state-only check can miss a focus diversion if a native dialog
 * subsequently restores the opener. The observer is scoped to this exercise,
 * is installed only once the dialog has opened, and is always removed.
 */
async function beginFocusRestoreAudit(dialog: Locator, triggerId: string | null): Promise<() => Promise<boolean>> {
  if (triggerId === null) return async () => false;
  const stableDialog = await dialog.elementHandle();
  if (stableDialog === null) return async () => false;
  const cleanupEvent = "a11y-round4-dialog-audit-end";
  await stableDialog.evaluate((element, args) => {
      const opener = document.getElementById(args.openerId);
      const controller = new AbortController();
      let closed = false;
      const isUnrelatedFocus = (target: EventTarget | null): boolean =>
        opener !== null && target instanceof HTMLElement && target.isConnected &&
        target !== opener && target !== document.body &&
        target !== document.documentElement;
      element.addEventListener("close", () => { closed = true; }, {
        capture: true, signal: controller.signal,
      });
      document.addEventListener("focusin", (event) => {
        if (closed && isUnrelatedFocus(event.target)) {
          element.setAttribute("data-a11y-round4-diverted-focus", "true");
        }
      }, { capture: true, signal: controller.signal });
      element.addEventListener(args.eventName, () => {
        controller.abort();
        element.removeAttribute("data-a11y-round4-diverted-focus");
      }, { once: true });
    }, { openerId: triggerId, eventName: cleanupEvent });
  return async () => {
    try {
      return await stableDialog.evaluate((element, eventName) => {
        const diverted = element.hasAttribute("data-a11y-round4-diverted-focus");
        element.dispatchEvent(new Event(eventName));
        return diverted;
      }, cleanupEvent);
    } catch {
      return false;
    } finally {
      await stableDialog.dispose();
    }
  };
}

/**
 * Exercise only a declared dialog opener: this audit does not click unrelated
 * controls, submit forms, or infer accessible behaviour from static markup.
 */
export async function exerciseDeclaredDialog(
  page: Page,
  trigger: Locator,
  options: { readonly maxTabSteps?: number } = {},
): Promise<DialogExercise> {
  const findings: DialogFinding[] = [];
  const maxTabSteps = options.maxTabSteps ?? 40;
  if (maxTabSteps < 1 || maxTabSteps > 200 || !Number.isInteger(maxTabSteps)) {
    throw new Error("maxTabSteps must be 1..200");
  }
  const triggerId = await trigger.getAttribute("id");
  const targetIds = (await trigger.getAttribute("aria-controls"))?.split(/\s+/).filter(Boolean) ?? [];
  if (!targetIds.length) {
    return {
      opened: false, named: false, escaped: false, returnedToTrigger: false,
      innerTabStops: 0,
      findings: [{ code: "missing-controls", target: triggerId ?? "trigger", detail: "No dialog target" }],
    };
  }
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = await visibleDialog(page);
  const opened = await dialog.count() > 0 && await dialog.isVisible();
  if (!opened) {
    findings.push({ code: "dialog-not-opened", target: triggerId ?? "trigger", detail: "Enter did not open dialog" });
    return { opened, named: false, escaped: false, returnedToTrigger: false, innerTabStops: 0, findings };
  }
  const actualId = await dialog.getAttribute("id");
  if (!actualId || !targetIds.includes(actualId)) {
    findings.push({ code: "dialog-target-mismatch", target: actualId ?? "dialog", detail: targetIds.join(" ") });
  }
  const structural = await auditDialogTree(page);
  findings.push(...structural);
  const named = !structural.some((item) => item.code === "unnamed-dialog");
  let innerTabStops = 0;
  const seen = new Set<string>();
  for (let step = 0; step < maxTabSteps; step += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      const modal = Array.from(document.querySelectorAll<HTMLElement>(
        "dialog[open],[role='dialog'],[role='alertdialog']",
      )).find((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      if (!modal || !active || !(active instanceof HTMLElement)) return null;
      const parkedOnRoot = active === document.body || active === document.documentElement;
      return {
        inside: modal.contains(active) || parkedOnRoot,
        parkedOnRoot,
        id: active.id,
        tag: active.localName,
        position: Array.from(modal.querySelectorAll("* ")).indexOf(active),
      };
    });
    if (!focus || !focus.inside) {
      findings.push({ code: "dialog-tab-escaped", target: actualId ?? "dialog", detail: String(step + 1) });
      break;
    }
    if (focus.parkedOnRoot) continue;
    innerTabStops += 1;
    const identity = `${focus.tag}:${focus.id}:${focus.position}`;
    if (seen.has(identity)) break;
    seen.add(identity);
  }
  if (innerTabStops === 0) {
    findings.push({ code: "dialog-no-tab-target", target: actualId ?? "dialog", detail: "No sequential target" });
  }
  const endFocusAudit = await beginFocusRestoreAudit(dialog, triggerId);
  let escaped = false;
  let returnedToTrigger = false;
  let focusDiverted = false;
  let auditFinished = false;
  try {
    await page.keyboard.press("Escape");
    // Observe close handlers, their microtasks, and a rendering opportunity.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    escaped = await dialog.isHidden().catch(() => true);
    const finalFocus = await trigger.evaluate((element) => document.activeElement === element)
      .catch(() => false);
    focusDiverted = await endFocusAudit();
    auditFinished = true;
    returnedToTrigger = finalFocus && !focusDiverted;
  } finally {
    // This also cleans listeners if a Playwright action throws partway through.
    if (!auditFinished) await endFocusAudit();
  }
  if (!escaped) findings.push({ code: "dialog-escape-failed", target: actualId ?? "dialog", detail: "Still open" });
  if (!returnedToTrigger) {
    findings.push({ code: "dialog-focus-not-restored", target: triggerId ?? "trigger", detail: "Focus not returned" });
  }
  return { opened, named, escaped, returnedToTrigger, innerTabStops, findings };
}

export async function assertDeclaredDialog(page: Page, trigger: Locator): Promise<void> {
  const result = await exerciseDeclaredDialog(page, trigger);
  expect(result.findings, "Dialog keyboard activation and Escape lifecycle").toEqual([]);
  expect(result.opened).toBe(true);
  expect(result.named).toBe(true);
  expect(result.escaped).toBe(true);
  expect(result.returnedToTrigger).toBe(true);
}

export async function auditDialogEscapeOnPage(page: Page): Promise<DialogFinding[]> {
  const dialog = await visibleDialog(page);
  if (await dialog.count() === 0) return [];
  await page.keyboard.press("Escape");
  if (await dialog.isVisible().catch(() => false)) {
    return [{ code: "open-dialog-not-dismissible", target: await dialog.getAttribute("id") ?? "dialog", detail: "Escape did not dismiss" }];
  }
  return [];
}
