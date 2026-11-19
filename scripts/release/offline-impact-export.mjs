/**
 * Screen-reader friendly, privacy-preserving renderings of offline impact data.
 * These are review notices, not confirmations of any accessibility conditions.
 * All rendering is pure; nothing is sent to a server, printer or storage.
 */
import { validateTriageQueue, summarizeTriage } from './offline-impact-triage.mjs';

export const EXPORT_LANGUAGES = Object.freeze(['en', 'fr']);
export const EXPORT_FORMATS = Object.freeze(['text', 'csv', 'html', 'json']);
const WORDS = Object.freeze({
  en: Object.freeze({
    title: 'Offline evidence review impacts', caution: 'Review status does not confirm real-world accessibility.',
    total: 'Items', state: 'Claim state', status: 'Review status', reason: 'Reason',
    source: 'Source reference', record: 'Record', field: 'Claim',
    open: 'Open', deferred: 'Deferred', resolved: 'Resolved',
    block: 'Blocking', review: 'Needs review', empty: 'There are no review impacts.',
    unknown: 'UNKNOWN', heading: 'Evidence review items',
    count: 'Count', level: 'Priority', action: 'Human review required',
  }),
  fr: Object.freeze({
    title: 'Incidences des preuves hors ligne', caution: 'Le statut d’examen ne confirme pas l’accessibilité réelle.',
    total: 'Fiches', state: 'État déclaré', status: 'État de l’examen', reason: 'Motif',
    source: 'Référence de source', record: 'Fiche', field: 'Déclaration',
    open: 'Ouvert', deferred: 'Reporté', resolved: 'Résolu',
    block: 'Bloquant', review: 'Examen nécessaire', empty: 'Aucune incidence à examiner.',
    unknown: 'UNKNOWN', heading: 'Fiches à examiner',
    count: 'Nombre', level: 'Priorité', action: 'Examen humain nécessaire',
  }),
});
const TABLE_HEADERS = Object.freeze(['record', 'field', 'state', 'status', 'level', 'reason', 'source']);

function messages(language) { return WORDS[language === 'fr' ? 'fr' : 'en']; }
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeCsv(value) {
  const text = String(value);
  const protectedText = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}
function safeText(value) {
  return String(value).replace(/[\r\n\t]/g, ' ');
}
function colon(language) { return language === 'fr' ? '\u00A0:' : ':'; }
function roleName(value, words) { return words[value] ?? value; }
function rows(queue) {
  return [...queue.items].sort((a, b) => a.key.localeCompare(b.key, 'en')).map((item) => ({
    record: item.recordId, field: item.claimKey, state: item.state,
    status: item.status, level: item.level, reason: item.reason,
    source: item.sourcePath,
  }));
}

export function outputWords(language = 'en') {
  return { ...messages(language) };
}

/** No raw private values in errors; a rejected queue renders nothing. */
export function exportImpactReview(queue, format = 'text', language = 'en') {
  const check = validateTriageQueue(queue);
  if (!check.ok) return { ok: false, problems: check.problems, content: null, mediaType: null };
  if (!EXPORT_LANGUAGES.includes(language)) {
    return { ok: false, problems: [{ code: 'LANGUAGE_INVALID', path: '/language' }], content: null, mediaType: null };
  }
  if (!EXPORT_FORMATS.includes(format)) {
    return { ok: false, problems: [{ code: 'FORMAT_INVALID', path: '/format' }], content: null, mediaType: null };
  }
  const w = messages(language);
  const data = rows(queue);
  const summary = summarizeTriage(queue).summary;
  const content = {
    text: () => asText(data, summary, w, language),
    csv: () => asCsv(data, w),
    html: () => asHtml(data, summary, w, language),
    json: () => asJson(data, summary, language),
  }[format]();
  const mediaType = { text: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8', html: 'text/html; charset=utf-8',
    json: 'application/json; charset=utf-8' }[format];
  return { ok: true, problems: [], content, mediaType };
}

