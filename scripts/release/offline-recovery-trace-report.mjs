/** Bilingual, static reports from recorded traces; no network or UI probing. */
import { Buffer } from 'node:buffer';
import { analyzeRecoveryTraces, coverageGaps, triageRecoveryTraces } from './offline-recovery-trace-analysis.mjs';
import { compareRecoveryReleases } from './offline-recovery-trace-delta.mjs';

const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Offline recovery evidence review', warning: 'Recorded traces are not proof of physical accessibility.',
    trace: 'Trace', route: 'Route', mode: 'Network mode', language: 'Language', category: 'Category',
    state: 'Recorded outcome', source: 'Source', licence: 'Licence', date: 'Retrieved', tier: 'Source review tier',
    failures: 'Failures recorded', recovered: 'Recoveries with checks', changes: 'Changes',
    reason: 'Review reason', noRecords: 'No traces recorded. The outcome is UNKNOWN.',
    noChanges: 'No differences recorded.', missing: 'Missing coverage', task: 'Review task',
    unknown: 'UNKNOWN', issue: 'Input issue', caution: 'Human review is required for uncertain results.',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des preuves de récupération',
    warning: 'Les traces consignées ne prouvent pas l’accessibilité physique.',
    trace: 'Trace', route: 'Parcours', mode: 'Mode réseau', language: 'Langue', category: 'Catégorie',
    state: 'Résultat consigné', source: 'Source', licence: 'Licence', date: 'Consulté',
    tier: 'Niveau d’examen de la source', failures: 'Échecs consignés',
    recovered: 'Récupérations avec contrôle', changes: 'Changements',
    reason: 'Motif d’examen', noRecords: 'Aucune trace consignée. Résultat\u00a0: UNKNOWN.',
    noChanges: 'Aucune différence consignée.', missing: 'Couverture manquante',
    task: 'Tâche d’examen', unknown: 'UNKNOWN', issue: 'Problème d’entrée',
    caution: 'Un examen humain est nécessaire pour les résultats incertains.',
  }),
});
const COLUMNS = ['trace', 'route', 'language', 'mode', 'category', 'state',
  'source', 'licence', 'date', 'tier', 'failures', 'recovered'];
