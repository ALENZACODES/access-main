import { issue, type DialogState, type Finding, type FocusTarget, type JourneyEvent, type PageSnapshot } from "./p20ak-types.ts";

/** Keyboard and dialog checks evaluate the observed target sequence, not selectors alone. */
export function focusEligible(target: FocusTarget): boolean {
  return target.visible && !target.disabled && !target.inert && target.tabIndex >= 0;
}
export function orderedTargets(targets: readonly FocusTarget[]): FocusTarget[] {
  return targets.filter(focusEligible).sort((left, right) => {
    const leftPositive = left.tabIndex > 0;
    const rightPositive = right.tabIndex > 0;
    if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
    if (leftPositive && rightPositive && left.tabIndex !== right.tabIndex) return left.tabIndex - right.tabIndex;
    return left.order - right.order;
  });
}
export function nextKeyboardStop(targets: readonly FocusTarget[], id: string | null, backwards = false): string | null {
  const ordered = orderedTargets(targets);
  if (ordered.length === 0) return null;
  const previous = ordered.findIndex((target) => target.id === id);
  if (previous < 0) return backwards ? ordered[ordered.length - 1]!.id : ordered[0]!.id;
  const next = backwards ? (previous + ordered.length - 1) % ordered.length : (previous + 1) % ordered.length;
  return ordered[next]?.id ?? null;
}
export function targetFindings(targets: readonly FocusTarget[], step = 0): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const target of targets) {
    const scope = `focus/${target.id}`;
    if (!target.id.trim()) findings.push(issue("focus-id-empty", scope, "Target ID missing", step));
    if (ids.has(target.id)) findings.push(issue("focus-id-duplicate", scope, "Duplicate target ID", step));
    ids.add(target.id);
    if (!focusEligible(target)) continue;
    if (!target.name?.trim()) findings.push(issue("focus-name-missing", scope, "Keyboard target has no accessible name", step));
    if (!Number.isInteger(target.order) || target.order < 0) findings.push(issue("focus-order-invalid", scope, "Invalid document order", step));
    if (orders.has(target.order)) findings.push(issue("focus-order-duplicate", scope, "Multiple stops share document order", step));
    orders.add(target.order);
    if (!Number.isInteger(target.tabIndex) || target.tabIndex > 0) findings.push(issue("focus-tabindex-positive", scope, "Positive or fractional tabindex", step, "warning"));
    if (target.width === null || !Number.isFinite(target.width)) findings.push(issue("focus-width-unknown", scope, "Width UNKNOWN", step, "information"));
    else if (target.width < 44) findings.push(issue("focus-target-width", scope, "Target narrower than 44 px", step));
    if (target.height === null || !Number.isFinite(target.height)) findings.push(issue("focus-height-unknown", scope, "Height UNKNOWN", step, "information"));
    else if (target.height < 44) findings.push(issue("focus-target-height", scope, "Target shorter than 44 px", step));
    if (target.focusIndicator === false) findings.push(issue("focus-indicator-absent", scope, "No visible focus indicator", step));
    if (target.focusIndicator === null) findings.push(issue("focus-indicator-unknown", scope, "Focus indicator UNKNOWN", step, "information"));
  }
  return findings;
}
export function dialogFindings(dialogs: readonly DialogState[], targets: readonly FocusTarget[], step = 0): Finding[] {
  const findings: Finding[] = [];
  const active = dialogs.filter((dialog) => dialog.open);
  for (const dialog of active) {
    const scope = `dialog/${dialog.id}`;
    if (!dialog.id.trim()) findings.push(issue("dialog-id-empty", scope, "Missing dialog ID", step));
    if (dialog.modal && dialog.activeId !== null && !dialog.descendants.includes(dialog.activeId)) findings.push(issue("dialog-focus-escaped", scope, "Focus outside open modal", step));
    if (dialog.modal && dialog.backgroundFocusableIds.length > 0) findings.push(issue("dialog-background-active", scope, "Background remains keyboard operable", step));
    if (dialog.modal && dialog.activeId === null) findings.push(issue("dialog-focus-unknown", scope, "Active focus UNKNOWN", step, "information"));
    if (dialog.modal && !dialog.descendants.some((id) => targets.some((target) => target.id === id && focusEligible(target)))) {
      findings.push(issue("dialog-no-keyboard-controls", scope, "No eligible target inside dialog", step));
    }
    if (dialog.triggerId !== null && !targets.some((target) => target.id === dialog.triggerId)) findings.push(issue("dialog-trigger-missing", scope, "Trigger ID absent from target inventory", step, "warning"));
  }
  if (active.filter((dialog) => dialog.modal).length > 1) findings.push(issue("dialog-multiple-modals", "dialog", "More than one active modal", step));
  return findings;
}
export function keyboardTransitionFindings(before: PageSnapshot, after: PageSnapshot, key: string, step = 0): Finding[] {
  const findings: Finding[] = [];
  if (!after.activeId && before.targets.some(focusEligible)) findings.push(issue("keyboard-focus-lost", after.route, `Focus lost following ${key}`, step));
  if (key === "Tab" || key === "Shift+Tab") {
    const expected = nextKeyboardStop(after.targets, before.activeId, key === "Shift+Tab");
    if (expected !== null && after.activeId !== expected) findings.push(issue("keyboard-tab-order", after.route, `Expected ${expected}; observed ${after.activeId ?? "UNKNOWN"}`, step));
  }
  if (key === "Escape") {
    const beforeDialog = before.dialogs.find((dialog) => dialog.open && dialog.modal);
    if (beforeDialog && after.dialogs.some((dialog) => dialog.id === beforeDialog.id && dialog.open)) {
      findings.push(issue("keyboard-escape-not-closed", beforeDialog.id, "Escape left modal open", step));
    }
    if (beforeDialog?.triggerId && !after.dialogs.some((dialog) => dialog.id === beforeDialog.id && dialog.open) && after.activeId !== beforeDialog.triggerId) {
      findings.push(issue("keyboard-escape-focus-not-returned", beforeDialog.id, "Focus did not return to trigger", step));
    }
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key) && before.scrollY !== after.scrollY && before.activeId !== after.activeId) {
    findings.push(issue("keyboard-arrow-scrolled", after.route, "Arrow navigation moved focus and scrolled", step, "warning"));
  }
  return findings;
}
export function focusEventFindings(event: JourneyEvent, step = 0): Finding[] {
  const findings: Finding[] = [];
  if (event.action === "focus" && event.intendedFocusId && event.after.activeId !== event.intendedFocusId) {
    findings.push(issue("focus-action-mismatch", event.after.route, "Intended focus not observed", step));
  }
  if (event.action === "open") {
    const opened = event.after.dialogs.filter((dialog) => dialog.open && !event.before.dialogs.some((previous) => previous.id === dialog.id && previous.open));
    if (opened.length === 0) findings.push(issue("dialog-open-unobserved", event.after.route, "Open action did not open a dialog", step));
    for (const dialog of opened) {
      if (dialog.modal && event.after.activeId !== null && !dialog.descendants.includes(event.after.activeId)) findings.push(issue("dialog-open-focus-outside", dialog.id, "Focus outside modal after opening", step));
    }
  }
  if (event.action === "close") {
    const previouslyOpen = event.before.dialogs.filter((dialog) => dialog.open);
    const stillOpen = previouslyOpen.some((dialog) => event.after.dialogs.some((next) => next.id === dialog.id && next.open));
    if (stillOpen) findings.push(issue("dialog-close-unobserved", event.after.route, "Close action left dialog open", step));
    for (const previous of previouslyOpen) {
      if (previous.triggerId && !stillOpen && event.after.activeId !== previous.triggerId) findings.push(issue("dialog-close-focus-lost", previous.id, "Trigger focus not restored", step));
    }
  }
  return findings;
}
export function focusContrastRisk(target: FocusTarget): boolean {
  return focusEligible(target) && target.focusIndicator !== true;
}
export function focusCoverage(targets: readonly FocusTarget[]): { eligible: number; named: number; sized: number; indicated: number } {
  const eligible = targets.filter(focusEligible);
  return {
    eligible: eligible.length,
    named: eligible.filter((target) => Boolean(target.name?.trim())).length,
    sized: eligible.filter((target) => target.width !== null && target.height !== null && target.width >= 44 && target.height >= 44).length,
    indicated: eligible.filter((target) => target.focusIndicator === true).length,
  };
}
export function dialogFocusBoundary(dialog: DialogState, id: string | null): "inside" | "outside" | "UNKNOWN" {
  if (id === null) return "UNKNOWN";
  return dialog.descendants.includes(id) ? "inside" : "outside";
}
export function targetById(targets: readonly FocusTarget[], id: string | null): FocusTarget | null {
  if (!id) return null;
  return targets.find((target) => target.id === id) ?? null;
}
export function activeTargetStatus(snapshot: PageSnapshot): "eligible" | "ineligible" | "UNKNOWN" {
  const target = targetById(snapshot.targets, snapshot.activeId);
  return target === null ? "UNKNOWN" : focusEligible(target) ? "eligible" : "ineligible";
}
export function skippedFocusIds(before: readonly FocusTarget[], after: readonly FocusTarget[]): string[] {
  const updated = new Set(orderedTargets(after).map((target) => target.id));
  return orderedTargets(before).filter((target) => !updated.has(target.id)).map((target) => target.id);
}
export function stableFocusableNames(before: readonly FocusTarget[], after: readonly FocusTarget[]): Finding[] {
  const findings: Finding[] = [];
  const mapped = new Map(after.map((target) => [target.id, target]));
  for (const previous of before) {
    const current = mapped.get(previous.id);
    if (current && previous.name?.trim() && !current.name?.trim() && focusEligible(current)) findings.push(issue("focus-name-lost", previous.id, "Accessible name disappeared"));
  }
  return findings;
}
