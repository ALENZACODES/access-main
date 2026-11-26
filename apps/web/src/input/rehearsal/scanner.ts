import { type ControlAction, type Controls, type Finding, type Journey, type Locale, type Step, issue, validId, validText } from './model.ts';

/** The scanner never schedules an action. Explicit user keys cause all transitions. */
export type ScanMode = 'linear' | 'grouped' | 'direct';
export interface ScanPolicy { readonly mode: ScanMode; readonly wrap: boolean; readonly maxActions: number }
export interface ScanTarget { readonly id: string; readonly group: string; readonly name: string; readonly disabled: boolean; readonly hidden: boolean; readonly kind: string }
export interface ScanSnapshot { readonly controls: Controls; readonly selected: string | null; readonly issues: readonly Finding[] }
export interface KeyboardObservation {
  readonly target: string;
  readonly key: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly activated: boolean;
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
  readonly contained: boolean;
}
export interface Announcement { readonly id: string; readonly locale: Locale; readonly text: string; readonly status: 'READY' | 'HOLD' | 'UNKNOWN'; readonly politeness: 'polite' | 'assertive'; readonly sequence: number }
export const DEFAULT_SCAN: ScanPolicy = Object.freeze({ mode: 'linear', wrap: true, maxActions: 100 });
export const NEXT: readonly ControlAction[] = Object.freeze(['NEXT','PREVIOUS','SELECT','BACK','CANCEL','RESET']);
export function scanPolicy(input: Partial<ScanPolicy> = {}): ScanPolicy {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid scan policy');
  const mode = input.mode ?? 'linear';
  const wrap = input.wrap ?? true;
  const maxActions = input.maxActions ?? 100;
  if (!['linear','grouped','direct'].includes(mode) || typeof wrap !== 'boolean' || !Number.isSafeInteger(maxActions) || maxActions < 1 || maxActions > 1000) {
    throw new TypeError('Invalid scan policy');
  }
  return Object.freeze({ mode, wrap, maxActions });
}
export function targetsForJourney(journey: Journey, locale: Locale): ScanTarget[] {
  return targetsForSteps(journey.steps, locale);
}
export function targetsForSteps(steps: readonly Step[], locale: Locale): ScanTarget[] {
  if (!Array.isArray(steps)) return [];
  return [...steps]
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id, 'en'))
    .map((step) => ({
      id: step.id,
      group: step.kind,
      name: step.label[locale],
      disabled: step.access === 'unsupported',
      hidden: false,
      kind: step.kind,
    }));
}
export function availableTargets(targets: readonly ScanTarget[]): ScanTarget[] {
  return targets.filter(t => !t.disabled && !t.hidden && validId(t.id) && validText(t.name));
}
export function initialScan(): Controls {
  return { focus: null, scanning: false, index: -1, history: [] };
}
export function moveIndex(index: number, length: number, offset: number, wrap: boolean): number {
  if (length < 1) return -1;
  if (index < 0) return offset < 0 ? length - 1 : 0;
  const next = index + offset;
  if (wrap) return (next % length + length) % length;
  return Math.max(0, Math.min(length - 1, next));
}
export function stepScan(state: Controls, action: ControlAction, targets: readonly ScanTarget[], policy: ScanPolicy = DEFAULT_SCAN): ScanSnapshot {
  if (!NEXT.includes(action)) throw new TypeError('Unsupported scan action');
  if (state.history.length >= policy.maxActions && action !== 'RESET') {
    return { controls: state, selected: null, issues: [issue('scan.limit', 'history', 'review')] };
  }
  const available = availableTargets(targets);
  if (action === 'RESET') return { controls: initialScan(), selected: null, issues: [] };
  const history = [...state.history, action];
  if (action === 'CANCEL') return { controls: { focus: null, scanning: false, index: -1, history }, selected: null, issues: [] };
  if (available.length === 0) return { controls: { ...state, history }, selected: null, issues: [issue('scan.empty', 'targets', 'review')] };
  const index = available.findIndex(t => t.id === state.focus);
  if (action === 'SELECT') {
    const target = available[index];
    if (!target) return { controls: { ...state, history }, selected: null, issues: [issue('scan.no-selection', 'focus', 'review')] };
    return { controls: { ...state, history }, selected: target.id, issues: [] };
  }
  if (action === 'BACK') {
    const previous = available[moveIndex(index, available.length, -1, policy.wrap)];
    return { controls: { focus: previous?.id ?? null, scanning: true, index: available.indexOf(previous!), history }, selected: null, issues: [] };
  }
  if (action === 'NEXT' || action === 'PREVIOUS') {
    const position = moveIndex(index, available.length, action === 'NEXT' ? 1 : -1, policy.wrap);
    return { controls: { focus: available[position]?.id ?? null, scanning: true, index: position, history }, selected: null, issues: [] };
  }
  return { controls: { ...state, history }, selected: null, issues: [] };
}
export function replayScan(actions: readonly ControlAction[], targets: readonly ScanTarget[], policy: ScanPolicy = DEFAULT_SCAN): ScanSnapshot {
  if (!Array.isArray(actions) || actions.length > policy.maxActions + 1) throw new TypeError('Invalid action sequence');
  let result: ScanSnapshot = { controls: initialScan(), selected: null, issues: [] };
  const issues: Finding[] = [];
  for (const action of actions) {
    result = stepScan(result.controls, action, targets, policy);
    issues.push(...result.issues);
  }
  return { ...result, issues };
}
export function groupsOf(targets: readonly ScanTarget[]): Map<string, ScanTarget[]> {
  const groups = new Map<string, ScanTarget[]>();
  for (const target of availableTargets(targets)) {
    const group = groups.get(target.group) ?? [];
    group.push(target);
    groups.set(target.group, group);
  }
  return groups;
}
export function groupAdvance(current: string | null, targets: readonly ScanTarget[], direction: 1 | -1, wrap = true): string | null {
  const groups = [...groupsOf(targets).keys()];
  if (!groups.length) return null;
  const index = groups.indexOf(current ?? '');
  return groups[moveIndex(index, groups.length, direction, wrap)] ?? null;
}
export function inspectTargets(targets: readonly ScanTarget[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  targets.forEach((target, index) => {
    const path = `targets[${index}]`;
    if (!validId(target.id)) findings.push(issue('target.id', path + '.id'));
    if (seen.has(target.id)) findings.push(issue('target.duplicate', path + '.id'));
    seen.add(target.id);
    if (!validText(target.name)) findings.push(issue('target.name', path + '.name'));
    if (!validText(target.group)) findings.push(issue('target.group', path + '.group'));
    if (typeof target.disabled !== 'boolean') findings.push(issue('target.disabled', path));
    if (typeof target.hidden !== 'boolean') findings.push(issue('target.hidden', path));
  });
  return findings;
}
export function inspectKeyboard(observations: readonly KeyboardObservation[], targets: readonly ScanTarget[]): Finding[] {
  const issues: Finding[] = [];
  const ids = new Set(availableTargets(targets).map(x => x.id));
  observations.forEach((o, index) => {
    const path = `observations[${index}]`;
    if (!ids.has(o.target)) issues.push(issue('keyboard.missing-target', path + '.target'));
    if (o.before !== null && !ids.has(o.before)) issues.push(issue('keyboard.invalid-before', path + '.before'));
    if (o.after !== null && !ids.has(o.after)) issues.push(issue('keyboard.invalid-after', path + '.after'));
    if (!o.visible) issues.push(issue('keyboard.not-visible', path + '.visible'));
    if (!o.contained) issues.push(issue('keyboard.outside-container', path + '.contained'));
    if (!Number.isFinite(o.width) || !Number.isFinite(o.height) || o.width < 44 || o.height < 44) issues.push(issue('keyboard.target-size', path + '.size'));
    if (!['Tab','Shift+Tab','Enter','Space','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(o.key)) issues.push(issue('keyboard.key', path + '.key'));
    if (['Enter','Space'].includes(o.key) && !o.activated) issues.push(issue('keyboard.no-activation', path + '.activated'));
  });
  return issues;
}
export function reverseTraversal(ids: readonly string[], targets: readonly ScanTarget[]): Finding[] {
  const valid = availableTargets(targets).map(t => t.id);
  if (ids.length !== valid.length) return [issue('focus.count', 'focus')];
  const expected = [...valid].reverse();
  const findings: Finding[] = [];
  ids.forEach((id, index) => {
    if (id !== expected[index]) findings.push(issue('focus.reverse-order', `focus[${index}]`));
  });
  return findings;
}
export function inspectAnnouncements(messages: readonly Announcement[], selectedLocale: Locale): Finding[] {
  const issues: Finding[] = [];
  const ids = new Set<string>();
  let last = -1;
  messages.forEach((msg, index) => {
    const path = `announcements[${index}]`;
    if (!validId(msg.id)) issues.push(issue('announcement.id', path + '.id'));
    if (ids.has(msg.id)) issues.push(issue('announcement.duplicate', path + '.id'));
    ids.add(msg.id);
    if (msg.locale !== selectedLocale) issues.push(issue('announcement.locale', path + '.locale'));
    if (!validText(msg.text)) issues.push(issue('announcement.text', path + '.text'));
    if (!['READY','HOLD','UNKNOWN'].includes(msg.status)) issues.push(issue('announcement.status', path + '.status'));
    if (!['polite','assertive'].includes(msg.politeness)) issues.push(issue('announcement.politeness', path + '.politeness'));
    if (!Number.isSafeInteger(msg.sequence) || msg.sequence <= last) issues.push(issue('announcement.order', path + '.sequence'));
    last = msg.sequence;
  });
  return issues;
}
export function matchSelection(id: string | null, targets: readonly ScanTarget[], journey: Journey): Finding[] {
  if (!id) return [issue('selection.missing', 'selection', 'review')];
  if (!availableTargets(targets).some(t => t.id === id)) return [issue('selection.unreachable', 'selection')];
  const step: Step | undefined = journey.steps.find(s => s.id === id);
  if (!step) return [issue('selection.no-step', 'selection')];
  if (step.access === 'unknown') return [issue('selection.unknown', 'selection', 'review')];
  return [];
}
export function scanSummary(result: ScanSnapshot, targets: readonly ScanTarget[]) {
  return {
    focus: result.controls.focus,
    selected: result.selected,
    controls: availableTargets(targets).length,
    actions: result.controls.history.length,
    findings: result.issues.length,
  };
}
