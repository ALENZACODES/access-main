/**
 * Read-only accessibility transitions for route, dialog, focus, and form surfaces.
 * These contracts accept observations, never mutate a user's application state.
 * Missing observations remain UNKNOWN rather than becoming successful assertions.
 */
export type Language = "en" | "fr";
export type Confidence = "KNOWN" | "UNKNOWN";
export type Severity = "error" | "warning" | "information";
export type Outcome = "pass" | "fail" | "UNKNOWN";
export type InteractionKind = "navigate" | "open-dialog" | "close-dialog" | "search" | "reset" | "language" | "offline" | "online" | "submit" | "retry";
export type Surface = "page" | "dialog" | "form" | "listbox" | "tablist" | "menu";

export interface Finding {
  readonly code: string;
  readonly path: string;
  readonly detail: string;
  readonly severity: Severity;
}
export interface FocusPoint {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly visible: boolean;
  readonly connected: boolean;
  readonly disabled: boolean;
  readonly tabIndex: number;
  readonly rectangle: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  readonly clipped: boolean;
  readonly occluded: boolean;
  readonly focusIndicator: boolean | null;
}
export interface DialogPoint {
  readonly id: string;
  readonly open: boolean;
  readonly modal: boolean;
  readonly name: string | null;
  readonly description: string | null;
  readonly labelledByResolved: boolean;
  readonly describedByResolved: boolean;
  readonly dismissible: boolean;
  readonly inertOutside: boolean;
  readonly focusWithin: boolean;
  readonly openerId: string | null;
}
export interface FormControl {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly visible: boolean;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly invalid: boolean | null;
  readonly errorReference: string | null;
  readonly errorReferenceExists: boolean;
  readonly errorText: string;
  readonly value: string | null;
}
export interface Frame {
  readonly route: string;
  readonly language: string;
  readonly online: boolean | null;
  readonly documentTitle: string;
  readonly mainCount: number;
  readonly h1: readonly string[];
  readonly focus: FocusPoint | null;
  readonly dialog: DialogPoint | null;
  readonly controls: readonly FormControl[];
  readonly status: readonly string[];
  readonly alerts: readonly string[];
  readonly submitted: boolean;
  readonly timestamp: number;
}
export interface Step {
  readonly kind: InteractionKind;
  readonly before: Frame;
  readonly after: Frame;
  readonly trigger: string | null;
  readonly target: string | null;
  readonly requestedLanguage: Language | null;
  readonly expectStatus: boolean;
}
export interface Sequence {
  readonly id: string;
  readonly steps: readonly Step[];
  readonly allowIntermediateRoutes: boolean;
}

const failure = (code: string, path: string, detail: string, severity: Severity = "error"): Finding => ({ code, path, detail, severity });
const normalized = (text: string): string => text.normalize("NFC").replace(/\s+/g, " ").trim();
const significant = (text: string): boolean => normalized(text).length > 0;
const focusEqual = (left: FocusPoint | null, right: FocusPoint | null): boolean => left?.id === right?.id;
const sameStatus = (left: readonly string[], right: readonly string[]): boolean =>
  left.map(normalized).join("\u0001") === right.map(normalized).join("\u0001");

export function validRoute(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  if (path.includes("#") || path.includes("?") || path.includes("*") || path.includes(":")) return false;
  if (path.split("/").some((part) => part === "." || part === "..")) return false;
  for (const character of path) if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return false;
  return true;
}

export function languageCode(value: string): Language | null {
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return (match?.[1]?.toLowerCase() as Language | undefined) ?? null;
}

