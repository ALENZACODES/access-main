/**
 * The shape of listed-sources.json, written down twice: as a JSON Schema for other programs, and
 * as a checker that reads a file back and says what is not as promised. The checker goes further
 * than the schema can: it also checks that the facts inside one source agree with each other
 * (a tier of UNKNOWN is listed among the unknown facts, a review date goes with a number of
 * days) and that no missing value is written any other way than UNKNOWN.
 */
import { GAP_FIELDS } from './filters';
import { LISTED_JSON_VERSION } from './listedJson';
import { TIER_IDS } from './tierValue';
import { UNKNOWN_WORD } from './unknownWord';

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const TIERS: readonly string[] = [...TIER_IDS, UNKNOWN_WORD];
const STATUSES: readonly string[] = ['fresh', 'stale', UNKNOWN_WORD];
const LICENCE_TYPES: readonly string[] = ['open', 'terms', 'unrecognised', UNKNOWN_WORD];
const TEXT_FIELDS = ['datasetId', 'dataset', 'kind', 'sourceId', 'source', 'page', 'licence', 'licenceType', 'retrieved', 'tier', 'status', 'reviewDate'] as const;
export const LISTED_SOURCE_KEYS: readonly string[] = [...TEXT_FIELDS, 'ageDays', 'daysUntilReview', 'unknownFacts'];
export const LISTED_DOC_KEYS: readonly string[] = ['version', 'generatedAt', 'locale', 'unknownToken', 'filters', 'total', 'listed', 'sources'];

const dateOrUnknown = { anyOf: [{ type: 'string', pattern: DATE_PATTERN }, { const: UNKNOWN_WORD }] };

/** JSON Schema (2020-12) for the file. Every property is required and no other property is allowed. */
export const LISTED_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Listed sources',
  description: `One object per listed source. A fact that is not recorded is the string ${UNKNOWN_WORD}; a number that cannot be worked out is null.`,
  type: 'object',
  additionalProperties: false,
  required: [...LISTED_DOC_KEYS],
  properties: {
    version: { const: LISTED_JSON_VERSION },
    generatedAt: { type: 'string', format: 'date-time' },
    locale: { enum: ['en', 'fr'] },
    unknownToken: { const: UNKNOWN_WORD },
    filters: { type: 'string', pattern: '^(\\?.+)?$' },
    total: { type: 'integer', minimum: 0 },
    listed: { type: 'integer', minimum: 0 },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [...LISTED_SOURCE_KEYS],
        properties: {
          datasetId: { type: 'string' },
          dataset: { type: 'string' },
          kind: { type: 'string', minLength: 1 },
          sourceId: { type: 'string' },
          source: { type: 'string', minLength: 1 },
          page: { type: 'string', minLength: 1 },
          licence: { type: 'string', minLength: 1 },
          licenceType: { enum: [...LICENCE_TYPES] },
          retrieved: dateOrUnknown,
          tier: { enum: [...TIERS] },
          status: { enum: [...STATUSES] },
          ageDays: { type: ['integer', 'null'], minimum: 0 },
          reviewDate: dateOrUnknown,
          daysUntilReview: { type: ['integer', 'null'] },
          unknownFacts: { type: 'array', uniqueItems: true, items: { enum: [...GAP_FIELDS] } },
        },
      },
    },
  },
} as const;