function asText(data, summary, w, language) {
  const lines = [w.title, w.caution, `${w.total}${colon(language)} ${summary.total}`];
  if (!data.length) lines.push(w.empty);
  for (const item of data) {
    lines.push(`${w.record}${colon(language)} ${safeText(item.record)}`);
    lines.push(`${w.field}${colon(language)} ${safeText(item.field)}`);
    lines.push(`${w.state}${colon(language)} ${item.state}`);
    lines.push(`${w.status}${colon(language)} ${roleName(item.status, w)}`);
    lines.push(`${w.level}${colon(language)} ${roleName(item.level, w)}`);
    lines.push(`${w.reason}${colon(language)} ${item.reason}`);
    lines.push(`${w.source}${colon(language)} ${safeText(item.source)}`);
  }
  return `${lines.join('\n')}\n`;
}

function asCsv(data, w) {
  const headers = TABLE_HEADERS.map((header) => w[header]);
  const lines = [headers.map(escapeCsv).join(',')];
  for (const item of data) lines.push(TABLE_HEADERS.map((key) => escapeCsv(item[key])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function asHtml(data, summary, w, language) {
  const header = TABLE_HEADERS.map((name) => `<th scope="col">${escapeHtml(w[name])}</th>`).join('');
  const body = data.map((item) => `<tr>${TABLE_HEADERS.map((key) =>
    `<td>${escapeHtml(key === 'state' ? item[key] : roleName(item[key], w))}</td>`).join('')}</tr>`).join('');
  const empty = data.length === 0 ? `<p>${escapeHtml(w.empty)}</p>` : '';
  return '<!doctype html>\n' +
    `<html lang="${language}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(w.title)}</title></head><body><main>` +
    `<h1>${escapeHtml(w.title)}</h1><p>${escapeHtml(w.caution)}</p>` +
    `<p>${escapeHtml(w.total)}${colon(language)} ${summary.total}</p>` + empty +
    `<h2>${escapeHtml(w.heading)}</h2>` +
    `<table><caption>${escapeHtml(w.heading)}</caption><thead><tr>${header}</tr></thead>` +
    `<tbody>${body}</tbody></table></main></body></html>\n`;
}

function asJson(data, summary, language) {
  return JSON.stringify({ version: 1, language, warning: messages(language).caution,
    summary, items: data }, null, 2) + '\n';
}

/**
 * Read-only report parsing with a fixed, minimal schema. This is intentionally
 * not a reverse import into the queue: reports cannot become evidence.
 */
export function parseImpactJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 8_000_000) {
    return { ok: false, problems: [{ code: 'INPUT_LIMIT', path: '/' }], report: null };
  }
  let data;
  try { data = JSON.parse(text); } catch {
    return { ok: false, problems: [{ code: 'JSON_INVALID', path: '/' }], report: null };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 ||
      !EXPORT_LANGUAGES.includes(data.language) || !Array.isArray(data.items) ||
      data.items.length > 20_000) {
    return { ok: false, problems: [{ code: 'REPORT_INVALID', path: '/' }], report: null };
  }
  const problems = [];
  const allowed = new Set(TABLE_HEADERS);
  for (const [index, row] of data.items.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).some((key) => !allowed.has(key))) {
      problems.push({ code: 'ROW_INVALID', path: `/items/${index}` });
      continue;
    }
    if (TABLE_HEADERS.some((key) => typeof row[key] !== 'string' || row[key].length > 2048)) {
      problems.push({ code: 'ROW_VALUE_INVALID', path: `/items/${index}` });
    }
    if (!['YES', 'NO', 'UNKNOWN'].includes(row.state)) {
      problems.push({ code: 'ROW_STATE_INVALID', path: `/items/${index}/state` });
    }
  }
  return { ok: problems.length === 0, problems,
    report: problems.length ? null : data };
}

/** Printable labels are not an endorsement or a proof of accuracy. */
export function exportImpactOverview(queue, language = 'en') {
  const result = summarizeTriage(queue);
  if (!result.ok) return { ok: false, problems: result.problems, text: null };
  const w = messages(language);
  const detail = TRIAGE_ORDER.map((status) =>
    `${roleName(status, w)}${colon(language)} ${result.summary.byStatus[status]}`);
  return { ok: true, problems: [], text: [w.title, w.caution,
    `${w.total}${colon(language)} ${result.summary.total}`,
    `${w.unknown}${colon(language)} ${result.summary.UNKNOWN}`, ...detail].join('\n') + '\n' };
}
const TRIAGE_ORDER = Object.freeze(['open', 'deferred', 'resolved']);
