/** Keyboard and switch traversal analysis, with no browser side effects. */
import { finding, plain, sortFindings } from "./contracts.mjs";

export const INPUT_METHODS = Object.freeze(["keyboard", "switch", "pointer"]);
export const NAVIGATION_KEYS = Object.freeze(["Tab", "Shift+Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
export const ACTIVATION_KEYS = Object.freeze(["Enter", "Space"]);
export const COMPOSITES = Object.freeze(["tablist", "listbox", "menu", "menubar", "tree", "radiogroup"]);
export const RESTORE_STATES = Object.freeze(["restored", "lost", "unknown"]);

export function walkEntry(value) {
  if (!plain(value)) return null;
  if (typeof value.id !== "string" || !value.id || value.id.length > 160) return null;
  if (!Number.isInteger(value.step) || value.step < 0) return null;
  if (!["Tab", "Shift+Tab"].includes(value.key)) return null;
  if (typeof value.visible !== "boolean" || typeof value.inside !== "boolean") return null;
  return { id: value.id, step: value.step, key: value.key, visible: value.visible, inside: value.inside };
}

/** Check a sequential focus walk without assuming browser address-bar cycling. */
export function auditForwardWalk(input, options = {}) {
  const issues = [];
  if (!Array.isArray(input)) return [finding("focus.walk-array", "walk")];
  const maximum = options.maximum ?? 250;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 500) throw new TypeError("Invalid maximum");
  if (input.length > maximum) issues.push(finding("focus.walk-overflow", "walk"));
  if (input.length === 0) issues.push(finding("focus.walk-empty", "walk"));
  const seen = new Set();
  let lastStep = -1;
  for (const [index, raw] of input.entries()) {
    const path = `walk[${index}]`;
    const entry = walkEntry(raw);
    if (!entry) {
      issues.push(finding("focus.walk-entry", path));
      continue;
    }
    if (entry.step <= lastStep) issues.push(finding("focus.step-order", `${path}.step`));
    lastStep = entry.step;
    if (entry.key !== "Tab") issues.push(finding("focus.forward-key", `${path}.key`));
    if (!entry.visible) issues.push(finding("focus.hidden-target", `${path}.visible`));
    if (!entry.inside) issues.push(finding("focus.outside-scope", `${path}.inside`));
    if (seen.has(entry.id)) issues.push(finding("focus.repeated-target", `${path}.id`));
    seen.add(entry.id);
  }
  return sortFindings(issues);
}

/** Reverse traversal should mirror the forward sequence until its boundary. */
export function auditReverseWalk(forward, reverse) {
  const issues = [];
  if (!Array.isArray(forward) || !Array.isArray(reverse)) return [finding("focus.reverse-input", "reverse")];
  const expected = forward.map((entry) => entry?.id).filter(Boolean).slice(0, -1).reverse();
  const observed = reverse.map((entry) => entry?.id);
  if (observed.length !== expected.length) issues.push(finding("focus.reverse-length", "reverse.length"));
  for (let index = 0; index < Math.max(expected.length, observed.length); index += 1) {
    if (expected[index] !== observed[index]) issues.push(finding("focus.reverse-order", `reverse[${index}]`));
    if (reverse[index]?.key !== "Shift+Tab") issues.push(finding("focus.reverse-key", `reverse[${index}].key`));
  }
  return sortFindings(issues);
}

export function auditFocusGeometry(entries) {
  if (!Array.isArray(entries)) return [finding("geometry.array", "geometry")];
  const issues = [];
  for (const [index, entry] of entries.entries()) {
    const at = `geometry[${index}]`;
    if (!plain(entry)) {
      issues.push(finding("geometry.object", at));
      continue;
    }
    if (!Number.isFinite(entry.width) || !Number.isFinite(entry.height)) {
      issues.push(finding("geometry.dimensions", at));
      continue;
    }
    if (entry.width <= 0 || entry.height <= 0) issues.push(finding("geometry.empty-target", at));
    if (entry.occluded) issues.push(finding("geometry.occluded", at));
    if (entry.clipped) issues.push(finding("geometry.clipped", at));
    if (!entry.focusIndicator) issues.push(finding("geometry.no-indicator", at));
    if (entry.width < 24 && entry.height < 24 && !entry.inlineException) issues.push(finding("geometry.small-target", at));
    if (entry.viewportWidth > 0 && entry.right > entry.viewportWidth) issues.push(finding("geometry.horizontal-overflow", at));
    if (entry.left < 0 || entry.top < 0) issues.push(finding("geometry.negative-location", at, "review"));
  }
  return sortFindings(issues);
}

export function auditSwitchPath(input) {
  const issues = [];
  if (!plain(input)) return [finding("switch.object", "switch")];
  if (!Array.isArray(input.stops)) return [finding("switch.stops", "switch.stops")];
  if (input.stops.length === 0) issues.push(finding("switch.empty", "switch.stops"));
  if (input.stops.length > 200) issues.push(finding("switch.too-many-stops", "switch.stops"));
  const seen = new Set();
  let actionCount = 0;
  for (const [index, stop] of input.stops.entries()) {
    const at = `switch.stops[${index}]`;
    if (!plain(stop) || typeof stop.id !== "string" || !stop.id) {
      issues.push(finding("switch.invalid-stop", at));
      continue;
    }
    if (seen.has(stop.id)) issues.push(finding("switch.duplicate-stop", `${at}.id`));
    seen.add(stop.id);
    if (stop.disabled) issues.push(finding("switch.disabled-stop", at));
    if (stop.hidden) issues.push(finding("switch.hidden-stop", at));
    if (stop.requiresDrag && !stop.alternative) issues.push(finding("switch.no-drag-alternative", at));
    if (stop.requiresMotion && !stop.alternative) issues.push(finding("switch.no-motion-alternative", at));
    if (stop.requiresMultiPointer && !stop.alternative) issues.push(finding("switch.no-single-pointer", at));
    if (stop.action === "activate") actionCount += 1;
    if (stop.action === "none" && stop.interactive) issues.push(finding("switch.unusable-control", at));
    if (stop.timeoutOnly) issues.push(finding("switch.time-limited", at, "review"));
    if (stop.label === "" || stop.label === undefined) issues.push(finding("switch.unnamed-stop", at));
  }
  if (actionCount === 0) issues.push(finding("switch.no-activation", "switch.stops"));
  return sortFindings(issues);
}

/** A composite state snapshot captures authored keyboard intent, not a voice claim. */
export function auditComposite(input) {
  if (!plain(input)) return [finding("composite.object", "composite")];
  const issues = [];
  if (!COMPOSITES.includes(input.role)) issues.push(finding("composite.role", "composite.role"));
  if (!Array.isArray(input.items)) return sortFindings([...issues, finding("composite.items", "composite.items")]);
  if (input.items.length === 0) issues.push(finding("composite.empty", "composite.items"));
  const ids = new Set();
  let tabStops = 0;
  let selected = 0;
  for (const [index, item] of input.items.entries()) {
    const at = `composite.items[${index}]`;
    if (!plain(item)) {
      issues.push(finding("composite.item-object", at));
      continue;
    }
    if (typeof item.id !== "string" || !item.id) issues.push(finding("composite.item-id", at));
    else if (ids.has(item.id)) issues.push(finding("composite.duplicate-id", `${at}.id`));
    else ids.add(item.id);
    if (!item.label || typeof item.label !== "string") issues.push(finding("composite.unnamed-item", at));
    if (![-1, 0].includes(item.tabindex)) issues.push(finding("composite.invalid-tabindex", at));
    if (item.tabindex === 0) tabStops += 1;
    if (item.selected === true) selected += 1;
    if (item.disabled && item.tabindex === 0) issues.push(finding("composite.disabled-tabstop", at));
    if (item.hidden && item.tabindex === 0) issues.push(finding("composite.hidden-tabstop", at));
    if (item.level !== undefined && (!Number.isInteger(item.level) || item.level < 1)) {
      issues.push(finding("composite.tree-level", at));
    }
    if (item.posinset !== undefined && (!Number.isInteger(item.posinset) || item.posinset < 1)) {
      issues.push(finding("composite.position", at));
    }
  }
  if (input.model === "roving") {
    if (tabStops !== 1) issues.push(finding("composite.roving-count", "composite.items"));
  } else if (input.model === "active-descendant") {
    if (!input.ownerFocusable) issues.push(finding("composite.owner-unfocusable", "composite.ownerFocusable"));
    if (!ids.has(input.activeId)) issues.push(finding("composite.active-id", "composite.activeId"));
    if (tabStops > 0) issues.push(finding("composite.descendant-tabstop", "composite.items"));
  } else issues.push(finding("composite.model", "composite.model"));
  if (["tablist", "radiogroup"].includes(input.role) && selected !== 1) {
    issues.push(finding("composite.selection-count", "composite.items"));
  }
  if (input.orientation && !["horizontal", "vertical"].includes(input.orientation)) {
    issues.push(finding("composite.orientation", "composite.orientation"));
  }
  return sortFindings(issues);
}

/** Arrow-key transitions are checked against an explicitly declared model. */
export function expectedCompositeTarget(state, key) {
  if (!plain(state) || !Array.isArray(state.items)) return null;
  const items = state.items.filter((item) => plain(item) && !item.disabled && !item.hidden);
  if (items.length === 0) return null;
  const current = items.findIndex((item) => item.id === state.activeId);
  const index = current < 0 ? 0 : current;
  if (key === "Home") return items[0].id;
  if (key === "End") return items[items.length - 1].id;
  if (["ArrowDown", "ArrowRight"].includes(key)) return items[(index + 1) % items.length].id;
  if (["ArrowUp", "ArrowLeft"].includes(key)) return items[(index - 1 + items.length) % items.length].id;
  return null;
}

export function auditCompositeTransitions(transitions, initial) {
  if (!Array.isArray(transitions) || !plain(initial)) return [finding("composite.transitions", "transitions")];
  const issues = [];
  let state = { ...initial };
  for (const [index, event] of transitions.entries()) {
    const at = `transitions[${index}]`;
    if (!plain(event) || typeof event.key !== "string") {
      issues.push(finding("composite.invalid-event", at));
      continue;
    }
    const expected = expectedCompositeTarget(state, event.key);
    if (expected === null) {
      issues.push(finding("composite.unsupported-key", at));
      continue;
    }
    if (event.to !== expected) issues.push(finding("composite.wrong-target", at));
    if (!state.items.some((item) => item.id === event.to)) issues.push(finding("composite.target-absent", at));
    state = { ...state, activeId: event.to };
  }
  return sortFindings(issues);
}

export function auditDialogLifecycle(input) {
  if (!plain(input)) return [finding("dialog.object", "dialog")];
  const issues = [];
  if (!input.declared) issues.push(finding("dialog.undeclared-opener", "dialog.declared"));
  if (!input.opened) issues.push(finding("dialog.not-opened", "dialog.opened"));
  if (input.opened && !input.named) issues.push(finding("dialog.unnamed", "dialog.named"));
  if (input.opened && !input.focusInside) issues.push(finding("dialog.focus-outside", "dialog.focusInside"));
  if (input.opened && !input.tabContained) issues.push(finding("dialog.tab-escaped", "dialog.tabContained"));
  if (input.opened && !input.escapeClosed) issues.push(finding("dialog.escape-failed", "dialog.escapeClosed"));
  if (input.escapeClosed && !input.focusReturned) issues.push(finding("dialog.focus-not-restored", "dialog.focusReturned"));
  if (input.opened && input.interactiveCount === 0) issues.push(finding("dialog.no-controls", "dialog.interactiveCount"));
  if (input.modal && input.backgroundReachable) issues.push(finding("dialog.background-reachable", "dialog.backgroundReachable"));
  if (input.nestedModalCount > 1) issues.push(finding("dialog.multiple-modal", "dialog.nestedModalCount"));
  return sortFindings(issues);
}

export function auditKeyboardCommands(input) {
  if (!Array.isArray(input)) return [finding("command.array", "commands")];
  const issues = [];
  for (const [index, command] of input.entries()) {
    const at = `commands[${index}]`;
    if (!plain(command) || !ACTIVATION_KEYS.includes(command.key)) {
      issues.push(finding("command.invalid", at));
      continue;
    }
    if (!command.targetId) issues.push(finding("command.target", at));
    if (!command.focusedBefore) issues.push(finding("command.not-focused", at));
    if (!command.activated) issues.push(finding("command.did-not-activate", at));
    if (command.destructive && !command.confirmed) issues.push(finding("command.unsafe-activation", at));
    if (command.navigation && !command.localTarget) issues.push(finding("command.unexpected-navigation", at));
  }
  return sortFindings(issues);
}

export function summarizeFocusFindings(issues) {
  const summary = { error: 0, review: 0 };
  const codes = new Map();
  for (const entry of issues) {
    if (entry.severity === "review") summary.review += 1;
    else summary.error += 1;
    codes.set(entry.code, (codes.get(entry.code) ?? 0) + 1);
  }
  return { ...summary, codes: [...codes].sort(([a], [b]) => a.localeCompare(b, "en")) };
}
