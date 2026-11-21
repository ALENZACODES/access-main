import { expect, test } from "@playwright/test";
import {
  fieldConstraints, fieldIsEmpty, formLedgerFindings, formStructure, formTransition,
  problemCodes, report, validCalendarDate,
  type FormField, type FormSnapshot, type FormTransition,
} from "./p20x-forms";

const field = (changes: Partial<FormField> = {}): FormField => ({
  id: "query", kind: "text", label: "Search terms", required: false,
  ariaRequired: null, ariaInvalid: "false", ariaDescribedBy: [], instructions: "",
  value: "library", disabled: false, visible: true, focusable: true,
  minLength: null, maxLength: null, min: null, max: null, step: null,
  choices: [], selectedChoices: [], groupLabel: "", autocomplete: null,
  errorText: "", errorId: null, ...changes,
});
const form = (changes: Partial<FormSnapshot> = {}): FormSnapshot => ({
  route: "/finders", locale: "en", formId: "finder", title: "Find places",
  state: "editing", fields: [field()], referencedIds: [], focusedId: "query",
  summaryLinks: [], formError: "", lastAction: "idle", disabledSubmit: false,
  roleStatus: "", roleAlert: "", ...changes,
});
const transition = (changes: Partial<FormTransition> = {}): FormTransition => ({
  action: "submit", before: form(), after: form({ state: "submitting", disabledSubmit: true, lastAction: "submit" }),
  ...changes,
});
const codes = (items: readonly { rule: string }[]) => items.map((item) => item.rule);

for (const value of ["2024-02-29", "2000-02-29", "2026-11-19", "1900-01-01", "9999-12-31"]) {
  test(`recognizes calendar date ${value}`, () => expect(validCalendarDate(value)).toBe(true));
}
for (const value of ["2025-02-29", "1900-02-29", "2026-00-01", "2026-13-01", "2026-11-31", "0000-01-01", "2026/11/19", "2026-1-2", "2026-02-00", "future"]) {
  test(`rejects invalid calendar date ${value}`, () => expect(validCalendarDate(value)).toBe(false));
}
for (const kind of ["text", "number", "email", "date", "search", "file", "textarea"] as const) {
  test(`empty ${kind} field reads empty`, () => {
    expect(fieldIsEmpty(field({ kind, value: "" }))).toBe(true);
  });
  test(`nonempty ${kind} field is not empty`, () => {
    expect(fieldIsEmpty(field({ kind, value: "ready" }))).toBe(false);
  });
}
for (const kind of ["radio", "checkbox", "select"] as const) {
  test(`unselected ${kind} is empty`, () => {
    expect(fieldIsEmpty(field({ kind, choices: ["a"], selectedChoices: [] }))).toBe(true);
  });
  test(`selected ${kind} is not empty`, () => {
    expect(fieldIsEmpty(field({ kind, choices: ["a"], selectedChoices: ["a"] }))).toBe(false);
  });
}

