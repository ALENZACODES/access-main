/** Composite widget and disclosure state contracts independent of a browser runtime. */
export type WidgetKind = "button" | "tab" | "tablist" | "tabpanel" | "tree" | "treeitem" | "listbox" | "option" | "combobox" | "dialog" | "grid" | "row" | "gridcell" | "menu" | "menuitem" | "region";
export type ToggleState = "true" | "false" | "mixed" | null;
export type WidgetEventKind = "open" | "close" | "select" | "deselect" | "activate" | "dismiss" | "escape" | "arrow" | "tab";

export interface WidgetIssue {
  readonly code: string;
  readonly owner: string;
  readonly detail: string;
}

export interface WidgetObservation {
  readonly id: string;
  readonly role: WidgetKind;
  readonly label: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly expanded: ToggleState;
  readonly pressed: ToggleState;
  readonly selected: ToggleState;
  readonly checked: ToggleState;
  readonly controls: readonly string[];
  readonly labelledBy: readonly string[];
  readonly activeDescendant: string | null;
  readonly tabIndex: number;
  readonly parentId: string | null;
  readonly containerId: string | null;
}

export interface DisclosureObservation {
  readonly trigger: WidgetObservation;
  readonly panelId: string;
  readonly panelCount: number;
  readonly panelVisible: boolean;
  readonly panelInert: boolean;
  readonly modal: boolean;
  readonly focusInside: boolean;
  readonly backdropFocusable: boolean;
}

export interface WidgetEvent {
  readonly type: WidgetEventKind;
  readonly before: WidgetObservation;
  readonly after: WidgetObservation;
  readonly expectedFocus: string | null;
  readonly focusAfter: string | null;
  readonly interrupted: boolean;
}

export interface CompositeObservation {
  readonly id: string;
  readonly kind: "tabs" | "listbox" | "tree" | "menu" | "grid";
  readonly children: readonly WidgetObservation[];
  readonly activeId: string | null;
  readonly selectedIds: readonly string[];
  readonly multiple: boolean;
  readonly wrapNavigation: boolean;
}

const CAN_EXPAND = new Set<WidgetKind>(["button", "combobox", "treeitem", "menuitem"]);
const CAN_SELECT = new Set<WidgetKind>(["tab", "treeitem", "option", "gridcell", "row"]);
const CAN_CHECK = new Set<WidgetKind>(["option", "treeitem", "menuitem"]);
const CAN_PRESS = new Set<WidgetKind>(["button"]);
const CONTAINER_ROLE: Record<CompositeObservation["kind"], WidgetKind> = {
  tabs: "tab", listbox: "option", tree: "treeitem", menu: "menuitem", grid: "row",
};

function issue(code: string, owner: string, detail: string): WidgetIssue {
  return { code, owner, detail };
}

export function hasState(value: ToggleState): boolean {
  return value === "true" || value === "false" || value === "mixed";
}

export function widgetName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function stateIssues(widget: WidgetObservation): WidgetIssue[] {
  const problems: WidgetIssue[] = [];
  if (!widget.visible || widget.disabled) return problems;
  if (!widgetName(widget.label)) problems.push(issue("widget-unnamed", widget.id, widget.role));
  if (widget.expanded !== null && !CAN_EXPAND.has(widget.role)) {
    problems.push(issue("expanded-role", widget.id, widget.role));
  }
  if (widget.pressed !== null && !CAN_PRESS.has(widget.role)) {
    problems.push(issue("pressed-role", widget.id, widget.role));
  }
  if (widget.selected !== null && !CAN_SELECT.has(widget.role)) {
    problems.push(issue("selected-role", widget.id, widget.role));
  }
  if (widget.checked !== null && !CAN_CHECK.has(widget.role)) {
    problems.push(issue("checked-role", widget.id, widget.role));
  }
  if (widget.expanded === "mixed" || widget.pressed === "mixed" || widget.selected === "mixed") {
    problems.push(issue("mixed-state-invalid", widget.id, widget.role));
  }
  if (widget.expanded !== null && widget.controls.length === 0) {
    problems.push(issue("expanded-no-controls", widget.id, widget.role));
  }
  if (widget.activeDescendant !== null && !["combobox", "listbox", "tree", "grid"].includes(widget.role)) {
    problems.push(issue("active-descendant-role", widget.id, widget.role));
  }
  if (widget.tabIndex < -1 || !Number.isInteger(widget.tabIndex)) {
    problems.push(issue("widget-tabindex", widget.id, String(widget.tabIndex)));
  }
  if (widget.controls.some((value) => !value.trim())) {
    problems.push(issue("empty-controls-token", widget.id, widget.role));
  }
  if (widget.labelledBy.some((value) => !value.trim())) {
    problems.push(issue("empty-label-token", widget.id, widget.role));
  }
  return problems;
}

