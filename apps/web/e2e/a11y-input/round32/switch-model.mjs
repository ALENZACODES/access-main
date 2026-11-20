/**
 * Deterministic, event-driven switch access model. No timers or background
 * scanning: the caller must supply every advance, select, and cancel event.
 * State is immutable and the implementation does not activate DOM controls.
 */
export const SWITCH_ACTIONS = Object.freeze(["ADVANCE", "SELECT", "BACK", "CANCEL", "RESET"]);
export const SWITCH_STATES = Object.freeze(["IDLE", "SCANNING", "SELECTED", "UNKNOWN"]);
export const SWITCH_MODES = Object.freeze(["linear", "grouped", "row-column"]);
export const SWITCH_KEYS = Object.freeze(["Enter", "Space", "ArrowRight", "ArrowLeft", "Escape"]);
const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_ITEMS = 512;
const MAX_EVENTS = 4096;

/** @param {unknown} value */
export function objectRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @param {unknown} value */
export function safeIdentifier(value) {
  return typeof value === "string" && value.length <= 96 && IDENTIFIER.test(value);
}

/** @param {unknown} value */
export function hasControlCode(value) {
  if (typeof value !== "string") return true;
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit <= 31 || unit === 127 || (unit >= 128 && unit <= 159)) return true;
  }
  return false;
}

/** @param {unknown} value @param {number} [limit] */
export function safeCopy(value, limit = 240) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit && !hasControlCode(value);
}

/** @param {unknown} value */
export function normalizeControl(value) {
  if (!objectRecord(value)) return null;
  if (!safeIdentifier(value.id)) return null;
  if (!safeIdentifier(value.group)) return null;
  if (!safeCopy(value.label?.en) || !safeCopy(value.label?.fr)) return null;
  if (typeof value.disabled !== "boolean") return null;
  if (typeof value.hidden !== "boolean") return null;
  if (typeof value.inert !== "boolean") return null;
  if (typeof value.tabIndex !== "number" || !Number.isInteger(value.tabIndex)) return null;
  if (value.role !== "button" && value.role !== "link" && value.role !== "switch" && value.role !== "checkbox") return null;
  return Object.freeze({
    id: value.id,
    group: value.group,
    label: Object.freeze({ en: value.label.en, fr: value.label.fr }),
    disabled: value.disabled,
    hidden: value.hidden,
    inert: value.inert,
    tabIndex: value.tabIndex,
    role: value.role,
  });
}

/** @param {unknown} input */
export function auditControls(input) {
  const findings = [];
  if (!Array.isArray(input)) return [{ code: "controls.array", path: "controls" }];
  if (input.length > MAX_ITEMS) findings.push({ code: "controls.limit", path: "controls" });
  const seen = new Set();
  input.forEach((item, index) => {
    const path = `controls[${index}]`;
    if (!objectRecord(item)) {
      findings.push({ code: "control.object", path });
      return;
    }
    if (!safeIdentifier(item.id)) findings.push({ code: "control.id", path: `${path}.id` });
    else if (seen.has(item.id)) findings.push({ code: "control.duplicate", path: `${path}.id` });
    else seen.add(item.id);
    if (!safeIdentifier(item.group)) findings.push({ code: "control.group", path: `${path}.group` });
    if (!safeCopy(item.label?.en)) findings.push({ code: "control.label-en", path: `${path}.label.en` });
    if (!safeCopy(item.label?.fr)) findings.push({ code: "control.label-fr", path: `${path}.label.fr` });
    for (const flag of ["disabled", "hidden", "inert"]) {
      if (typeof item[flag] !== "boolean") findings.push({ code: "control.flag", path: `${path}.${flag}` });
    }
    if (!Number.isInteger(item.tabIndex) || item.tabIndex < -1 || item.tabIndex > 0) {
      findings.push({ code: "control.tab-index", path: `${path}.tabIndex` });
    }
    if (!["button", "link", "switch", "checkbox"].includes(item.role)) {
      findings.push({ code: "control.role", path: `${path}.role` });
    }
    if ((item.hidden || item.inert) && item.tabIndex === 0) {
      findings.push({ code: "control.inactive-focus", path: `${path}.tabIndex` });
    }
    if (item.disabled && item.tabIndex === 0) {
      findings.push({ code: "control.disabled-focus", path: `${path}.tabIndex` });
    }
  });
  return findings;
}