export function focusFindings(point: FocusPoint | null, path: string): Finding[] {
  if (!point) return [failure("focus-unknown", path, "No focus observation", "information")];
  const problems: Finding[] = [];
  if (!point.connected) problems.push(failure("focus-detached", path, point.id));
  if (!point.visible) problems.push(failure("focus-hidden", path, point.id));
  if (point.disabled) problems.push(failure("focus-disabled", path, point.id));
  if (!significant(point.name) && point.role !== "main") problems.push(failure("focus-unnamed", path, point.id));
  if (point.tabIndex < -1) problems.push(failure("focus-tabindex-invalid", path, point.id));
  if (point.tabIndex > 0) problems.push(failure("focus-positive-tabindex", path, point.id, "warning"));
  if (point.clipped) problems.push(failure("focus-clipped", path, point.id));
  if (point.occluded) problems.push(failure("focus-obscured", path, point.id));
  if (point.focusIndicator === false) problems.push(failure("focus-indicator-missing", path, point.id));
  if (point.focusIndicator === null) problems.push(failure("focus-indicator-unknown", path, point.id, "information"));
  if (!point.rectangle) problems.push(failure("focus-geometry-unknown", path, point.id, "information"));
  else {
    const { x, y, width, height } = point.rectangle;
    if (![x, y, width, height].every(Number.isFinite)) problems.push(failure("focus-geometry-invalid", path, point.id));
    if (width <= 0 || height <= 0) problems.push(failure("focus-zero-size", path, point.id));
  }
  return problems;
}

export function dialogFindings(dialog: DialogPoint | null, path: string): Finding[] {
  if (!dialog) return [];
  const problems: Finding[] = [];
  if (!dialog.id) problems.push(failure("dialog-id", path, "Dialog needs stable identity"));
  if (!dialog.open) return problems;
  if (!significant(dialog.name ?? "")) problems.push(failure("dialog-name", path, dialog.id));
  if (!dialog.labelledByResolved) problems.push(failure("dialog-label-reference", path, dialog.id));
  if (!dialog.describedByResolved) problems.push(failure("dialog-description-reference", path, dialog.id));
  if (dialog.modal && !dialog.inertOutside) problems.push(failure("dialog-background-operable", path, dialog.id));
  if (!dialog.focusWithin) problems.push(failure("dialog-focus-outside", path, dialog.id));
  if (!dialog.dismissible) problems.push(failure("dialog-undismissable", path, dialog.id));
  if (!dialog.openerId) problems.push(failure("dialog-opener-unknown", path, dialog.id, "information"));
  return problems;
}

export function formControlFindings(controls: readonly FormControl[], path: string): Finding[] {
  const problems: Finding[] = [];
  const seen = new Set<string>();
  for (const item of controls) {
    if (seen.has(item.id)) problems.push(failure("form-duplicate-id", path, item.id));
    seen.add(item.id);
    if (!item.visible) continue;
    if (!significant(item.name)) problems.push(failure("form-unnamed", path, item.id));
    if (item.invalid === true && !item.errorReference) problems.push(failure("form-error-unlinked", path, item.id));
    if (item.errorReference && !item.errorReferenceExists) problems.push(failure("form-error-reference-missing", path, item.id));
    if (item.invalid === true && !significant(item.errorText)) problems.push(failure("form-error-message-empty", path, item.id));
    if (item.invalid === true && item.disabled) problems.push(failure("form-error-disabled", path, item.id, "warning"));
    if (item.required && item.value === null) problems.push(failure("form-value-unknown", path, item.id, "information"));
  }
  return problems;
}

export function frameFindings(frame: Frame): Finding[] {
  const problems: Finding[] = [];
  if (!validRoute(frame.route)) problems.push(failure("route-invalid", frame.route, "Invalid path"));
  if (!languageCode(frame.language)) problems.push(failure("document-language", frame.route, frame.language || "UNKNOWN"));
  if (!significant(frame.documentTitle)) problems.push(failure("document-title", frame.route, "Missing document title"));
  if (frame.mainCount !== 1) problems.push(failure("main-count", frame.route, String(frame.mainCount)));
  if (frame.h1.length !== 1 || !significant(frame.h1[0] ?? "")) problems.push(failure("heading-count", frame.route, String(frame.h1.length)));
  if (!Number.isFinite(frame.timestamp) || frame.timestamp < 0) problems.push(failure("time-invalid", frame.route, String(frame.timestamp)));
  if (frame.online === null) problems.push(failure("connectivity-unknown", frame.route, "UNKNOWN", "information"));
  problems.push(...dialogFindings(frame.dialog, frame.route));
  problems.push(...formControlFindings(frame.controls, frame.route));
  if (frame.focus) problems.push(...focusFindings(frame.focus, frame.route));
  if (frame.status.some((entry) => !significant(entry))) problems.push(failure("status-empty", frame.route, "Empty announcement"));
  if (frame.alerts.some((entry) => !significant(entry))) problems.push(failure("alert-empty", frame.route, "Empty alert"));
  return problems;
}