export function disclosureIssues(disclosure: DisclosureObservation): WidgetIssue[] {
  const { trigger } = disclosure;
  const problems = stateIssues(trigger);
  if (trigger.expanded === null) problems.push(issue("disclosure-no-state", trigger.id, "No expanded state"));
  if (!trigger.controls.includes(disclosure.panelId)) {
    problems.push(issue("disclosure-controls", trigger.id, disclosure.panelId));
  }
  if (disclosure.panelCount !== 1) problems.push(issue("disclosure-panel-count", trigger.id, String(disclosure.panelCount)));
  if (trigger.expanded === "true") {
    if (!disclosure.panelVisible) problems.push(issue("disclosure-open-hidden", trigger.id, disclosure.panelId));
    if (disclosure.panelInert) problems.push(issue("disclosure-open-inert", trigger.id, disclosure.panelId));
    if (disclosure.modal && !disclosure.focusInside) problems.push(issue("modal-focus-outside", trigger.id, disclosure.panelId));
    if (disclosure.modal && disclosure.backdropFocusable) problems.push(issue("modal-background-active", trigger.id, disclosure.panelId));
  }
  if (trigger.expanded === "false") {
    if (disclosure.panelVisible && !disclosure.panelInert) {
      problems.push(issue("disclosure-closed-visible", trigger.id, disclosure.panelId));
    }
  }
  return problems;
}

export function transitionIssues(event: WidgetEvent): WidgetIssue[] {
  const problems: WidgetIssue[] = [];
  if (event.before.id !== event.after.id) problems.push(issue("widget-identity-shift", event.after.id, event.before.id));
  if (event.interrupted) {
    problems.push(issue("widget-event-interrupted", event.after.id, event.type));
    return problems;
  }
  const opens = event.type === "open";
  const closes = event.type === "close" || event.type === "dismiss" || event.type === "escape";
  if (opens && event.after.expanded !== "true") problems.push(issue("widget-open-no-change", event.after.id, String(event.after.expanded)));
  if (closes && event.after.expanded !== "false") problems.push(issue("widget-close-no-change", event.after.id, String(event.after.expanded)));
  if (event.type === "select" && event.after.selected !== "true") problems.push(issue("widget-select-no-change", event.after.id, String(event.after.selected)));
  if (event.type === "deselect" && event.after.selected !== "false") problems.push(issue("widget-deselect-no-change", event.after.id, String(event.after.selected)));
  if (event.expectedFocus !== null && event.focusAfter !== event.expectedFocus) {
    problems.push(issue("widget-focus-mismatch", event.after.id, event.focusAfter ?? "UNKNOWN"));
  }
  if (event.before.disabled && event.before !== event.after) problems.push(issue("widget-disabled-transition", event.after.id, event.type));
  return problems;
}

export function compositeIssues(composite: CompositeObservation): WidgetIssue[] {
  const problems: WidgetIssue[] = [];
  const visible = composite.children.filter((node) => node.visible && !node.disabled);
  const seen = new Set<string>();
  const selected = new Set(composite.selectedIds);
  for (const node of composite.children) {
    if (seen.has(node.id)) problems.push(issue("composite-duplicate-id", composite.id, node.id));
    seen.add(node.id);
    problems.push(...stateIssues(node));
  }
  const expectedRole = CONTAINER_ROLE[composite.kind];
  for (const node of visible) {
    if (node.role !== expectedRole && !(composite.kind === "grid" && node.role === "gridcell")) {
      problems.push(issue("composite-child-role", composite.id, `${node.id}: ${node.role}`));
    }
  }
  const active = visible.filter((node) => node.id === composite.activeId);
  if (composite.activeId !== null && active.length !== 1) {
    problems.push(issue("composite-active-missing", composite.id, composite.activeId));
  }
  if (!composite.multiple && selected.size > 1) problems.push(issue("composite-multiple-selection", composite.id, String(selected.size)));
  for (const id of selected) {
    const child = composite.children.find((node) => node.id === id);
    if (!child || !child.visible || child.disabled) {
      problems.push(issue("composite-selected-unavailable", composite.id, id));
    } else if (child.selected !== "true") {
      problems.push(issue("composite-selected-state", composite.id, id));
    }
  }
  const tabbable = visible.filter((node) => node.tabIndex === 0);
  if (visible.length > 0 && tabbable.length !== 1) {
    problems.push(issue("composite-roving-tabindex", composite.id, `${tabbable.length} tabbable children`));
  }
  if (composite.activeId !== null && composite.kind !== "grid" && visible.length > 0 &&
      tabbable.length === 1 && tabbable[0]?.id !== composite.activeId) {
    problems.push(issue("composite-roving-not-active", composite.id, tabbable[0]?.id ?? "UNKNOWN"));
  }
  return problems;
}

