/** P20AE: deterministic responsive-reflow and text-spacing audit contracts. */
export type Locale = "en" | "fr" | "UNKNOWN";
export type Orientation = "portrait" | "landscape" | "square" | "UNKNOWN";
export type Severity = "error" | "review";
export type ControlKind = "button" | "link" | "input" | "select" | "textarea" | "summary" | "other";

export interface Viewport {
  width: number; height: number; clientWidth: number; clientHeight: number;
  scrollWidth: number; scrollHeight: number; scrollX: number; scrollY: number;
  deviceScaleFactor: number; orientation: Orientation; rootFontSize: number;
}
export interface Rect {
  x: number; y: number; width: number; height: number;
  top: number; right: number; bottom: number; left: number;
}
export interface ElementBox {
  selector: string; name: string; kind: ControlKind; rect: Rect;
  visible: boolean; disabled: boolean; tabIndex: number;
  fontSize: number; lineHeight: number; textLength: number;
  scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number;
  fixed: boolean; sticky: boolean; clippingAncestors: readonly string[];
}
export interface TextSpacing {
  lineHeight: number; paragraphGap: number; letterSpacing: number; wordSpacing: number;
}
export interface Observation {
  route: string; locale: Locale; viewport: Viewport; elements: readonly ElementBox[];
  mainCount: number; headingCount: number; visibleHeadingCount: number;
  textSpacing: TextSpacing | null;
}
export type IssueCode =
  | "route-missing" | "locale-unknown" | "viewport-invalid" | "horizontal-overflow"
  | "horizontal-scroll-offset" | "orientation-mismatch" | "root-font-small"
  | "main-missing" | "main-duplicate" | "heading-missing" | "heading-duplicate"
  | "heading-hidden" | "target-small" | "target-hidden" | "target-clipped"
  | "target-tabindex-negative" | "target-disabled" | "content-overflow"
  | "content-clipped" | "content-font-small" | "content-line-height-tight"
  | "fixed-obstruction" | "sticky-obstruction" | "text-line-height"
  | "text-paragraph-gap" | "text-letter-spacing" | "text-word-spacing"
  | "observation-truncated";

export interface Issue {
  code: IssueCode; target: string; severity: Severity;
  measured: string; expected: string; detail: string;
}
export interface Policy {
  targetWidth: number; targetHeight: number; overflowTolerance: number;
  minFontSize: number; minRootFontSize: number; minLineHeightRatio: number;
  requireMain: boolean; requireHeading: boolean; requireLocale: boolean;
}
export interface Report {
  route: string; locale: Locale; viewport: Viewport;
  issues: readonly Issue[]; errors: number; reviews: number;
  controls: number; content: number; overflow: number; clean: boolean;
}

export const DEFAULT_POLICY: Policy = {
  targetWidth: 44, targetHeight: 44, overflowTolerance: 1,
  minFontSize: 12, minRootFontSize: 12, minLineHeightRatio: 1.2,
  requireMain: true, requireHeading: true, requireLocale: false,
};
export const TEXT_SPACING_REQUIREMENTS: TextSpacing = {
  lineHeight: 1.5, paragraphGap: 2, letterSpacing: 0.12, wordSpacing: 0.16,
};
export const WIDTH_MATRIX = [320, 360, 375, 390, 414, 600, 768, 1024, 1280] as const;
export const HEIGHT_MATRIX = [568, 640, 720, 800, 900] as const;

const CONTROL_KINDS: readonly ControlKind[] = ["button", "link", "input", "select", "textarea", "summary"];