/** The schema as text: two-space indented, with a final new line. */
export function listedJsonSchemaText(): string {
  return `${JSON.stringify(LISTED_JSON_SCHEMA, null, 2)}\n`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** True for YYYY-MM-DD that is a day of the calendar. */
export function isRealIsoDay(v: unknown): v is string {
  if (typeof v !== 'string' || !new RegExp(DATE_PATTERN).test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// A missing value written some other way than the token: a localized word, or the token in another case.
const OTHER_UNKNOWN = /^(unknown|inconnue?s?|n\/a|n\/d|tbd|none|null|undefined)$/i;

function checkKeys(obj: Record<string, unknown>, want: readonly string[], where: string, out: string[]): void {
  for (const k of want) if (!Object.hasOwn(obj, k)) out.push(`${where}: "${k}" is missing`);
  for (const k of Object.keys(obj)) if (!want.includes(k)) out.push(`${where}: "${k}" is not part of the file`);
}

function checkSource(s: unknown, where: string, out: string[]): void {
  if (!isObject(s)) {
    out.push(`${where}: not an object`);
    return;
  }
  checkKeys(s, LISTED_SOURCE_KEYS, where, out);
  for (const k of TEXT_FIELDS) {
    const v = s[k];
    if (!Object.hasOwn(s, k)) continue;
    if (typeof v !== 'string') out.push(`${where}.${k}: not text`);
    else if (v !== UNKNOWN_WORD && OTHER_UNKNOWN.test(v.trim())) out.push(`${where}.${k}: a missing value must be written ${UNKNOWN_WORD}, not "${v}"`);
    else if (v.trim() === '' && k !== 'datasetId' && k !== 'dataset' && k !== 'sourceId') out.push(`${where}.${k}: empty`);
  }
  if (typeof s['licenceType'] === 'string' && !LICENCE_TYPES.includes(s['licenceType'])) out.push(`${where}.licenceType: not a licence type`);
  if (typeof s['tier'] === 'string' && !TIERS.includes(s['tier'])) out.push(`${where}.tier: not a tier`);
  if (typeof s['status'] === 'string' && !STATUSES.includes(s['status'])) out.push(`${where}.status: not a status`);
  for (const k of ['retrieved', 'reviewDate'] as const) {
    const v = s[k];
    if (typeof v === 'string' && v !== UNKNOWN_WORD && !isRealIsoDay(v)) out.push(`${where}.${k}: not a day of the calendar (YYYY-MM-DD) and not ${UNKNOWN_WORD}`);
  }
  const age = s['ageDays'];
  if (Object.hasOwn(s, 'ageDays') && age !== null && !(isInt(age) && age >= 0)) out.push(`${where}.ageDays: not a whole number of days, and not null`);
  const days = s['daysUntilReview'];
  if (Object.hasOwn(s, 'daysUntilReview') && days !== null && !isInt(days)) out.push(`${where}.daysUntilReview: not a whole number of days, and not null`);
  const facts = s['unknownFacts'];
  if (Object.hasOwn(s, 'unknownFacts')) {
    if (!Array.isArray(facts)) out.push(`${where}.unknownFacts: not a list`);
    else {
      if (facts.some((f) => !(GAP_FIELDS as readonly unknown[]).includes(f))) out.push(`${where}.unknownFacts: holds something that is not one of ${GAP_FIELDS.join(', ')}`);
      if (new Set(facts).size !== facts.length) out.push(`${where}.unknownFacts: the same fact twice`);
    }
  }
  // The facts of one source have to agree with each other.
  if (Array.isArray(facts) && typeof s['tier'] === 'string' && TIERS.includes(s['tier']) && (s['tier'] === UNKNOWN_WORD) !== facts.includes('tier')) {
    out.push(`${where}: the tier and the list of unknown facts disagree`);
  }
  if (typeof s['reviewDate'] === 'string' && Object.hasOwn(s, 'daysUntilReview') && (s['reviewDate'] === UNKNOWN_WORD) !== (days === null)) {
    out.push(`${where}: the review date and the days until review disagree`);
  }
  if (s['status'] === UNKNOWN_WORD && (s['retrieved'] !== UNKNOWN_WORD || age !== null)) out.push(`${where}: the status is ${UNKNOWN_WORD} but a retrieved date or an age is given`);
  if (s['status'] !== UNKNOWN_WORD && typeof s['status'] === 'string' && STATUSES.includes(s['status']) && (s['retrieved'] === UNKNOWN_WORD || age === null)) {
    out.push(`${where}: the status is known but the retrieved date or the age is not`);
  }
  if (s['status'] === 'stale' && isInt(days) && days >= 0) out.push(`${where}: marked possibly out of date but the review date has not passed`);
  if (s['status'] === 'fresh' && isInt(days) && days < 0) out.push(`${where}: marked within its review period but the review date has passed`);
}

/** Every way the value is not a listed-sources file. Empty when it is one. Never throws. */
export function validateListedJson(value: unknown): string[] {
  const out: string[] = [];
  if (!isObject(value)) return ['file: not an object'];
  checkKeys(value, LISTED_DOC_KEYS, 'file', out);
  if (value['version'] !== LISTED_JSON_VERSION) out.push(`file.version: expected ${LISTED_JSON_VERSION}`);
  const at = value['generatedAt'];
  if (typeof at !== 'string' || Number.isNaN(new Date(at).getTime()) || new Date(at).toISOString() !== at) out.push('file.generatedAt: not a time in ISO form');
  if (value['locale'] !== 'en' && value['locale'] !== 'fr') out.push('file.locale: not en or fr');
  if (value['unknownToken'] !== UNKNOWN_WORD) out.push(`file.unknownToken: expected ${UNKNOWN_WORD}`);
  const filters = value['filters'];
  if (typeof filters !== 'string' || (filters !== '' && !(filters.startsWith('?') && filters.length > 1))) out.push('file.filters: not a query string');
  const total = value['total'];
  const listed = value['listed'];
  if (!(isInt(total) && total >= 0)) out.push('file.total: not a count');
  if (!(isInt(listed) && listed >= 0)) out.push('file.listed: not a count');
  if (isInt(total) && isInt(listed) && listed > total) out.push('file: more sources listed than there are in all');
  const sources = value['sources'];
  if (!Array.isArray(sources)) {
    out.push('file.sources: not a list');
    return out;
  }
  if (isInt(listed) && sources.length !== listed) out.push(`file: "listed" says ${listed} but the list holds ${sources.length}`);
  sources.forEach((s, i) => checkSource(s, `sources[${i}]`, out));
  return out;
}

export interface ListedJsonRead {
  ok: boolean;
  problems: string[];
  /** The parsed value when the text is JSON at all; undefined otherwise. */
  value?: unknown;
}

/** Reads the text of a file back. A text that is not JSON is one problem, not an exception. */
export function readListedJson(text: string): ListedJsonRead {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, problems: ['file: not JSON'] };
  }
  const problems = validateListedJson(value);
  return { ok: problems.length === 0, problems, value };
}

export const LISTED_SCHEMA_ROUTE = '/listed-sources.schema.json';
