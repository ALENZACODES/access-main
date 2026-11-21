import type { Page } from "@playwright/test";

export type FeedbackCode =
  | "invalid-live-mode"
  | "invalid-live-atomic"
  | "invalid-live-relevant"
  | "invalid-live-busy"
  | "silenced-alert"
  | "silenced-status"
  | "live-region-hidden"
  | "live-positive-tabindex"
  | "invalid-progress-range"
  | "invalid-progress-value"
  | "progress-without-name"
  | "invalid-progress-value-text"
  | "invalid-meter-range"
  | "invalid-meter-value"
  | "meter-without-name"
  | "output-broken-for"
  | "output-empty-reference"
  | "invalid-error-target"
  | "error-region-hidden"
  | "alert-empty"
  | "status-is-button"
  | "disabled-control-still-expanded"
  | "invalid-aria-current"
  | "multiple-current-pages"
  | "missing-error-status"
  | "status-reference-empty"
  | "status-focus-stolen";

export interface FeedbackIssue {
  readonly code: FeedbackCode;
  readonly target: string;
  readonly explanation: string;
}

export interface FeedbackReport {
  readonly issues: readonly FeedbackIssue[];
  readonly regions: number;
  readonly progressIndicators: number;
  readonly outputs: number;
  readonly errors: number;
}

/**
 * Status semantics are observable without initiating an operation. This audit
 * neither submits a form nor launches a download. Announcements can change
 * language, but supported role and attribute values are language-neutral.
 */
export async function auditFeedback(page: Page): Promise<FeedbackReport> {
  return page.evaluate(() => {
    type Code = FeedbackCode;
    const issues: FeedbackIssue[] = [];
    const add = (code: Code, element: Element, explanation: string): void => {
      issues.push({ code, target: element.id ? `#${CSS.escape(element.id)}` : element.localName, explanation });
    };
    const hidden = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return true;
      const css = getComputedStyle(element);
      return css.display === "none" || css.visibility === "hidden";
    };
    const targets = (value: string): Element[] => {
      const ids = value.trim().split(/\s+/).filter(Boolean);
      return ids.flatMap((id) => Array.from(document.querySelectorAll("[id]")).filter((element) => element.id === id));
    };
    const named = (element: Element): boolean => {
      if (element.getAttribute("aria-label")?.trim()) return true;
      const labelIds = element.getAttribute("aria-labelledby");
      if (labelIds && targets(labelIds).some((node) => node.textContent?.trim())) return true;
      if (element.getAttribute("title")?.trim()) return true;
      if (element instanceof HTMLProgressElement || element instanceof HTMLMeterElement) {
        if (element.labels && Array.from(element.labels).some((node) => node.textContent?.trim())) return true;
      }
      return false;
    };
    let regions = 0;
    let progressIndicators = 0;
    let outputs = 0;
    let errors = 0;
    for (const region of document.querySelectorAll("[aria-live],[role='alert'],[role='status'],[role='log']")) {
      regions += 1;
      const live = region.getAttribute("aria-live");
      const atomic = region.getAttribute("aria-atomic");
      const relevant = region.getAttribute("aria-relevant");
      const busy = region.getAttribute("aria-busy");
      const role = region.getAttribute("role");
      if (live !== null && !["polite", "assertive", "off"].includes(live)) add("invalid-live-mode", region, live);
      if (atomic !== null && !["true", "false"].includes(atomic)) add("invalid-live-atomic", region, atomic);
      if (busy !== null && !["true", "false"].includes(busy)) add("invalid-live-busy", region, busy);
      if (relevant !== null) {
        const tokens = relevant.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || tokens.some((word) => !["all", "additions", "removals", "text"].includes(word))) {
          add("invalid-live-relevant", region, relevant);
        }
      }
      if (role === "alert" && live === "off") add("silenced-alert", region, "Alert has aria-live=off");
      if (role === "status" && live === "off") add("silenced-status", region, "Status has aria-live=off");
      if (region.getAttribute("aria-hidden") === "true") add("live-region-hidden", region, "Status excluded from accessibility tree");
      if (Number(region.getAttribute("tabindex") ?? 0) > 0) add("live-positive-tabindex", region, "Live region reorders keyboard focus");
      if (role === "alert" && !hidden(region) && !region.textContent?.trim() && !region.querySelector("[aria-label]")) {
        // Empty alert containers can be pre-mounted to announce later updates.
        // Only authored static alerts opt into a mandatory content requirement.
        if (region.hasAttribute("data-a11y-static-alert")) add("alert-empty", region, "Static alert has no content");
      }
      if (["button", "a"].includes(region.localName) && role === "status") add("status-is-button", region, "A status should not be an action control");
    }
    for (const element of document.querySelectorAll("progress,meter,[role='progressbar'],[role='meter']")) {
      if (hidden(element)) continue;
      progressIndicators += 1;
      const role = element.getAttribute("role") ?? element.localName;
      const min = Number(element.getAttribute("aria-valuemin") ?? element.getAttribute("min") ?? "0");
      const defaultMax = role === "meter" ? "1" : "100";
      const max = Number(element.getAttribute("aria-valuemax") ?? element.getAttribute("max") ?? defaultMax);
      const current = element.getAttribute("aria-valuenow") ?? element.getAttribute("value");
      const isMeter = role === "meter";
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        add(isMeter ? "invalid-meter-range" : "invalid-progress-range", element, `${min}/${max}`);
      }
      if (current !== null && current.trim()) {
        const value = Number(current);
        if (!Number.isFinite(value) || value < min || value > max) {
          add(isMeter ? "invalid-meter-value" : "invalid-progress-value", element, current);
        }
      }
      const textValue = element.getAttribute("aria-valuetext");
      if (textValue !== null && !textValue.trim()) add("invalid-progress-value-text", element, "Empty aria-valuetext");
      if (!named(element) && element.hasAttribute("role")) {
        add(isMeter ? "meter-without-name" : "progress-without-name", element, "Custom progress indicator has no accessible name");
      }
    }
    for (const output of document.querySelectorAll("output")) {
      outputs += 1;
      const reference = output.getAttribute("for");
      if (reference === null) continue;
      if (!reference.trim()) add("output-empty-reference", output, "Output has an empty for attribute");
      for (const id of reference.trim().split(/\s+/).filter(Boolean)) {
        if (targets(id).length !== 1) add("output-broken-for", output, id);
      }
    }
    for (const control of document.querySelectorAll("input,textarea,select,[aria-invalid]")) {
      const invalid = control.getAttribute("aria-invalid");
      if (invalid !== "true") continue;
      errors += 1;
      const reference = control.getAttribute("aria-errormessage");
      if (reference === null) {
        if (control.hasAttribute("data-a11y-error-required")) add("missing-error-status", control, "Invalid control needs aria-errormessage");
        continue;
      }
      const references = targets(reference);
      if (references.length !== 1) {
        add("invalid-error-target", control, `Expected one error target: ${reference}`);
        continue;
      }
      const message = references[0];
      if (message && hidden(message)) add("error-region-hidden", control, "Error text is hidden");
      if (message && !message.textContent?.trim()) add("status-reference-empty", control, "Error target has no text");
    }
    for (const control of document.querySelectorAll("[aria-disabled='true'][aria-expanded='true']")) {
      if (hidden(control)) continue;
      if (control.hasAttribute("data-a11y-closed-when-disabled")) {
        add("disabled-control-still-expanded", control, "Disabled disclosure remains expanded");
      }
    }
    const navigationGroups = document.querySelectorAll("nav,[role='navigation']");
    for (const nav of navigationGroups) {
      let currentPages = 0;
      for (const element of nav.querySelectorAll("[aria-current]")) {
        const current = element.getAttribute("aria-current") ?? "";
        if (!["page", "step", "location", "date", "time", "true", "false"].includes(current)) {
          add("invalid-aria-current", element, current);
        }
        if (current === "page") currentPages += 1;
      }
      if (currentPages > 1) add("multiple-current-pages", nav, `${currentPages} current pages in one navigation group`);
    }
    return { issues, regions, progressIndicators, outputs, errors };
  });
}