export function stepFindings(step: Step): Finding[] {
  const { before, after, kind } = step;
  const problems = [...frameFindings(after)];
  if (after.timestamp < before.timestamp) problems.push(failure("time-regression", after.route, kind));
  if (kind !== "navigate" && after.route !== before.route) problems.push(failure("unexpected-route", after.route, kind));
  if (kind === "navigate" && step.target && step.target !== after.route) problems.push(failure("wrong-destination", after.route, step.target));
  if (kind === "language") {
    if (!step.requestedLanguage) problems.push(failure("language-target-unknown", after.route, "UNKNOWN", "information"));
    else if (languageCode(after.language) !== step.requestedLanguage) problems.push(failure("language-not-applied", after.route, step.requestedLanguage));
  } else if (languageCode(before.language) !== languageCode(after.language)) {
    problems.push(failure("language-unexpected", after.route, kind));
  }
  if (kind === "offline" && after.online !== false) problems.push(failure("offline-state", after.route, String(after.online ?? "UNKNOWN")));
  if (kind === "online" && after.online !== true) problems.push(failure("online-state", after.route, String(after.online ?? "UNKNOWN")));
  if (kind === "open-dialog") {
    if (!after.dialog?.open) problems.push(failure("dialog-not-opened", after.route, step.target ?? "UNKNOWN"));
    if (step.target && after.dialog?.id !== step.target) problems.push(failure("dialog-wrong-target", after.route, step.target));
    if (after.dialog?.open && !after.dialog.focusWithin) problems.push(failure("dialog-no-initial-focus", after.route, after.dialog.id));
  }
  if (kind === "close-dialog") {
    if (after.dialog?.open) problems.push(failure("dialog-not-closed", after.route, after.dialog.id));
    if (step.trigger && after.focus?.id !== step.trigger) problems.push(failure("dialog-focus-not-restored", after.route, step.trigger));
  }
  if (kind === "submit") {
    if (!after.submitted && !after.controls.some((control) => control.invalid)) {
      problems.push(failure("submit-silent", after.route, "No result or field errors"));
    }
    if (after.controls.some((control) => control.invalid) && !after.alerts.some(significant)) {
      problems.push(failure("form-error-summary-missing", after.route, "Invalid form lacks alert"));
    }
  }
  if ((kind === "search" || kind === "reset" || kind === "retry") && step.trigger && !focusEqual(before.focus, after.focus)) {
    problems.push(failure("action-focus-lost", after.route, step.trigger));
  }
  if (step.expectStatus && sameStatus(before.status, after.status) && sameStatus(before.alerts, after.alerts)) {
    problems.push(failure("announcement-unchanged", after.route, kind));
  }
  if (kind === "search" && after.online === false && after.status.every((line) => !/offline|hors ligne/i.test(line))) {
    problems.push(failure("offline-search-undisclosed", after.route, "No offline notice"));
  }
  if (kind === "retry" && before.controls.some((control) => control.invalid) && after.controls.some((control) => control.invalid)) {
    problems.push(failure("retry-errors-persist", after.route, "Existing errors remained", "warning"));
  }
  return problems;
}