test("a complete minimal text field has no structural problems", () => {
  expect(fieldConstraints(field())).toEqual([]);
});
test("fields without labels fail", () => {
  expect(codes(fieldConstraints(field({ label: " " })))).toContain("unnamed-field");
});
test("field IDs cannot contain whitespace", () => {
  expect(codes(fieldConstraints(field({ id: "two words" })))).toContain("field-id");
});
test("field ID cannot be empty", () => {
  expect(codes(fieldConstraints(field({ id: "" })))).toContain("field-id");
});
test("native required and false ARIA conflict", () => {
  expect(codes(fieldConstraints(field({ required: true, ariaRequired: "false" })))).toContain("required-conflict");
});
test("explicit ARIA required true is allowed", () => {
  expect(codes(fieldConstraints(field({ required: true, ariaRequired: "true" })))).not.toContain("required-conflict");
});
test("invalid ARIA required token fails", () => {
  expect(codes(fieldConstraints(field({ ariaRequired: "mixed" })))).toContain("required-invalid");
});
test("invalid ARIA invalid token fails", () => {
  expect(codes(fieldConstraints(field({ ariaInvalid: "possibly" })))).toContain("invalid-aria");
});
for (const invalid of ["true", "false", "grammar", "spelling"]) {
  test(`accepted aria-invalid state ${invalid}`, () => {
    const errors = fieldConstraints(field({ ariaInvalid: invalid, errorText: invalid === "true" ? "Please correct" : "", errorId: invalid === "true" ? "err" : null, ariaDescribedBy: invalid === "true" ? ["err"] : [] }));
    expect(codes(errors)).not.toContain("invalid-aria");
  });
}
test("negative maximum length fails", () => {
  expect(codes(fieldConstraints(field({ maxLength: -1 })))).toContain("negative-max-length");
});
test("negative minimum length fails", () => {
  expect(codes(fieldConstraints(field({ minLength: -1 })))).toContain("negative-min-length");
});
test("reversed length boundaries fail", () => {
  expect(codes(fieldConstraints(field({ minLength: 10, maxLength: 5 })))).toContain("reversed-length");
});
test("short value violates declared minimum", () => {
  expect(codes(fieldConstraints(field({ minLength: 9, value: "hi" })))).toContain("too-short");
});
test("long value violates declared maximum", () => {
  expect(codes(fieldConstraints(field({ maxLength: 2, value: "long" })))).toContain("too-long");
});
test("valid length boundaries pass", () => {
  expect(fieldConstraints(field({ minLength: 2, maxLength: 9, value: "four" }))).toEqual([]);
});
test("reversed numeric range fails", () => {
  expect(codes(fieldConstraints(field({ kind: "number", min: 10, max: 3, value: "5" })))).toContain("reversed-number-range");
});
test("invalid numeric value fails", () => {
  expect(codes(fieldConstraints(field({ kind: "number", value: "ten" })))).toContain("not-a-number");
});
test("value below numeric minimum fails", () => {
  expect(codes(fieldConstraints(field({ kind: "number", value: "2", min: 5 })))).toContain("below-min");
});
test("value above numeric maximum fails", () => {
  expect(codes(fieldConstraints(field({ kind: "number", value: "9", max: 7 })))).toContain("above-max");
});
test("number at boundary passes", () => {
  expect(fieldConstraints(field({ kind: "number", value: "5", min: 5, max: 5 }))).toEqual([]);
});
for (const step of [0, -1, Infinity, Number.NaN]) {
  test(`invalid number step ${step}`, () => {
    expect(codes(fieldConstraints(field({ kind: "number", value: "5", step })))).toContain("invalid-step");
  });
}
test("valid fractional step passes", () => {
  expect(codes(fieldConstraints(field({ kind: "number", value: "5", step: 0.25 })))).not.toContain("invalid-step");
});
test("invalid date fails", () => {
  expect(codes(fieldConstraints(field({ kind: "date", value: "2026-02-30" })))).toContain("invalid-date");
});
test("valid leap date passes", () => {
  expect(codes(fieldConstraints(field({ kind: "date", value: "2024-02-29" })))).not.toContain("invalid-date");
});
test("malformed email fails without disclosing value", () => {
  const problems = fieldConstraints(field({ kind: "email", value: "missing-at-sign" }));
  expect(codes(problems)).toContain("invalid-email");
  expect(JSON.stringify(problems)).not.toContain("missing-at-sign");
});
test("structured email passes", () => {
  expect(fieldConstraints(field({ kind: "email", value: "example@example.org" }))).toEqual([]);
});
for (const kind of ["checkbox", "radio"] as const) {
  test(`${kind} group requires group label`, () => {
    expect(codes(fieldConstraints(field({ kind, value: "", choices: ["a"] })))).toContain("unnamed-choice-group");
  });
  test(`${kind} group with group label passes`, () => {
    const f = field({ kind, value: "", choices: ["a"], groupLabel: "Options", selectedChoices: ["a"] });
    expect(codes(fieldConstraints(f))).not.toContain("unnamed-choice-group");
  });
}
test("radio does not allow multiple choices", () => {
  const f = field({ kind: "radio", choices: ["a", "b"], selectedChoices: ["a", "b"], groupLabel: "Options" });
  expect(codes(fieldConstraints(f))).toContain("multi-radio");
});
test("checkbox allows multiple choices", () => {
  const f = field({ kind: "checkbox", choices: ["a", "b"], selectedChoices: ["a", "b"], groupLabel: "Options" });
  expect(fieldConstraints(f)).toEqual([]);
});
test("duplicate option keys are an error", () => {
  expect(codes(fieldConstraints(field({ kind: "select", choices: ["a", "a"] })))).toContain("duplicate-choice");
});
test("selected option outside the set fails", () => {
  expect(codes(fieldConstraints(field({ kind: "select", choices: ["a"], selectedChoices: ["b"] })))).toContain("unknown-choice");
});
test("hidden but focusable field fails", () => {
  expect(codes(fieldConstraints(field({ visible: false })))).toContain("hidden-focus");
});
test("hidden field removed from tab sequence passes", () => {
  expect(fieldConstraints(field({ visible: false, focusable: false }))).toEqual([]);
});
test("disabled but focusable field fails", () => {
  expect(codes(fieldConstraints(field({ disabled: true })))).toContain("disabled-focus");
});
test("disabled and untabbable field passes", () => {
  expect(fieldConstraints(field({ disabled: true, focusable: false }))).toEqual([]);
});
test("invalid field without explanation fails", () => {
  expect(codes(fieldConstraints(field({ ariaInvalid: "true" })))).toContain("unexplained-error");
});
test("error text without target ID fails", () => {
  expect(codes(fieldConstraints(field({ ariaInvalid: "true", errorText: "Correct this" })))).toContain("error-without-id");
});
test("an error requires aria-describedby association", () => {
  expect(codes(fieldConstraints(field({ ariaInvalid: "true", errorText: "Correct this", errorId: "err" })))).toContain("error-not-associated");
});
test("associated error reference passes field check", () => {
  const f = field({ ariaInvalid: "true", errorText: "Correct this", errorId: "err", ariaDescribedBy: ["err"] });
  expect(fieldConstraints(f)).toEqual([]);
});

