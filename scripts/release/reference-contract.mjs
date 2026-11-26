/** User-invoked release link inventory contract. It does not fetch or test links. */
export const UNKNOWN = 'UNKNOWN';
export const LIMITS = Object.freeze({ bytes: 1_048_576, references: 400, label: 180, notes: 1200, url: 2048 });
export const PURPOSES = Object.freeze(['data-source', 'licence', 'public-resource', 'download', 'contact', 'map-credit']);
export const TIERS = Object.freeze(['UNKNOWN', 'self-reported', 'documented', 'field-observed']);
export const STATUSES = Object.freeze(['AVAILABLE', 'UNAVAILABLE', UNKNOWN]);
const ROOT_FIELDS = new Set(['schemaVersion', 'capturedOn', 'references']);
const ENTRY_FIELDS = new Set(['id', 'route', 'locale', 'label', 'destination', 'purpose', 'source', 'licence', 'retrievedOn', 'tier', 'status', 'observedOn', 'note', 'pairId']);
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/u;
const SAFE_ROUTE = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/u;
const FORBIDDEN_PARAM = /^(?:access[_-]?token|api[_-]?key|auth|authorization|client[_-]?secret|password|passwd|session|jwt|secret|refresh[_-]?token)$/iu;
const TRACKING_PARAM = /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/iu;
const PRIVATE_HOST = /(?:^|\.)(?:localhost|local|internal|test|invalid)$/iu;
export function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function textField(value, maximum = LIMITS.notes) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && value.trim() === value &&
    [...value].every(char => { const n = char.codePointAt(0); return n >= 32 && n !== 127 && n !== 0x2028 && n !== 0x2029; });
}
export function issuesForUrl(input) {
  if (!textField(input, LIMITS.url)) return ['URL_TEXT'];
  if (/[\\\s<>"'`]/u.test(input) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(input)) return ['URL_ENCODING'];
  let url;
  try { url = new URL(input); } catch { return ['URL_PARSE']; }
  const problems = [];
  if (url.protocol !== 'https:') problems.push('URL_SCHEME');
  if (url.username || url.password) problems.push('URL_CREDENTIALS');
  if (url.port && url.port !== '443') problems.push('URL_PORT');
  if (!url.hostname || PRIVATE_HOST.test(url.hostname) || url.hostname.startsWith('xn--') || url.hostname.includes('.xn--')) problems.push('URL_HOST');
  if (/^(?:\d+\.){3}\d+$/u.test(url.hostname) || url.hostname.startsWith('[')) problems.push('URL_IP');
  if (url.hash) problems.push('URL_FRAGMENT');
  for (const [key] of url.searchParams) if (FORBIDDEN_PARAM.test(key)) problems.push('URL_SECRET_PARAMETER');
  return [...new Set(problems)];
}
export function trackingParameters(input) {
  let url;
  try { url = new URL(input); } catch { return []; }
  return [...new Set([...url.searchParams.keys()].filter(key => TRACKING_PARAM.test(key)))].sort();
}
export function entryKey(reference) { return `${reference.locale}:${reference.id}`; }
export function canonicalDestination(destination) {
  const url = new URL(destination);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname === '/') url.pathname = '';
  return url.toString();
}
function unknownFields(value, allowed, at, problems) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) problems.push(`${at}.${key}:EXTRA_FIELD`);
}
function checkEntry(value, index, capturedOn, problems) {
  const at = `references[${index}]`;
  if (!plain(value)) { problems.push(`${at}:OBJECT`); return; }
  unknownFields(value, ENTRY_FIELDS, at, problems);
  if (!IDENTIFIER.test(value.id ?? '')) problems.push(`${at}.id:IDENTIFIER`);
  if (typeof value.route !== 'string' || !SAFE_ROUTE.test(value.route)) problems.push(`${at}.route:ROUTE`);
  if (!['en', 'fr'].includes(value.locale)) problems.push(`${at}.locale:LOCALE`);
  if (!textField(value.label, LIMITS.label)) problems.push(`${at}.label:LABEL`);
  if (!PURPOSES.includes(value.purpose)) problems.push(`${at}.purpose:PURPOSE`);
  if (!textField(value.source, 350)) problems.push(`${at}.source:SOURCE`);
  if (!textField(value.licence, 120)) problems.push(`${at}.licence:LICENCE`);
  if (!validDate(value.retrievedOn) || value.retrievedOn > capturedOn) problems.push(`${at}.retrievedOn:DATE`);
  if (!TIERS.includes(value.tier)) problems.push(`${at}.tier:TIER`);
  if (!STATUSES.includes(value.status)) problems.push(`${at}.status:STATUS`);
  if (value.pairId !== undefined && !IDENTIFIER.test(value.pairId)) problems.push(`${at}.pairId:IDENTIFIER`);
  if (value.note !== undefined && !textField(value.note)) problems.push(`${at}.note:TEXT`);
  if (value.observedOn !== undefined && (!validDate(value.observedOn) || value.observedOn > capturedOn)) problems.push(`${at}.observedOn:DATE`);
  if (value.status !== UNKNOWN && value.observedOn === undefined) problems.push(`${at}.observedOn:REQUIRED`);
  if (value.status !== UNKNOWN && value.tier === UNKNOWN) problems.push(`${at}.tier:EVIDENCE_REQUIRED`);
  if (typeof value.destination !== 'string') problems.push(`${at}.destination:URL_TEXT`);
  else for (const issue of issuesForUrl(value.destination)) problems.push(`${at}.destination:${issue}`);
}
export function validateManifest(value, { today = '2026-11-21' } = {}) {
  const problems = [];
  if (!validDate(today)) return { ok: false, problems: ['today:DATE'] };
  if (!plain(value)) return { ok: false, problems: ['root:OBJECT'] };
  unknownFields(value, ROOT_FIELDS, 'root', problems);
  if (value.schemaVersion !== 1) problems.push('schemaVersion:VERSION');
  if (!validDate(value.capturedOn) || value.capturedOn > today) problems.push('capturedOn:DATE');
  if (!Array.isArray(value.references) || value.references.length > LIMITS.references) problems.push('references:ARRAY');
  else {
    const seen = new Set();
    for (const [index, entry] of value.references.entries()) {
      checkEntry(entry, index, value.capturedOn, problems);
      if (plain(entry) && typeof entry.id === 'string' && typeof entry.locale === 'string') {
        const key = entryKey(entry);
        if (seen.has(key)) problems.push(`references[${index}]:DUPLICATE_KEY`);
        seen.add(key);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
export function parseManifest(raw, options = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > LIMITS.bytes) return { ok: false, problems: ['input:BYTES'] };
  let value;
  try { value = JSON.parse(raw); } catch { return { ok: false, problems: ['input:JSON'] }; }
  const result = validateManifest(value, options);
  return result.ok ? { ok: true, value, problems: [] } : result;
}
