/** Human-readable release review, bilingual and safe for offline export. */
import { Buffer } from 'node:buffer';
import { inspectPrecache } from './precache-contract.mjs';
import { comparePrecache } from './precache-delta.mjs';
export const PRECACHE_FORMATS = Object.freeze(['text', 'html', 'csv', 'json']);
export const PRECACHE_REPORT_MAX_BYTES = 8_000_000;
const FORMAT = new Set(PRECACHE_FORMATS);
const HEADER = Object.freeze({
  en: Object.freeze({
    title: 'Offline release asset review', caution: 'Recorded file evidence does not establish accessibility at any location.',
    id: 'Asset', path: 'File path', group: 'Cache group', locale: 'Language', kind: 'Asset type',
    state: 'Recorded state', bytes: 'Bytes', hash: 'SHA-256', source: 'Source',
    licence: 'Licence', retrievedOn: 'Retrieved', tier: 'Source review tier',
    finding: 'Issue', change: 'Change', before: 'Earlier record', after: 'Later record',
    empty: 'No records.', unknown: 'UNKNOWN', summary: 'Summary',
  }),
  fr: Object.freeze({
    title: 'Examen des fichiers de publication hors ligne',
    caution: 'Les données des fichiers ne démontrent pas l’accessibilité d’un lieu.',
    id: 'Fichier', path: 'Chemin du fichier', group: 'Groupe du cache', locale: 'Langue', kind: 'Type de fichier',
    state: 'État consigné', bytes: 'Octets', hash: 'SHA-256', source: 'Source',
    licence: 'Licence', retrievedOn: 'Consulté', tier: 'Niveau de contrôle des sources',
    finding: 'Problème', change: 'Changement', before: 'Donnée antérieure', after: 'Donnée récente',
    empty: 'Aucune donnée.', unknown: 'UNKNOWN', summary: 'Résumé',
  }),
});
const COLUMNS = ['id', 'path', 'group', 'locale', 'kind', 'state', 'bytes', 'hash', 'source', 'licence', 'retrievedOn', 'tier'];
export function reportWords(lang = 'en') { return HEADER[lang === 'fr' ? 'fr' : 'en']; }
export function htmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function csvCell(value) {
  const str = String(value ?? '').split('\r').join(' ').split('\n').join(' ').split('\t').join(' ');
  const neutralized = /^[\s]*[=+@-]/u.test(str) ? `'${str}` : str;
  return `"${neutralized.replace(/"/g, '""')}"`;
}
export function colon(lang) { return lang === 'fr' ? '\u00A0:' : ':'; }
function locale(lang) { return lang === 'fr' ? 'fr' : 'en'; }
function issue(code, path) { return { code, path }; }
function fail(errors) { return { ok: false, errors, content: null, bytes: 0 }; }
function success(content) {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > PRECACHE_REPORT_MAX_BYTES) return fail([issue('REPORT_LIMIT', '/')]);
  return { ok: true, errors: [], content, bytes };
}
export function assetReportRows(manifest, lang = 'en', options = {}) {
  const check = inspectPrecache(manifest, options);
  if (!check.ok) return { ok: false, errors: check.errors, rows: [] };
  const chosen = locale(lang);
  const rows = [...manifest.assets].sort((a, b) => a.id.localeCompare(b.id, 'en')).map(asset => ({
    id: asset.id, path: asset.path, group: asset.group, locale: asset.locale, kind: asset.kind,
    state: asset.state, bytes: asset.bytes, hash: asset.sha256,
    source: asset.source, licence: asset.licence, retrievedOn: asset.retrievedOn, tier: asset.tier,
    label: asset.label[chosen],
  }));
  return { ok: true, errors: [], rows };
}
export function textReport(manifest, lang = 'en', options = {}) {
  const rows = assetReportRows(manifest, lang, options);
  if (!rows.ok) return fail(rows.errors);
  const selected = locale(lang);
  const w = reportWords(selected);
  const lines = [w.title, w.caution];
  if (!rows.rows.length) lines.push(w.empty);
  for (const row of rows.rows) {
    lines.push(`${row.id} | ${row.label} | ${row.state}`);
    for (const key of COLUMNS.filter(key => key !== 'id' && key !== 'state')) {
      lines.push(`${w[key]}${colon(selected)} ${row[key]}`);
    }
  }
  return success(lines.join('\n') + '\n');
}
export function csvReport(manifest, lang = 'en', options = {}) {
  const result = assetReportRows(manifest, lang, options);
  if (!result.ok) return fail(result.errors);
  const w = reportWords(lang);
  const header = [...COLUMNS.map(key => w[key]), lang === 'fr' ? 'Libellé' : 'Label'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of result.rows) {
    lines.push([...COLUMNS.map(key => row[key]), row.label].map(csvCell).join(','));
  }
  return success(lines.join('\r\n') + '\r\n');
}
export function htmlReport(manifest, lang = 'en', options = {}) {
  const result = assetReportRows(manifest, lang, options);
  if (!result.ok) return fail(result.errors);
  const chosen = locale(lang);
  const w = reportWords(chosen);
  const h = htmlEscape;
  const heads = [...COLUMNS.map(key => w[key]), chosen === 'fr' ? 'Libellé' : 'Label'];
  const caption = chosen === 'fr' ? 'Liste des fichiers et de leurs sources' : 'Asset and source review list';
  const cells = result.rows.map(row => `<tr>${[...COLUMNS.map(key => row[key]), row.label]
    .map(value => `<td>${h(value)}</td>`).join('')}</tr>`).join('\n');
  const empty = result.rows.length ? '' : `<p>${h(w.empty)}</p>`;
  const content = `<!doctype html>\n<html lang="${chosen}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(w.title)}</title></head>\n<body><main><h1>${h(w.title)}</h1><p role="note">${h(w.caution)}</p>${empty}<table><caption>${h(caption)}</caption><thead><tr>${heads.map(value => `<th scope="col">${h(value)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></main></body></html>\n`;
  return success(content);
}
export function jsonReport(manifest, lang = 'en', options = {}) {
  const result = assetReportRows(manifest, lang, options);
  if (!result.ok) return fail(result.errors);
  const payload = { version: 1, releaseId: manifest.releaseId, language: locale(lang), state: 'UNKNOWN',
    disclaimer: reportWords(lang).caution, rows: result.rows };
  return success(JSON.stringify(payload, null, 2) + '\n');
}
export function renderReport(manifest, { format = 'text', lang = 'en', ...options } = {}) {
  if (!FORMAT.has(format)) return fail([issue('REPORT_FORMAT', '/format')]);
  if (lang !== 'en' && lang !== 'fr') return fail([issue('REPORT_LOCALE', '/lang')]);
  if (format === 'text') return textReport(manifest, lang, options);
  if (format === 'csv') return csvReport(manifest, lang, options);
  if (format === 'html') return htmlReport(manifest, lang, options);
  return jsonReport(manifest, lang, options);
}
export function changeReport(before, after, { lang = 'en', format = 'text', ...options } = {}) {
  const comparison = comparePrecache(before, after, options);
  if (!comparison.ok) return fail(comparison.errors);
  const chosen = locale(lang);
  const w = reportWords(chosen);
  if (format === 'json') return success(JSON.stringify({ version: 1, language: chosen,
    state: 'UNKNOWN', changes: comparison.changes, summary: comparison.summary }, null, 2) + '\n');
  if (format === 'csv') {
    const lines = [[w.id, w.change, w.before, w.after].map(csvCell).join(',')];
    for (const entry of comparison.changes) {
      lines.push([entry.id, entry.kind, entry.before?.sha256 ?? 'UNKNOWN', entry.after?.sha256 ?? 'UNKNOWN'].map(csvCell).join(','));
    }
    return success(lines.join('\r\n') + '\r\n');
  }
  if (format === 'html') {
    const items = comparison.changes.map(item => `<li>${htmlEscape(item.id)} — ${htmlEscape(item.kind)}</li>`).join('');
    return success(`<!doctype html><html lang="${chosen}"><head><meta charset="utf-8"><title>${htmlEscape(w.title)}</title></head><body><main><h1>${htmlEscape(w.title)}</h1><p>${htmlEscape(w.caution)}</p><ul>${items}</ul></main></body></html>\n`);
  }
  if (format !== 'text') return fail([issue('REPORT_FORMAT', '/format')]);
  const lines = [w.title, w.caution];
  for (const entry of comparison.changes) lines.push(`${entry.id} | ${entry.kind} | UNKNOWN`);
  if (!comparison.changes.length) lines.push(w.empty);
  return success(lines.join('\n') + '\n');
}