/**
 * Safe opt-in event runner. A button is exercised only if the page explicitly
 * marks it as a non-destructive test action and points to one status element.
 * No scheduled operations, data writes or network actions are initiated by
 * ordinary live-route census tests.
 */
export async function exerciseStatusEvent(page: Page, triggerSelector: string): Promise<FeedbackIssue[]> {
  const trigger = page.locator(triggerSelector);
  const errors: FeedbackIssue[] = [];
  const name = (await trigger.getAttribute("id")) ?? triggerSelector;
  const statusId = await trigger.getAttribute("data-a11y-safe-status-target");
  if (!statusId) return [{ code: "invalid-error-target", target: name, explanation: "No declared safe status target" }];
  const regionId: string = statusId;
  const region = page.locator(`[id=${JSON.stringify(regionId)}]`);
  if (await region.count() !== 1) return [{ code: "invalid-error-target", target: name, explanation: statusId }];
  const before = await region.textContent();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(({ id, previous }) => document.getElementById(id)?.textContent !== previous, { id: regionId, previous: before });
  const after = await region.textContent();
  if (!after?.trim()) errors.push({ code: "status-reference-empty", target: statusId, explanation: "Status update is empty" });
  const focusRestored = await trigger.evaluate((element) => element === document.activeElement);
  if (!focusRestored) errors.push({ code: "status-focus-stolen", target: name, explanation: "Status action unexpectedly moved focus" });
  return errors;
}

export function describeFeedback(report: FeedbackReport): string {
  return report.issues.map((issue) => `${issue.code}: ${issue.target}: ${issue.explanation}`).join("\n");
}
