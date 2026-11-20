/** Keyboard-only operability contracts for observed focus paths. */
export type Key = "Tab" | "Shift+Tab" | "Enter" | "Space" | "Escape" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";
export type Orientation = "horizontal" | "vertical" | "both";
export type CompositeKind = "tabs" | "listbox" | "menu" | "radio" | "tree" | "toolbar";
export interface Target {
  id: string;
  role: string;
  label: string;
  visible: boolean;
  disabled: boolean;
  inert: boolean;
  tabindex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  focusRing: boolean;
  selected: boolean | null;
  checked: boolean | null;
  expanded: boolean | null;
  controls: readonly string[];
}
export interface KeyStroke {
  key: Key;
  before: string | null;
  after: string | null;
  prevented: boolean;
  at: number;
  scrollBefore: number;
  scrollAfter: number;
}
export interface Composite {
  id: string;
  kind: CompositeKind;
  orientation: Orientation;
  wrap: boolean;
  activation: "automatic" | "manual";
  current: string | null;
  children: readonly Target[];
}
export interface Dialog {
  id: string;
  open: boolean;
  triggerId: string;
  activeId: string | null;
  descendants: readonly string[];
  backgroundFocusables: readonly string[];
  modal: boolean;
}
export interface KeyboardFinding {
  code: string;
  target: string;
  description: string;
}
const error = (code: string, target: string, description: string): KeyboardFinding => ({ code, target, description });
export function eligible(target: Target): boolean {
  return target.visible && !target.disabled && !target.inert;
}
export function tabbable(target: Target): boolean {
  return eligible(target) && target.tabindex >= 0;
}
export function targetFindings(target: Target): KeyboardFinding[] {
  const problems: KeyboardFinding[] = [];
  if (!target.id.trim()) problems.push(error("target-id", target.id, "Focusable target needs a stable identifier"));
  if (!target.label.trim() && eligible(target)) problems.push(error("target-name", target.id, "Interactive target needs an accessible name"));
  if (!Number.isInteger(target.tabindex) || target.tabindex < -1) problems.push(error("target-tabindex", target.id, "Invalid tab index"));
  if (target.tabindex > 0) problems.push(error("positive-tabindex", target.id, "Positive tab index changes natural order"));
  for (const [dimension, value] of [["width", target.width], ["height", target.height]] as const) {
    if (!Number.isFinite(value) || value < 0) problems.push(error(`target-${dimension}-invalid`, target.id, `Invalid ${dimension}`));
    else if (eligible(target) && value < 44) problems.push(error(`target-${dimension}-small`, target.id, `${dimension} below 44px`));
  }
  if (eligible(target) && !target.focusRing) problems.push(error("focus-indicator-missing", target.id, "Keyboard focus needs a visible indicator"));
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) problems.push(error("target-coordinate", target.id, "Unknown target position"));
  if (target.controls.some((id) => !id.trim())) problems.push(error("target-empty-controls", target.id, "Empty aria-controls token"));
  return problems;
}
export function targetListFindings(targets: readonly Target[]): KeyboardFinding[] {
  const result: KeyboardFinding[] = [];
  const ids = new Set<string>();
  for (const target of targets) {
    result.push(...targetFindings(target));
    if (ids.has(target.id)) result.push(error("duplicate-target-id", target.id, "Repeated identifier"));
    ids.add(target.id);
  }
  for (const target of targets) {
    for (const controlled of target.controls) {
      if (!ids.has(controlled)) result.push(error("controls-missing", target.id, `Missing controlled node ${controlled}`));
    }
  }
  return result;
}
export function orderedTabStops(targets: readonly Target[]): Target[] {
  return targets.filter(tabbable).slice().sort((a, b) => {
    const aPositive = a.tabindex > 0;
    const bPositive = b.tabindex > 0;
    if (aPositive !== bPositive) return aPositive ? -1 : 1;
    if (aPositive && bPositive) return a.tabindex - b.tabindex;
    return 0;
  });
}
export function expectedTabTarget(targets: readonly Target[], active: string | null, backwards: boolean, wrap = true): string | null {
  const stops = orderedTabStops(targets);
  if (!stops.length) return null;
  const index = stops.findIndex((target) => target.id === active);
  if (index < 0) return backwards ? stops[stops.length - 1]!.id : stops[0]!.id;
  const next = index + (backwards ? -1 : 1);
  if (next >= 0 && next < stops.length) return stops[next]!.id;
  if (!wrap) return null;
  return stops[backwards ? stops.length - 1 : 0]!.id;
}
export function arrowDirection(key: Key, orientation: Orientation): -1 | 0 | 1 {
  if (orientation !== "vertical" && key === "ArrowRight") return 1;
  if (orientation !== "vertical" && key === "ArrowLeft") return -1;
  if (orientation !== "horizontal" && key === "ArrowDown") return 1;
  if (orientation !== "horizontal" && key === "ArrowUp") return -1;
  return 0;
}
export function compositeEligible(composite: Composite): Target[] {
  return composite.children.filter(eligible);
}
export function nextComposite(composite: Composite, key: Key): string | null {
  const targets = compositeEligible(composite);
  if (!targets.length) return null;
  if (key === "Home") return targets[0]!.id;
  if (key === "End") return targets[targets.length - 1]!.id;
  const direction = arrowDirection(key, composite.orientation);
  if (direction === 0) return composite.current;
  const index = targets.findIndex((target) => target.id === composite.current);
  if (index < 0) return targets[0]!.id;
  const desired = index + direction;
  if (desired >= 0 && desired < targets.length) return targets[desired]!.id;
  if (composite.wrap) return targets[desired < 0 ? targets.length - 1 : 0]!.id;
  return targets[index]!.id;
}
export function compositeFindings(composite: Composite): KeyboardFinding[] {
  const failures: KeyboardFinding[] = [];
  if (!composite.id.trim()) failures.push(error("composite-id", composite.id, "Composite identifier missing"));
  if (!composite.children.length) failures.push(error("composite-empty", composite.id, "Composite has no children"));
  const ids = composite.children.map((target) => target.id);
  if (new Set(ids).size !== ids.length) failures.push(error("composite-duplicate-child", composite.id, "Repeated child identifier"));
  const available = compositeEligible(composite);
  if (composite.current && !available.some((target) => target.id === composite.current)) {
    failures.push(error("composite-current-missing", composite.id, "Current item not eligible"));
  }
  const inTabOrder = available.filter((target) => target.tabindex === 0);
  if (available.length && inTabOrder.length !== 1) failures.push(error("composite-roving-count", composite.id, "Exactly one eligible child needs tabindex zero"));
  if (composite.current && inTabOrder.length === 1 && inTabOrder[0]?.id !== composite.current) {
    failures.push(error("composite-roving-current", composite.id, "Roving target does not match current item"));
  }
  if (composite.kind === "tabs") {
    const selected = available.filter((target) => target.selected);
    if (selected.length !== 1) failures.push(error("tabs-selection-count", composite.id, "Exactly one tab should be selected"));
    if (composite.activation === "automatic" && composite.current && selected[0]?.id !== composite.current) {
      failures.push(error("tabs-automatic-selection", composite.id, "Automatic activation should select focused tab"));
    }
  }
  if (composite.kind === "radio") {
    const checked = available.filter((target) => target.checked);
    if (checked.length > 1) failures.push(error("radio-multiple-checked", composite.id, "Radio group has multiple checked choices"));
  }
  return failures;
}
export function compositeStrokeFindings(composite: Composite, stroke: KeyStroke): KeyboardFinding[] {
  const failures: KeyboardFinding[] = [];
  const expected = nextComposite({ ...composite, current: stroke.before }, stroke.key);
  const controlled = stroke.key === "Home" || stroke.key === "End" || arrowDirection(stroke.key, composite.orientation) !== 0;
  if (controlled && stroke.after !== expected) failures.push(error("composite-wrong-focus", composite.id, `${stroke.after} instead of ${expected}`));
  if (controlled && !stroke.prevented) failures.push(error("composite-default-not-prevented", composite.id, "Consumed navigation key should prevent browser scrolling"));
  if (!controlled && stroke.key.startsWith("Arrow") && stroke.before !== stroke.after) {
    failures.push(error("composite-cross-axis", composite.id, "Cross-axis key moved composite focus"));
  }
  if (controlled && stroke.scrollBefore !== stroke.scrollAfter) failures.push(error("composite-scrolled", composite.id, "Arrow navigation also scrolled page"));
  if (!Number.isFinite(stroke.at)) failures.push(error("stroke-time-invalid", composite.id, "Invalid input time"));
  return failures;
}
export function linearStrokeFindings(targets: readonly Target[], stroke: KeyStroke, wrap = true): KeyboardFinding[] {
  const failures: KeyboardFinding[] = [];
  if (stroke.key !== "Tab" && stroke.key !== "Shift+Tab") return failures;
  const backwards = stroke.key === "Shift+Tab";
  const expected = expectedTabTarget(targets, stroke.before, backwards, wrap);
  if (stroke.after !== expected) failures.push(error("tab-order", stroke.before ?? "document", `${stroke.after} instead of ${expected}`));
  if (stroke.prevented) failures.push(error("tab-prevented", stroke.before ?? "document", "Native Tab should generally remain available"));
  return failures;
}
export function dialogFindings(dialog: Dialog): KeyboardFinding[] {
  const failures: KeyboardFinding[] = [];
  if (!dialog.open) return failures;
  if (!dialog.descendants.length) failures.push(error("dialog-empty", dialog.id, "Open dialog has no focusable descendants"));
  if (dialog.activeId && !dialog.descendants.includes(dialog.activeId)) failures.push(error("dialog-focus-outside", dialog.id, "Focus is outside dialog"));
  if (dialog.modal && dialog.backgroundFocusables.length) failures.push(error("dialog-background-active", dialog.id, "Background controls are focusable"));
  if (!dialog.triggerId.trim()) failures.push(error("dialog-trigger-missing", dialog.id, "Dialog has no restoration anchor"));
  return failures;
}
export function dialogEscapeFindings(before: Dialog, after: Dialog, stroke: KeyStroke): KeyboardFinding[] {
  const failures: KeyboardFinding[] = [];
  if (stroke.key !== "Escape" || !before.open) return failures;
  if (after.open) failures.push(error("escape-not-closed", before.id, "Escape did not close dialog"));
  if (stroke.after !== before.triggerId) failures.push(error("escape-focus-not-returned", before.id, "Focus did not return to the trigger"));
  return failures;
}
export function pathFindings(targets: readonly Target[], strokes: readonly KeyStroke[]): KeyboardFinding[] {
  const failures: KeyboardFinding[] = [];
  const seen = new Set<string>();
  let previous: KeyStroke | null = null;
  for (const stroke of strokes) {
    if (previous && previous.after !== stroke.before) failures.push(error("path-disconnected", stroke.before ?? "document", "Next stroke does not start at previous focus"));
    if (previous && stroke.at < previous.at) failures.push(error("path-time-reversed", stroke.before ?? "document", "Time moved backwards"));
    failures.push(...linearStrokeFindings(targets, stroke));
    if (stroke.after) seen.add(stroke.after);
    previous = stroke;
  }
  for (const target of orderedTabStops(targets)) {
    if (!seen.has(target.id)) failures.push(error("target-unreached", target.id, "Keyboard path did not reach eligible tab stop"));
  }
  return failures;
}
export function keyboardSummary(findings: readonly KeyboardFinding[], maximum = 30): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("Invalid report maximum");
  const rows = [...new Set(findings.map((finding) => `${finding.code} ${finding.target}: ${finding.description}`))];
  const omitted = rows.length - Math.min(rows.length, maximum);
  return [...rows.slice(0, maximum), ...(omitted ? [`${omitted} additional findings`] : [])].join("\n");
}
