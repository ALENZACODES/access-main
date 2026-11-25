/** WCAG control observation policies, without English-only ARIA selectors. */
import { normalized, type Locale, type Problem } from "./p20af-transition-ledger.ts";
export type Kind = "button" | "link" | "textbox" | "checkbox" | "radio" | "tab" | "dialog" | "summary" | "other";
export type Key = "Tab" | "Shift+Tab" | "Enter" | "Space" | "Escape" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
export interface Control {
  id: string;
  kind: Kind;
  name: string;
  visible: boolean;
  disabled: boolean;
  inert: boolean;
  width: number | null;
  height: number | null;
  tabindex: number | null;
  active: boolean;
  expanded: boolean | null;
  selected: boolean | null;
  controls: readonly string[];
  language: Locale | "unknown";
}
export interface Stroke { key: Key; beforeId: string | null; afterId: string | null; scrolled: boolean | null; }
export interface Dialog { id: string; trigger: string; open: boolean; focusId: string | null; descendants: readonly string[]; backgroundTabbable: readonly string[]; }
export interface ControlFinding extends Problem { control: string; }
const issue = (code: string, control: string, detail: string, severity: Problem["severity"] = "error"): ControlFinding => ({ code, control, detail, severity, at: 0 });
export const LABELS = {
  en: { continue: "Continue", retry: "Try again", back: "Go back", close: "Close", search: "Search", status: "Status", unknown: "UNKNOWN", offline: "Offline", next: "Next", previous: "Previous", details: "Details" },
  fr: { continue: "Continuer", retry: "Réessayer", back: "Retour", close: "Fermer", search: "Rechercher", status: "État", unknown: "UNKNOWN", offline: "Hors ligne", next: "Suivant", previous: "Précédent", details: "Détails" },
} as const;
export type LabelKey = keyof typeof LABELS.en;
export function controlLabel(locale: Locale, key: LabelKey): string { return LABELS[locale][key]; }
export function localeName(value: string | null): Locale | null {
  if (!value) return null;
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return match?.[1]?.toLowerCase() === "en" ? "en" : match?.[1]?.toLowerCase() === "fr" ? "fr" : null;
}
export function frenchSpacing(text: string): string[] {
  const issues: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const prior = text[index - 1];
    if (current === "'") issues.push(`straight-apostrophe:${index}`);
    if (current === ":" && index > 0 && prior !== "\u00a0") issues.push(`colon-space:${index}`);
    if ([";", "!", "?"].includes(current ?? "") && index > 0 && prior !== "\u202f") issues.push(`thin-space:${index}`);
    if (current === "«" && text[index + 1] !== "\u202f") issues.push(`guillemet-open:${index}`);
    if (current === "»" && prior !== "\u202f") issues.push(`guillemet-close:${index}`);
  }
  return issues;
}
export function controlFindings(control: Control, locale: Locale): ControlFinding[] {
  if (!control.visible || control.disabled) return [];
  const issues: ControlFinding[] = [];
  if (!control.id.trim()) issues.push(issue("control-id-missing", control.id, control.kind));
  if (normalized(control.name) === "UNKNOWN") issues.push(issue("control-name-unknown", control.id, control.kind));
  if (control.inert) issues.push(issue("control-inert", control.id, control.kind));
  if (control.language !== "unknown" && control.language !== locale) issues.push(issue("control-locale-mismatch", control.id, control.language));
  if (control.width === null) issues.push(issue("control-width-unknown", control.id, control.kind, "information"));
  else if (!Number.isFinite(control.width) || control.width < 44) issues.push(issue("control-width-small", control.id, String(control.width)));
  if (control.height === null) issues.push(issue("control-height-unknown", control.id, control.kind, "information"));
  else if (!Number.isFinite(control.height) || control.height < 44) issues.push(issue("control-height-small", control.id, String(control.height)));
  if (control.tabindex !== null && control.tabindex < -1) issues.push(issue("control-tabindex-invalid", control.id, String(control.tabindex)));
  if (control.tabindex !== null && control.tabindex > 0) issues.push(issue("control-positive-tabindex", control.id, String(control.tabindex)));
  if (control.expanded !== null && !["button", "summary", "other"].includes(control.kind)) issues.push(issue("control-expanded-role", control.id, control.kind));
  if (control.expanded !== null && control.controls.length === 0) issues.push(issue("control-expanded-target-missing", control.id, control.kind));
  if (control.selected !== null && !["tab", "radio", "other"].includes(control.kind)) issues.push(issue("control-selected-role", control.id, control.kind));
  if (locale === "fr") for (const detail of frenchSpacing(control.name)) issues.push(issue("control-french-typography", control.id, detail));
  return issues;
}
export function groupFindings(controls: readonly Control[], locale: Locale): ControlFinding[] {
  const issues: ControlFinding[] = [];
  const ids = new Set<string>();
  for (const control of controls) {
    issues.push(...controlFindings(control, locale));
    if (ids.has(control.id) && control.id.trim()) issues.push(issue("control-duplicate-id", control.id, control.kind));
    ids.add(control.id);
  }
  for (const control of controls) for (const reference of control.controls) {
    if (!ids.has(reference)) issues.push(issue("control-target-absent", control.id, reference));
  }
  const actives = controls.filter((control) => control.active && control.visible);
  if (actives.length > 1) issues.push(issue("control-multiple-focus", "document", String(actives.length)));
  return issues;
}
export function tabbables(controls: readonly Control[]): Control[] {
  return controls.filter((control) => control.visible && !control.disabled && !control.inert && (control.tabindex === null || control.tabindex >= 0));
}
export function tabOrder(controls: readonly Control[]): Control[] {
  const candidates = tabbables(controls);
  return [...candidates.filter((item) => (item.tabindex ?? 0) > 0).sort((a, b) => (a.tabindex ?? 0) - (b.tabindex ?? 0)),
    ...candidates.filter((item) => (item.tabindex ?? 0) === 0)];
}
export function nextTab(controls: readonly Control[], current: string | null, reverse = false): string | null {
  const ordered = tabOrder(controls);
  if (ordered.length === 0) return null;
  const currentIndex = ordered.findIndex((item) => item.id === current);
  if (currentIndex < 0) return reverse ? ordered[ordered.length - 1]?.id ?? null : ordered[0]?.id ?? null;
  const next = reverse ? (currentIndex - 1 + ordered.length) % ordered.length : (currentIndex + 1) % ordered.length;
  return ordered[next]?.id ?? null;
}
export function strokeFindings(stroke: Stroke, controls: readonly Control[]): ControlFinding[] {
  const issues: ControlFinding[] = [];
  const ids = new Set(controls.map((control) => control.id));
  if (stroke.beforeId !== null && !ids.has(stroke.beforeId)) issues.push(issue("stroke-before-missing", stroke.beforeId, stroke.key));
  if (stroke.afterId !== null && !ids.has(stroke.afterId)) issues.push(issue("stroke-after-missing", stroke.afterId, stroke.key));
  if (stroke.key === "Tab" || stroke.key === "Shift+Tab") {
    const expected = nextTab(controls, stroke.beforeId, stroke.key === "Shift+Tab");
    if (expected !== stroke.afterId) issues.push(issue("stroke-tab-order", stroke.afterId ?? "UNKNOWN", expected ?? "UNKNOWN"));
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(stroke.key) && stroke.scrolled === true) {
    issues.push(issue("stroke-page-scrolled", stroke.afterId ?? "UNKNOWN", stroke.key, "warning"));
  }
  if (stroke.afterId === null && tabbables(controls).length > 0) issues.push(issue("stroke-focus-missing", "UNKNOWN", stroke.key));
  return issues;
}
export function dialogFindings(dialog: Dialog, controls: readonly Control[]): ControlFinding[] {
  if (!dialog.open) return [];
  const issues: ControlFinding[] = [];
  const known = new Set(controls.map((control) => control.id));
  if (!known.has(dialog.trigger)) issues.push(issue("dialog-trigger-missing", dialog.id, dialog.trigger));
  if (!dialog.focusId || !dialog.descendants.includes(dialog.focusId)) issues.push(issue("dialog-focus-outside", dialog.id, dialog.focusId ?? "UNKNOWN"));
  if (dialog.backgroundTabbable.length > 0) issues.push(issue("dialog-background-tabbable", dialog.id, dialog.backgroundTabbable.join(", ")));
  if (dialog.descendants.length === 0) issues.push(issue("dialog-no-controls", dialog.id, dialog.id));
  for (const child of dialog.descendants) if (!known.has(child)) issues.push(issue("dialog-child-missing", dialog.id, child));
  return issues;
}
export function controlsMatrix(controls: readonly Control[], locale: Locale): { total: number; actionable: number; unnamed: number; undersized: number; unknownSize: number; mismatchedLocale: number } {
  const actionable = tabbables(controls);
  return {
    total: controls.length,
    actionable: actionable.length,
    unnamed: actionable.filter((control) => normalized(control.name) === "UNKNOWN").length,
    undersized: actionable.filter((control) => (control.width !== null && control.width < 44) || (control.height !== null && control.height < 44)).length,
    unknownSize: actionable.filter((control) => control.width === null || control.height === null).length,
    mismatchedLocale: actionable.filter((control) => control.language !== "unknown" && control.language !== locale).length,
  };
}
export function translationMatrix(): { key: LabelKey; en: string; fr: string; differs: boolean }[] {
  return (Object.keys(LABELS.en) as LabelKey[]).map((key) => ({ key, en: LABELS.en[key], fr: LABELS.fr[key], differs: LABELS.en[key] !== LABELS.fr[key] }));
}
export function localizedSummary(findings: readonly ControlFinding[], locale: Locale, maximum = 25): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive");
  const headline = locale === "fr" ? "Éléments à examiner\u00a0:" : "Items to review:";
  const rows = [...new Set(findings.map((entry) => `${entry.code} (${entry.control}) ${entry.detail}`))];
  const left = rows.length - Math.min(maximum, rows.length);
  return [headline, ...rows.slice(0, maximum), ...(left ? [locale === "fr" ? `${left} autres éléments` : `${left} more items`] : [])].join("\n");
}
