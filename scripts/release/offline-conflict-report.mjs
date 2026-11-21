/** Bilingual, deterministic, redacted exports for human disagreement review. */
import { Buffer } from 'node:buffer';
import { analyzeConflicts, reviewPlan } from './offline-conflict-analysis.mjs';
import { compareRegisters } from './offline-conflict-delta.mjs';

export const REPORT_FORMATS = Object.freeze(['text', 'csv', 'html', 'json']);
const FORMAT = new Set(REPORT_FORMATS);
const MAX_OUTPUT = 12_000_000;
const MESSAGES = Object.freeze({
  en: Object.freeze({
    title: 'Offline evidence disagreement review',
    warning: 'Records describe submitted evidence, not physical accessibility.',
    outcome: 'UNKNOWN', source: 'Source', record: 'Record', subject: 'Subject',
    attribute: 'Attribute', reason: 'Review reason', priority: 'Priority',
    licence: 'Licence', retrieved: 'Retrieved on', tier: 'Source review tier',
    unknown: 'UNKNOWN', changes: 'Recorded changes', review: 'Human review',
    none: 'No disagreement entries in the submitted register.',
    total: 'Total review items', before: 'Earlier', after: 'Later',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des divergences entre preuves',
    warning: 'Ces fiches décrivent les sources transmises et non l’accessibilité physique.',
    outcome: 'UNKNOWN', source: 'Source', record: 'Fiche', subject: 'Sujet',
    attribute: 'Attribut', reason: 'Motif d’examen', priority: 'Priorité',
    licence: 'Licence', retrieved: 'Consulté le', tier: 'Niveau d’examen de la source',
    unknown: 'UNKNOWN', changes: 'Changements consignés', review: 'Examen humain',
    none: 'Aucune divergence consignée dans ce registre.',
    total: 'Total des éléments à examiner', before: 'Avant', after: 'Après',
  }),
});
const HEADERS = ['record', 'subject', 'attribute', 'reason', 'priority',
  'source', 'licence', 'retrieved', 'tier', 'outcome'];
