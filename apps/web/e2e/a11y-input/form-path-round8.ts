import { expect, type Page } from "@playwright/test";

export interface FormFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface FormActionResult {
  readonly field: string;
  readonly described: boolean;
  readonly invalid: boolean;
  readonly messageVisible: boolean;
  readonly focusStayed: boolean;
}

/** Resolve common HTML/ARIA accessible name paths, including associated labels. */
export async function inspectFormNames(page: Page): Promise<FormFinding[]> {
  return page.evaluate(() => {
    const findings: FormFinding[] = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(
      "input:not([type='hidden']),textarea,select,[role='textbox'],[role='combobox']," +
      "[role='searchbox'],[role='spinbutton'],[role='slider'],[role='switch']," +
      "[role='checkbox'],[role='radio']",
    ));
    const visible = (node: HTMLElement): boolean => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" &&
        rect.width > 0 && rect.height > 0 && !node.closest("[hidden],[inert]");
    };
    for (const [index, node] of nodes.entries()) {
      if (!visible(node)) continue;
      const target = node.id ? `#${node.id}` : `${node.localName}[${index}]`;
      const idrefs = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const labels = idrefs.map((id) => document.getElementById(id));
      const associated = node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
        node instanceof HTMLTextAreaElement ? Array.from(node.labels ?? []).map((label) =>
          label.textContent?.trim() ?? "").join(" ") : "";
      const aria = node.getAttribute("aria-label")?.trim() ?? "";
      const referenced = labels.map((item) => item?.textContent?.trim() ?? "").join(" ").trim();
      const fallback = node.getAttribute("title")?.trim() ?? "";
      const value = node.getAttribute("value") ?? "";
      const role = node.getAttribute("role") ?? "";
      const isButton = node.matches("input[type='button'],input[type='submit'],input[type='reset']");
      const contentsName = ["checkbox", "radio", "switch"].includes(role) ?
        node.textContent?.trim() ?? "" : "";
      const name = aria || referenced || associated || fallback || (isButton ? value : "") || contentsName;
      if (!name) findings.push({ code: "field-name", target,
        detail: "Input or ARIA field is missing an accessible name" });
      for (const [i, element] of labels.entries()) {
        if (!element) findings.push({ code: "field-label-reference", target,
          detail: `Missing labelledby target ${idrefs[i]}` });
      }
      const descriptions = (node.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      for (const id of descriptions) {
        if (!document.getElementById(id)) findings.push({ code: "field-description-reference", target,
          detail: `Missing description ${id}` });
      }
      const invalid = node.getAttribute("aria-invalid");
      if (invalid && !["true", "false", "grammar", "spelling"].includes(invalid)) {
        findings.push({ code: "field-invalid-state", target,
          detail: `Unsupported aria-invalid ${invalid}` });
      }
      const errors = (node.getAttribute("aria-errormessage") ?? "").split(/\s+/).filter(Boolean);
      for (const id of errors) {
        if (!document.getElementById(id)) findings.push({ code: "field-error-reference", target,
          detail: `Missing error message ${id}` });
      }
      const required = node.getAttribute("aria-required");
      if (required !== null && required !== "true" && required !== "false") {
        findings.push({ code: "field-required-state", target, detail: `Invalid required state ${required}` });
      }
      if (node.matches(":disabled") && node.getAttribute("tabindex") === "0") {
        findings.push({ code: "disabled-field-tabstop", target,
          detail: "Disabled field explicitly participates in tab order" });
      }
      if (["checkbox", "radio", "switch"].includes(role)) {
        const checked = node.getAttribute("aria-checked");
        if (checked === null && !(node instanceof HTMLInputElement)) {
          findings.push({ code: "field-checked-state-missing", target,
            detail: "ARIA stateful control lacks aria-checked" });
        } else if (checked !== null && !["true", "false", "mixed"].includes(checked)) {
          findings.push({ code: "field-checked-state-invalid", target,
            detail: `Unexpected aria-checked ${checked}` });
        }
        if (role === "radio" && checked === "mixed") {
          findings.push({ code: "radio-indeterminate", target,
            detail: "Radio options cannot use a mixed checked state" });
        }
      }
    }
    return findings;
  });
}

