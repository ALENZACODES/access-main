import type { Orientation, Rect, Viewport } from "./p20ae-reflow-contracts.ts";

export type WidthBand = "compact" | "phone" | "tablet" | "desktop" | "wide";
export type Movement = "stable" | "reflowed" | "disappeared" | "appeared" | "unknown";
export interface ElementFrame {
  readonly id: string; readonly role: string; readonly name: string;
  readonly rect: Rect; readonly visible: boolean; readonly fontSize: number;
}
export interface ViewportFrame {
  readonly route: string; readonly locale: "en" | "fr" | "UNKNOWN";
  readonly viewport: Viewport; readonly elements: readonly ElementFrame[];
  readonly activeId: string | null; readonly activeVisible: boolean;
}
export type TransitionIssueCode =
  | "route-changed" | "locale-changed" | "viewport-not-resized" | "width-band-not-updated"
  | "overflow-introduced" | "overflow-increased" | "control-disappeared"
  | "content-disappeared" | "active-element-lost" | "active-element-hidden"
  | "target-moved-outside" | "font-size-shrank" | "orientation-not-updated"
  | "duplicate-element-id" | "frame-missing-route";
export interface TransitionIssue {
  readonly code: TransitionIssueCode; readonly target: string;
  readonly before: string; readonly after: string; readonly detail: string;
  readonly severity: "error" | "review";
}
export interface ElementDelta {
  readonly id: string; readonly movement: Movement;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly fontSizeDelta: number;
}
export interface TransitionReport {
  readonly fromBand: WidthBand; readonly toBand: WidthBand;
  readonly fromOrientation: Orientation; readonly toOrientation: Orientation;
  readonly deltas: readonly ElementDelta[];
  readonly issues: readonly TransitionIssue[];
  readonly errors: number; readonly reviews: number; readonly clean: boolean;
}
export function widthBand(width: number): WidthBand {
  if (!Number.isFinite(width) || width <= 0) return "compact";
  if (width < 360) return "compact";
  if (width < 600) return "phone";
  if (width < 900) return "tablet";
  if (width < 1440) return "desktop";
  return "wide";
}
function add(out: TransitionIssue[], code: TransitionIssueCode, target: string,
  before: string, after: string, detail: string, severity: "error" | "review" = "error") {
  out.push({ code, target, before, after, detail, severity });
}
function uniqueMap(elements: readonly ElementFrame[]): { map: Map<string, ElementFrame>; duplicates: string[] } {
  const map = new Map<string, ElementFrame>();
  const duplicates: string[] = [];
  for (const element of elements) {
    if (map.has(element.id)) duplicates.push(element.id);
    else map.set(element.id, element);
  }
  return { map, duplicates };
}
function inside(rect: Rect, viewport: Viewport): boolean {
  return rect.left >= 0 && rect.right <= viewport.clientWidth && rect.top >= 0 && rect.bottom <= viewport.clientHeight;
}
export function compareViewportFrames(before: ViewportFrame, after: ViewportFrame): TransitionReport {
  const issues: TransitionIssue[] = [];
  const fromBand = widthBand(before.viewport.width);
  const toBand = widthBand(after.viewport.width);
  if (!before.route || !after.route) add(issues, "frame-missing-route", "route", before.route, after.route, "A frame has no route identifier");
  if (before.route !== after.route) add(issues, "route-changed", "route", before.route, after.route, "Resize comparison crossed a route transition");
  if (before.locale !== after.locale) add(issues, "locale-changed", "html[lang]", before.locale, after.locale, "Resize comparison crossed a language transition", "review");
  if (before.viewport.width === after.viewport.width && before.viewport.height === after.viewport.height) add(issues, "viewport-not-resized", "viewport", `${before.viewport.width}x${before.viewport.height}`, `${after.viewport.width}x${after.viewport.height}`, "The second frame did not resize the viewport", "review");
  if (fromBand !== toBand && before.viewport.width === after.viewport.width) add(issues, "width-band-not-updated", "viewport.width", fromBand, toBand, "Responsive width band changed without width change");
  const beforeOverflow = Math.max(0, before.viewport.scrollWidth - before.viewport.clientWidth);
  const afterOverflow = Math.max(0, after.viewport.scrollWidth - after.viewport.clientWidth);
  if (beforeOverflow === 0 && afterOverflow > 1) add(issues, "overflow-introduced", "document", "0px", `${afterOverflow}px`, "Resize introduced horizontal overflow");
  else if (afterOverflow > beforeOverflow + 1) add(issues, "overflow-increased", "document", `${beforeOverflow}px`, `${afterOverflow}px`, "Resize increased horizontal overflow");
  const a = uniqueMap(before.elements);
  const b = uniqueMap(after.elements);
  for (const id of a.duplicates) add(issues, "duplicate-element-id", id, "duplicate", "duplicate", "Before frame has repeated element identity");
  for (const id of b.duplicates) add(issues, "duplicate-element-id", id, "unique", "duplicate", "After frame has repeated element identity");
  const deltas: ElementDelta[] = [];
  for (const [id, first] of a.map) {
    const second = b.map.get(id);
    if (!second) {
      const code = first.role === "button" || first.role === "link" ? "control-disappeared" : "content-disappeared";
      add(issues, code, id, "present", "missing", "An observed element disappeared after resize", code === "control-disappeared" ? "error" : "review");
      deltas.push({ id, movement: "disappeared", x: 0, y: 0, width: 0, height: 0, fontSizeDelta: 0 });
      continue;
    }
    const dx = second.rect.x - first.rect.x;
    const dy = second.rect.y - first.rect.y;
    const dw = second.rect.width - first.rect.width;
    const dh = second.rect.height - first.rect.height;
    const moved = Math.abs(dx) + Math.abs(dy) + Math.abs(dw) + Math.abs(dh) > 1;
    deltas.push({ id, movement: moved ? "reflowed" : "stable", x: dx, y: dy, width: dw, height: dh, fontSizeDelta: second.fontSize - first.fontSize });
    if (first.role === "button" || first.role === "link") {
      if (second.visible && !inside(second.rect, after.viewport)) add(issues, "target-moved-outside", id, "inside viewport", "outside viewport", "Control moved outside the viewport");
    }
    if (second.fontSize + 0.25 < first.fontSize) add(issues, "font-size-shrank", id, `${first.fontSize}px`, `${second.fontSize}px`, "Text became smaller after resize", "review");
  }
  for (const [id] of b.map) if (!a.map.has(id)) deltas.push({ id, movement: "appeared", x: 0, y: 0, width: 0, height: 0, fontSizeDelta: 0 });
  if (before.activeId && before.activeId !== after.activeId) {
    if (!after.activeId) add(issues, "active-element-lost", before.activeId, before.activeId, "none", "Resize lost the active element");
  }
  if (after.activeId && !after.activeVisible) add(issues, "active-element-hidden", after.activeId, "visible", "hidden", "Active element is no longer visible");
  const expectedOrientation = after.viewport.width > after.viewport.height ? "landscape"
    : after.viewport.width < after.viewport.height ? "portrait" : "square";
  if (after.viewport.orientation !== expectedOrientation) add(issues, "orientation-not-updated", "viewport.orientation", expectedOrientation, after.viewport.orientation, "Orientation metadata did not update", "review");
  const errors = issues.filter((item) => item.severity === "error").length;
  return { fromBand, toBand, fromOrientation: before.viewport.orientation, toOrientation: after.viewport.orientation,
    deltas, issues, errors, reviews: issues.length - errors, clean: errors === 0 };
}
export function transitionKey(before: ViewportFrame, after: ViewportFrame): string {
  return `${before.route}|${before.viewport.width}x${before.viewport.height}->${after.viewport.width}x${after.viewport.height}|${before.locale}`;
}
export function summarizeTransition(report: TransitionReport): string {
  return [
    `Width band: ${report.fromBand} -> ${report.toBand}`,
    `Orientation: ${report.fromOrientation} -> ${report.toOrientation}`,
    `Elements: ${report.deltas.length}`,
    `Errors: ${report.errors}`,
    `Reviews: ${report.reviews}`,
  ].join("\n");
}
