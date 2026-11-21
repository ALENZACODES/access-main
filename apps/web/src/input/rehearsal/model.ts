/** Device-local accessibility rehearsal. A statement is an observation, never a public fact. */
export type Locale = 'en' | 'fr';
export type Status = 'READY' | 'HOLD' | 'UNKNOWN';
export type SourceTier = 'PRIMARY' | 'SECONDARY' | 'COMMUNITY' | 'UNKNOWN';
export type AccessFact = 'supported' | 'limited' | 'unsupported' | 'unknown';
export type StepKind = 'entrance' | 'path' | 'lift' | 'washroom' | 'transit' | 'exit' | 'custom';
export type ControlAction = 'NEXT' | 'PREVIOUS' | 'SELECT' | 'BACK' | 'CANCEL' | 'RESET';
export interface Copy { readonly en: string; readonly fr: string }
export interface SourceInfo {
  readonly name: string;
  readonly url: string;
  readonly licence: string;
  readonly collectedOn: string;
  readonly tier: SourceTier;
}
export interface LocalCopy {
  readonly state: 'stored' | 'absent' | 'unknown';
  readonly path?: string;
  readonly savedOn?: string;
}
export interface Step {
  readonly id: string;
  readonly kind: StepKind;
  readonly label: Copy;
  readonly detail: Copy;
  readonly access: AccessFact;
  readonly source: SourceInfo | null;
  readonly offline: LocalCopy;
  readonly sequence: number;
  readonly needsReview: boolean;
}
export interface Journey {
  readonly id: string;
  readonly name: Copy;
  readonly createdOn: string;
  readonly steps: readonly Step[];
}
export interface Finding { readonly code: string; readonly path: string; readonly severity: 'error' | 'review' }
export interface Assessment { readonly status: Status; readonly findings: readonly Finding[]; readonly steps: readonly StepDecision[] }
export interface StepDecision { readonly id: string; readonly status: Status; readonly reasons: readonly string[] }
export interface Controls { readonly focus: string | null; readonly scanning: boolean; readonly index: number; readonly history: readonly ControlAction[] }
export interface Options { readonly today: string; readonly maxAgeDays: number; readonly requireOffline: boolean }
export const DEFAULT_OPTIONS: Options = Object.freeze({ today: '2026-11-19', maxAgeDays: 180, requireOffline: false });
export const KINDS: readonly StepKind[] = Object.freeze(['entrance','path','lift','washroom','transit','exit','custom']);
export const TIERS: readonly SourceTier[] = Object.freeze(['PRIMARY','SECONDARY','COMMUNITY','UNKNOWN']);
export const ACTIONS: readonly ControlAction[] = Object.freeze(['NEXT','PREVIOUS','SELECT','BACK','CANCEL','RESET']);
export const FACTS: readonly AccessFact[] = Object.freeze(['supported','limited','unsupported','unknown']);
export const STATUSES: readonly Status[] = Object.freeze(['READY','HOLD','UNKNOWN']);
export function isObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127 || (code >= 128 && code <= 159)) return true;
  }
  return false;
}
export function validText(value: unknown, max = 600): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !hasControl(value);
}
export function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined || year < 1970 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
export function ordinal(value: unknown): number | null {
  if (!validDay(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}
export function safeSourceUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048 || hasControl(value) || value.trim() !== value || value.includes(' ')) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !!host && !url.username && !url.password && !url.hash &&
      host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') &&
      host !== '127.0.0.1' && host !== '0.0.0.0' && host !== '[::1]';
  } catch { return false; }
}
export function safeOfflinePath(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1024 || hasControl(value)) return false;
  if (!value.startsWith('/offline/') || value.includes('\\') || value.includes('%') || value.includes('?') || value.includes('#')) return false;
  return value.split('/').slice(1).every((part) => part.length > 0 && part !== '.' && part !== '..' && /^[a-zA-Z0-9._-]+$/.test(part));
}
export function isCopy(value: unknown): value is Copy {
  return isObject(value) && validText(value.en) && validText(value.fr);
}
export function issue(code: string, path: string, severity: Finding['severity'] = 'error'): Finding {
  return { code, path, severity };
}
export function sortFindings(items: readonly Finding[]): Finding[] {
  return [...items].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
}
export function checkFrenchPunctuation(value: string): string[] {
  const errors: string[] = [];
  if (value.includes("'")) errors.push('fr.apostrophe');
  for (let i = 0; i < value.length; i += 1) {
    const token = value[i];
    if (token === ':' && i > 0 && value[i-1] !== '\u00A0') errors.push('fr.colon');
    if ([';', '!', '?'].includes(token ?? '') && i > 0 && value[i-1] !== '\u202F') errors.push('fr.narrow');
    if (token === '«' && i < value.length - 1 && value[i+1] !== '\u202F') errors.push('fr.guillemet-open');
    if (token === '»' && i > 0 && value[i-1] !== '\u202F') errors.push('fr.guillemet-close');
  }
  return [...new Set(errors)];
}
export function textIssues(value: unknown, path: string, checkFrench = true): Finding[] {
  if (!isObject(value)) return [issue('copy.object', path)];
  const found: Finding[] = [];
  if (!validText(value.en)) found.push(issue('copy.en', path + '.en'));
  if (!validText(value.fr)) found.push(issue('copy.fr', path + '.fr'));
  if (checkFrench && validText(value.fr)) {
    for (const code of checkFrenchPunctuation(value.fr)) found.push(issue(code, path + '.fr'));
  }
  return found;
}
export function sourceIssues(input: unknown, path: string, today: string): Finding[] {
  if (!isObject(input)) return [issue('source.missing', path, 'review')];
  const findings: Finding[] = [];
  if (!validText(input.name, 180)) findings.push(issue('source.name', path + '.name'));
  if (!safeSourceUrl(input.url)) findings.push(issue('source.url', path + '.url'));
  if (!validText(input.licence, 160)) findings.push(issue('source.licence', path + '.licence'));
  if (!TIERS.includes(input.tier as SourceTier)) findings.push(issue('source.tier', path + '.tier'));
  if (input.tier === 'UNKNOWN') findings.push(issue('source.tier-unknown', path + '.tier', 'review'));
  if (!validDay(input.collectedOn)) findings.push(issue('source.collected', path + '.collectedOn'));
  else if (ordinal(input.collectedOn)! > ordinal(today)!) findings.push(issue('source.future', path + '.collectedOn'));
  return findings;
}
export function offlineIssues(input: unknown, path: string, today: string): Finding[] {
  if (!isObject(input)) return [issue('offline.object', path)];
  const findings: Finding[] = [];
  if (!['stored', 'absent', 'unknown'].includes(String(input.state))) findings.push(issue('offline.state', path + '.state'));
  if (input.state === 'stored') {
    if (!safeOfflinePath(input.path)) findings.push(issue('offline.path', path + '.path'));
    if (!validDay(input.savedOn)) findings.push(issue('offline.date', path + '.savedOn'));
    else if (ordinal(input.savedOn)! > ordinal(today)!) findings.push(issue('offline.future', path + '.savedOn'));
  } else if (input.path !== undefined || input.savedOn !== undefined) {
    findings.push(issue('offline.unexpected-metadata', path));
  }
  return findings;
}
export function stepIssues(input: unknown, path: string, options: Options): Finding[] {
  if (!isObject(input)) return [issue('step.object', path)];
  const result: Finding[] = [];
  if (!validId(input.id)) result.push(issue('step.id', path + '.id'));
  if (!KINDS.includes(input.kind as StepKind)) result.push(issue('step.kind', path + '.kind'));
  result.push(...textIssues(input.label, path + '.label'));
  result.push(...textIssues(input.detail, path + '.detail'));
  if (!FACTS.includes(input.access as AccessFact)) result.push(issue('step.access', path + '.access'));
  if (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 0) result.push(issue('step.sequence', path + '.sequence'));
  result.push(...sourceIssues(input.source, path + '.source', options.today));
  result.push(...offlineIssues(input.offline, path + '.offline', options.today));
  if (typeof input.needsReview !== 'boolean') result.push(issue('step.review', path + '.needsReview'));
  return result;
}
export function journeyIssues(input: unknown, options: Options = DEFAULT_OPTIONS): Finding[] {
  if (!validDay(options.today) || !Number.isInteger(options.maxAgeDays) || options.maxAgeDays < 0 || options.maxAgeDays > 3650) throw new TypeError('Invalid assessment policy');
  if (!isObject(input)) return [issue('journey.object', 'journey')];
  const findings: Finding[] = [];
  if (!validId(input.id)) findings.push(issue('journey.id', 'journey.id'));
  findings.push(...textIssues(input.name, 'journey.name'));
  if (!validDay(input.createdOn)) findings.push(issue('journey.date', 'journey.createdOn'));
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 40) {
    findings.push(issue('journey.steps', 'journey.steps'));
    return sortFindings(findings);
  }
  const ids = new Set<string>();
  const sequences = new Set<number>();
  const paths = new Set<string>();
  input.steps.forEach((step: unknown, i: number) => {
    const path = `journey.steps[${i}]`;
    findings.push(...stepIssues(step, path, options));
    if (!isObject(step)) return;
    if (typeof step.id === 'string') {
      if (ids.has(step.id)) findings.push(issue('step.duplicate-id', path + '.id'));
      ids.add(step.id);
    }
    if (typeof step.sequence === 'number') {
      if (sequences.has(step.sequence)) findings.push(issue('step.duplicate-sequence', path + '.sequence'));
      sequences.add(step.sequence);
    }
    if (isObject(step.offline) && step.offline.state === 'stored' && typeof step.offline.path === 'string') {
      if (paths.has(step.offline.path)) findings.push(issue('offline.duplicate-path', path + '.offline.path'));
      paths.add(step.offline.path);
    }
  });
  return sortFindings(findings);
}
export function decisionForStep(step: Step, options: Options): StepDecision {
  const findings = stepIssues(step, 'step', options);
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length) return { id: step.id, status: 'HOLD', reasons: errors.map((f) => f.code) };
  if (step.source === null) return { id: step.id, status: 'UNKNOWN', reasons: ['source.missing'] };
  if (step.access === 'unsupported' || step.access === 'limited') return { id: step.id, status: 'HOLD', reasons: ['access.' + step.access] };
  if (step.access === 'unknown' || step.source?.tier === 'UNKNOWN' || step.offline.state === 'unknown') {
    return { id: step.id, status: 'UNKNOWN', reasons: ['evidence.unknown'] };
  }
  if (step.needsReview) return { id: step.id, status: 'HOLD', reasons: ['review.requested'] };
  if (options.requireOffline && step.offline.state !== 'stored') return { id: step.id, status: 'HOLD', reasons: ['offline.not-stored'] };
  if (step.source) {
    const age = ordinal(options.today)! - ordinal(step.source.collectedOn)!;
    if (age > options.maxAgeDays) return { id: step.id, status: 'HOLD', reasons: ['source.age'] };
  }
  return { id: step.id, status: 'READY', reasons: [] };
}
export function assessJourney(journey: Journey, options: Options = DEFAULT_OPTIONS): Assessment {
  const findings = journeyIssues(journey, options);
  const steps = (Array.isArray(journey?.steps) ? journey.steps : []).filter((s): s is Step => isObject(s)).map(s => decisionForStep(s, options));
  if (findings.some((f) => f.severity === 'error')) return { status: 'HOLD', findings, steps };
  if (steps.some(s => s.status === 'HOLD')) return { status: 'HOLD', findings, steps };
  if (steps.some(s => s.status === 'UNKNOWN') || findings.some(f => f.severity === 'review')) return { status: 'UNKNOWN', findings, steps };
  return { status: 'READY', findings, steps };
}