/** Validate grouped controls without assuming their selected answers. */
export async function inspectFormGroups(page: Page): Promise<FormFinding[]> {
  return page.evaluate(() => {
    const findings: FormFinding[] = [];
    for (const [index, fieldset] of Array.from(document.querySelectorAll("fieldset")).entries()) {
      const legend = fieldset.querySelector("legend")?.textContent?.trim();
      if (!legend) findings.push({ code: "fieldset-legend", target: `fieldset[${index}]`,
        detail: "Fieldset needs a descriptive legend" });
    }
    const groups = Array.from(document.querySelectorAll<HTMLElement>(
      "[role='radiogroup'],[role='group'],[role='listbox']",
    ));
    for (const [index, group] of groups.entries()) {
      const style = getComputedStyle(group);
      if (style.visibility === "hidden" || style.display === "none" || group.closest("[hidden]")) continue;
      const target = group.id ? `#${group.id}` : `group[${index}]`;
      const ids = (group.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const name = group.getAttribute("aria-label")?.trim() || ids.map((id) =>
        document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      if (!name && group.getAttribute("role") !== "group") {
        findings.push({ code: "form-group-name", target, detail: "Group lacks an accessible label" });
      }
      // Native radio inputs have the implicit radio role. Omitting them would
      // report an empty group even when it contains labelled radio controls.
      const items = Array.from(group.querySelectorAll<HTMLElement>(
        group.getAttribute("role") === "radiogroup"
          ? "[role='radio'],input[type='radio']"
          : "[role='option']",
      )).filter((item) => !(item instanceof HTMLInputElement &&
        item.closest("[role='radio']")));
      // A synthetic radio can wrap a native input. Count that widget once,
      // while retaining the native input's implicit role when it stands alone.
      if (group.getAttribute("role") === "radiogroup") {
        if (!items.length) findings.push({ code: "radiogroup-empty", target,
          detail: "Radio group has no radio options" });
        const selected = items.filter((item) => item instanceof HTMLInputElement
          ? item.checked : item.getAttribute("aria-checked") === "true");
        if (selected.length > 1) findings.push({ code: "radiogroup-multi-selected", target,
          detail: "More than one radio is checked" });
        // Native radio groups follow the browser's checked-radio focus rule.
        // An explicit roving tabindex contract applies to synthetic ARIA radios.
        const reachable = items.filter((item) =>
          !(item instanceof HTMLInputElement) && item.getAttribute("tabindex") === "0");
        if (reachable.length > 1) findings.push({ code: "radiogroup-multi-tabstop", target,
          detail: "More than one radio participates in sequential focus" });
      }
      if (group.getAttribute("role") === "listbox") {
        if (!items.length) findings.push({ code: "listbox-empty", target,
          detail: "Listbox exposes no options" });
        const multiple = group.getAttribute("aria-multiselectable") === "true";
        const selected = items.filter((item) => item.getAttribute("aria-selected") === "true");
        if (!multiple && selected.length > 1) {
          findings.push({ code: "listbox-too-many-selections", target,
            detail: "Single-selection listbox has multiple selected options" });
        }
      }
    }
    return findings;
  });
}

/** Inspect form submission affordances, not the personal data being entered. */
export async function inspectFormActions(page: Page): Promise<FormFinding[]> {
  return page.evaluate(() => {
    const findings: FormFinding[] = [];
    const forms = Array.from(document.querySelectorAll("form"));
    for (const [index, form] of forms.entries()) {
      const name = form.getAttribute("aria-label")?.trim() ||
        form.getAttribute("aria-labelledby") || "";
      const target = form.id ? `#${form.id}` : `form[${index}]`;
      if (forms.length > 1 && !name && !form.getAttribute("title")) {
        findings.push({ code: "multi-form-unnamed", target,
          detail: "Multiple forms should expose distinct purposes" });
      }
      const submits = Array.from(form.querySelectorAll<HTMLElement>(
        "button[type='submit'],input[type='submit']",
      ));
      for (const [buttonIndex, button] of submits.entries()) {
        const buttonName = button.getAttribute("aria-label")?.trim() ||
          (button instanceof HTMLInputElement ? button.value : button.textContent?.trim()) || "";
        if (!buttonName) findings.push({ code: "submit-name", target: `${target}/submit[${buttonIndex}]`,
          detail: "Submit action has no accessible name" });
      }
    }
    return findings;
  });
}

/** Optional instrumentation permits safe validation without submitting real data. */
export async function exerciseOptInFormError(
  page: Page,
  selector = "[data-a11y-form-error-trigger]",
): Promise<FormActionResult[]> {
  const results: FormActionResult[] = [];
  const triggers = page.locator(selector);
  const count = await triggers.count();
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible()) || !(await trigger.isEnabled())) continue;
    const target = await trigger.getAttribute("data-a11y-form-error-trigger");
    expect(target, "Opt-in form trigger must name a field ID").toBeTruthy();
    const field = page.locator(`[id=${JSON.stringify(target)}]`);
    await expect(field).toHaveCount(1);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => field.getAttribute("aria-invalid")).toBe("true");
    const describedBy = (await field.getAttribute("aria-describedby")) ?? "";
    const errorBy = (await field.getAttribute("aria-errormessage")) ?? "";
    const referenced = [...new Set([...describedBy.split(/\s+/), ...errorBy.split(/\s+/)])]
      .filter(Boolean);
    const messageVisible = referenced.length > 0 && (await Promise.all(referenced.map(async (id) => {
      const element = page.locator(`[id=${JSON.stringify(id)}]`);
      return (await element.count()) === 1 && await element.isVisible() &&
        Boolean((await element.textContent())?.trim());
    }))).some(Boolean);
    results.push({
      field: target ?? "",
      described: referenced.length > 0,
      invalid: (await field.getAttribute("aria-invalid")) === "true",
      messageVisible,
      focusStayed: await trigger.evaluate((node) => node === document.activeElement),
    });
  }
  return results;
}

/** An optional field-error trigger must produce a visible, referenced message. */
export async function assertOptInFormErrors(page: Page): Promise<void> {
  const results = await exerciseOptInFormError(page);
  for (const result of results) {
    expect(result.invalid, `${result.field}: error state`).toBe(true);
    expect(result.described, `${result.field}: error reference`).toBe(true);
    expect(result.messageVisible, `${result.field}: visible error text`).toBe(true);
    expect(result.focusStayed, `${result.field}: focus stays on action`).toBe(true);
  }
}

export async function auditFormRoute(page: Page): Promise<FormFinding[]> {
  return [
    ...await inspectFormNames(page),
    ...await inspectFormGroups(page),
    ...await inspectFormActions(page),
  ];
}
