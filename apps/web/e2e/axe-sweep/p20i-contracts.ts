/** Deterministic, DOM-independent checks for the route-wide accessibility audit. */
export type Locale = "en" | "fr";
export type Width = 320 | 1280;
export type Knowledge = "PASS" | "BLOCKED" | "UNKNOWN";
export interface Context { readonly route: string; readonly locale: Locale; readonly width: Width }
export interface Issue { readonly rule: string; readonly location: string; readonly detail: string }
export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Target {
  readonly id: string;
  readonly label: string;
  readonly rect: Rect;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly kind: "link" | "button" | "field" | "choice" | "summary" | "custom";
  readonly labelRect: Rect | null;
  readonly labelInteractive: boolean;
}
export interface DocumentSummary {
  readonly lang: string;
  readonly title: string;
  readonly h1: readonly string[];
  readonly mainCount: number;
  readonly mainText: string;
  readonly horizontalOverflow: number;
  readonly loading: boolean;
  readonly skipTargetExists: boolean;
}
export interface TextControl {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly ariaLabelledby: string;
  readonly title: string;
  readonly placeholder: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly describedBy: readonly string[];
  readonly missingDescriptions: readonly string[];
  readonly required: boolean;
  readonly invalid: boolean;
  readonly errorText: string;
}
export interface NavigationLink {
  readonly id: string;
  readonly href: string;
  readonly text: string;
  readonly rect: Rect;
  readonly visible: boolean;
  readonly external: boolean;
  readonly blank: boolean;
  readonly rel: string;
  readonly downloaded: boolean;
}
export interface FocusStep {
  readonly identity: string;
  readonly name: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inMain: boolean;
  readonly disconnected: boolean;
  readonly hiddenByOverlay: boolean;
}
export interface FocusWalk {
  readonly forward: readonly FocusStep[];
  readonly reverse: readonly FocusStep[];
  readonly firstSkip: boolean;
  readonly reachedMain: boolean;
}
export interface MediaItem {
  readonly id: string;
  readonly kind: "img" | "svg" | "canvas" | "video" | "audio";
  readonly visible: boolean;
  readonly decorative: boolean;
  readonly alternate: string | null;
  readonly controls: boolean;
  readonly captioned: boolean;
}
export interface TableItem {
  readonly id: string;
  readonly rows: number;
  readonly headers: number;
  readonly caption: string;
  readonly layout: boolean;
  readonly associationErrors: readonly string[];
}
export interface Evidence {
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
  readonly status: Knowledge;
}
export interface Disclosure {
  readonly id: string;
  readonly buttonName: string;
  readonly expanded: string | null;
  readonly controlsId: string | null;
  readonly controlledExists: boolean;
}
export interface DialogItem {
  readonly id: string;
  readonly name: string;
  readonly modal: boolean;
  readonly focusInside: boolean;
  readonly visible: boolean;
}
export interface LiveItem {
  readonly id: string;
  readonly role: string;
  readonly live: string;
  readonly busy: boolean;
  readonly visible: boolean;
  readonly text: string;
}
export interface FormItem {
  readonly id: string;
  readonly method: string;
  readonly action: string;
  readonly fields: number;
  readonly submits: number;
  readonly visible: boolean;
}
export interface LanguageTransition {
  readonly before: Locale;
  readonly after: string;
  readonly beforeRoute: string;
  readonly afterRoute: string;
  readonly buttonUsed: boolean;
}
export const LANGUAGES: readonly Locale[] = ["en", "fr"];
export const WIDTHS: readonly Width[] = [320, 1280];
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;
const TARGET_MIN = 44;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const OPEN_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-Ontario-1.0"]);

