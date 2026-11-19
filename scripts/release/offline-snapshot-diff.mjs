/**
 * Deterministic, read-only review of two offline accessibility snapshots.
 *
 * This is a change report, not a field inspection and not a source of new facts.
 * No attribute in a later snapshot can become an affirmative claim merely
 * because an earlier snapshot held one. All claims are shown with source data.
 * No network requests, clocks, persistence, analytics or personal identifiers.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLAIM_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const REVIEW_KINDS = Object.freeze([
  'added', 'removed', 'changed', 'unchanged', 'evidence-lost',
  'evidence-gained', 'source-changed', 'date-changed', 'tier-changed',
  'unknown-transition', 'invalid',
]);
export const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 8_000_000,
  maxRecords: 50_000,
  maxFields: 64,
  maxText: 8_192,
  maxIssues: 200,
});

const CLAIM_NAMES = Object.freeze([
  'stepFreeEntrance', 'accessibleEntrance', 'accessibleParking',
  'accessibleWashroom', 'accessibleWashrooms', 'accessibleToilet',
  'liftAvailable', 'elevator', 'ramp', 'automaticDoor', 'stepFree',
  'accessibleSeating', 'doorWidth', 'turningSpace', 'clearWidth',
  'transferSpace', 'threshold', 'accessibleRoute',
]);
const CLAIM_KEYS = new Set(CLAIM_NAMES);
const METADATA_NAMES = Object.freeze({
  source: ['source', 'sourceUrl', 'source_url'],
  licence: ['licence', 'license', 'licenceId', 'licenseId'],
  retrievedOn: ['retrievedOn', 'retrieved_at', 'retrievedAt'],
  tier: ['tier', 'verificationTier', 'verification_tier'],
  observedOn: ['observedOn', 'observed_on', 'source_date', 'sourceDate'],
});
const PRIVATE_KEYS = new Set([
  'password', 'token', 'apikey', 'secret', 'healthcard', 'ohip',
  'diagnosis', 'medication', 'medications', 'prescription',
  'locationhistory', 'email', 'personname', 'phone', 'birthdate',
  'userid', 'sessionid', 'accesskey', 'authorization',
]);
const TIER_VALUES = new Set([0, 1, 2, 3, 4, 'E',
  'tier-0-open-data', 'tier-1-business-claimed', 'tier-2-peer',
  'tier-3-surveyor', 'tier-4-live-feed', 'administrator_page',
]);
const OPEN_LICENSES = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODC-BY-1.0',
  'ODbL-1.0', 'PDDL-1.0', 'OGL-Canada-2.0', 'OGL-Canada-3.0',
  'MIT', 'Apache-2.0', 'BSD-3-Clause',
]);

const MESSAGES = Object.freeze({
  en: {
    title: 'Offline snapshot review',
    caution: 'A change in records does not establish conditions at a place. Unknown stays Unknown.',
    previous: 'Earlier snapshot',
    current: 'Later snapshot',
    added: 'Record added',
    removed: 'Record removed',
    changed: 'Claim changed',
    unchanged: 'No claim change',
    'evidence-lost': 'Evidence missing from later snapshot',
    'evidence-gained': 'Evidence newly present',
    'source-changed': 'Source changed',
    'date-changed': 'Source or retrieval date changed',
    'tier-changed': 'Verification tier changed',
    'unknown-transition': 'Claim moved to or from Unknown',
    invalid: 'Record needs review',
    noChanges: 'No differences found.',
    record: 'Record',
    field: 'Field',
    before: 'Before',
    after: 'After',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Retrieved',
    tier: 'Tier',
    unknown: 'Unknown',
    issues: 'Issues',
  },
  fr: {
    title: 'Examen des instantanés hors ligne',
    caution: 'Une modification des fiches ne confirme pas l’état d’un lieu. Inconnu demeure inconnu.',
    previous: 'Instantané précédent',
    current: 'Instantané récent',
    added: 'Fiche ajoutée',
    removed: 'Fiche retirée',
    changed: 'Énoncé modifié',
    unchanged: 'Aucun changement d’énoncé',
    'evidence-lost': 'Preuve absente de l’instantané récent',
    'evidence-gained': 'Nouvelle preuve présente',
    'source-changed': 'Source modifiée',
    'date-changed': 'Date de source ou de consultation modifiée',
    'tier-changed': 'Niveau de contrôle modifié',
    'unknown-transition': 'Énoncé devenu inconnu ou précédemment inconnu',
    invalid: 'Fiche à examiner',
    noChanges: 'Aucune différence trouvée.',
    record: 'Fiche',
    field: 'Champ',
    before: 'Avant',
    after: 'Après',
    source: 'Source',
    licence: 'Licence',
    retrieved: 'Consulté',
    tier: 'Niveau',
    unknown: 'Inconnu',
    issues: 'Problèmes',
  },
});

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function firstValue(record, names) {
  if (!isPlainObject(record)) return undefined;
  for (const name of names) {
    if (Object.hasOwn(record, name)) return record[name];
  }
  return undefined;
}

export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dateFromTimestamp(value) {
  if (typeof value !== 'string') return null;
  if (validDay(value)) return value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString().slice(0, 10) : null;
}

export function safeSource(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === 'https:' && Boolean(url.hostname) &&
    !url.username && !url.password && !url.hash &&
    !/^(?:localhost|127(?:\.\d+){3}|0(?:\.\d+){3}|\[?::1\]?)$/i.test(url.hostname);
}

export function openLicence(value) {
  return typeof value === 'string' && OPEN_LICENSES.has(value.trim());
}

export function canonicalTier(value) {
  if (!TIER_VALUES.has(value)) return null;
  const aliases = {
    'tier-0-open-data': 0,
    'tier-1-business-claimed': 1,
    'tier-2-peer': 2,
    'tier-3-surveyor': 3,
    'tier-4-live-feed': 4,
    administrator_page: 'E',
  };
  return typeof value === 'string' && Object.hasOwn(aliases, value) ? aliases[value] : value;
}

export function normalizeState(raw) {
  const state = isPlainObject(raw) ? raw.state ?? raw.value : raw;
  return CLAIM_STATES.includes(state) ? state : null;
}

export function sourceMetadata(record, claim = null) {
  const own = isPlainObject(claim) ? claim : {};
  const common = isPlainObject(record?.provenance) ? record.provenance : {};
  const parent = isPlainObject(record) ? record : {};
  const pick = (key) => {
    for (const item of [own, common, parent]) {
      const value = firstValue(item, METADATA_NAMES[key]);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const rawSource = pick('source');
  const rawLicence = pick('licence');
  const rawTier = pick('tier');
  const rawRetrievedOn = pick('retrievedOn');
  const rawObservedOn = pick('observedOn');
  return {
    source: typeof rawSource === 'string' ? rawSource : null,
    licence: typeof rawLicence === 'string' ? rawLicence : null,
    retrievedOn: dateFromTimestamp(rawRetrievedOn),
    observedOn: dateFromTimestamp(rawObservedOn),
    tier: canonicalTier(rawTier),
  };
}

export function privateFields(value, pointer = '', limit = 100) {
  const issues = [];
  const active = new WeakSet();
  function walk(current, path, depth) {
    if (issues.length >= limit) return;
    if (depth > 32) {
      issues.push({ code: 'DEPTH_LIMIT', path });
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (active.has(current)) {
      issues.push({ code: 'CYCLIC_DATA', path });
      return;
    }
    active.add(current);
    for (const [key, child] of Object.entries(current)) {
      const here = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      const normal = key.toLowerCase().replace(/[-_]/g, '');
      if (PRIVATE_KEYS.has(normal)) issues.push({ code: 'PRIVATE_FIELD', path: here });
      if (issues.length < limit) walk(child, here, depth + 1);
    }
    active.delete(current);
  }
  walk(value, pointer, 0);
  return issues;
}

export function snapshotRecords(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  if (!isPlainObject(snapshot)) return null;
  for (const key of ['records', 'places', 'locations', 'features']) {
    if (Array.isArray(snapshot[key])) return snapshot[key];
  }
  if (snapshot.type === 'Feature') return [snapshot];
  return null;
}

export function recordPayload(record) {
  if (record?.type === 'Feature' && isPlainObject(record.properties)) {
    return { ...record.properties, id: record.id ?? record.properties.id };
  }
  return record;
}

export function recordIdentity(record) {
  const payload = recordPayload(record);
  const id = payload?.id ?? payload?.recordId ?? payload?.placeId;
  return typeof id === 'string' && id.trim().length > 0 && id.length <= 256 ? id : null;
}

export function recordClaims(record) {
  const payload = recordPayload(record);
  if (!isPlainObject(payload)) return [];
  const found = new Map();
  for (const container of [payload, payload.fields, payload.accessibility, payload.features]) {
    if (!isPlainObject(container)) continue;
    for (const [key, value] of Object.entries(container)) {
      if (CLAIM_KEYS.has(key) && !found.has(key)) found.set(key, value);
    }
  }
  return [...found].map(([name, value]) => ({ name, value }));
}

function issue(code, path) { return { code, path }; }

export function validateSnapshot(snapshot, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const problems = [];
  const records = snapshotRecords(snapshot);
  if (!records) return { ok: false, records: new Map(), problems: [issue('SNAPSHOT_SHAPE', '/')] };
  if (records.length > limits.maxRecords) {
    return { ok: false, records: new Map(), problems: [issue('RECORD_LIMIT', '/')] };
  }
  const output = new Map();
  const append = (code, path) => {
    if (problems.length < limits.maxIssues) problems.push(issue(code, path));
  };
  for (let index = 0; index < records.length; index++) {
    const raw = records[index];
    const record = recordPayload(raw);
    const path = `/records/${index}`;
    if (!isPlainObject(record)) { append('RECORD_SHAPE', path); continue; }
    const id = recordIdentity(raw);
    if (!id) { append('RECORD_ID', `${path}/id`); continue; }
    if (output.has(id)) { append('DUPLICATE_ID', `${path}/id`); continue; }
    // Every exported record, including records without accessibility fields,
    // must carry the evidence envelope. This prevents empty records from
    // bypassing attribution requirements.
    const envelope = sourceMetadata(record);
    if (!envelope.source || !safeSource(envelope.source)) append('SOURCE_REQUIRED', path);
    if (!openLicence(envelope.licence)) append('OPEN_LICENCE_REQUIRED', path);
    if (!validDay(envelope.retrievedOn)) append('RETRIEVAL_DATE_REQUIRED', path);
    if (envelope.tier === null) append('TIER_REQUIRED', path);
    const fields = recordClaims(raw);
    if (fields.length > limits.maxFields) { append('CLAIM_LIMIT', path); continue; }
    const claims = new Map();
    for (const field of fields) {
      const location = `${path}/${field.name}`;
      const state = normalizeState(field.value);
      if (!state) { append('INVALID_STATE', location); continue; }
      const meta = sourceMetadata(record, field.value);
      if (!meta.source || !safeSource(meta.source)) append('SOURCE_REQUIRED', location);
      if (!openLicence(meta.licence)) append('OPEN_LICENCE_REQUIRED', location);
      if (!validDay(meta.retrievedOn)) append('RETRIEVAL_DATE_REQUIRED', location);
      if (meta.tier === null) append('TIER_REQUIRED', location);
      if (meta.observedOn && !validDay(meta.observedOn)) append('SOURCE_DATE', location);
      claims.set(field.name, { state, ...meta });
    }
    output.set(id, { id, claims });
  }
  for (const found of privateFields(snapshot, '', limits.maxIssues)) append(found.code, found.path);
  return { ok: problems.length === 0, records: output, problems };
}

export function metadataSame(a, b) {
  return a?.source === b?.source && a?.licence === b?.licence &&
    a?.retrievedOn === b?.retrievedOn && a?.observedOn === b?.observedOn &&
    a?.tier === b?.tier;
}

export function claimDiff(before, after, id, field) {
  const entries = [];
  const add = (kind) => entries.push({ kind, id, field, before: before ?? null, after: after ?? null });
  if (!before && after) { add('added'); return entries; }
  if (before && !after) { add('removed'); return entries; }
  if (!before && !after) return entries;
  if (before.state !== after.state) {
    add(before.state === 'UNKNOWN' || after.state === 'UNKNOWN' ? 'unknown-transition' : 'changed');
  }
  if (before.source !== after.source || before.licence !== after.licence) add('source-changed');
  if (before.retrievedOn !== after.retrievedOn || before.observedOn !== after.observedOn) add('date-changed');
  if (before.tier !== after.tier) add('tier-changed');
  const hasEvidence = (claim) => Boolean(claim?.source && claim?.licence && claim?.retrievedOn && claim?.tier !== null);
  if (hasEvidence(before) && !hasEvidence(after)) add('evidence-lost');
  if (!hasEvidence(before) && hasEvidence(after)) add('evidence-gained');
  return entries;
}

export function compareSnapshots(earlier, later, options = {}) {
  const first = validateSnapshot(earlier, options);
  const second = validateSnapshot(later, options);
  const problems = [
    ...first.problems.map((entry) => ({ ...entry, snapshot: 'earlier' })),
    ...second.problems.map((entry) => ({ ...entry, snapshot: 'later' })),
  ];
  // Reject invalid snapshots instead of outputting a misleading partial comparison.
  if (problems.length) return { ok: false, problems, changes: [], summary: null };
  const ids = [...new Set([...first.records.keys(), ...second.records.keys()])].sort();
  const changes = [];
  for (const id of ids) {
    const previous = first.records.get(id);
    const current = second.records.get(id);
    if (!previous) {
      changes.push({ kind: 'added', id, field: null, before: null, after: null });
    } else if (!current) {
      changes.push({ kind: 'removed', id, field: null, before: null, after: null });
    }
    const keys = [...new Set([
      ...(previous?.claims.keys() ?? []), ...(current?.claims.keys() ?? []),
    ])].sort();
    for (const key of keys) {
      changes.push(...claimDiff(previous?.claims.get(key), current?.claims.get(key), id, key));
    }
  }
  const counts = Object.fromEntries(REVIEW_KINDS.map((kind) => [kind, 0]));
  for (const change of changes) counts[change.kind]++;
  return {
    ok: true,
    problems: [],
    changes,
    summary: {
      earlierRecords: first.records.size,
      laterRecords: second.records.size,
      changes: changes.length,
      counts,
    },
  };
}

export function textFor(language = 'en') {
  return MESSAGES[language === 'fr' ? 'fr' : 'en'];
}

export function formatMetadata(claim, locale = 'en') {
  const labels = textFor(locale);
  if (!claim) return labels.unknown;
  const punctuation = locale === 'fr' ? '\u00a0:' : ':';
  const fields = [
    `${labels.source}${punctuation} ${claim.source ?? labels.unknown}`,
    `${labels.licence}${punctuation} ${claim.licence ?? labels.unknown}`,
    `${labels.retrieved}${punctuation} ${claim.retrievedOn ?? labels.unknown}`,
    `${labels.tier}${punctuation} ${claim.tier ?? labels.unknown}`,
  ];
  return fields.join(' | ');
}

export function formatTextReport(result, locale = 'en') {
  const labels = textFor(locale);
  const lines = [labels.title, labels.caution, ''];
  const punctuation = locale === 'fr' ? '\u00a0:' : ':';
  if (!result.ok) {
    lines.push(labels.issues);
    for (const item of result.problems) lines.push(`${item.snapshot}${punctuation} ${item.code} ${item.path}`);
    return lines.join('\n') + '\n';
  }
  if (result.changes.length === 0) lines.push(labels.noChanges);
  for (const item of result.changes) {
    lines.push(`${labels[item.kind]} | ${labels.record}${punctuation} ${item.id}${item.field ? ` | ${labels.field}${punctuation} ${item.field}` : ''}`);
    if (item.before) lines.push(`  ${labels.before}${punctuation} ${item.before.state} | ${formatMetadata(item.before, locale)}`);
    if (item.after) lines.push(`  ${labels.after}${punctuation} ${item.after.state} | ${formatMetadata(item.after, locale)}`);
  }
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const args = { earlier: null, later: null, output: null, format: 'text', locale: 'en' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const field = { '--earlier': 'earlier', '--later': 'later', '--output': 'output',
      '--format': 'format', '--locale': 'locale' }[key];
    if (!field || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid argument: ${key}`);
    args[field] = argv[++i];
  }
  if (!args.earlier || !args.later || !['json', 'text'].includes(args.format) || !['en', 'fr'].includes(args.locale)) {
    throw new Error('Expected --earlier file --later file [--format json|text] [--locale en|fr] [--output file]');
  }
  return args;
}

async function readSnapshot(file, maxBytes = DEFAULT_LIMITS.maxBytes) {
  const input = await readFile(resolve(file));
  if (input.byteLength > maxBytes) throw new Error('Snapshot exceeds input size limit');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(input);
  return JSON.parse(content);
}

export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = parseArgs(argv);
    const [earlier, later] = await Promise.all([readSnapshot(args.earlier), readSnapshot(args.later)]);
    const result = compareSnapshots(earlier, later);
    const output = args.format === 'json'
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatTextReport(result, args.locale);
    if (args.output) await writeFile(resolve(args.output), output, { flag: 'wx', mode: 0o600 });
    else stdout.write(output);
    return result.ok ? 0 : 1;
  } catch (error) {
    stderr.write(`Offline snapshot review failed: ${error.message}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