export function sequenceFindings(sequence: Sequence): Finding[] {
  const problems: Finding[] = [];
  if (!significant(sequence.id)) problems.push(failure("sequence-id", "/", "Missing sequence identifier"));
  if (sequence.steps.length === 0) return [...problems, failure("sequence-empty", "/", "No steps observed")];
  for (const [index, step] of sequence.steps.entries()) {
    problems.push(...stepFindings(step));
    if (index === 0) continue;
    const previous = sequence.steps[index - 1]!;
    if (previous.after.timestamp !== step.before.timestamp) problems.push(failure("sequence-time-gap", step.before.route, String(index), "warning"));
    if (previous.after.route !== step.before.route && !sequence.allowIntermediateRoutes) {
      problems.push(failure("sequence-route-gap", step.before.route, String(index)));
    }
    if (previous.after.language !== step.before.language) problems.push(failure("sequence-language-gap", step.before.route, String(index)));
  }
  return problems;
}

export interface CoverageCell {
  readonly route: string;
  readonly language: Language;
  readonly width: 320 | 1280;
  readonly kind: InteractionKind;
  readonly outcome: Outcome;
}
export interface CoverageReport {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly unknown: number;
  readonly findings: readonly Finding[];
}
export function coverageKey(cell: CoverageCell): string {
  return [cell.route, cell.language, cell.width, cell.kind].join("|");
}
export function coverageFindings(cells: readonly CoverageCell[], requiredRoutes: readonly string[]): CoverageReport {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const validRoutes = new Set(requiredRoutes);
  for (const route of requiredRoutes) if (!validRoute(route)) findings.push(failure("coverage-route-invalid", route, "Invalid requirement"));
  for (const cell of cells) {
    const key = coverageKey(cell);
    if (seen.has(key)) findings.push(failure("coverage-duplicate", cell.route, key));
    seen.add(key);
    if (!validRoute(cell.route) || !validRoutes.has(cell.route)) findings.push(failure("coverage-unexpected-route", cell.route, key));
    if (cell.outcome === "UNKNOWN") findings.push(failure("coverage-unknown", cell.route, key, "information"));
  }
  for (const route of requiredRoutes) {
    for (const language of ["en", "fr"] as const) {
      for (const width of [320, 1280] as const) {
        if (!cells.some((cell) => cell.route === route && cell.language === language && cell.width === width)) {
          findings.push(failure("coverage-missing", route, `${language}|${width}`));
        }
      }
    }
  }
  return {
    total: cells.length,
    passed: cells.filter((cell) => cell.outcome === "pass").length,
    failed: cells.filter((cell) => cell.outcome === "fail").length,
    unknown: cells.filter((cell) => cell.outcome === "UNKNOWN").length,
    findings,
  };
}

export function formatInteractionFindings(findings: readonly Finding[], limit = 40): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const unique = [...new Set(findings.map((entry) => `${entry.severity} ${entry.code} ${entry.path}: ${entry.detail}`))];
  return [...unique.slice(0, limit), ...(unique.length > limit ? [`${unique.length - limit} further findings`] : [])].join("\n");
}

export function summarizeInteractionFindings(findings: readonly Finding[]): Readonly<Record<Severity, number>> {
  return {
    error: findings.filter((item) => item.severity === "error").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    information: findings.filter((item) => item.severity === "information").length,
  };
}

export function routeCoverageInventory(cells: readonly CoverageCell[]): readonly string[] {
  return [...new Set(cells.map((cell) => cell.route))].sort();
}

export function incompleteCoverage(cells: readonly CoverageCell[]): readonly CoverageCell[] {
  return cells.filter((cell) => cell.outcome !== "pass");
}

export function observedInteractions(sequence: Sequence): Readonly<Record<InteractionKind, number>> {
  const result: Record<InteractionKind, number> = {
    navigate: 0, "open-dialog": 0, "close-dialog": 0, search: 0, reset: 0,
    language: 0, offline: 0, online: 0, submit: 0, retry: 0,
  };
  for (const step of sequence.steps) result[step.kind] += 1;
  return result;
}
