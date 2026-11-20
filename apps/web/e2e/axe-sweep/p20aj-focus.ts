import { finding, type Finding, type KeyboardKey, type Snapshot, type Target } from "./p20aj-types.ts";

export interface KeyObservation {
  readonly key: KeyboardKey;
  readonly beforeId: string | null;
  readonly afterId: string | null;
  readonly scrollBefore: number | null;
  readonly scrollAfter: number | null;
  readonly prevented: boolean | null;
}
export interface DialogObservation {
  readonly id: string;
  readonly activeId: string | null;
  readonly triggerId: string | null;
  readonly descendants: readonly string[];
  readonly backgroundFocusable: readonly string[];
  readonly modal: boolean;
  readonly open: boolean;
}
export interface CompositeObservation {
  readonly id: string;
  readonly kind: "tabs" | "listbox" | "toolbar" | "radio" | "menu";
  readonly orientation: "horizontal" | "vertical";
  readonly activeId: string | null;
  readonly children: readonly Target[];
  readonly wrap: boolean;
}
export function eligible(target: Target): boolean {
  return target.visible && target.enabled && !target.inert && target.tabIndex >= 0;
}
export function named(target: Target): boolean {
  return target.name !== null && target.name.trim().length > 0;
}
export function tabStops(targets: readonly Target[]): Target[] {
  const candidates = targets.filter(eligible);
  const positive = candidates.filter((target) => target.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
  return [...positive, ...candidates.filter((target) => target.tabIndex === 0)];
}
export function targetFindings(targets: readonly Target[], step: number): Finding[] {
  const problems: Finding[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    if (!target.id.trim()) problems.push(finding("target-id-empty", "focus", step, "Focusable has no identifier"));
    if (seen.has(target.id)) problems.push(finding("target-id-duplicate", "focus", step, target.id));
    seen.add(target.id);
    if (!target.visible || !target.enabled) continue;
    if (target.inert && target.tabIndex >= 0) problems.push(finding("inert-in-tab-order", "focus", step, target.id));
    if (!named(target)) problems.push(finding("control-unnamed", "focus", step, target.id));
    if (target.tabIndex < -1 || !Number.isInteger(target.tabIndex)) {
      problems.push(finding("tabindex-invalid", "focus", step, target.id));
    }
    if (target.tabIndex > 0) problems.push(finding("positive-tabindex", "focus", step, target.id, "warning"));
    if (target.width === null || !Number.isFinite(target.width)) {
      problems.push(finding("width-UNKNOWN", "focus", step, target.id, "information"));
    } else if (target.width < 44) problems.push(finding("target-width", "focus", step, target.id));
    if (target.height === null || !Number.isFinite(target.height)) {
      problems.push(finding("height-UNKNOWN", "focus", step, target.id, "information"));
    } else if (target.height < 44) problems.push(finding("target-height", "focus", step, target.id));
    if (target.focusIndicator === false) problems.push(finding("focus-indicator", "focus", step, target.id));
    if (target.focusIndicator === null) problems.push(finding("focus-indicator-UNKNOWN", "focus", step, target.id, "information"));
  }
  return problems;
}
export function activeTarget(snapshot: Snapshot): Target | null {
  return snapshot.targets.find((target) => target.id === snapshot.activeId) ?? null;
}
export function focusFindings(snapshot: Snapshot, step: number): Finding[] {
  const problems = targetFindings(snapshot.targets, step);
  if (snapshot.activeId === null) {
    problems.push(finding("active-UNKNOWN", "focus", step, snapshot.route, "information"));
    return problems;
  }
  const active = activeTarget(snapshot);
  if (!active) {
    problems.push(finding("active-missing", "focus", step, snapshot.activeId));
    return problems;
  }
  if (!active.visible || active.inert || !active.enabled) problems.push(finding("active-ineligible", "focus", step, active.id));
  if (snapshot.dialogId !== null && active.modalId !== snapshot.dialogId) {
    problems.push(finding("modal-focus-outside", "focus", step, active.id));
  }
  return problems;
}
export function nextTabTarget(targets: readonly Target[], activeId: string | null, reverse: boolean): string | null {
  const stops = tabStops(targets);
  if (!stops.length) return null;
  const index = stops.findIndex((target) => target.id === activeId);
  if (index < 0) return (reverse ? stops[stops.length - 1] : stops[0])?.id ?? null;
  const next = (index + (reverse ? -1 : 1) + stops.length) % stops.length;
  return stops[next]?.id ?? null;
}
export function tabSequenceFindings(targets: readonly Target[], events: readonly KeyObservation[], step: number): Finding[] {
  const problems: Finding[] = [];
  for (const event of events) {
    if (event.key !== "Tab" && event.key !== "Shift+Tab") continue;
    const expected = nextTabTarget(targets, event.beforeId, event.key === "Shift+Tab");
    if (expected !== event.afterId) problems.push(finding("tab-order", "focus", step, `${event.beforeId ?? "UNKNOWN"} -> ${event.afterId ?? "UNKNOWN"}, expected ${expected ?? "UNKNOWN"}`));
    if (event.beforeId === event.afterId && targets.filter(eligible).length > 1) {
      problems.push(finding("tab-stuck", "focus", step, event.beforeId ?? "UNKNOWN"));
    }
  }
  return problems;
}
export function compositeTarget(composite: CompositeObservation, direction: "next" | "previous" | "first" | "last"): string | null {
  const children = composite.children.filter((item) => item.visible && item.enabled && !item.inert);
  if (!children.length) return null;
  if (direction === "first") return children[0]?.id ?? null;
  if (direction === "last") return children[children.length - 1]?.id ?? null;
  const position = children.findIndex((item) => item.id === composite.activeId);
  if (position < 0) return children[0]?.id ?? null;
  const delta = direction === "next" ? 1 : -1;
  const proposed = position + delta;
  if (composite.wrap) return children[(proposed + children.length) % children.length]?.id ?? null;
  return children[Math.min(children.length - 1, Math.max(0, proposed))]?.id ?? null;
}
export function compositeFindings(composite: CompositeObservation, step: number): Finding[] {
  const problems: Finding[] = [];
  const valid = composite.children.filter((item) => item.visible && item.enabled && !item.inert);
  const roving = valid.filter((item) => item.tabIndex === 0);
  if (roving.length !== 1 && valid.length > 0) problems.push(finding("roving-count", "focus", step, composite.id));
  if (!valid.some((item) => item.id === composite.activeId)) problems.push(finding("composite-active-missing", "focus", step, composite.id));
  if (roving.length === 1 && roving[0]?.id !== composite.activeId) problems.push(finding("roving-mismatch", "focus", step, composite.id));
  const ids = new Set<string>();
  for (const item of composite.children) {
    if (ids.has(item.id)) problems.push(finding("composite-id-duplicate", "focus", step, item.id));
    ids.add(item.id);
  }
  return problems;
}
export function arrowFindings(composite: CompositeObservation, events: readonly KeyObservation[], step: number): Finding[] {
  const problems: Finding[] = [];
  const forward = composite.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const backward = composite.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  for (const event of events) {
    let direction: "next" | "previous" | "first" | "last" | null = null;
    if (event.key === forward) direction = "next";
    if (event.key === backward) direction = "previous";
    if (event.key === "Home") direction = "first";
    if (event.key === "End") direction = "last";
    if (direction === null) continue;
    const expected = compositeTarget({ ...composite, activeId: event.beforeId }, direction);
    if (expected !== event.afterId) problems.push(finding("arrow-destination", "focus", step, `${event.key}: ${event.afterId ?? "UNKNOWN"}`));
    if (event.prevented === false) problems.push(finding("arrow-default", "focus", step, event.key));
    if (event.scrollBefore !== null && event.scrollAfter !== null && event.scrollAfter !== event.scrollBefore) {
      problems.push(finding("arrow-scrolled", "focus", step, event.key));
    }
  }
  return problems;
}
export function dialogFindings(dialog: DialogObservation, step: number): Finding[] {
  const problems: Finding[] = [];
  if (!dialog.open) return problems;
  if (!dialog.id.trim()) problems.push(finding("dialog-id", "focus", step, "Dialog has no ID"));
  if (dialog.modal && !dialog.descendants.includes(dialog.activeId ?? "")) problems.push(finding("dialog-escaped", "focus", step, dialog.id));
  if (dialog.modal && dialog.backgroundFocusable.length) problems.push(finding("dialog-background", "focus", step, dialog.backgroundFocusable.join(",")));
  if (!dialog.triggerId) problems.push(finding("dialog-trigger-UNKNOWN", "focus", step, dialog.id, "information"));
  return problems;
}
export function escapeFindings(before: DialogObservation, after: DialogObservation, step: number): Finding[] {
  const problems: Finding[] = [];
  if (!before.open) return [finding("escape-not-open", "focus", step, before.id, "information")];
  if (after.open) problems.push(finding("escape-still-open", "focus", step, after.id));
  if (before.triggerId && after.activeId !== before.triggerId) problems.push(finding("escape-focus-lost", "focus", step, before.triggerId));
  return problems;
}
export function focusRestoreFindings(before: Snapshot, after: Snapshot, preserve: boolean, step: number): Finding[] {
  if (!preserve) return [];
  if (before.activeId === null) return [finding("restore-UNKNOWN", "focus", step, before.route, "information")];
  if (before.activeId !== after.activeId) return [finding("focus-not-restored", "focus", step, `${before.activeId} => ${after.activeId ?? "UNKNOWN"}`)];
  return [];
}