export function issue(rule: string, context: Context, detail: string): Issue {
  return { rule, location: `${context.route} [${context.locale}, ${context.width}px]`, detail };
}
export function issueText(issues: readonly Issue[], limit = 40): string {
  const unique = [...new Set(issues.map((item) => `${item.rule} @ ${item.location}: ${item.detail}`))];
  return [...unique.slice(0, limit), ...(unique.length > limit ? [`${unique.length - limit} additional finding(s)`] : [])].join("\n");
}
export function rectValid(rect: Rect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width >= 0 && rect.height >= 0;
}
export function effectiveRect(item: Target): Rect {
  if (item.labelInteractive && item.labelRect !== null && rectValid(item.labelRect)) return item.labelRect;
  return item.rect;
}
export function targetIssues(items: readonly Target[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (!item.visible || item.disabled) continue;
    const rect = effectiveRect(item);
    if (!rectValid(rect)) {
      issues.push(issue("invalid-target-geometry", context, item.id));
      continue;
    }
    if (rect.width < TARGET_MIN || rect.height < TARGET_MIN) {
      issues.push(issue("target-44", context, `${item.kind} ${item.id}: ${rect.width.toFixed(2)} × ${rect.height.toFixed(2)} CSS px`));
    }
    if (!item.label.trim()) issues.push(issue("target-name", context, `${item.kind} ${item.id}`));
  }
  return issues;
}
export function documentIssues(document: DocumentSummary, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (!new RegExp(`^${context.locale}(?:-|$)`, "i").test(document.lang)) issues.push(issue("document-language", context, document.lang || "missing"));
  if (!document.title.trim()) issues.push(issue("document-title", context, "Document title is empty"));
  if (document.mainCount !== 1) issues.push(issue("main-landmark", context, `${document.mainCount} main regions`));
  if (document.h1.length !== 1 || !document.h1[0]?.trim()) issues.push(issue("page-heading", context, `${document.h1.length} visible h1 headings`));
  if (!document.skipTargetExists) issues.push(issue("skip-destination", context, "Skip destination is missing"));
  if (document.horizontalOverflow > 1 && context.width === 320) issues.push(issue("reflow", context, `${document.horizontalOverflow}px overflow`));
  if (document.loading) issues.push(issue("loading-incomplete", context, "Page still loading"));
  if (!document.mainText.trim()) issues.push(issue("empty-main", context, "No rendered main content"));
  return issues;
}
export function fieldIssues(items: readonly TextControl[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (!item.visible) continue;
    const name = item.ariaLabel.trim() || item.ariaLabelledby.trim() || item.label.trim() || item.title.trim();
    if (!name) issues.push(issue("field-name", context, `${item.kind} ${item.id} has no name`));
    if (item.missingDescriptions.length) issues.push(issue("field-description", context, `${item.id}: ${item.missingDescriptions.join(", ")}`));
    if (item.invalid && !item.errorText.trim()) issues.push(issue("field-error", context, `${item.id} is invalid without a described error`));
    if (item.required && !name) issues.push(issue("required-name", context, item.id));
  }
  return issues;
}
export function linkIssues(items: readonly NavigationLink[], context: Context, origin: string): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (!item.visible) continue;
    if (!item.text.trim()) issues.push(issue("link-name", context, item.id));
    if (item.rect.width < TARGET_MIN || item.rect.height < TARGET_MIN) issues.push(issue("link-44", context, `${item.id}: ${item.rect.width} × ${item.rect.height}`));
    let url: URL;
    try { url = new URL(item.href, origin); } catch { issues.push(issue("link-url", context, item.id)); continue; }
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol) && !item.href.startsWith("#")) issues.push(issue("link-scheme", context, `${item.id}: ${url.protocol}`));
    if (item.blank && !item.external && !item.downloaded) issues.push(issue("unneeded-new-tab", context, item.id));
    if (item.blank && item.external && !item.rel.split(/\s+/).includes("noopener")) issues.push(issue("external-window", context, item.id));
  }
  return issues;
}
export function focusIssues(walk: FocusWalk, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (walk.forward.length === 0) return [issue("no-keyboard-focus", context, "No focus stops")];
  if (!walk.firstSkip) issues.push(issue("skip-link-order", context, "Skip link is not first"));
  if (!walk.reachedMain) issues.push(issue("main-unreachable", context, "Tab never reaches main"));
  const seen = new Set<string>();
  for (const step of walk.forward) {
    if (step.disconnected || !step.visible || step.disabled || step.hiddenByOverlay) issues.push(issue("focus-not-operable", context, step.identity));
    if (seen.has(step.identity)) issues.push(issue("focus-repeat", context, step.identity));
    seen.add(step.identity);
  }
  const forward = walk.forward.map((step) => step.identity);
  const reverse = walk.reverse.map((step) => step.identity);
  const expectedReverse = forward.slice(0, Math.min(reverse.length, forward.length)).reverse();
  if (reverse.length && JSON.stringify(reverse) !== JSON.stringify(expectedReverse)) issues.push(issue("reverse-order", context, `Expected ${expectedReverse.join(" > ")}, got ${reverse.join(" > ")}`));
  return issues;
}
export function mediaIssues(items: readonly MediaItem[], context: Context): Issue[] {
  return items.flatMap((item) => {
    if (!item.visible || item.decorative) return [];
    const issues: Issue[] = [];
    if (["img", "svg", "canvas"].includes(item.kind) && !item.alternate?.trim()) issues.push(issue("media-alternative", context, item.id));
    if (item.kind === "video" && !item.captioned) issues.push(issue("video-captions", context, item.id));
    if (["video", "audio"].includes(item.kind) && !item.controls) issues.push(issue("media-controls", context, item.id));
    return issues;
  });
}
export function tableIssues(items: readonly TableItem[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (item.layout) continue;
    if (item.rows > 0 && item.headers === 0) issues.push(issue("table-headers", context, item.id));
    if (item.rows > 0 && !item.caption.trim()) issues.push(issue("table-caption", context, item.id));
    for (const error of item.associationErrors) issues.push(issue("table-association", context, `${item.id}: ${error}`));
  }
  return issues;
}
export function disclosureIssues(items: readonly Disclosure[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (!item.buttonName.trim()) issues.push(issue("disclosure-name", context, item.id));
    if (item.expanded !== null && item.expanded !== "true" && item.expanded !== "false") issues.push(issue("disclosure-expanded", context, item.id));
    if (item.controlsId !== null && !item.controlledExists) issues.push(issue("disclosure-controls", context, item.id));
  }
  return issues;
}
export function dialogIssues(items: readonly DialogItem[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (!item.visible) continue;
    if (!item.name.trim()) issues.push(issue("dialog-name", context, item.id));
    if (item.modal && !item.focusInside) issues.push(issue("dialog-focus", context, item.id));
  }
  return issues;
}
export function liveIssues(items: readonly LiveItem[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (["polite", "assertive", "off", ""].includes(item.live) === false) issues.push(issue("live-value", context, item.id));
    if (item.busy && item.text.trim()) issues.push(issue("busy-announcement", context, item.id));
    if (item.role === "alert" && !item.visible) issues.push(issue("hidden-alert", context, item.id));
  }
  return issues;
}
export function formIssues(items: readonly FormItem[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    if (!item.visible) continue;
    if (item.fields > 0 && item.submits === 0) issues.push(issue("form-submit", context, item.id));
    if (item.action.trim().toLowerCase().startsWith("javascript:")) issues.push(issue("form-action", context, item.id));
  }
  return issues;
}
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}
export function evidenceIssues(items: readonly Evidence[], context: Context): Issue[] {
  const issues: Issue[] = [];
  for (const [index, item] of items.entries()) {
    if (item.status === "UNKNOWN") continue;
    if (!item.source?.trim()) issues.push(issue("evidence-source", context, `Record ${index}`));
    if (!item.licence || !OPEN_LICENCES.has(item.licence)) issues.push(issue("evidence-licence", context, `Record ${index}`));
    if (!item.date || !isCalendarDate(item.date)) issues.push(issue("evidence-date", context, `Record ${index}`));
  }
  return issues;
}
export function combineKnowledge(values: readonly Knowledge[]): Knowledge {
  if (!values.length || values.includes("UNKNOWN")) return values.includes("BLOCKED") ? "BLOCKED" : "UNKNOWN";
  return values.includes("BLOCKED") ? "BLOCKED" : "PASS";
}
export function normalizePath(raw: string): string | null {
  try {
    const parsed = new URL(raw, "https://example.invalid");
    if (parsed.origin !== "https://example.invalid" || !parsed.pathname.startsWith("/") || parsed.search || parsed.hash) return null;
    return parsed.pathname.replace(/\/$/, "") || "/";
  } catch { return null; }
}
export function routesForMatrix(routes: readonly string[]): string[] {
  const normalized = routes.map(normalizePath);
  if (normalized.some((path) => path === null)) throw new Error("Invalid route path in source list");
  return [...new Set(normalized as string[])].sort();
}
export function matrixKeys(routes: readonly string[]): string[] {
  return routesForMatrix(routes).flatMap((route) => LANGUAGES.flatMap((locale) => WIDTHS.map((width) => `${route}|${locale}|${width}`)));
}
export function matrixIssues(routes: readonly string[], observed: readonly string[]): Issue[] {
  const wanted = new Set(matrixKeys(routes));
  const seen = new Set(observed);
  const issues: Issue[] = [];
  for (const key of wanted) if (!seen.has(key)) issues.push({ rule: "matrix-missing", location: key, detail: "Route/locale/viewport not audited" });
  for (const key of seen) if (!wanted.has(key)) issues.push({ rule: "matrix-unexpected", location: key, detail: "Unexpected audit entry" });
  if (observed.length !== seen.size) issues.push({ rule: "matrix-duplicate", location: "matrix", detail: "Duplicate audit entries" });
  return issues;
}
export function languageIssues(value: LanguageTransition, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (!value.buttonUsed) issues.push(issue("locale-control", context, "No language-button interaction"));
  if (value.before === value.after) issues.push(issue("locale-unchanged", context, value.after));
  if (value.after !== (value.before === "en" ? "fr" : "en")) issues.push(issue("locale-destination", context, value.after));
  if (value.beforeRoute !== value.afterRoute) issues.push(issue("locale-navigation", context, value.afterRoute));
  return issues;
}
