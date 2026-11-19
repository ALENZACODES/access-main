/** Model-only accessibility contracts for forms and recovery journeys. */
export type Locale = "en" | "fr";
export type FieldKind = "text" | "number" | "email" | "date" | "select" | "radio" | "checkbox" | "textarea" | "search" | "file";
export type FormState = "editing" | "submitting" | "invalid" | "complete" | "failed";
export type ChoiceState = "off" | "on" | "mixed";
export type Level = "error" | "warning";
export interface FormIssue { readonly rule: string; readonly field: string; readonly detail: string; readonly level: Level; }
export interface FormField {
  readonly id: string;
  readonly kind: FieldKind;
  readonly label: string;
  readonly required: boolean;
  readonly ariaRequired: string | null;
  readonly ariaInvalid: string | null;
  readonly ariaDescribedBy: readonly string[];
  readonly instructions: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly visible: boolean;
  readonly focusable: boolean;
  readonly minLength: number | null;
  readonly maxLength: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly step: number | null;
  readonly choices: readonly string[];
  readonly selectedChoices: readonly string[];
  readonly groupLabel: string;
  readonly autocomplete: string | null;
  readonly errorText: string;
  readonly errorId: string | null;
}
export interface FormSnapshot {
  readonly route: string;
  readonly locale: Locale;
  readonly formId: string;
  readonly title: string;
  readonly state: FormState;
  readonly fields: readonly FormField[];
  readonly referencedIds: readonly string[];
  readonly focusedId: string | null;
  readonly summaryLinks: readonly string[];
  readonly formError: string;
  readonly lastAction: string;
  readonly disabledSubmit: boolean;
  readonly roleStatus: string;
  readonly roleAlert: string;
}
export interface FormTransition {
  readonly action: "submit" | "correct" | "reset" | "retry" | "language" | "navigate";
  readonly before: FormSnapshot;
  readonly after: FormSnapshot;
  readonly requestedLocale?: Locale;
  readonly changedField?: string;
  readonly expectedFocus?: string;
}
const finding = (rule: string, field: string, detail: string, level: Level = "error"): FormIssue => ({ rule, field, detail, level });
const normalized = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const fieldKinds = new Set<FieldKind>(["text", "number", "email", "date", "select", "radio", "checkbox", "textarea", "search", "file"]);

