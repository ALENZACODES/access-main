/** Pure, bounded alternative-input journey replay; no DOM or external effects. */
import { ACTIONS, MAX_STEPS, eligibleControls, identifier, journeyIssues, object, finding, sorted } from './contracts.mjs';
export const MODES = Object.freeze(['LINEAR', 'GROUP', 'DIRECT']);
export const PHASES = Object.freeze(['IDLE', 'SCANNING', 'SELECTED', 'CANCELLED', 'COMPLETE', 'UNKNOWN']);
export function scanOptions(input = {}) {
  if (!object(input)) throw new TypeError('options must be object');
  const mode = input.mode === undefined ? 'LINEAR' : input.mode;
  const wrap = input.wrap ?? true;
  const maximumSteps = input.maximumSteps ?? MAX_STEPS;
  const dwellSteps = input.dwellSteps ?? 1;
  if (!MODES.includes(mode)) throw new TypeError('invalid mode');
  if (typeof wrap !== 'boolean') throw new TypeError('invalid wrap');
  if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1 || maximumSteps > MAX_STEPS) throw new TypeError('invalid maximumSteps');
  if (!Number.isSafeInteger(dwellSteps) || dwellSteps < 1 || dwellSteps > 100) throw new TypeError('invalid dwellSteps');
  return Object.freeze({ mode, wrap, maximumSteps, dwellSteps });
}
export function scanTargets(journey, options = {}) {
  const policy = scanOptions(options);
  const controls = eligibleControls(journey?.controls);
  if (policy.mode === 'LINEAR') return controls.map((c) => ({ id: c.id, group: c.group ?? null, type: 'control' }));
  if (policy.mode === 'GROUP') {
    const output = [];
    const seen = new Set();
    for (const control of controls) {
      const group = control.group ?? control.id;
      if (seen.has(group)) continue;
      seen.add(group);
      output.push({ id: group, group, type: 'group' });
    }
    return output;
  }
  return controls.map((c) => ({ id: c.id, group: c.group ?? null, type: 'control' }));
}
export function initialScan(journey, options = {}) {
  const policy = scanOptions(options);
  const targets = scanTargets(journey, policy);
  const issues = journeyIssues(journey);
  const hard = issues.some((issue) => issue.severity === 'error');
  return {
    phase: hard ? 'UNKNOWN' : targets.length ? 'SCANNING' : 'IDLE',
    index: targets.length ? 0 : -1,
    selected: null,
    group: null,
    visits: 0,
    actions: 0,
    dwells: 0,
    history: [],
    targets,
    options: policy,
    issues,
  };
}
function appendHistory(state, action, next) {
  return [...state.history, { sequence: state.actions + 1, action, from: state.index, to: next.index, phase: next.phase, selection: next.selected }];
}
function movement(index, distance, size, wrap) {
  if (size === 0) return -1;
  const next = index + distance;
  if (wrap) return ((next % size) + size) % size;
  return Math.max(0, Math.min(size - 1, next));
}
export function stepScan(state, action, detail = {}) {
  if (!object(state) || !object(detail)) throw new TypeError('invalid scan state');
  if (!ACTIONS.includes(action)) throw new TypeError('unsupported action');
  if (state.actions >= state.options.maximumSteps) {
    return { ...state, phase: 'UNKNOWN', issues: [...state.issues, finding('scan.limit', 'scan.actions')] };
  }
  const count = state.targets.length;
  let next = { ...state, actions: state.actions + 1, visits: state.visits, selected: state.selected, history: state.history };
  if (action === 'NEXT' || action === 'PREVIOUS') {
    if (state.phase === 'CANCELLED' || state.phase === 'COMPLETE') {
      next.phase = 'IDLE'; next.selected = null;
    } else if (count) {
      next.phase = 'SCANNING'; next.index = movement(state.index, action === 'NEXT' ? 1 : -1, count, state.options.wrap);
      next.visits += 1;
    }
  } else if (action === 'SELECT') {
    const target = state.targets[state.index];
    if (state.phase === 'SCANNING' && target) {
      if (state.options.mode === 'GROUP' && target.type === 'group') {
        next.group = target.id;
        next.phase = 'SELECTED';
        next.selected = target.id;
      } else {
        next.selected = target.id;
        next.phase = 'COMPLETE';
      }
    } else next.phase = 'UNKNOWN';
  } else if (action === 'BACK') {
    if (state.phase === 'SELECTED') { next.phase = 'SCANNING'; next.group = null; next.selected = null; }
    else if (state.phase === 'COMPLETE') { next.phase = 'SCANNING'; next.selected = null; }
    else next.index = movement(state.index, -1, count, state.options.wrap);
  } else if (action === 'CANCEL') {
    next.phase = 'CANCELLED'; next.selected = null;
  } else if (action === 'RESTART') {
    next = { ...next, phase: count ? 'SCANNING' : 'IDLE', index: count ? 0 : -1, selected: null, group: null, dwells: 0 };
  }
  next.history = appendHistory(state, action, next);
  return next;
}
export function dwellScan(state) {
  if (!object(state)) throw new TypeError('invalid state');
  if (state.phase !== 'SCANNING') return state;
  if (state.dwells + 1 < state.options.dwellSteps) return { ...state, dwells: state.dwells + 1 };
  const next = stepScan(state, 'NEXT');
  return { ...next, dwells: 0 };
}
export function replayScan(journey, actions, options = {}) {
  if (!Array.isArray(actions) || actions.length > MAX_STEPS) throw new TypeError('invalid actions');
  let state = initialScan(journey, options);
  for (const action of actions) {
    if (typeof action === 'string') state = stepScan(state, action);
    else if (object(action) && typeof action.action === 'string') state = stepScan(state, action.action, action.detail ?? {});
    else throw new TypeError('malformed action');
  }
  return state;
}
export function expectedFocusTargets(journey) {
  return eligibleControls(journey?.controls).map((c) => c.id);
}
export function auditFocusWalk(journey, observations) {
  const expected = expectedFocusTargets(journey);
  if (!Array.isArray(observations)) return [finding('walk.array', 'walk')];
  const issues = [];
  const seen = new Set();
  for (let i = 0; i < observations.length; i += 1) {
    const item = observations[i]; const at = `walk[${i}]`;
    if (!object(item) || !identifier(item.id)) { issues.push(finding('walk.item', at)); continue; }
    if (!expected.includes(item.id)) issues.push(finding('walk.unexpected', `${at}.id`));
    if (seen.has(item.id)) issues.push(finding('walk.duplicate', `${at}.id`));
    seen.add(item.id);
    if (item.occluded === true) issues.push(finding('walk.occluded', at));
    if (item.visible !== true) issues.push(finding('walk.hidden', at));
    if (item.indicator !== true) issues.push(finding('walk.no-indicator', at));
    if (item.targetWidth !== undefined && item.targetHeight !== undefined && item.targetWidth < 24 && item.targetHeight < 24) issues.push(finding('walk.small-target', at, 'review'));
  }
  for (const id of expected) if (!seen.has(id)) issues.push(finding('walk.missing', `controls.${id}`));
  const actualOrder = observations.filter((c) => object(c) && identifier(c.id)).map((c) => c.id);
  if (actualOrder.length === expected.length && actualOrder.some((id, index) => id !== expected[index])) issues.push(finding('walk.order', 'walk'));
  return sorted(issues);
}
export function auditReverseWalk(forward, reverse) {
  if (!Array.isArray(forward) || !Array.isArray(reverse)) return [finding('reverse.array', 'reverse')];
  const out = [];
  const expected = forward.slice(0, -1).reverse().map((item) => item.id);
  const received = reverse.map((item) => item?.id);
  if (expected.length !== received.length) out.push(finding('reverse.length', 'reverse'));
  for (let i = 0; i < Math.min(expected.length, received.length); i += 1) {
    if (expected[i] !== received[i]) out.push(finding('reverse.order', `reverse[${i}]`));
  }
  return sorted(out);
}
export function auditSwitchSelection(journey, state) {
  const out = [];
  if (!object(state)) return [finding('selection.state', 'selection')];
  if (state.selected !== null && state.selected !== undefined) {
    const ids = new Set(eligibleControls(journey?.controls).map((c) => c.id));
    const groups = new Set(eligibleControls(journey?.controls).map((c) => c.group).filter(Boolean));
    if (!ids.has(state.selected) && !groups.has(state.selected)) out.push(finding('selection.missing', 'selection.selected'));
  }
  if (state.phase === 'COMPLETE' && !state.selected) out.push(finding('selection.unconfirmed', 'selection.phase'));
  if (state.phase === 'UNKNOWN') out.push(finding('selection.unknown', 'selection.phase', 'review'));
  if (Array.isArray(state.history)) {
    for (let i = 0; i < state.history.length; i += 1) {
      const row = state.history[i];
      if (row.sequence !== i + 1) out.push(finding('selection.history-order', `selection.history[${i}]`));
    }
  }
  return sorted(out);
}
export function switchReport(state) {
  if (!object(state)) return { phase: 'UNKNOWN', actions: 0, selected: null, visits: 0, issues: ['selection.state'] };
  return { phase: state.phase, actions: state.actions, selected: state.selected, visits: state.visits, issues: [...new Set((state.issues ?? []).map((i) => i.code))].sort() };
}
export function actionAudit(actions) {
  if (!Array.isArray(actions)) return [finding('actions.array', 'actions')];
  const out = [];
  if (actions.length > MAX_STEPS) out.push(finding('actions.limit', 'actions'));
  for (let i = 0; i < actions.length; i += 1) {
    const action = typeof actions[i] === 'string' ? actions[i] : actions[i]?.action;
    if (!ACTIONS.includes(action)) out.push(finding('actions.unknown', `actions[${i}]`));
  }
  return sorted(out);
}
