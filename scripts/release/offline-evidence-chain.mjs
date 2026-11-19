/**
 * Audit relationships in an offline collection of source-backed claims.
 * This is a structural audit, not an assessment of a physical location.
 * The supplied records never become more trustworthy through this audit.
 *
 * Document shape:
 * { version: 1, sources: [{id, title, url, licence, retrievedOn, tier}],
 *   observations: [{id, sourceId, recordedOn, evidenceIds?: [], note?: {en,fr}}],
 *   claims: [{id, observationIds: [], state: 'YES'|'NO'|'UNKNOWN',
 *             label: {en,fr}}] }
 *
 * An observation can cite other observations (for example an original
 * survey and its openly licensed transcription). Cycles are prohibited.
 * Every affirmative or negative claim must have a path to a usable source.
 * UNKNOWN remains UNKNOWN, including when evidence is present.
 */

export const CHAIN_VERSION = 1;
const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 64;
const MAX_STRING = 4_096;
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIERS = new Set([0, 1, 2, 3, 4, 'E']);
const PRIVATE_FIELDS = new Set([
  'password', 'passwd', 'secret', 'apikey', 'accesstoken', 'refreshtoken',
  'bearertoken', 'sessioncookie', 'healthcard', 'diagnosis', 'medication',
  'prescription', 'locationhistory', 'emailaddress', 'phonenumber',
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(code, path, detail) {
  return Object.freeze({ code, path, detail });
}

function escapePointer(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function dateValid(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const instance = new Date(0);
  instance.setUTCFullYear(year, month - 1, day);
  instance.setUTCHours(0, 0, 0, 0);
  return instance.getUTCFullYear() === year && instance.getUTCMonth() === month - 1 &&
    instance.getUTCDate() === day;
}

function containsControls(value) {
  for (const character of value) {
    const ordinal = character.codePointAt(0);
    if (ordinal <= 31 || ordinal === 127) return true;
  }
  return false;
}

function textValid(value) {
  return typeof value === 'string' && Boolean(value.trim()) &&
    value.length <= MAX_STRING && !containsControls(value);
}

function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2_048 || containsControls(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) &&
      !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}

function keyNormal(value) {
  return value.toLowerCase().replace(/[_-]/g, '');
}

function privateIssues(value, path = '', issues = [], seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return issues;
  if (seen.has(value)) return issues;
  if (depth >= MAX_DEPTH) {
    issues.push(issue('DEPTH_LIMIT', path || '/', 'Nested data exceeds the review limit'));
    return issues;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}/${escapePointer(key)}`;
    if (PRIVATE_FIELDS.has(keyNormal(key))) {
      issues.push(issue('PRIVATE_FIELD', next, 'Sensitive field is not permitted in the collection'));
    }
    privateIssues(child, next, issues, seen, depth + 1);
  }
  return issues;
}

function bilingual(value, path, issues) {
  if (!object(value) || !textValid(value.en) || !textValid(value.fr)) {
    issues.push(issue('BILINGUAL_TEXT', path, 'Non-empty English and French text required'));
    return;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'en' && key !== 'fr') issues.push(issue('UNEXPECTED_TEXT_KEY', `${path}/${escapePointer(key)}`, 'Unexpected translation field'));
  }
  // App copy follows the project's explicit non-breaking-space convention.
  const fr = value.fr;
  for (let index = 0; index < fr.length; index++) {
    const char = fr[index];
    if (char === ':' || char === '?' || char === '!') {
      if (index > 0 && fr[index - 1] !== '\u00a0') {
        issues.push(issue('FR_SPACING', `${path}/fr`, 'French punctuation needs U+00A0 before colon, question mark or exclamation mark'));
        break;
      }
    }
    if (char === '«' && fr[index + 1] !== '\u00a0') {
      issues.push(issue('FR_GUILLEMET', `${path}/fr`, 'Opening guillemet requires U+00A0'));
      break;
    }
    if (char === '»' && fr[index - 1] !== '\u00a0') {
      issues.push(issue('FR_GUILLEMET', `${path}/fr`, 'Closing guillemet requires U+00A0'));
      break;
    }
  }
}

function uniqueCollection(value, name, issues) {
  if (!Array.isArray(value)) {
    issues.push(issue('COLLECTION_REQUIRED', `/${name}`, 'Expected an array'));
    return new Map();
  }
  if (value.length > MAX_ENTRIES) {
    issues.push(issue('COLLECTION_LIMIT', `/${name}`, 'Collection exceeds safe offline limit'));
    return new Map();
  }
  const result = new Map();
  value.forEach((entry, index) => {
    const path = `/${name}/${index}`;
    if (!object(entry)) {
      issues.push(issue('ENTRY_OBJECT', path, 'Expected a record object'));
      return;
    }
    if (typeof entry.id !== 'string' || !ID.test(entry.id)) {
      issues.push(issue('ENTRY_ID', `${path}/id`, 'Stable non-empty record ID required'));
      return;
    }
    if (result.has(entry.id)) {
      issues.push(issue('DUPLICATE_ID', `${path}/id`, 'Record ID duplicated in this collection'));
      return;
    }
    result.set(entry.id, { entry, path });
  });
  return result;
}

function referenceIds(value, path, issues) {
  if (!Array.isArray(value)) {
    issues.push(issue('REFERENCES_ARRAY', path, 'References must be an array'));
    return [];
  }
  const seen = new Set();
  const ids = [];
  value.forEach((id, index) => {
    if (typeof id !== 'string' || !ID.test(id)) {
      issues.push(issue('REFERENCE_ID', `${path}/${index}`, 'Reference ID is invalid'));
    } else if (seen.has(id)) {
      issues.push(issue('DUPLICATE_REFERENCE', `${path}/${index}`, 'Duplicate reference'));
    } else {
      ids.push(id);
      seen.add(id);
    }
  });
  return ids;
}

/**
 * Returns issues and a conservative, diagnostic-only summary. In particular,
 * `supported` means a complete structural citation path, not a confirmed
 * physical accessibility fact or proof of accuracy.
 */
export function inspectEvidenceChain(document, { today = '2026-11-19' } = {}) {
  const issues = [];
  if (!object(document)) return { ok: false, issues: [issue('DOCUMENT_OBJECT', '/', 'Expected object')], summary: null };
  if (document.version !== CHAIN_VERSION) issues.push(issue('VERSION', '/version', 'Unrecognised document version'));
  if (!dateValid(today)) issues.push(issue('TODAY', '/options/today', 'Invalid comparison date'));
  privateIssues(document, '', issues);

  const sources = uniqueCollection(document.sources, 'sources', issues);
  const observations = uniqueCollection(document.observations, 'observations', issues);
  const claims = uniqueCollection(document.claims, 'claims', issues);
  const validSources = new Set();
  for (const [id, { entry, path }] of sources) {
    let valid = true;
    if (!textValid(entry.title)) {
      issues.push(issue('SOURCE_TITLE', `${path}/title`, 'Source title required'));
      valid = false;
    }
    if (!safeUrl(entry.url)) {
      issues.push(issue('SOURCE_URL', `${path}/url`, 'HTTPS source URL without credentials or fragment required'));
      valid = false;
    }
    if (!textValid(entry.licence)) {
      issues.push(issue('SOURCE_LICENCE', `${path}/licence`, 'Licence required'));
      valid = false;
    }
    if (!dateValid(entry.retrievedOn) || dateValid(today) && entry.retrievedOn > today) {
      issues.push(issue('SOURCE_DATE', `${path}/retrievedOn`, 'Valid non-future retrieval date required'));
      valid = false;
    }
    if (!TIERS.has(entry.tier)) {
      issues.push(issue('SOURCE_TIER', `${path}/tier`, 'Canonical verification tier required'));
      valid = false;
    }
    if (valid) validSources.add(id);
  }

  const edges = new Map();
  const usable = new Map();
  for (const [id, { entry, path }] of observations) {
    let direct = false;
    if (!dateValid(entry.recordedOn) || dateValid(today) && entry.recordedOn > today) {
      issues.push(issue('OBSERVATION_DATE', `${path}/recordedOn`, 'Valid non-future observation date required'));
    }
    if (!ID.test(String(entry.sourceId ?? '')) || !sources.has(entry.sourceId)) {
      issues.push(issue('SOURCE_REFERENCE', `${path}/sourceId`, 'Source record missing'));
    } else if (!validSources.has(entry.sourceId)) {
      issues.push(issue('SOURCE_UNUSABLE', `${path}/sourceId`, 'Referenced source metadata is incomplete'));
    } else if (dateValid(entry.recordedOn) && (!dateValid(today) || entry.recordedOn <= today)) {
      direct = true;
    }
    if (entry.note !== undefined) bilingual(entry.note, `${path}/note`, issues);
    const deps = entry.evidenceIds === undefined ? [] :
      referenceIds(entry.evidenceIds, `${path}/evidenceIds`, issues);
    for (const [index, dependency] of deps.entries()) {
      if (!observations.has(dependency)) {
        issues.push(issue('EVIDENCE_REFERENCE', `${path}/evidenceIds/${index}`, 'Referenced observation missing'));
      }
      if (dependency === id) issues.push(issue('SELF_REFERENCE', `${path}/evidenceIds/${index}`, 'Observation cannot cite itself'));
    }
    edges.set(id, deps);
    usable.set(id, direct);
  }

  // Three-colour DFS detects cycles even in disconnected observations.
  const colours = new Map();
  const cycleIds = new Set();
  const stack = [];
  function visit(id, depth) {
    if (depth > MAX_DEPTH) {
      issues.push(issue('REFERENCE_DEPTH', `/observations/${escapePointer(id)}`, 'Citation path exceeds depth limit'));
      cycleIds.add(id);
      return;
    }
    colours.set(id, 1);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      if (!observations.has(next)) continue;
      if (colours.get(next) === 1) {
        const start = stack.indexOf(next);
        for (const inCycle of stack.slice(start)) cycleIds.add(inCycle);
        issues.push(issue('REFERENCE_CYCLE', `/observations/${escapePointer(id)}`, 'Cyclic evidence references'));
      } else if (!colours.has(next)) visit(next, depth + 1);
    }
    stack.pop();
    colours.set(id, 2);
  }
  for (const id of observations.keys()) if (!colours.has(id)) visit(id, 0);
  // Propagate unusability along references: all cited evidence must be valid.
  const memo = new Map();
  function validObservation(id, depth = 0) {
    if (memo.has(id)) return memo.get(id);
    if (depth > MAX_DEPTH || cycleIds.has(id) || !usable.get(id)) return false;
    const dependencies = edges.get(id) ?? [];
    if (dependencies.some((dependency) => !observations.has(dependency))) return false;
    // Set pessimistically to break a hidden cycle, then refine.
    memo.set(id, false);
    const valid = dependencies.every((dependency) => validObservation(dependency, depth + 1));
    memo.set(id, valid);
    return valid;
  }
  let known = 0;
  let unknown = 0;
  let supported = 0;
  const used = new Set();
  for (const [, { entry, path }] of claims) {
    bilingual(entry.label, `${path}/label`, issues);
    if (!STATES.has(entry.state)) {
      issues.push(issue('CLAIM_STATE', `${path}/state`, 'YES, NO or UNKNOWN required'));
      continue;
    }
    if (entry.state === 'UNKNOWN') unknown++;
    else known++;
    const refs = referenceIds(entry.observationIds, `${path}/observationIds`, issues);
    for (const [index, ref] of refs.entries()) {
      if (!observations.has(ref)) issues.push(issue('CLAIM_REFERENCE', `${path}/observationIds/${index}`, 'Observation does not exist'));
      else used.add(ref);
    }
    if (entry.state !== 'UNKNOWN') {
      if (refs.length === 0) issues.push(issue('CLAIM_NO_EVIDENCE', `${path}/observationIds`, 'Known state needs citation'));
      else if (!refs.every((ref) => validObservation(ref))) {
        issues.push(issue('CLAIM_UNSUPPORTED', `${path}/observationIds`, 'Citation chain incomplete'));
      } else supported++;
    }
  }
  for (const [id, { path }] of observations) {
    if (!used.has(id) && ![...edges.values()].some((deps) => deps.includes(id))) {
      issues.push(issue('UNUSED_OBSERVATION', path, 'Observation not referenced by a claim or another observation'));
    }
  }
  return {
    ok: issues.length === 0,
    issues: issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)),
    summary: Object.freeze({ sources: sources.size, observations: observations.size,
      claims: claims.size, known, unknown, structurallySupported: supported,
      unusedObservations: issues.filter(({ code }) => code === 'UNUSED_OBSERVATION').length }),
  };
}

export function formatEvidenceChainReport(result, language = 'en') {
  if (!result || !Array.isArray(result.issues) || !result.summary) return '';
  const fr = language === 'fr';
  const lines = [fr ? 'Contrôle des références hors ligne' : 'Offline citation review'];
  lines.push(fr ? `Sources\u00A0: ${result.summary.sources}` : `Sources: ${result.summary.sources}`);
  lines.push(fr ? `Observations\u00A0: ${result.summary.observations}` : `Observations: ${result.summary.observations}`);
  lines.push(fr ? `Déclarations inconnues\u00A0: ${result.summary.unknown}` : `Unknown claims: ${result.summary.unknown}`);
  lines.push(fr ? `Chaînes documentées\u00A0: ${result.summary.structurallySupported}` :
    `Structurally cited claims: ${result.summary.structurallySupported}`);
  for (const item of result.issues) lines.push(`${item.code} ${item.path}`);
  lines.push(fr ? 'Aucune conclusion sur l’accessibilité réelle.' : 'No conclusion about real-world accessibility.');
  return lines.join('\n');
}