const langOf = value => value === 'fr' ? 'fr' : 'en';
export const reportCopy = value => MESSAGES[langOf(value)];
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
export function normalText(value) {
  return String(value ?? '').replace(/\r/gu, ' ').replace(/\n/gu, ' ')
    .replace(/\t/gu, ' ').trim();
}
export function csvCell(value) {
  const plain = normalText(value);
  const safe = /^[\s]*[=+@-]/u.test(plain) ? `'${plain}` : plain;
  return `"${safe.replace(/"/gu, '""')}"`;
}
export function csvRow(values) { return values.map(csvCell).join(','); }
export function modelForReport(register, options = {}) {
  const plan = reviewPlan(register, options);
  if (!plan.ok) return { ok: false, problems: plan.problems, rows: [], summary: null };
  const index = new Map(register.records.map(record => [record.id, record]));
  const rows = [];
  for (const task of plan.tasks) {
    for (const id of task.recordIds) {
      const record = index.get(id);
      if (!record) continue;
      rows.push({ record: id, subject: task.subject, attribute: task.attribute,
        reason: task.reason, priority: task.priority, source: record.source,
        licence: record.licence, retrieved: record.retrievedOn, tier: record.tier,
        outcome: 'UNKNOWN' });
    }
  }
  rows.sort((a, b) => a.subject.localeCompare(b.subject, 'en') ||
    a.attribute.localeCompare(b.attribute, 'en') ||
    a.record.localeCompare(b.record, 'en') || a.reason.localeCompare(b.reason, 'en'));
  return { ok: true, problems: [], rows, summary: plan.summary };
}
function result(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT) return {
    ok: false, problems: [{ code: 'REPORT_SIZE', path: '/' }], text: null,
  };
  return { ok: true, problems: [], text };
}
function failed(check) { return { ok: false, problems: check.problems, text: null }; }
export function textReport(register, language = 'en', options = {}) {
  const data = modelForReport(register, options);
  if (!data.ok) return failed(data);
  const m = reportCopy(language);
  const sep = langOf(language) === 'fr' ? '\u00a0:' : ':';
  const lines = [m.title, m.warning, `${m.total}${sep} ${data.rows.length}`];
  if (!data.rows.length) lines.push(m.none);
  for (const row of data.rows) {
    lines.push(`${m.record}${sep} ${normalText(row.record)} | ${m.subject}${sep} ${normalText(row.subject)}`);
    lines.push(`${m.attribute}${sep} ${normalText(row.attribute)} | ${m.reason}${sep} ${row.reason}`);
    lines.push(`${m.priority}${sep} ${row.priority} | ${m.outcome}`);
    lines.push(`${m.source}${sep} ${row.source}`);
    lines.push(`${m.licence}${sep} ${row.licence}`);
    lines.push(`${m.retrieved}${sep} ${row.retrieved} | ${m.tier}${sep} ${row.tier}`);
  }
  return result(lines.join('\n') + '\n');
}
export function csvReport(register, language = 'en', options = {}) {
  const data = modelForReport(register, options);
  if (!data.ok) return failed(data);
  const m = reportCopy(language);
  const lines = [csvRow(HEADERS.map(key => m[key]))];
  for (const row of data.rows) lines.push(csvRow(HEADERS.map(key => row[key])));
  return result(lines.join('\r\n') + '\r\n');
}
export function htmlReport(register, language = 'en', options = {}) {
  const data = modelForReport(register, options);
  if (!data.ok) return failed(data);
  const lang = langOf(language);
  const m = reportCopy(lang);
  const heads = HEADERS.map(key => `<th scope="col">${escapeHtml(m[key])}</th>`).join('');
  const body = data.rows.map(row => '<tr>' + HEADERS.map(key =>
    `<td>${escapeHtml(row[key])}</td>`).join('') + '</tr>').join('');
  const fallback = data.rows.length === 0 ? `<p>${escapeHtml(m.none)}</p>` : '';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(m.title)}</title><style>` +
    'body{font:1rem/1.5 system-ui;max-width:80rem;margin:auto;padding:1.5rem}' +
    'table{width:100%;border-collapse:collapse}th,td{border:1px solid currentColor;padding:.6rem;text-align:start}' +
    'caption{text-align:start;font-weight:700}th{font-weight:700}table{display:block;overflow-x:auto}' +
    ':focus-visible{outline:3px solid currentColor;outline-offset:3px}' +
    '</style></head><body><main>' +
    `<h1>${escapeHtml(m.title)}</h1><p>${escapeHtml(m.warning)}</p>` +
    `<p>${escapeHtml(m.total)}${lang === 'fr' ? '\u00a0:' : ':'} ${data.rows.length}</p>` +
    fallback + `<table><caption>${escapeHtml(m.review)}</caption><thead><tr>${heads}</tr></thead>` +
    `<tbody>${body}</tbody></table></main></body></html>`;
  return result(html);
}
export function jsonReport(register, options = {}) {
  const data = modelForReport(register, options);
  if (!data.ok) return failed(data);
  return result(JSON.stringify({ version: 1, summary: data.summary, rows: data.rows }, null, 2) + '\n');
}
export function reportByFormat(register, format, language = 'en', options = {}) {
  if (!FORMAT.has(format)) return { ok: false, problems: [{ code: 'FORMAT', path: '/format' }], text: null };
  if (format === 'text') return textReport(register, language, options);
  if (format === 'csv') return csvReport(register, language, options);
  if (format === 'html') return htmlReport(register, language, options);
  return jsonReport(register, options);
}
export function deltaTextReport(before, after, language = 'en', options = {}) {
  const delta = compareRegisters(before, after, options);
  if (!delta.ok) return failed(delta);
  const m = reportCopy(language);
  const colon = langOf(language) === 'fr' ? '\u00a0:' : ':';
  const lines = [m.title, m.warning, `${m.changes}${colon} ${delta.changes.length}`];
  for (const change of delta.changes) {
    lines.push(`${change.id} | ${change.kind} | ${change.priority} | ${m.unknown}`);
  }
  return result(lines.join('\n') + '\n');
}
export function statusSummary(register, options = {}) {
  const analysis = analyzeConflicts(register, options);
  return analysis.ok ? { ok: true, ...analysis.summary } : { ok: false, problems: analysis.problems };
}