export function reportCopy(locale = 'en') { return COPY[locale === 'fr' ? 'fr' : 'en']; }
export function htmlEscape(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
export function csvCell(value) {
  const text = String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('\t', ' ');
  const guard = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${guard.replaceAll('"', '""')}"`;
}
export function reportRows(report) {
  return report.traces.map((entry) => ({
    trace: entry.id, route: entry.route, language: entry.locale, mode: entry.mode,
    category: entry.category, state: entry.state, source: entry.source.source,
    licence: entry.source.licence, date: entry.source.retrievedOn,
    tier: String(entry.source.tier), failures: entry.failures,
    recovered: entry.recovered,
  }));
}
function failureText(problems, language) {
  const copy = reportCopy(language);
  return [copy.title, copy.warning, ...problems.map((issue) => `${copy.issue}: ${issue.code} ${issue.path}`)].join('\n');
}
function newlineColon(language) { return language === 'fr' ? '\u00a0:' : ':'; }
export function recoveryText(document, language = 'en', options = {}) {
  const result = analyzeRecoveryTraces(document, options);
  if (!result.ok) return failureText(result.problems, language);
  const locale = language === 'fr' ? 'fr' : 'en';
  const copy = reportCopy(locale);
  const colon = newlineColon(locale);
  const lines = [copy.title, copy.warning, copy.caution];
  if (!result.report.traces.length) lines.push(copy.noRecords);
  for (const entry of result.report.traces) {
    lines.push(`${copy.trace}${colon} ${entry.id}`);
    lines.push(`${copy.route}${colon} ${entry.route}`);
    lines.push(`${copy.state}${colon} ${entry.state}`);
    lines.push(`${copy.source}${colon} ${entry.source.source}`);
    lines.push(`${copy.licence}${colon} ${entry.source.licence}`);
    lines.push(`${copy.date}${colon} ${entry.source.retrievedOn}`);
    lines.push(`${copy.tier}${colon} ${entry.source.tier}`);
    lines.push(`${copy.failures}${colon} ${entry.failures}`);
    lines.push(`${copy.recovered}${colon} ${entry.recovered}`);
  }
  return lines.join('\n') + '\n';
}
export function recoveryCsv(document, language = 'en', options = {}) {
  const check = analyzeRecoveryTraces(document, options);
  if (!check.ok) return null;
  const copy = reportCopy(language);
  const rows = [COLUMNS.map((key) => csvCell(copy[key])).join(',')];
  for (const entry of reportRows(check.report)) {
    rows.push(COLUMNS.map((key) => csvCell(entry[key])).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
export function recoveryHtml(document, language = 'en', options = {}) {
  const locale = language === 'fr' ? 'fr' : 'en';
  const copy = reportCopy(locale);
  const check = analyzeRecoveryTraces(document, options);
  if (!check.ok) return null;
  const header = COLUMNS.map((key) => `<th scope="col">${htmlEscape(copy[key])}</th>`).join('');
  const body = reportRows(check.report).map((row) => '<tr>' +
    COLUMNS.map((key) => `<td>${htmlEscape(row[key])}</td>`).join('') + '</tr>').join('');
  return '<!doctype html>\n' + `<html lang="${locale}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${htmlEscape(copy.title)}</title>` +
    '<style>body{font:1rem/1.6 system-ui;margin:1.25rem;max-width:82rem}' +
    'table{border-collapse:collapse;display:block;overflow-x:auto}' +
    'th,td{border:1px solid currentColor;padding:.75rem;vertical-align:top}' +
    ':focus-visible{outline:3px solid currentColor;outline-offset:3px}' +
    'button,a{min-height:44px;min-width:44px}</style></head><body>' +
    `<main><h1>${htmlEscape(copy.title)}</h1>` +
    `<p role="note">${htmlEscape(copy.warning)}</p><p>${htmlEscape(copy.caution)}</p>` +
    `<table><caption>${htmlEscape(copy.title)}</caption><thead><tr>${header}</tr></thead>` +
    `<tbody>${body}</tbody></table></main></body></html>\n`;
}
export function recoveryJson(document, options = {}) {
  const check = analyzeRecoveryTraces(document, options);
  if (!check.ok) return null;
  return JSON.stringify(check.report, null, 2) + '\n';
}
export function comparisonText(before, after, language = 'en', options = {}) {
  const check = compareRecoveryReleases(before, after, options);
  if (!check.ok) return failureText(check.problems, language);
  const copy = reportCopy(language);
  const lines = [copy.title, copy.warning, `${copy.changes}${newlineColon(language)} ${check.summary.changes}`];
  if (!check.summary.changes) lines.push(copy.noChanges);
  for (const change of check.changes.filter((entry) => entry.kind !== 'unchanged')) {
    lines.push(`${change.id} | ${change.kind} | ${change.before ?? 'UNKNOWN'} | ${change.after ?? 'UNKNOWN'}`);
  }
  return lines.join('\n') + '\n';
}
export function coverageText(document, language = 'en', options = {}) {
  const result = coverageGaps(document, options);
  if (!result.ok) return failureText(result.problems, language);
  const copy = reportCopy(language);
  const lines = [copy.title, copy.warning,
    `${copy.missing}${newlineColon(language)} ${result.gaps.length}`];
  for (const gap of result.gaps) lines.push(`${gap.locale} | ${gap.mode} | ${gap.category} | ${gap.state}`);
  return lines.join('\n') + '\n';
}
export function triageText(document, language = 'en', options = {}) {
  const result = triageRecoveryTraces(document, options);
  if (!result.ok) return failureText(result.problems, language);
  const copy = reportCopy(language);
  const lines = [copy.title, copy.warning];
  for (const task of result.tasks) lines.push(`${copy.task}${newlineColon(language)} ${task.id} | ${task.severity}`);
  return lines.join('\n') + '\n';
}
export function formatRecoveryDocument(document, format = 'text', language = 'en', options = {}) {
  const normalized = format === 'html' ? recoveryHtml(document, language, options) :
    format === 'csv' ? recoveryCsv(document, language, options) :
    format === 'json' ? recoveryJson(document, options) :
    format === 'text' ? recoveryText(document, language, options) : null;
  if (normalized === null) return { ok: false, code: 'EXPORT_INVALID', text: null };
  if (Buffer.byteLength(normalized, 'utf8') > 12_000_000) {
    return { ok: false, code: 'EXPORT_BYTES', text: null };
  }
  return { ok: true, code: null, text: normalized };
}
