import { type Locale, type Connection, type Finding, finding, safeRoute } from "./p20an-evidence.ts";
/** Actual browser observations are necessary before any action may be called successful. */
export type Phase = "idle" | "loading" | "ready" | "empty" | "error" | "UNKNOWN";
export type ActionKind = "navigate" | "search" | "clear" | "language" | "disconnect" | "reconnect" | "retry" | "back" | "forward" | "open" | "close" | "export";
export interface Control {
  readonly id: string;
  readonly role: string;
  readonly accessibleName: string | null;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly inert: boolean;
  readonly tabIndex: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly focusVisible: boolean | null;
  readonly dialogId: string | null;
}
export interface Announcement {
  readonly id: string;
  readonly text: string;
  readonly language: Locale;
  readonly politeness: "off" | "polite" | "assertive";
  readonly emittedAt: number | null;
  readonly busy: boolean;
}
export interface Screen {
  readonly route: string;
  readonly locale: Locale;
  readonly connection: Connection;
  readonly phase: Phase;
  readonly title: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly focusId: string | null;
  readonly activeDialogId: string | null;
  readonly scrollY: number | null;
  readonly historyIndex: number | null;
  readonly controls: readonly Control[];
  readonly announcements: readonly Announcement[];
}
export interface Step {
  readonly kind: ActionKind;
  readonly before: Screen;
  readonly after: Screen;
  readonly observed: boolean;
  readonly expectedRoute: string | null;
  readonly preserveFocus: boolean;
  readonly at: number | null;
}
export interface Sequence {
  readonly id: string;
  readonly initial: Screen;
  readonly steps: readonly Step[];
}
export function available(control: Control): boolean {
  return control.visible && control.enabled && !control.inert;
}
export function keyboardEligible(control: Control): boolean {
  return available(control) && Number.isInteger(control.tabIndex) && control.tabIndex >= 0;
}
export function controlFindings(control: Control, route: string): Finding[] {
  const errors: Finding[] = [];
  if (!available(control)) return errors;
  if (!control.accessibleName?.trim()) errors.push(finding("control-name-UNKNOWN", route, control.id));
  if (control.width === null || !Number.isFinite(control.width)) errors.push(finding("control-width-UNKNOWN", route, control.id));
  else if (control.width < 44) errors.push(finding("control-width-small", route, control.id));
  if (control.height === null || !Number.isFinite(control.height)) errors.push(finding("control-height-UNKNOWN", route, control.id));
  else if (control.height < 44) errors.push(finding("control-height-small", route, control.id));
  if (!Number.isInteger(control.tabIndex) || control.tabIndex < -1) errors.push(finding("control-tabindex-invalid", route, control.id));
  if (keyboardEligible(control) && control.focusVisible === false) errors.push(finding("control-focus-not-visible", route, control.id));
  return errors;
}
export function focusOrder(controls: readonly Control[]): string[] {
  return controls.filter(keyboardEligible).sort((a, b) => a.tabIndex - b.tabIndex).map((control) => control.id);
}
export function screenFindings(screen: Screen): Finding[] {
  const errors: Finding[] = [];
  if (!safeRoute(screen.route)) errors.push(finding("screen-route-unsafe", screen.route, screen.route));
  if (screen.mainCount !== 1) errors.push(finding("screen-main-count", screen.route, String(screen.mainCount)));
  if (!screen.title.trim()) errors.push(finding("screen-title-missing", screen.route, "No document title"));
  if (!screen.heading.trim()) errors.push(finding("screen-heading-missing", screen.route, "No first-level heading"));
  if (screen.scrollY !== null && (!Number.isFinite(screen.scrollY) || screen.scrollY < 0)) errors.push(finding("screen-scroll-invalid", screen.route, String(screen.scrollY)));
  if (screen.historyIndex !== null && (!Number.isInteger(screen.historyIndex) || screen.historyIndex < 0)) errors.push(finding("screen-history-invalid", screen.route, String(screen.historyIndex)));
  const ids = new Set<string>();
  for (const control of screen.controls) {
    if (ids.has(control.id)) errors.push(finding("control-id-duplicate", screen.route, control.id));
    ids.add(control.id);
    errors.push(...controlFindings(control, screen.route));
    if (screen.activeDialogId && keyboardEligible(control) && control.dialogId !== screen.activeDialogId) {
      errors.push(finding("modal-background-focusable", screen.route, control.id));
    }
  }
  if (screen.focusId && !screen.controls.some((control) => control.id === screen.focusId)) errors.push(finding("focus-not-in-controls", screen.route, screen.focusId));
  if (screen.activeDialogId && screen.focusId && !screen.controls.some((control) => control.id === screen.focusId && control.dialogId === screen.activeDialogId)) {
    errors.push(finding("modal-focus-outside", screen.route, screen.focusId));
  }
  if (screen.phase === "loading" && !screen.announcements.some((a) => a.busy && a.politeness !== "off")) {
    errors.push(finding("loading-not-announced", screen.route, "Loading requires an observable busy status"));
  }
  if ((screen.phase === "empty" || screen.phase === "error") && !screen.announcements.some((a) => a.text.trim() && a.politeness !== "off")) {
    errors.push(finding("outcome-silent", screen.route, screen.phase));
  }
  for (const a of screen.announcements) {
    if (a.language !== screen.locale) errors.push(finding("announcement-language-mismatch", screen.route, a.id));
    if (!a.text.trim() && a.politeness !== "off") errors.push(finding("announcement-empty", screen.route, a.id));
    if (a.emittedAt !== null && (!Number.isFinite(a.emittedAt) || a.emittedAt < 0)) errors.push(finding("announcement-time-invalid", screen.route, a.id));
  }
  return errors;
}
export function stepFindings(step: Step): Finding[] {
  const errors: Finding[] = [];
  const { before, after } = step;
  if (!step.observed) errors.push(finding("step-not-observed", after.route, step.kind));
  if (step.expectedRoute && step.expectedRoute !== after.route) errors.push(finding("step-route-not-reached", after.route, step.expectedRoute));
  if (step.kind === "language") {
    if (before.locale === after.locale) errors.push(finding("language-did-not-change", after.route, before.locale));
    if (before.route !== after.route) errors.push(finding("language-lost-route", after.route, before.route));
  } else if (step.kind !== "navigate" && step.kind !== "back" && step.kind !== "forward") {
    if (before.route !== after.route) errors.push(finding("action-changed-route", after.route, step.kind));
    if (before.locale !== after.locale) errors.push(finding("action-changed-language", after.route, step.kind));
  }
  if (step.kind === "disconnect" && after.connection !== "offline") errors.push(finding("disconnect-not-observed", after.route, after.connection));
  if (step.kind === "reconnect" && after.connection !== "online") errors.push(finding("reconnect-not-observed", after.route, after.connection));
  if (step.kind === "retry" && before.phase !== "error" && before.phase !== "empty") errors.push(finding("retry-without-failure", after.route, before.phase));
  if (step.kind === "clear" && after.phase === "loading") errors.push(finding("clear-triggered-loading", after.route, after.phase));
  if (step.preserveFocus && before.focusId !== after.focusId) errors.push(finding("focus-not-preserved", after.route, `${before.focusId} -> ${after.focusId}`));
  if (step.at !== null && (!Number.isFinite(step.at) || step.at < 0)) errors.push(finding("step-time-invalid", after.route, String(step.at)));
  return errors;
}
export function sameScreenIdentity(first: Screen, second: Screen): boolean {
  return first.route === second.route && first.locale === second.locale && first.connection === second.connection;
}
export function sequenceFindings(sequence: Sequence): Finding[] {
  const errors: Finding[] = [];
  if (!sequence.id.trim()) errors.push(finding("sequence-id-empty", sequence.initial.route, "Unnamed sequence"));
  errors.push(...screenFindings(sequence.initial));
  let cursor = sequence.initial;
  for (const step of sequence.steps) {
    if (!sameScreenIdentity(cursor, step.before)) errors.push(finding("sequence-chain-broken", step.before.route, step.kind));
    errors.push(...stepFindings(step));
    errors.push(...screenFindings(step.after));
    cursor = step.after;
  }
  return errors;
}
export function routeCoverage(routes: readonly string[], locales: readonly Locale[] = ["en", "fr"], widths: readonly number[] = [320, 1280]): ReadonlyArray<{ route: string; locale: Locale; width: number }> {
  return routes.flatMap((route) => locales.flatMap((locale) => widths.map((width) => ({ route, locale, width }))));
}
export function coverageKey(cell: { route: string; locale: Locale; width: number }): string {
  return `${cell.route}|${cell.locale}|${cell.width}`;
}
export function coverageFindings(expected: ReturnType<typeof routeCoverage>, actual: ReturnType<typeof routeCoverage>): Finding[] {
  const errors: Finding[] = [];
  const observed = new Set<string>();
  const wanted = new Set(expected.map(coverageKey));
  for (const cell of actual) {
    const key = coverageKey(cell);
    if (observed.has(key)) errors.push(finding("coverage-duplicate", cell.route, key));
    if (!wanted.has(key)) errors.push(finding("coverage-unexpected", cell.route, key));
    observed.add(key);
  }
  for (const cell of expected) if (!observed.has(coverageKey(cell))) errors.push(finding("coverage-missing", cell.route, coverageKey(cell)));
  return errors;
}
