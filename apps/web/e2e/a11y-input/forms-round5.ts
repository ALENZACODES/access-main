import { expect, type Page } from "@playwright/test";

export interface FormFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/** Inspect visible form semantics without submitting, mutating, or guessing user data. */
export async function auditFormSemantics(page: Page): Promise<FormFinding[]> {
  return page.evaluate(() => {
    const findings: FormFinding[] = [];
    const identify = (node: Element): string => node.id || node.getAttribute("name") || node.localName;
    const report = (code: string, node: Element, detail: string): void => {
      findings.push({ code, target: identify(node), detail });
    };
    const visible = (node: Element): boolean => {
      if (node.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const css = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return css.display !== "none" && css.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const linkedText = (node: Element, attribute: string): string => {
      const ids = (node.getAttribute(attribute) || "").trim().split(/\s+/).filter(Boolean);
      return ids.map((id) => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim();
    };
    const hasName = (node: Element): boolean => {
      if (node.getAttribute("aria-label")?.trim()) return true;
      if (linkedText(node, "aria-labelledby")) return true;
      if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
          node instanceof HTMLTextAreaElement) {
        if (Array.from(node.labels || []).some((label) => label.textContent?.trim())) return true;
      }
      return Boolean(node.getAttribute("title")?.trim());
    };
    const controls = document.querySelectorAll<HTMLElement>(
      "input:not([type='hidden']),textarea,select,[role='textbox'],[role='combobox'],[role='spinbutton'],[role='searchbox']",
    );
    for (const control of Array.from(controls)) {
      if (!visible(control) || control.closest("template")) continue;
      if (!hasName(control)) report("form-control-name", control, "Control has no programmatic name");
      if (control.getAttribute("aria-invalid") &&
          !["true", "false", "grammar", "spelling"].includes(control.getAttribute("aria-invalid") || "")) {
        report("invalid-aria-invalid", control, "Unsupported aria-invalid value");
      }
      if (control.getAttribute("aria-required") &&
          !["true", "false"].includes(control.getAttribute("aria-required") || "")) {
        report("invalid-aria-required", control, "Unsupported aria-required value");
      }
      if (control.getAttribute("aria-invalid") === "true") {
        const errorId = control.getAttribute("aria-errormessage");
        const descriptionId = control.getAttribute("aria-describedby");
        if (!errorId && !descriptionId) {
          report("missing-error-association", control, "Invalid control has no description reference");
        } else if (!linkedText(control, "aria-errormessage") &&
                   !linkedText(control, "aria-describedby")) {
          report("empty-error-association", control, "Referenced error message has no text");
        }
      }
      const autocomplete = control.getAttribute("autocomplete");
      if (autocomplete?.trim() === "") report("empty-autocomplete", control, "Empty autocomplete attribute");
      if (control instanceof HTMLInputElement) {
        if (control.type === "image" && !control.getAttribute("alt")?.trim()) {
          report("image-submit-name", control, "Image submit control has no alternative name");
        }
        if (control.type === "radio" && !control.name) {
          report("radio-group-name", control, "Radio has no group name");
        }
      }
    }
    for (const fieldset of Array.from(document.querySelectorAll("fieldset"))) {
      if (!visible(fieldset)) continue;
      const associated = fieldset.querySelectorAll("input[type='radio'],input[type='checkbox']");
      if (associated.length > 1 && !fieldset.querySelector("legend")?.textContent?.trim()) {
        report("fieldset-legend", fieldset, "Group requires a descriptive legend");
      }
    }
    for (const label of Array.from(document.querySelectorAll("label[for]"))) {
      if (!visible(label)) continue;
      const id = label.getAttribute("for") || "";
      const target = document.getElementById(id);
      if (!id || !target) report("orphan-label", label, "Label target does not exist");
      else if (!target.matches("input,select,textarea,button,output,meter,progress")) {
        report("label-target-type", label, "Label target is not labelable");
      }
    }
    for (const group of Array.from(document.querySelectorAll<HTMLElement>("[role='radiogroup'],[role='group']"))) {
      if (!visible(group)) continue;
      if (!group.querySelector("[role='radio'],input[type='radio'],input[type='checkbox'],[role='checkbox']")) continue;
      if (!group.getAttribute("aria-label")?.trim() && !linkedText(group, "aria-labelledby")) {
        report("unnamed-control-group", group, "Control group has no accessible name");
      }
    }
    return findings;
  });
}

export interface FormEventObservation {
  readonly before: string;
  readonly after: string;
  readonly focused: string;
  readonly errorReferences: readonly string[];
}

/**
 * Only explicitly marked non-destructive demo forms are submitted. This protects
 * application records and avoids triggering real communication or transactions.
 */
export async function exerciseSafeFormValidation(page: Page): Promise<FormEventObservation[]> {
  const forms = page.locator("form[data-a11y-test-submit='safe']");
  const observations: FormEventObservation[] = [];
  for (let index = 0, count = await forms.count(); index < count; index += 1) {
    const form = forms.nth(index);
    if (!(await form.isVisible())) continue;
    const submit = form.locator("button[type='submit'],input[type='submit']").first();
    if (!(await submit.count()) || !(await submit.isEnabled())) continue;
    const before = await form.evaluate((element) => element.textContent || "");
    await submit.focus();
    await page.keyboard.press("Enter");
    const after = await form.evaluate((element) => element.textContent || "");
    const state = await form.evaluate(() => {
      const active = document.activeElement;
      const invalid = Array.from(document.querySelectorAll("[aria-invalid='true']"));
      return {
        focused: active?.id || active?.nodeName.toLowerCase() || "",
        errorReferences: invalid.map((element) =>
          element.getAttribute("aria-errormessage") || element.getAttribute("aria-describedby") || ""),
      };
    });
    observations.push({ before, after, ...state });
  }
  return observations;
}

export async function assertFormSemantics(page: Page): Promise<void> {
  expect(await auditFormSemantics(page), "Form control names and error associations").toEqual([]);
  const observations = await exerciseSafeFormValidation(page);
  for (const observation of observations) {
    expect(observation.focused.length, "Focus must remain within a rendered page").toBeGreaterThan(0);
    expect(observation.errorReferences.every(Boolean), "Invalid controls describe their errors").toBe(true);
  }
}
