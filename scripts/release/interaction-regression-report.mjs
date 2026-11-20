/** Localised read-only reports for recorded accessibility regression evidence. */
import { Buffer } from 'node:buffer';
import { compareRegressionSnapshots, reviewQueue, regressionGate } from './interaction-regression-compare.mjs';
import { analyzeCoverage, reviewMissingCoverage } from './interaction-regression-coverage.mjs';

const WORDS = Object.freeze({
  en: Object.freeze({
    title: 'Offline accessibility regression review',
    caution: 'Recorded results do not establish real-world accessibility.',
    unknown: 'UNKNOWN', route: 'Route', locale: 'Language', network: 'Network',
    storage: 'Storage', viewport: 'Viewport', category: 'Check category',
    check: 'Check', before: 'Previous', after: 'Current', kind: 'Change',
    severity: 'Review priority', action: 'Review action', source: 'Source',
    licence: 'Licence', retrieved: 'Retrieved on', tier: 'Source review tier',
    total: 'Recorded differences', block: 'Blocking changes',
    review: 'Changes for human review', missing: 'Missing records',
    noChanges: 'No recorded differences', invalid: 'Invalid input',
    coverage: 'Recorded coverage', recorded: 'Recorded', absent: 'Absent',
    release: 'Manual release review',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des écarts d’accessibilité',
    caution: 'Les résultats consignés ne prouvent pas l’accessibilité réelle.',
    unknown: 'UNKNOWN', route: 'Parcours', locale: 'Langue', network: 'Réseau',
    storage: 'Stockage', viewport: 'Fenêtre', category: 'Catégorie de contrôle',
    check: 'Contrôle', before: 'Avant', after: 'Après', kind: 'Changement',
    severity: 'Priorité d’examen', action: 'Action d’examen', source: 'Source',
    licence: 'Licence', retrieved: 'Consulté le', tier: 'Niveau de contrôle de la source',
    total: 'Écarts consignés', block: 'Changements bloquants',
    review: 'Changements à examiner', missing: 'Données manquantes',
    noChanges: 'Aucun écart consigné', invalid: 'Entrée non valide',
    coverage: 'Couverture consignée', recorded: 'Consigné', absent: 'Absent',
    release: 'Examen manuel de la publication',
  }),
});
const REPORT_FORMATS = new Set(['text', 'html', 'csv', 'json']);
const REPORT_MAX_BYTES = 12_000_000;

export function locale(value) { return value === 'fr' ? 'fr' : 'en'; }
export function reportWords(language) { return WORDS[locale(language)]; }
export function colon(language) { return locale(language) === 'fr' ? '\u00a0:' : ':'; }

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

export function textCell(value) {
  return String(value ?? 'UNKNOWN').replaceAll('\r', ' ').replaceAll('\n', ' ')
    .replaceAll('\t', ' ').replace(/ {2,}/gu, ' ').trim();
}

export function csvCell(value) {
  const plain = textCell(value);
  const safe = /^\s*[=+@-]/u.test(plain) ? `'${plain}` : plain;
  return `"${safe.replace(/"/gu, '""')}"`;
}

export function csvLine(values) {
  return values.map(csvCell).join(',');
}

export function dimension(viewport) {
  return `${viewport.width}×${viewport.height}`;
}

export function comparisonRows(comparison) {
  if (!comparison?.ok) return [];
  return comparison.changes.map((change) => ({
    route: change.route,
    locale: change.locale,
    network: change.network,
    storage: change.storage,
    viewport: dimension(change.viewport),
    category: change.category,
    check: change.checkId,
    before: change.before?.outcome ?? 'UNKNOWN',
    after: change.after?.outcome ?? 'UNKNOWN',
    kind: change.kind,
    severity: change.severity,
    action: change.action,
    source: change.after?.source ?? change.before?.source ?? 'UNKNOWN',
    licence: change.after?.licence ?? change.before?.licence ?? 'UNKNOWN',
    retrieved: change.after?.retrievedOn ?? change.before?.retrievedOn ?? 'UNKNOWN',
    tier: change.after?.tier ?? change.before?.tier ?? 'UNKNOWN',
  }));
}

export function coverageRows(coverage) {
  if (!coverage?.ok) return [];
  return coverage.rows.map((row) => ({
    route: row.route, locale: row.locale,
    network: row.network, storage: row.storage,
    viewport: dimension(row.viewport), category: row.category,
    check: row.recorded ? 'recorded' : 'UNKNOWN',
    before: 'UNKNOWN', after: row.outcome, kind: row.reason,
    severity: row.outcome === 'FAIL' ? 'block' : 'review',
    action: row.recorded ? 'Review recorded result' : 'Capture missing evidence',
    source: 'UNKNOWN', licence: 'UNKNOWN', retrieved: 'UNKNOWN', tier: 'UNKNOWN',
  }));
}

export const REPORT_COLUMNS = Object.freeze([
  'route', 'locale', 'network', 'storage', 'viewport', 'category',
  'check', 'before', 'after', 'kind', 'severity', 'action',
  'source', 'licence', 'retrieved', 'tier',
]);

export function invalidReport(result, language) {
  const word = reportWords(language);
  return `${word.title}\n${word.invalid}\n${word.caution}\n` +
    (result?.issues ?? result?.problems ?? []).map((issue) =>
      `${issue.code} ${issue.path}`).join('\n');
}