test("minimal editing form has no structure findings", () => {
  expect(formStructure(form())).toEqual([]);
});
test("form title is required", () => {
  expect(codes(formStructure(form({ title: " " })))).toContain("form-title");
});
test("form ID is required", () => {
  expect(codes(formStructure(form({ formId: "" })))).toContain("form-id");
});
test("duplicate field IDs fail", () => {
  expect(codes(formStructure(form({ fields: [field(), field()] })))).toContain("duplicate-field-id");
});
test("unresolved aria-describedby fails", () => {
  expect(codes(formStructure(form({ fields: [field({ ariaDescribedBy: ["missing"] })] })))).toContain("missing-description");
});
test("valid help description association passes", () => {
  const f = form({ referencedIds: ["hint"], fields: [field({ ariaDescribedBy: ["hint"] })] });
  expect(formStructure(f)).toEqual([]);
});
test("error ID missing from DOM is detected", () => {
  const f = form({ fields: [field({ ariaInvalid: "true", errorText: "Fix", errorId: "err", ariaDescribedBy: ["err"] })] });
  expect(codes(formStructure(f))).toContain("missing-error-node");
});
test("completed form cannot omit a required field", () => {
  const f = form({ state: "complete", roleStatus: "Complete", fields: [field({ required: true, value: "" })] });
  expect(codes(formStructure(f))).toContain("required-omitted");
});
test("required field with a value allows completion", () => {
  const f = form({ state: "complete", roleStatus: "Complete", fields: [field({ required: true })] });
  expect(codes(formStructure(f))).not.toContain("required-omitted");
});
test("silent submission without disabled submit is rejected", () => {
  expect(codes(formStructure(form({ state: "submitting" })))).toContain("silent-submit");
});
test("disabled submit conveys pending state", () => {
  expect(codes(formStructure(form({ state: "submitting", disabledSubmit: true })))).not.toContain("silent-submit");
});
test("status message also conveys pending state", () => {
  expect(codes(formStructure(form({ state: "submitting", roleStatus: "Saving" })))).not.toContain("silent-submit");
});
test("invalid form must identify a field", () => {
  expect(codes(formStructure(form({ state: "invalid", roleAlert: "Correct errors" })))).toContain("invalid-without-field");
});
test("invalid form must summarize errors", () => {
  const f = form({ state: "invalid", fields: [field({ ariaInvalid: "true", errorText: "Fix", errorId: "err", ariaDescribedBy: ["err"] })], referencedIds: ["err"] });
  expect(codes(formStructure(f))).toContain("missing-error-summary");
});
test("error summary must link to invalid field", () => {
  const f = form({ state: "invalid", roleAlert: "Please fix", fields: [field({ ariaInvalid: "true", errorText: "Fix", errorId: "err", ariaDescribedBy: ["err"] })], referencedIds: ["err"] });
  expect(codes(formStructure(f))).toContain("error-summary-missing-link");
});
test("fully linked error field passes", () => {
  const f = form({ state: "invalid", roleAlert: "Please fix", summaryLinks: ["query"], fields: [field({ ariaInvalid: "true", errorText: "Fix", errorId: "err", ariaDescribedBy: ["err"] })], referencedIds: ["err"] });
  expect(formStructure(f)).toEqual([]);
});
test("failed submit must announce failure", () => {
  expect(codes(formStructure(form({ state: "failed" })))).toContain("silent-failure");
});
test("completed submit must announce completion", () => {
  expect(codes(formStructure(form({ state: "complete" })))).toContain("silent-completion");
});
test("focus outside form creates warning", () => {
  const issues = formStructure(form({ focusedId: "global-navigation" }));
  expect(issues).toContainEqual(expect.objectContaining({ rule: "focus-outside-form", level: "warning" }));
});
test("form container can receive focus for error summary", () => {
  expect(codes(formStructure(form({ focusedId: "finder" })))).not.toContain("focus-outside-form");
});