export function orientationOf(width: number, height: number): Orientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "UNKNOWN";
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}
export function isControl(element: ElementBox): boolean {
  return CONTROL_KINDS.includes(element.kind);
}
export function viewportIsValid(viewport: Viewport): boolean {
  return [viewport.width, viewport.height, viewport.clientWidth, viewport.clientHeight,
    viewport.deviceScaleFactor, viewport.rootFontSize].every((n) => Number.isFinite(n) && n > 0)
    && [viewport.scrollWidth, viewport.scrollHeight, viewport.scrollX, viewport.scrollY]
      .every((n) => Number.isFinite(n) && n >= 0);
}
export function overflowBy(viewport: Viewport, tolerance = 1): number {
  if (!viewportIsValid(viewport) || !Number.isFinite(tolerance) || tolerance < 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, viewport.scrollWidth - viewport.clientWidth - tolerance);
}
export function rectInsideViewport(rect: Rect, viewport: Viewport): boolean {
  return rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.clientWidth && rect.bottom <= viewport.clientHeight;
}
export function rectVisible(rect: Rect, viewport: Viewport): "visible" | "partial" | "outside" | "invalid" {
  const values = [rect.left, rect.right, rect.top, rect.bottom];
  if (!values.every(Number.isFinite)) return "invalid";
  if (rect.right <= 0 || rect.left >= viewport.clientWidth || rect.bottom <= 0 || rect.top >= viewport.clientHeight) return "outside";
  return rectInsideViewport(rect, viewport) ? "visible" : "partial";
}
export function controlSizePasses(element: ElementBox, policy = DEFAULT_POLICY): boolean {
  return !isControl(element) || element.disabled
    || (element.rect.width >= policy.targetWidth && element.rect.height >= policy.targetHeight);
}
export function textSpacingPasses(spacing: TextSpacing): boolean {
  return Number.isFinite(spacing.lineHeight) && spacing.lineHeight >= TEXT_SPACING_REQUIREMENTS.lineHeight
    && Number.isFinite(spacing.paragraphGap) && spacing.paragraphGap >= TEXT_SPACING_REQUIREMENTS.paragraphGap
    && Number.isFinite(spacing.letterSpacing) && spacing.letterSpacing >= TEXT_SPACING_REQUIREMENTS.letterSpacing
    && Number.isFinite(spacing.wordSpacing) && spacing.wordSpacing >= TEXT_SPACING_REQUIREMENTS.wordSpacing;
}
function add(issues: Issue[], code: IssueCode, target: string, measured: string, expected: string,
  detail: string, severity: Severity = "error"): void {
  issues.push({ code, target, measured, expected, detail, severity });
}
export function evaluate(observation: Observation, policy: Policy = DEFAULT_POLICY): Report {
  const issues: Issue[] = [];
  const v = observation.viewport;
  if (!observation.route.trim()) add(issues, "route-missing", "route", "", "path", "Route was not identified");
  if (observation.locale === "UNKNOWN" && policy.requireLocale) add(issues, "locale-unknown", "html[lang]", "UNKNOWN", "en or fr", "Document language was not observed");
  if (!viewportIsValid(v)) add(issues, "viewport-invalid", "window", "invalid geometry", "positive CSS-pixel dimensions", "Viewport observation is incomplete");
  const overflow = overflowBy(v, policy.overflowTolerance);
  if (overflow > 0) add(issues, "horizontal-overflow", "document", `${overflow}px`, "0px", "Document exceeds the layout viewport");
  if (v.scrollX > policy.overflowTolerance) add(issues, "horizontal-scroll-offset", "window.scrollX", `${v.scrollX}px`, "0px", "Document begins horizontally scrolled");
  const expectedOrientation = orientationOf(v.width, v.height);
  if (v.orientation !== expectedOrientation) add(issues, "orientation-mismatch", "viewport.orientation", v.orientation, expectedOrientation, "Orientation does not match viewport geometry", "review");
  if (v.rootFontSize < policy.minRootFontSize) add(issues, "root-font-small", "html", `${v.rootFontSize}px`, `>= ${policy.minRootFontSize}px`, "Root font size is unusually small", "review");
  if (policy.requireMain && observation.mainCount === 0) add(issues, "main-missing", "main", "0", "1", "Main landmark is missing");
  if (observation.mainCount > 1) add(issues, "main-duplicate", "main", String(observation.mainCount), "1", "More than one main landmark exists");
  if (policy.requireHeading && observation.headingCount === 0) add(issues, "heading-missing", "main h1", "0", "1", "Main heading is missing");
  if (observation.headingCount > 1) add(issues, "heading-duplicate", "main h1", String(observation.headingCount), "1", "More than one main heading exists");
  if (observation.headingCount > 0 && observation.visibleHeadingCount === 0) add(issues, "heading-hidden", "main h1", "hidden", "visible", "Main heading is not visible");
  for (const element of observation.elements) {
    const selector = element.selector || element.name || element.kind;
    if (isControl(element)) {
      if (!controlSizePasses(element, policy)) add(issues, "target-small", selector,
        `${element.rect.width}x${element.rect.height}px`, `${policy.targetWidth}x${policy.targetHeight}px`, "Interactive target is smaller than the minimum");
      const visibility = rectVisible(element.rect, v);
      if (!element.visible || visibility === "outside") add(issues, "target-hidden", selector, visibility, "visible", "Interactive target is not visually reachable");
      else if (visibility === "partial") add(issues, "target-clipped", selector, "partly outside viewport", "inside viewport", "Interactive target is clipped", "review");
      if (element.tabIndex < 0 && !element.disabled) add(issues, "target-tabindex-negative", selector, String(element.tabIndex), "natural tab order", "Interactive target is excluded from sequential keyboard navigation", "review");
      if (element.disabled) add(issues, "target-disabled", selector, "disabled", "enabled or intentionally unavailable", "Disabled control requires context", "review");
    } else {
      if (element.scrollWidth - element.clientWidth > policy.overflowTolerance) add(issues, "content-overflow", selector,
        `${element.scrollWidth}px`, `${element.clientWidth}px`, "Content container has internal horizontal overflow", "review");
      if (element.visible && (element.rect.left < 0 || element.rect.right > v.clientWidth)) add(issues, "content-clipped", selector,
        `${element.rect.left}..${element.rect.right}`, `0..${v.clientWidth}`, "Content extends beyond viewport", "review");
      if (element.textLength > 0 && element.fontSize < policy.minFontSize) add(issues, "content-font-small", selector,
        `${element.fontSize}px`, `>= ${policy.minFontSize}px`, "Text size is below the review threshold", "review");
      if (element.textLength > 0 && element.fontSize > 0 && element.lineHeight / element.fontSize < policy.minLineHeightRatio) add(issues, "content-line-height-tight", selector,
        `${(element.lineHeight / element.fontSize).toFixed(2)}x`, `>= ${policy.minLineHeightRatio}x`, "Text line height is tight", "review");
    }
    if (element.fixed && element.rect.height > v.height * 0.25) add(issues, "fixed-obstruction", selector,
      `${element.rect.height}px`, `<= ${Math.round(v.height * 0.25)}px`, "Fixed element occupies a large part of the viewport", "review");
    if (element.sticky && element.rect.height > v.height * 0.2) add(issues, "sticky-obstruction", selector,
      `${element.rect.height}px`, `<= ${Math.round(v.height * 0.2)}px`, "Sticky element occupies a large part of the viewport", "review");
  }
  if (observation.textSpacing && !textSpacingPasses(observation.textSpacing)) {
    const s = observation.textSpacing;
    if (s.lineHeight < 1.5) add(issues, "text-line-height", "text-spacing", String(s.lineHeight), ">= 1.5", "Line-height stress value was not applied");
    if (s.paragraphGap < 2) add(issues, "text-paragraph-gap", "text-spacing", String(s.paragraphGap), ">= 2", "Paragraph spacing stress value was not applied");
    if (s.letterSpacing < 0.12) add(issues, "text-letter-spacing", "text-spacing", String(s.letterSpacing), ">= 0.12", "Letter spacing stress value was not applied");
    if (s.wordSpacing < 0.16) add(issues, "text-word-spacing", "text-spacing", String(s.wordSpacing), ">= 0.16", "Word spacing stress value was not applied");
  }
  const errors = issues.filter((x) => x.severity === "error").length;
  const controls = observation.elements.filter(isControl).length;
  return { route: observation.route, locale: observation.locale, viewport: v, issues, errors,
    reviews: issues.length - errors, controls, content: observation.elements.length - controls,
    overflow, clean: errors === 0 };
}
export function matrixKey(route: string, width: number, height: number, locale: Locale): string {
  return `${route}|${width}x${height}|${locale}`;
}
export function summarize(reports: readonly Report[]): string {
  const widths = [...new Set(reports.map((r) => r.viewport.width))].sort((a, b) => a - b);
  return [`Runs: ${reports.length}`, `Routes: ${new Set(reports.map((r) => r.route)).size}`,
    `Widths: ${widths.join(", ")}`, `Errors: ${reports.reduce((n, r) => n + r.errors, 0)}`,
    `Reviews: ${reports.reduce((n, r) => n + r.reviews, 0)}`].join("\n");
}
export function mergeReports(reports: readonly Report[]): Report[] {
  const byKey = new Map<string, Report>();
  for (const report of reports) byKey.set(matrixKey(report.route, report.viewport.width, report.viewport.height, report.locale), report);
  return [...byKey.values()].sort((a, b) => a.route.localeCompare(b.route)
    || a.viewport.width - b.viewport.width || a.viewport.height - b.viewport.height || a.locale.localeCompare(b.locale));
}