/** Compute intended roving focus without changing the application state. */
export function nextRovingTarget(
  composite: CompositeObservation,
  movement: "first" | "last" | "next" | "previous",
): string | null {
  const visible = composite.children.filter((child) => child.visible && !child.disabled);
  if (visible.length === 0) return null;
  if (movement === "first") return visible[0]?.id ?? null;
  if (movement === "last") return visible[visible.length - 1]?.id ?? null;
  const index = visible.findIndex((child) => child.id === composite.activeId);
  if (index < 0) return visible[0]?.id ?? null;
  const delta = movement === "next" ? 1 : -1;
  const target = index + delta;
  if (target >= 0 && target < visible.length) return visible[target]?.id ?? null;
  if (!composite.wrapNavigation) return visible[index]?.id ?? null;
  return visible[(target + visible.length) % visible.length]?.id ?? null;
}

export function widgetAuditSummary(issues: readonly WidgetIssue[], limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const unique = [...new Set(issues.map((item) => `${item.code} ${item.owner}: ${item.detail}`))];
  const remaining = unique.length - Math.min(limit, unique.length);
  return [...unique.slice(0, limit), ...(remaining > 0 ? [`${remaining} more findings`] : [])].join("\n");
}

export function multiWidgetIssues(widgets: readonly WidgetObservation[]): WidgetIssue[] {
  const issues: WidgetIssue[] = [];
  const counts = new Map<string, number>();
  for (const widget of widgets) {
    counts.set(widget.id, (counts.get(widget.id) ?? 0) + 1);
  }
  for (const widget of widgets) {
    issues.push(...stateIssues(widget));
    if (!widget.id.trim()) issues.push(issue("widget-id-empty", "unknown", widget.role));
    if ((counts.get(widget.id) ?? 0) > 1) issues.push(issue("widget-id-not-unique", widget.id, String(counts.get(widget.id))));
    for (const id of widget.controls) {
      if (!counts.has(id)) issues.push(issue("widget-controls-missing", widget.id, id));
    }
    if (widget.activeDescendant && !counts.has(widget.activeDescendant)) {
      issues.push(issue("widget-active-missing", widget.id, widget.activeDescendant));
    }
  }
  return issues;
}

/** Keyboard event log captured after a composite has rendered. */
export interface KeyboardMove {
  readonly key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";
  readonly beforeId: string | null;
  readonly afterId: string | null;
  readonly defaultPrevented: boolean;
  readonly changedSelection: boolean;
}

/**
 * A keyboard audit checks actual focus motion against the eligible roving
 * children. This does not infer a selection merely because focus moved.
 */
export function keyboardMoveIssues(
  composite: CompositeObservation,
  moves: readonly KeyboardMove[],
  orientation: "horizontal" | "vertical",
): WidgetIssue[] {
  const issues: WidgetIssue[] = [];
  const legalIds = new Set(composite.children.filter((item) => item.visible && !item.disabled).map((item) => item.id));
  for (const [index, move] of moves.entries()) {
    const owner = `${composite.id}#move-${index}`;
    if (move.beforeId !== null && !legalIds.has(move.beforeId)) {
      issues.push(issue("keyboard-before-not-eligible", owner, move.beforeId));
    }
    if (move.afterId === null || !legalIds.has(move.afterId)) {
      issues.push(issue("keyboard-after-not-eligible", owner, move.afterId ?? "UNKNOWN"));
      continue;
    }
    const horizontal = move.key === "ArrowLeft" || move.key === "ArrowRight";
    const vertical = move.key === "ArrowUp" || move.key === "ArrowDown";
    if ((horizontal && orientation !== "horizontal") || (vertical && orientation !== "vertical")) {
      if (move.afterId !== move.beforeId) issues.push(issue("keyboard-cross-axis-moved", owner, move.key));
      continue;
    }
    const movement = move.key === "Home" ? "first" : move.key === "End" ? "last" :
      (move.key === "ArrowRight" || move.key === "ArrowDown") ? "next" : "previous";
    const target = nextRovingTarget({ ...composite, activeId: move.beforeId }, movement);
    if (target !== move.afterId) {
      issues.push(issue("keyboard-roving-order", owner, `${target ?? "UNKNOWN"} expected, got ${move.afterId}`));
    }
    if (!move.defaultPrevented) issues.push(issue("keyboard-default-not-cancelled", owner, move.key));
    if (composite.kind === "tabs" && composite.multiple && move.changedSelection) {
      issues.push(issue("keyboard-selects-on-focus", owner, move.key));
    }
  }
  return issues;
}