/** @param {unknown} input */
export function eligibleControls(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeControl).filter((item) =>
    item !== null && !item.disabled && !item.hidden && !item.inert,
  );
}

/** @param {unknown} input */
export function groupControls(input) {
  const groups = new Map();
  for (const control of eligibleControls(input)) {
    const existing = groups.get(control.group) ?? [];
    existing.push(control);
    groups.set(control.group, existing);
  }
  return [...groups].map(([id, controls]) => Object.freeze({ id, controls: Object.freeze(controls) }));
}

/** @param {unknown} config */
export function validateConfig(config) {
  const findings = [];
  if (!objectRecord(config)) return [{ code: "config.object", path: "config" }];
  if (!SWITCH_MODES.includes(config.mode)) findings.push({ code: "config.mode", path: "config.mode" });
  if (config.wrap !== true && config.wrap !== false) findings.push({ code: "config.wrap", path: "config.wrap" });
  if (!Number.isSafeInteger(config.maxActions) || config.maxActions < 1 || config.maxActions > MAX_EVENTS) {
    findings.push({ code: "config.max-actions", path: "config.maxActions" });
  }
  if (config.announce !== true && config.announce !== false) findings.push({ code: "config.announce", path: "config.announce" });
  return findings;
}

/** @param {unknown} config */
export function normalizeConfig(config) {
  const input = config ?? {};
  const result = {
    mode: input.mode ?? "linear",
    wrap: input.wrap ?? true,
    maxActions: input.maxActions ?? 512,
    announce: input.announce ?? true,
  };
  if (validateConfig(result).length) throw new TypeError("Invalid switch configuration");
  return Object.freeze(result);
}

/** @param {unknown} controls @param {unknown} [options] */
export function createScan(controls, options = {}) {
  const config = normalizeConfig(options);
  const issues = auditControls(controls);
  if (issues.length) return Object.freeze({ status: "UNKNOWN", cursor: -1, groupCursor: -1, actions: 0, selected: null, history: [], issues, config, controls: [], groups: [] });
  const candidates = eligibleControls(controls);
  const groups = groupControls(controls);
  const status = candidates.length ? "IDLE" : "UNKNOWN";
  return Object.freeze({ status, cursor: -1, groupCursor: -1, actions: 0, selected: null, history: [], issues: [], config, controls: candidates, groups });
}

/** @param {unknown} state */
export function currentControl(state) {
  if (!objectRecord(state) || !Array.isArray(state.controls)) return null;
  return state.cursor >= 0 && state.cursor < state.controls.length ? state.controls[state.cursor] : null;
}

/** @param {unknown} state */
export function currentGroup(state) {
  if (!objectRecord(state) || !Array.isArray(state.groups)) return null;
  return state.groupCursor >= 0 && state.groupCursor < state.groups.length ? state.groups[state.groupCursor] : null;
}

