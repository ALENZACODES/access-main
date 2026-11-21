import { expect, type Page } from "@playwright/test";

export interface FormIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export interface FormField {
  readonly selector: string;
  readonly name: string;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly describedBy: readonly string[];
  readonly errorText: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
}
export interface FormSnapshot {
  readonly fields: readonly FormField[];
  readonly issues: readonly FormIssue[];
}
const FIELD_SELECTOR = "input:not([type='hidden']),select,textarea,[role='textbox'],[role='combobox'],[role='checkbox'],[role='radio']";
export async function inspectFormFeedback(page: Page): Promise<FormSnapshot> {
  return page.evaluate((selector) => {
    const issues: FormIssue[] = [];
    const fields = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const snapshots = fields.map((node, index): FormField => {
      const target = node.id ? `#${CSS.escape(node.id)}` : `${node.localName}[${index}]`;
      const ids = (node.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const labelled = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      const labels = node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement
        ? Array.from(node.labels ?? []).map((label) => label.textContent?.trim() ?? "").join(" ").trim()
        : "";
      const name = node.getAttribute("aria-label")?.trim() || labelled || labels || node.textContent?.trim() || "";
      const invalid = node.getAttribute("aria-invalid") === "true";
      const errorText = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
      const required = node.hasAttribute("required") || node.getAttribute("aria-required") === "true";
      const disabled = node.matches(":disabled,[aria-disabled='true']");
      const readOnly = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
        ? node.readOnly : false;
      if (!name) issues.push({ code: "field-name-empty", selector: target, detail: "Form field has no accessible name" });
      if (invalid && !errorText) issues.push({ code: "field-error-unannounced", selector: target, detail: "Invalid field has no associated error text" });
      if (invalid && node.getAttribute("aria-invalid") !== "true") issues.push({ code: "field-invalid-state", selector: target, detail: "Invalid field state is not exposed" });
      for (const id of ids) if (!document.getElementById(id)) issues.push({ code: "field-description-missing", selector: target, detail: `aria-describedby references missing #${id}` });
      if (required && node.getAttribute("aria-required") === "false") issues.push({ code: "field-required-conflict", selector: target, detail: "Native or ARIA required state conflicts" });
      if (node.hasAttribute("aria-errormessage")) {
        const errorId = node.getAttribute("aria-errormessage") ?? "";
        if (!document.getElementById(errorId)) issues.push({ code: "field-errormessage-missing", selector: target, detail: `aria-errormessage references missing #${errorId}` });
      }
      return { selector: target, name, required, invalid, describedBy: ids, errorText, disabled, readOnly };
    });
    return { fields: snapshots, issues };
  }, FIELD_SELECTOR);
}
export async function assertFormFeedback(page: Page): Promise<FormSnapshot> {
  const snapshot = await inspectFormFeedback(page);
  expect(snapshot.issues, "Form feedback contract").toEqual([]);
  return snapshot;
}
export async function exerciseRequiredError(page: Page, formSelector: string, submitSelector: string): Promise<void> {
  const form = page.locator(formSelector);
  await expect(form).toHaveCount(1);
  await form.locator(submitSelector).click();
  const invalid = form.locator("[aria-invalid='true'],:invalid");
  await expect(invalid.first()).toBeVisible();
  const feedback = await inspectFormFeedback(page);
  expect(feedback.issues).toEqual([]);
}
export async function assertErrorSummaryLinks(page: Page, summarySelector: string): Promise<void> {
  const summary = page.locator(summarySelector);
  await expect(summary).toBeVisible();
  const links = summary.locator("a[href^='#']");
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const href = await links.nth(index).getAttribute("href");
    expect(href).toBeTruthy();
    await expect(page.locator(href ?? "")).toHaveCount(1);
  }
}
