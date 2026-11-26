/** Schema for opt-in, human-supplied documentation snapshots. No site discovery or requests. */
export const UNKNOWN = 'UNKNOWN';
export const LIMITS = Object.freeze({ bytes: 1_500_000, documents: 300, characters: 120_000, findings: 5_000 });
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const STATES = Object.freeze(['UNKNOWN', 'draft', 'reviewed']);
export const MARKS = Object.freeze(['UNKNOWN', 'self-reported', 'documented', 'field-observed']);
const keys = (o) => Object.keys(o).sort();
export const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
export const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function hasExactKeys(value, allowed, required = allowed) {
  if (!plain(value)) return false;
  return required.every(k => Object.hasOwn(value, k)) && keys(value).every(k => allowed.includes(k));
}
export function dateValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function cleanText(value, maximum = 2048) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum &&
    ![...value].some(c => { const n = c.codePointAt(0); return n < 32 || n === 127 || n === 0x2028 || n === 0x2029; });
}
export function docId(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/u.test(value); }
export function safePath(value) {
  return typeof value === 'string' && value.length <= 160 && value.length > 0 &&
    !value.includes('\\') && !value.includes('//') && !value.startsWith('/') && !value.startsWith('.') &&
    value.endsWith('.md') && value.split('/').every(s => s && s !== '.' && s !== '..' && /^[a-zA-Z0-9._-]+$/u.test(s));
}
export function languageValid(value) { return LANGUAGES.includes(value); }
export function provenanceValid(value) {
  return plain(value) && ['source', 'licence', 'retrievedOn', 'tier'].every(k => Object.hasOwn(value, k)) &&
    cleanText(value.source, 1000) && cleanText(value.licence, 120) && dateValid(value.retrievedOn) && MARKS.includes(value.tier);
}
export function validateDocument(d, today, prefix = 'DOCUMENT') {
  const problems = [];
  const issue = (code, path) => problems.push({ code, path });
  if (!plain(d)) { issue('DOCUMENT_OBJECT', prefix); return problems; }
  const allowed = ['id', 'path', 'language', 'pairId', 'title', 'body', 'state', 'source', 'licence', 'retrievedOn', 'tier'];
  const required = allowed.filter(x => x !== 'pairId');
  if (!hasExactKeys(d, allowed, required)) issue('DOCUMENT_FIELDS', prefix);
  if (!docId(d.id)) issue('DOCUMENT_ID', `${prefix}.id`);
  if (!safePath(d.path)) issue('DOCUMENT_PATH', `${prefix}.path`);
  if (!languageValid(d.language)) issue('DOCUMENT_LANGUAGE', `${prefix}.language`);
  if (d.pairId !== undefined && !docId(d.pairId)) issue('DOCUMENT_PAIR_ID', `${prefix}.pairId`);
  if (!cleanText(d.title, 160)) issue('DOCUMENT_TITLE', `${prefix}.title`);
  if (typeof d.body !== 'string' || !d.body || d.body.length > LIMITS.characters || d.body.includes('\0')) issue('DOCUMENT_BODY', `${prefix}.body`);
  if (!STATES.includes(d.state)) issue('DOCUMENT_STATE', `${prefix}.state`);
  if (!provenanceValid(d)) issue('DOCUMENT_PROVENANCE', prefix);
  if (dateValid(today) && dateValid(d.retrievedOn) && d.retrievedOn > today) issue('DOCUMENT_FUTURE_SOURCE', `${prefix}.retrievedOn`);
  return problems;
}
export function validateManifest(value, { today = '2026-11-21' } = {}) {
  const errors = [];
  if (!dateValid(today)) return { ok: false, errors: [{ code: 'INVALID_TODAY', path: 'today' }] };
  if (!plain(value) || !hasExactKeys(value, ['schemaVersion', 'capturedOn', 'documents']))
    return { ok: false, errors: [{ code: 'MANIFEST_FIELDS', path: '$' }] };
  if (value.schemaVersion !== 1) errors.push({ code: 'SCHEMA_VERSION', path: '$.schemaVersion' });
  if (!dateValid(value.capturedOn) || value.capturedOn > today) errors.push({ code: 'MANIFEST_DATE', path: '$.capturedOn' });
  if (!Array.isArray(value.documents) || value.documents.length > LIMITS.documents || !value.documents.length)
    errors.push({ code: 'DOCUMENT_COUNT', path: '$.documents' });
  else {
    const ids = new Set(), paths = new Set();
    value.documents.forEach((d, index) => {
      errors.push(...validateDocument(d, today, `$.documents[${index}]`));
      if (docId(d?.id)) { if (ids.has(d.id)) errors.push({ code: 'DUPLICATE_ID', path: `$.documents[${index}].id` }); ids.add(d.id); }
      if (safePath(d?.path)) { if (paths.has(d.path)) errors.push({ code: 'DUPLICATE_PATH', path: `$.documents[${index}].path` }); paths.add(d.path); }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value, errors: [] };
}
export function parseManifest(source, options = {}) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > LIMITS.bytes)
    return { ok: false, errors: [{ code: 'FILE_SIZE', path: '$' }] };
  let value;
  try { value = JSON.parse(source); } catch { return { ok: false, errors: [{ code: 'INVALID_JSON', path: '$' }] }; }
  return validateManifest(value, options);
}
export function fictionalManifest() {
  return { schemaVersion: 1, capturedOn: '2026-11-20', documents: [
    { id: 'en-intro', path: 'help/introduction.en.md', language: 'en', pairId: 'intro', title: 'Introduction', body: '# Introduction\n\n[Go to details](#details)\n\n## Details\n\nRead the instructions.', state: 'draft', source: 'Fictional documentation', licence: 'CC0-1.0', retrievedOn: '2026-11-19', tier: UNKNOWN },
    { id: 'fr-intro', path: 'help/introduction.fr.md', language: 'fr', pairId: 'intro', title: 'Introduction', body: '# Introduction\n\n[Aller aux détails](#details)\n\n## Details\n\nLire les instructions.', state: 'draft', source: 'Documentation fictive', licence: 'CC0-1.0', retrievedOn: '2026-11-19', tier: UNKNOWN },
  ] };
}