/** @param {unknown} state @param {unknown} action */
export function applySwitch(state, action) {
  if (!objectRecord(state) || !Array.isArray(state.controls)) throw new TypeError("Invalid scan state");
  if (!SWITCH_ACTIONS.includes(action)) return state;
  if (state.status === "UNKNOWN") return state;
  if (state.actions >= state.config.maxActions && action !== "RESET") {
    return Object.freeze({ ...state, status: "UNKNOWN", issues: [...state.issues, { code: "scan.action-limit", path: "actions" }] });
  }
  if (action === "RESET") return createScan(state.controls, state.config);
  const next = { ...state, actions: state.actions + 1, selected: null };
  if (action === "CANCEL") {
    next.status = "IDLE";
    next.cursor = -1;
    next.groupCursor = -1;
  } else if (action === "BACK") {
    next.status = "SCANNING";
    next.cursor = state.cursor > 0 ? state.cursor - 1 : state.config.wrap ? state.controls.length - 1 : 0;
  } else if (action === "ADVANCE") {
    next.status = "SCANNING";
    next.cursor = state.cursor + 1 < state.controls.length ? state.cursor + 1 : state.config.wrap ? 0 : state.controls.length - 1;
  } else if (action === "SELECT") {
    if (state.cursor < 0) return state;
    next.status = "SELECTED";
    next.selected = state.controls[state.cursor]?.id ?? null;
  }
  const focused = next.controls[next.cursor] ?? null;
  next.groupCursor = focused ? next.groups.findIndex((group) => group.id === focused.group) : -1;
  next.history = [...state.history, Object.freeze({ action, status: next.status, target: focused?.id ?? null })];
  return Object.freeze(next);
}

/** @param {unknown} controls @param {unknown} actions @param {unknown} [options] */
export function replaySwitch(controls, actions, options = {}) {
  if (!Array.isArray(actions) || actions.length > MAX_EVENTS) throw new TypeError("Invalid event history");
  let state = createScan(controls, options);
  for (const action of actions) state = applySwitch(state, action);
  return state;
}

/** @param {unknown} state */
export function scanSummary(state) {
  if (!objectRecord(state)) return { status: "UNKNOWN", items: 0, groups: 0, actions: 0, selected: null };
  return {
    status: SWITCH_STATES.includes(state.status) ? state.status : "UNKNOWN",
    items: Array.isArray(state.controls) ? state.controls.length : 0,
    groups: Array.isArray(state.groups) ? state.groups.length : 0,
    actions: Number.isSafeInteger(state.actions) ? state.actions : 0,
    selected: safeIdentifier(state.selected) ? state.selected : null,
  };
}

/** @param {unknown} state @param {unknown} language */
export function scanAnnouncement(state, language) {
  if (language !== "en" && language !== "fr") return "UNKNOWN";
  if (!objectRecord(state) || state.status === "UNKNOWN") return "UNKNOWN";
  const current = currentControl(state);
  if (!current) return language === "en" ? "No selected control" : "Aucun contrôle sélectionné";
  return current.label[language];
}

/** @param {unknown} state */
export function auditScanState(state) {
  const issues = [];
  if (!objectRecord(state)) return [{ code: "state.object", path: "state" }];
  if (!SWITCH_STATES.includes(state.status)) issues.push({ code: "state.status", path: "status" });
  if (!Array.isArray(state.controls)) issues.push({ code: "state.controls", path: "controls" });
  if (!Array.isArray(state.groups)) issues.push({ code: "state.groups", path: "groups" });
  if (!Number.isSafeInteger(state.cursor) || state.cursor < -1 || state.cursor >= state.controls?.length) {
    issues.push({ code: "state.cursor", path: "cursor" });
  }
  if (!Number.isSafeInteger(state.actions) || state.actions < 0) issues.push({ code: "state.actions", path: "actions" });
  if (state.status === "SELECTED" && !safeIdentifier(state.selected)) issues.push({ code: "state.selection", path: "selected" });
  if (state.status === "UNKNOWN" && state.selected !== null) issues.push({ code: "state.unknown-selection", path: "selected" });
  return issues;
}

/** @param {unknown} state */
export function explicitDecision(state) {
  const result = auditScanState(state);
  if (result.length > 0) return { decision: "HOLD", reasons: result.map((entry) => entry.code) };
  if (state.status === "UNKNOWN") return { decision: "UNKNOWN", reasons: ["scan.unknown"] };
  if (state.status !== "SELECTED") return { decision: "HOLD", reasons: ["scan.not-selected"] };
  return { decision: "READY", reasons: [] };
}
