import { type Finding, finding, type Rect } from "./p20al-contract.ts";

export type KeyName = "Tab" | "Shift+Tab" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | "Escape" | "Enter" | "Space";
export interface Target {
  readonly key: string;
  readonly name: string | null;
  readonly role: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inert: boolean;
  readonly tabIndex: number;
  readonly rect: Rect | null;
  readonly inDialog: boolean;
}
export interface KeyboardStroke {
  readonly key: KeyName;
  readonly before: string | null;
  readonly after: string | null;
  readonly scrollBefore: number | null;
  readonly scrollAfter: number | null;
  readonly defaultPrevented: boolean | null;
}
export interface Composite {
  readonly id: string;
  readonly orientation: "horizontal" | "vertical";
  readonly wrap: boolean;
  readonly activeId: string | null;
  readonly targets: readonly Target[];
}
export interface Dialog {
  readonly id: string;
  readonly open: boolean;
  readonly activeId: string | null;
  readonly launcher: string | null;
  readonly insideIds: readonly string[];
  readonly backgroundFocusable: readonly string[];
}
export function eligibleTarget(target: Target): boolean {
  return target.visible && !target.disabled && !target.inert && target.tabIndex >= -1;
}
export function tabbableTargets(targets: readonly Target[]): Target[] {
  const eligible = targets.filter((item) => eligibleTarget(item) && item.tabIndex >= 0);
  return [...eligible.filter((item) => item.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex), ...eligible.filter((item) => item.tabIndex === 0)];
}
export function targetProblems(targets: readonly Target[], scope: string): Finding[] {
  const failures: Finding[] = [];
  const ids = new Set<string>();
  for (const target of targets) {
    if (ids.has(target.key)) failures.push(finding("target-id-duplicate", scope, target.key));
    ids.add(target.key);
    if (!target.visible || target.disabled) continue;
    if (!target.name?.trim()) failures.push(finding("target-name-missing", scope, target.key));
    if (target.inert && target.tabIndex >= 0) failures.push(finding("inert-tabbable", scope, target.key));
    if (target.tabIndex < -1 || !Number.isSafeInteger(target.tabIndex)) failures.push(finding("target-tabindex-invalid", scope, target.key));
    if (target.tabIndex > 0) failures.push(finding("target-positive-tabindex", scope, target.key, "warning"));
    if (target.rect === null) {
      failures.push(finding("target-measurement-unknown", scope, target.key, "information"));
      continue;
    }
    if (![target.rect.x, target.rect.y, target.rect.width, target.rect.height].every(Number.isFinite)) {
      failures.push(finding("target-measurement-invalid", scope, target.key));
      continue;
    }
    if (target.rect.width < 44) failures.push(finding("target-width", scope, target.key));
    if (target.rect.height < 44) failures.push(finding("target-height", scope, target.key));
  }
  return failures;
}
export function nextTab(targets: readonly Target[], current: string | null, backwards: boolean): string | null {
  const list = tabbableTargets(targets);
  if (list.length === 0) return null;
  const index = list.findIndex((item) => item.key === current);
  if (index < 0) return backwards ? list[list.length - 1]!.key : list[0]!.key;
  const next = backwards ? (index - 1 + list.length) % list.length : (index + 1) % list.length;
  return list[next]?.key ?? null;
}
export function compositeNext(composite: Composite, key: KeyName): string | null {
  const options = composite.targets.filter(eligibleTarget);
  if (!options.length) return null;
  if (key === "Home") return options[0]!.key;
  if (key === "End") return options[options.length - 1]!.key;
  const forward = composite.orientation === "horizontal" ? key === "ArrowRight" : key === "ArrowDown";
  const backward = composite.orientation === "horizontal" ? key === "ArrowLeft" : key === "ArrowUp";
  if (!forward && !backward) return composite.activeId;
  const position = options.findIndex((item) => item.key === composite.activeId);
  if (position < 0) return options[0]!.key;
  let next = position + (forward ? 1 : -1);
  if (composite.wrap) next = (next + options.length) % options.length;
  else next = Math.max(0, Math.min(options.length - 1, next));
  return options[next]?.key ?? null;
}
export function compositeProblems(composite: Composite): Finding[] {
  const failures: Finding[] = [];
  const eligible = composite.targets.filter(eligibleTarget);
  const active = eligible.filter((item) => item.key === composite.activeId);
  if (eligible.length && active.length !== 1) failures.push(finding("composite-active-invalid", composite.id, String(composite.activeId)));
  const roving = eligible.filter((item) => item.tabIndex === 0);
  if (eligible.length && roving.length !== 1) failures.push(finding("composite-roving-count", composite.id, String(roving.length)));
  if (roving.length === 1 && roving[0]?.key !== composite.activeId) failures.push(finding("composite-roving-mismatch", composite.id, roving[0]!.key));
  failures.push(...targetProblems(composite.targets, composite.id));
  return failures;
}
export function strokeProblems(stroke: KeyboardStroke, targets: readonly Target[], scope: string): Finding[] {
  const failures: Finding[] = [];
  const before = stroke.before;
  const after = stroke.after;
  if (before && !targets.some((item) => item.key === before)) failures.push(finding("stroke-before-unknown", scope, before));
  if (after && !targets.some((item) => item.key === after)) failures.push(finding("stroke-after-unknown", scope, after));
  if (stroke.key === "Tab" || stroke.key === "Shift+Tab") {
    const expected = nextTab(targets, before, stroke.key === "Shift+Tab");
    if (expected !== after) failures.push(finding("tab-order", scope, `${expected} -> ${after}`));
  }
  if (stroke.key.startsWith("Arrow") && stroke.defaultPrevented === false && stroke.scrollBefore !== stroke.scrollAfter) {
    failures.push(finding("arrow-scroll", scope, stroke.key));
  }
  if (stroke.scrollBefore !== null && (!Number.isFinite(stroke.scrollBefore) || stroke.scrollBefore < 0)) failures.push(finding("stroke-scroll-before-invalid", scope, stroke.key));
  if (stroke.scrollAfter !== null && (!Number.isFinite(stroke.scrollAfter) || stroke.scrollAfter < 0)) failures.push(finding("stroke-scroll-after-invalid", scope, stroke.key));
  return failures;
}
export function dialogProblems(dialog: Dialog): Finding[] {
  if (!dialog.open) return [];
  const failures: Finding[] = [];
  if (dialog.activeId === null || !dialog.insideIds.includes(dialog.activeId)) failures.push(finding("dialog-focus-outside", dialog.id, String(dialog.activeId)));
  if (dialog.backgroundFocusable.length) failures.push(finding("dialog-background-active", dialog.id, dialog.backgroundFocusable.join(",")));
  if (!dialog.insideIds.length) failures.push(finding("dialog-no-focus-target", dialog.id, "No dialog controls"));
  return failures;
}
export function dialogEscapeProblems(before: Dialog, after: Dialog, focusAfter: string | null): Finding[] {
  const failures: Finding[] = [];
  if (before.open && after.open) failures.push(finding("dialog-escape-not-closed", before.id, "Escape left dialog open"));
  if (before.open && !after.open && before.launcher && focusAfter !== before.launcher) failures.push(finding("dialog-focus-not-restored", before.id, String(focusAfter)));
  return failures;
}
export function keyboardSummary(findings: readonly Finding[], maximum = 20): string {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive");
  const unique = [...new Set(findings.map((item) => `${item.code} ${item.scope}: ${item.detail}`))];
  return [...unique.slice(0, maximum), ...(unique.length > maximum ? [`${unique.length - maximum} more`] : [])].join("\n");
}