export function validCalendarDate(date: string): boolean {
  if (!datePattern.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined || y < 1 || m < 1 || m > 12) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d >= 1 && d <= ([31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0);
}
export function fieldIsEmpty(field: FormField): boolean {
  if (field.kind === "checkbox" || field.kind === "radio" || field.kind === "select") return field.selectedChoices.length === 0;
  return normalized(field.value).length === 0;
}
export function fieldConstraints(field: FormField): FormIssue[] {
  const issues: FormIssue[] = [];
  const id = field.id;
  if (!fieldKinds.has(field.kind)) issues.push(finding("field-kind", id, field.kind));
  if (!id || /\s/.test(id)) issues.push(finding("field-id", id, "Identifier is absent or contains spaces"));
  if (!normalized(field.label)) issues.push(finding("unnamed-field", id, field.kind));
  if (field.required && field.ariaRequired === "false") issues.push(finding("required-conflict", id, "Native and ARIA required states disagree"));
  if (field.ariaRequired !== null && !["true", "false"].includes(field.ariaRequired)) issues.push(finding("required-invalid", id, field.ariaRequired));
  if (field.ariaInvalid !== null && !["true", "false", "grammar", "spelling"].includes(field.ariaInvalid)) issues.push(finding("invalid-aria", id, field.ariaInvalid));
  if (field.maxLength !== null && field.maxLength < 0) issues.push(finding("negative-max-length", id, String(field.maxLength)));
  if (field.minLength !== null && field.minLength < 0) issues.push(finding("negative-min-length", id, String(field.minLength)));
  if (field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength) issues.push(finding("reversed-length", id, `${field.minLength} > ${field.maxLength}`));
  if (field.min !== null && field.max !== null && field.min > field.max) issues.push(finding("reversed-number-range", id, `${field.min} > ${field.max}`));
  if (field.step !== null && (!Number.isFinite(field.step) || field.step <= 0)) issues.push(finding("invalid-step", id, String(field.step)));
  if (field.kind === "number" && field.value !== "" && !Number.isFinite(Number(field.value))) issues.push(finding("not-a-number", id, field.value));
  if (field.kind === "number" && field.value !== "" && Number.isFinite(Number(field.value))) {
    const value = Number(field.value);
    if (field.min !== null && value < field.min) issues.push(finding("below-min", id, field.value));
    if (field.max !== null && value > field.max) issues.push(finding("above-max", id, field.value));
  }
  if (field.kind === "date" && field.value !== "" && !validCalendarDate(field.value)) issues.push(finding("invalid-date", id, field.value));
  if (field.kind === "email" && field.value !== "" && !emailPattern.test(field.value)) issues.push(finding("invalid-email", id, "Entered value does not match email structure"));
  if (field.minLength !== null && !fieldIsEmpty(field) && field.value.length < field.minLength) issues.push(finding("too-short", id, String(field.value.length)));
  if (field.maxLength !== null && field.value.length > field.maxLength) issues.push(finding("too-long", id, String(field.value.length)));
  if (["radio", "checkbox"].includes(field.kind) && !normalized(field.groupLabel)) issues.push(finding("unnamed-choice-group", id, field.kind));
  if (["radio", "checkbox", "select"].includes(field.kind)) {
    const known = new Set(field.choices);
    if (known.size !== field.choices.length) issues.push(finding("duplicate-choice", id, "Option keys must be unique"));
    for (const choice of field.selectedChoices) if (!known.has(choice)) issues.push(finding("unknown-choice", id, choice));
    if (field.kind === "radio" && field.selectedChoices.length > 1) issues.push(finding("multi-radio", id, String(field.selectedChoices.length)));
  }
  if (!field.visible && field.focusable) issues.push(finding("hidden-focus", id, "Hidden field is in the focus order"));
  if (field.disabled && field.focusable) issues.push(finding("disabled-focus", id, "Disabled field is in the focus order"));
  if (field.ariaInvalid === "true" && !normalized(field.errorText)) issues.push(finding("unexplained-error", id, "Field is marked invalid but has no message"));
  if (normalized(field.errorText) && !field.errorId) issues.push(finding("error-without-id", id, "Error has no reference target"));
  if (field.errorId && !field.ariaDescribedBy.includes(field.errorId)) issues.push(finding("error-not-associated", id, field.errorId));
  return issues;
}
export function formStructure(snapshot: FormSnapshot): FormIssue[] {
  const issues: FormIssue[] = [];
  if (!normalized(snapshot.title)) issues.push(finding("form-title", snapshot.formId, "No form heading"));
  if (!snapshot.formId.trim()) issues.push(finding("form-id", snapshot.route, "Form identifier absent"));
  const fields = new Set<string>();
  const knownIds = new Set(snapshot.referencedIds);
  for (const field of snapshot.fields) {
    issues.push(...fieldConstraints(field));
    if (fields.has(field.id)) issues.push(finding("duplicate-field-id", field.id, "Duplicate form field"));
    fields.add(field.id);
    for (const id of field.ariaDescribedBy) if (!knownIds.has(id)) issues.push(finding("missing-description", field.id, id));
    if (field.errorId && !knownIds.has(field.errorId)) issues.push(finding("missing-error-node", field.id, field.errorId));
    if (field.required && fieldIsEmpty(field) && snapshot.state === "complete") issues.push(finding("required-omitted", field.id, "Required field missing on completion"));
  }
  if (snapshot.focusedId && !fields.has(snapshot.focusedId) && snapshot.focusedId !== snapshot.formId) {
    issues.push(finding("focus-outside-form", snapshot.formId, snapshot.focusedId, "warning"));
  }
  if (snapshot.state === "submitting" && !snapshot.disabledSubmit && !normalized(snapshot.roleStatus)) {
    issues.push(finding("silent-submit", snapshot.formId, "Submit is active with no announced progress"));
  }
  if (snapshot.state === "invalid") {
    const hasErrors = snapshot.fields.some((field) => field.ariaInvalid === "true");
    if (!hasErrors) issues.push(finding("invalid-without-field", snapshot.formId, "No invalid control identified"));
    if (!normalized(snapshot.formError) && !normalized(snapshot.roleAlert)) issues.push(finding("missing-error-summary", snapshot.formId, "No error summary"));
    for (const field of snapshot.fields.filter((entry) => entry.ariaInvalid === "true")) {
      if (!snapshot.summaryLinks.includes(field.id)) issues.push(finding("error-summary-missing-link", field.id, "Error summary cannot focus field"));
    }
  }
  if (snapshot.state === "failed" && !normalized(snapshot.roleAlert)) issues.push(finding("silent-failure", snapshot.formId, "No failure announcement"));
  if (snapshot.state === "complete" && !normalized(snapshot.roleStatus)) issues.push(finding("silent-completion", snapshot.formId, "No completion announcement"));
  return issues;
}
export function formTransition(transition: FormTransition): FormIssue[] {
  const { before, after } = transition;
  const issues = formStructure(after);
  if (before.formId !== after.formId && transition.action !== "navigate") issues.push(finding("unexpected-form-replacement", after.formId, before.formId));
  if (before.route !== after.route && transition.action !== "navigate") issues.push(finding("unexpected-route", after.formId, before.route));
  if (before.locale !== after.locale && transition.action !== "language") issues.push(finding("language-drift", after.formId, `${before.locale} to ${after.locale}`));
  if (transition.action === "language" && transition.requestedLocale && after.locale !== transition.requestedLocale) issues.push(finding("language-switch-failed", after.formId, transition.requestedLocale));
  if (transition.action === "submit" && before.state === "editing" && after.state === "editing" && before.lastAction === after.lastAction) {
    issues.push(finding("submit-no-feedback", after.formId, "Submission did not change accessible state"));
  }
  if (transition.action === "correct" && transition.changedField) {
    const previous = before.fields.find((field) => field.id === transition.changedField);
    const current = after.fields.find((field) => field.id === transition.changedField);
    if (!previous || !current) issues.push(finding("corrected-field-missing", transition.changedField, "Field not present in both snapshots"));
    else {
      if (current.value === previous.value && current.selectedChoices.join("|") === previous.selectedChoices.join("|")) {
        issues.push(finding("correction-not-applied", current.id, "No field change"));
      }
      if (current.ariaInvalid === "true" && !normalized(current.errorText)) issues.push(finding("stale-invalid-state", current.id, "Error state has no message"));
    }
  }
  if (transition.action === "reset") {
    for (const field of after.fields) {
      const prior = before.fields.find((entry) => entry.id === field.id);
      if (prior && (field.value !== "" || field.selectedChoices.length > 0) && !field.disabled) {
        issues.push(finding("reset-not-complete", field.id, "Value retained"));
      }
    }
  }
  if (transition.expectedFocus !== undefined && after.focusedId !== transition.expectedFocus) issues.push(finding("focus-not-restored", after.formId, `${transition.expectedFocus} expected`));
  return issues;
}
export interface FormLedger {
  readonly snapshots: readonly FormSnapshot[];
  readonly transitions: readonly FormTransition[];
}
export function formLedgerFindings(ledger: FormLedger): FormIssue[] {
  const issues: FormIssue[] = [];
  for (const snapshot of ledger.snapshots) issues.push(...formStructure(snapshot));
  for (const transition of ledger.transitions) issues.push(...formTransition(transition));
  for (const [index, transition] of ledger.transitions.entries()) {
    if (index === 0) continue;
    const prior = ledger.transitions[index - 1];
    if (prior && (prior.after.route !== transition.before.route || prior.after.locale !== transition.before.locale)) {
      issues.push(finding("ledger-gap", transition.before.formId, `Transition ${index} does not continue prior route and locale`));
    }
  }
  return issues;
}
export function problemCodes(items: readonly FormIssue[]): string[] { return items.map((item) => item.rule); }
export function report(items: readonly FormIssue[], limit = 35): string {
  const unique = [...new Set(items.map((item) => `${item.level} ${item.rule} ${item.field}: ${item.detail}`))];
  return [...unique.slice(0, limit), ...(unique.length > limit ? [`${unique.length - limit} additional problems`] : [])].join("\n");
}