export function reportModel(comparison, coverage = null, language = 'en') {
  if (!comparison?.ok || coverage !== null && !coverage.ok) {
    return { ok: false, rows: [], summary: null,
      issues: comparison?.ok === false ? comparison.issues : coverage?.problems ?? [] };
  }
  const rows = [...comparisonRows(comparison), ...coverageRows(coverage)];
  const status = regressionGate(comparison);
  const pending = reviewQueue(comparison);
  return {
    ok: true,
    issues: [], rows,
    summary: {
      changes: comparison.summary.total,
      blocks: comparison.summary.blocks,
      reviews: comparison.summary.reviews,
      coverageMissing: coverage?.summary?.absent ?? 0,
      releaseStatus: status.status,
      releaseReasons: status.reasons,
      reviewItems: pending.items.length,
      language: locale(language),
    },
  };
}

export function textReport(comparison, coverage = null, language = 'en') {
  const model = reportModel(comparison, coverage, language);
  if (!model.ok) return invalidReport(comparison, language);
  const w = reportWords(language);
  const sep = colon(language);
  const lines = [w.title, w.caution,
    `${w.total}${sep} ${model.summary.changes}`,
    `${w.block}${sep} ${model.summary.blocks}`,
    `${w.review}${sep} ${model.summary.reviews}`,
    `${w.missing}${sep} ${model.summary.coverageMissing}`,
    `${w.release}${sep} ${model.summary.releaseStatus}`];
  if (model.rows.length === 0) lines.push(w.noChanges);
  for (const row of model.rows) {
    lines.push(`${row.route} | ${row.locale} | ${row.category} | ${row.check}`);
    lines.push(`${w.before}${sep} ${textCell(row.before)} | ${w.after}${sep} ${textCell(row.after)}`);
    lines.push(`${w.kind}${sep} ${textCell(row.kind)} | ${w.severity}${sep} ${textCell(row.severity)}`);
    lines.push(`${w.source}${sep} ${textCell(row.source)} | ${w.licence}${sep} ${textCell(row.licence)}`);
    lines.push(`${w.retrieved}${sep} ${textCell(row.retrieved)} | ${w.tier}${sep} ${textCell(row.tier)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function csvReport(comparison, coverage = null, language = 'en') {
  const model = reportModel(comparison, coverage, language);
  if (!model.ok) return invalidReport(comparison, language);
  const w = reportWords(language);
  const lines = [csvLine(REPORT_COLUMNS.map((key) => w[key]))];
  for (const row of model.rows) lines.push(csvLine(REPORT_COLUMNS.map((key) => row[key])));
  return `${lines.join('\n')}\n`;
}

export function htmlReport(comparison, coverage = null, language = 'en') {
  const model = reportModel(comparison, coverage, language);
  const w = reportWords(language);
  const lang = locale(language);
  const columns = REPORT_COLUMNS;
  const heading = columns.map((key) => `<th scope="col">${escapeHtml(w[key])}</th>`).join('');
  const rows = model.ok ? model.rows.map((row) => `<tr>${columns.map((key) =>
    `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('') : '';
  const issueText = model.ok ? '' : `<p role="alert">${escapeHtml(invalidReport(comparison, language))}</p>`;
  return `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(w.title)}</title>\n<style>` +
    'body{font-family:system-ui,sans-serif;line-height:1.5;margin:1rem;max-width:100%}' +
    ':focus-visible{outline:3px solid currentColor;outline-offset:3px}' +
    '.overflow{overflow-x:auto;max-width:100%}' +
    'table{border-collapse:collapse}th,td{border:1px solid currentColor;padding:.75rem;text-align:start}' +
    'caption{text-align:start;font-weight:bold;padding:.5rem}p{max-width:75ch}' +
    '</style>\n</head>\n<body>\n<main>' +
    `<h1>${escapeHtml(w.title)}</h1><p role="note">${escapeHtml(w.caution)}</p>` +
    issueText + `<section aria-labelledby="review-heading"><h2 id="review-heading">${escapeHtml(w.review)}</h2>` +
    `<div class="overflow"><table><caption>${escapeHtml(w.total)}</caption><thead><tr>${heading}</tr></thead>` +
    `<tbody>${rows}</tbody></table></div></section></main>\n</body></html>\n`;
}

export function jsonReport(comparison, coverage = null, language = 'en') {
  const model = reportModel(comparison, coverage, language);
  return `${JSON.stringify(model, null, 2)}\n`;
}

export function reportByFormat(comparison, coverage = null, options = {}) {
  const format = options.format ?? 'text';
  if (!REPORT_FORMATS.has(format)) return { ok: false, issues: [{ code: 'FORMAT_INVALID', path: '/format' }], text: null };
  if (!comparison?.ok || coverage !== null && !coverage?.ok) {
    return { ok: false, issues: comparison?.ok === false ? comparison.issues : coverage?.problems ?? [], text: null };
  }
  const language = locale(options.language);
  const text = ({ text: textReport, csv: csvReport, html: htmlReport,
    json: jsonReport })[format](comparison, coverage, language);
  if (Buffer.byteLength(text, 'utf8') > REPORT_MAX_BYTES) {
    return { ok: false, issues: [{ code: 'REPORT_BYTES', path: '/' }], text: null };
  }
  return { ok: true, issues: [], text };
}

export function reportCoverageTasks(coverage) {
  return reviewMissingCoverage(coverage).map((row) => ({
    route: row.route, locale: row.locale,
    category: row.category, status: row.outcome,
    action: row.action,
  }));
}

export function reportHasEnglishAndFrenchHeaders() {
  return REPORT_COLUMNS.every((key) =>
    typeof WORDS.en[key] === 'string' && typeof WORDS.fr[key] === 'string');
}
