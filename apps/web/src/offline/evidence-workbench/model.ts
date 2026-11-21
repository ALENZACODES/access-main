/** Local evidence workbench. These records are user's unsubmitted notes, never place facts. */
export const VERSION = 1 as const;
export const UNKNOWN = 'UNKNOWN' as const;
export const FEATURES = ['entrance', 'door', 'path', 'washroom', 'lift', 'parking', 'signage', 'seating', 'other'] as const;
export const STATES = ['UNKNOWN', 'reported', 'not-reported'] as const;
export const TIERS = ['unknown', 'self-reported', 'documented', 'field-observed'] as const;
export const DECISIONS = ['unreviewed', 'needs-source', 'needs-recheck', 'reviewed'] as const;
export type Feature = typeof FEATURES[number];
export type EvidenceState = typeof STATES[number];
export type Tier = typeof TIERS[number];
export type Decision = typeof DECISIONS[number];
export type Language = 'en' | 'fr';
export interface EvidenceItem {
  id: string;
  placeId: string;
  label: string;
  feature: Feature;
  state: EvidenceState;
  source: string;
  licence: string;
  retrievedOn: string;
  tier: Tier;
  note: string;
  decision: Decision;
}
export interface WorkbenchDocument {
  version: 1;
  items: EvidenceItem[];
}
export interface Problem { code: string; path: string; }
export type Result<T> = { ok: true; value: T; problems: [] } | { ok: false; value: null; problems: Problem[] };
export const MAX_ITEMS = 500;
export const MAX_BYTES = 1_000_000;
export const MAX_NOTES = 1200;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const forbiddenNames = new Set(['__proto__', 'constructor', 'prototype']);
const reservedFields = ['id','placeId','label','feature','state','source','licence','retrievedOn','tier','note','decision'] as const;
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function validId(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value) && !forbiddenNames.has(value);
}
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0,0,0,0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function hasForbiddenControls(value: string): boolean {
  return [...value].some(char => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}
export function goodText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0) &&
    value.trim() === value && !hasForbiddenControls(value) && !value.includes('\uFFFD');
}
export function ownKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key) && !forbiddenNames.has(key));
}
export function validateItem(input: unknown, index: number, today: string): Result<EvidenceItem> {
  const problems: Problem[] = [];
  const path = `items[${index}]`;
  if (!isRecord(input)) return { ok: false, value: null, problems: [{ code: 'ITEM_OBJECT', path }] };
  const check = (valid: boolean, code: string, key: string): void => {
    if (!valid) problems.push({ code, path: `${path}.${key}` });
  };
  check(ownKeys(input, reservedFields), 'UNKNOWN_FIELD', '$');
  check(validId(input.id), 'INVALID_ID', 'id');
  check(validId(input.placeId), 'INVALID_PLACE', 'placeId');
  check(goodText(input.label, 120), 'INVALID_LABEL', 'label');
  check(FEATURES.some(f => f === input.feature), 'INVALID_FEATURE', 'feature');
  check(STATES.some(s => s === input.state), 'INVALID_STATE', 'state');
  check(goodText(input.source, 400), 'SOURCE_REQUIRED', 'source');
  check(goodText(input.licence, 120), 'LICENCE_REQUIRED', 'licence');
  check(validDay(input.retrievedOn) && typeof input.retrievedOn === 'string' && input.retrievedOn <= today, 'INVALID_DATE', 'retrievedOn');
  check(TIERS.some(t => t === input.tier), 'INVALID_TIER', 'tier');
  check(goodText(input.note, MAX_NOTES, true), 'INVALID_NOTE', 'note');
  check(DECISIONS.some(d => d === input.decision), 'INVALID_DECISION', 'decision');
  const missing = reservedFields.filter(key => !Object.hasOwn(input,key));
  for (const key of missing) problems.push({ code: 'MISSING_FIELD', path: `${path}.${key}` });
  if (problems.length) return { ok: false, value: null, problems };
  return { ok: true, value: {
    id: input.id as string, placeId: input.placeId as string, label: input.label as string,
    feature: input.feature as Feature, state: input.state as EvidenceState,
    source: input.source as string, licence: input.licence as string,
    retrievedOn: input.retrievedOn as string, tier: input.tier as Tier,
    note: input.note as string, decision: input.decision as Decision,
  }, problems: [] };
}
export function validateDocument(input: unknown, today: string): Result<WorkbenchDocument> {
  const problems: Problem[] = [];
  if (!validDay(today)) return { ok: false, value: null, problems: [{ code: 'INVALID_TODAY', path: 'today' }] };
  if (!isRecord(input)) return { ok: false, value: null, problems: [{ code: 'DOCUMENT_OBJECT', path: '$' }] };
  if (!ownKeys(input, ['version', 'items'])) problems.push({ code: 'UNKNOWN_FIELD', path: '$' });
  if (input.version !== VERSION) problems.push({ code: 'VERSION', path: 'version' });
  if (!Array.isArray(input.items) || input.items.length > MAX_ITEMS) {
    problems.push({ code: 'ITEMS', path: 'items' });
    return { ok: false, value: null, problems };
  }
  const seen = new Set<string>();
  const items: EvidenceItem[] = [];
  input.items.forEach((item: unknown, index: number) => {
    const result = validateItem(item, index, today);
    if (!result.ok) { problems.push(...result.problems); return; }
    if (seen.has(result.value.id)) problems.push({ code: 'DUPLICATE_ID', path: `items[${index}].id` });
    seen.add(result.value.id);
    items.push(result.value);
  });
  if (problems.length) return { ok: false, value: null, problems: problems.slice(0, 100) };
  return { ok: true, value: { version: VERSION, items }, problems: [] };
}
export function parseDocument(text: unknown, today: string): Result<WorkbenchDocument> {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BYTES) {
    return { ok: false, value: null, problems: [{ code: 'FILE_TOO_LARGE', path: '$' }] };
  }
  let data: unknown;
  try { data = JSON.parse(text) as unknown; }
  catch { return { ok: false, value: null, problems: [{ code: 'INVALID_JSON', path: '$' }] }; }
  return validateDocument(data, today);
}
export function emptyDocument(): WorkbenchDocument { return { version: 1, items: [] }; }
export function makeDraft(id: string, placeId: string, date: string): EvidenceItem {
  return { id, placeId, label: 'New evidence', feature: 'entrance', state: UNKNOWN,
    source: 'Personal review note (not independently confirmed)', licence: 'UNKNOWN',
    retrievedOn: date, tier: 'unknown', note: '', decision: 'unreviewed' };
}
export function safeDateToday(clock: Date): string { return clock.toISOString().slice(0,10); }
export function displayState(value: EvidenceState | Tier): string { return value === 'unknown' ? UNKNOWN : value; }
export function cloneDocument(document: WorkbenchDocument): WorkbenchDocument {
  return { version: 1, items: document.items.map(item => ({ ...item })) };
}