test("valid submit action enters pending state", () => {
  expect(formTransition(transition())).toEqual([]);
});
test("unresponsive submit is detected", () => {
  expect(codes(formTransition(transition({ after: form() })))).toContain("submit-no-feedback");
});
test("incorrect route transition is detected", () => {
  expect(codes(formTransition(transition({ after: form({ route: "/help" }) })))).toContain("unexpected-route");
});
test("navigation action allows route change", () => {
  const t = transition({ action: "navigate", after: form({ route: "/help" }) });
  expect(codes(formTransition(t))).not.toContain("unexpected-route");
});
test("non-language action does not alter locale", () => {
  expect(codes(formTransition(transition({ after: form({ locale: "fr" }) })))).toContain("language-drift");
});
test("language action checks requested locale", () => {
  const t = transition({ action: "language", requestedLocale: "fr", after: form({ locale: "en" }) });
  expect(codes(formTransition(t))).toContain("language-switch-failed");
});
test("language action accepts French when requested", () => {
  const t = transition({ action: "language", requestedLocale: "fr", after: form({ locale: "fr" }) });
  expect(codes(formTransition(t))).not.toContain("language-switch-failed");
});
test("correction must change the field", () => {
  const t = transition({ action: "correct", changedField: "query", after: form() });
  expect(codes(formTransition(t))).toContain("correction-not-applied");
});
test("changed correction passes change check", () => {
  const t = transition({ action: "correct", changedField: "query", after: form({ fields: [field({ value: "school" })] }) });
  expect(codes(formTransition(t))).not.toContain("correction-not-applied");
});
test("missing correction field is detected", () => {
  const t = transition({ action: "correct", changedField: "other" });
  expect(codes(formTransition(t))).toContain("corrected-field-missing");
});
test("reset must clear editable values", () => {
  const t = transition({ action: "reset", after: form() });
  expect(codes(formTransition(t))).toContain("reset-not-complete");
});
test("reset with empty field passes", () => {
  const t = transition({ action: "reset", after: form({ fields: [field({ value: "" })] }) });
  expect(codes(formTransition(t))).not.toContain("reset-not-complete");
});
test("focus restoration is required when caller specifies it", () => {
  expect(codes(formTransition(transition({ expectedFocus: "submit" })))).toContain("focus-not-restored");
});
test("focus restoration passes on matching target", () => {
  expect(codes(formTransition(transition({ expectedFocus: "query" })))).not.toContain("focus-not-restored");
});
test("form ledger with a valid transition passes", () => {
  const t = transition();
  expect(formLedgerFindings({ snapshots: [t.before], transitions: [t] })).toEqual([]);
});
test("form ledger catches inconsistent route continuity", () => {
  const a = transition();
  const b = transition({ before: form({ route: "/other" }) });
  expect(codes(formLedgerFindings({ snapshots: [], transitions: [a, b] }))).toContain("ledger-gap");
});
test("summary formatting keeps the field and rule", () => {
  const issues = fieldConstraints(field({ label: "" }));
  expect(report(issues)).toContain("unnamed-field query");
});
test("summary formatting deduplicates repeated findings", () => {
  const issues = fieldConstraints(field({ label: "" }));
  expect(report([...issues, ...issues]).split("\n")).toHaveLength(issues.length);
});
test("summary formatting announces truncation", () => {
  const issues = Array.from({ length: 8 }, (_, index) => ({ rule: "example", field: String(index), detail: "test", level: "error" as const }));
  expect(report(issues, 2)).toContain("6 additional problems");
});
test("problemCodes maintains ordering", () => {
  const issues = fieldConstraints(field({ label: "", minLength: 9 }));
  expect(problemCodes(issues)).toEqual(issues.map((entry) => entry.rule));
});
