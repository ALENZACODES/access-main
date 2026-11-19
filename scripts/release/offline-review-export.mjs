/**
 * Accessible, offline-only review listings. No browser automation, fetching,
 * personal data or claims of accessibility. Exports are human review aids.
 * UNKNOWN is a stable token in every locale and format.
 */
import { queryReviews, groupReviews, reviewAgeSummary } from './offline-review-query.mjs';

export const EXPORT_FORMATS = Object.freeze(['json', 'csv', 'text', 'html']);
export const EXPORT_LANGUAGES = Object.freeze(['en', 'fr']);
const MAX_EXPORT_ROWS = 500;
const LINES = Object.freeze({
  en: Object.freeze({
    title: 'Offline review listing',
    notice: 'Review workflow data only. No claim of real-world accessibility.',
    empty: 'No matching review items.',
    id: 'Review ID', record: 'Record ID', claim: 'Claim',
    status: 'Review status', reason: 'Reason', state: 'Claim state',
    source: 'Source', licence: 'Licence', retrieved: 'Retrieved on',
    tier: 'Source tier', date: 'Created on', history: 'Review events',
    total: 'Total matching items', page: 'Page offset',
    noDecision: 'UNKNOWN remains UNKNOWN.',
  }),
  fr: Object.freeze({
    title: 'Liste des examens hors ligne',
    notice: 'Données sur le processus d’examen seulement. Aucune conclusion sur l’accessibilité réelle.',
    empty: 'Aucune fiche correspondante.',
    id: 'Identifiant d’examen', record: 'Identifiant de la fiche',
    claim: 'Déclaration', status: 'État de l’examen', reason: 'Motif',
    state: 'État de la déclaration', source: 'Source', licence: 'Licence',
    retrieved: 'Consulté le', tier: 'Niveau de la source', date: 'Créé le',
    history: 'Événements d’examen', total: 'Nombre de fiches',
    page: 'Décalage de page', noDecision: 'UNKNOWN reste UNKNOWN.',
  }),
});
const COLUMNS = Object.freeze([
  ['id', 'id'], ['record', 'recordId'], ['claim', 'claimKey'],
  ['status', 'status'], ['reason', 'reason'], ['state', 'state'],
  ['date', 'createdOn'], ['source', 'source'], ['licence', 'licence'],
  ['retrieved', 'retrievedOn'], ['tier', 'tier'], ['history', 'historyCount'],
]);
function problem(code) { return { code, path: '/format' }; }
function localeValue(locale) { return locale === 'fr' ? 'fr' : 'en'; }
function projection(row, key) {
  if (['source', 'licence', 'retrievedOn', 'tier'].includes(key)) return row.provenance[key];
  return row[key];
}
function cellText(value) {
  return String(value ?? '').replace(/[\r\n\t]/gu, ' ');
}
function csvCell(value) {
  let text = cellText(value);
  // Spreadsheet applications can execute formulas even when quoted.
  if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
function escapeHtml(value) {
  return cellText(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function safeJsonEscape(value) {
  return JSON.stringify(value).replace(/</gu, '\\u003c').replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026');
}
function nl(locale) { return locale === 'fr' ? '\u00A0: ' : ': '; }
function textReport(rows, result, locale) {
  const labels = LINES[locale];
  const lines = [labels.title, labels.notice, labels.noDecision,
    `${labels.total}${nl(locale)}${result.total}`,
    `${labels.page}${nl(locale)}${result.page.offset}`];
  if (!rows.length) lines.push(labels.empty);
  for (const row of rows) {
    lines.push('');
    for (const [label, key] of COLUMNS) {
      lines.push(`${labels[label]}${nl(locale)}${cellText(projection(row, key))}`);
    }
    lines.push(`${locale === 'fr' ? 'Libellé' : 'Label'}${nl(locale)}${cellText(row.label[locale])}`);
  }
  return lines.join('\n') + '\n';
}
function csvReport(rows, locale) {
  const labels = LINES[locale];
  const headers = [...COLUMNS.map(([label]) => labels[label]), locale === 'fr' ? 'Libellé' : 'Label'];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push([...COLUMNS.map(([, key]) => projection(row, key)), row.label[locale]].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
function htmlReport(rows, result, locale) {
  const labels = LINES[locale];
  const heads = [...COLUMNS.map(([name]) => labels[name]), locale === 'fr' ? 'Libellé' : 'Label'];
  const header = heads.map((name) => `<th scope="col">${escapeHtml(name)}</th>`).join('');
  const body = rows.map((row) => {
    const values = [...COLUMNS.map(([, key]) => projection(row, key)), row.label[locale]];
    return '<tr>' + values.map((value, index) => index === 0 ?
      `<th scope="row">${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join('') + '</tr>';
  }).join('\n');
  const empty = rows.length ? '' : `<p>${escapeHtml(labels.empty)}</p>`;
  return [
    '<!doctype html>', `<html lang="${locale}">`, '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(labels.title)}</title>`,
    '<style>body{font:1rem/1.6 system-ui,sans-serif;max-width:75rem;margin:auto;padding:1rem}',
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:.6rem;text-align:start}',
    'th{font-weight:700}caption{text-align:start;font-weight:700;padding:.7rem}',
    '.scroll{overflow-x:auto}*:focus-visible{outline:3px solid currentColor;outline-offset:3px}',
    'a,button{min-height:44px;min-width:44px}</style>', '</head>', '<body>',
    '<main id="main">', `<h1>${escapeHtml(labels.title)}</h1>`,
    `<p>${escapeHtml(labels.notice)}</p>`, `<p>${escapeHtml(labels.noDecision)}</p>`,
    `<p>${escapeHtml(labels.total)}${nl(locale)}${result.total}</p>`,
    `<p>${escapeHtml(labels.page)}${nl(locale)}${result.page.offset}</p>`, empty,
    '<div class="scroll" role="region" tabindex="0" aria-label="' +
      escapeHtml(labels.title) + '">', '<table>',
    `<caption>${escapeHtml(labels.title)}</caption>`,
    `<thead><tr>${header}</tr></thead>`, `<tbody>${body}</tbody>`,
    '</table>', '</div>', '</main>', '</body>', '</html>', '',
  ].join('\n');
}

/** Export the selected page only. User consent/storage remain caller concerns. */
export function exportReviewPage(queue, filters = {}, settings = {}, options = {}) {
  const format = settings.format ?? 'text';
  const locale = settings.language ?? 'en';
  const problems = [];
  if (!EXPORT_FORMATS.includes(format)) problems.push(problem('FORMAT_INVALID'));
  if (!EXPORT_LANGUAGES.includes(locale)) problems.push(problem('LANGUAGE_INVALID'));
  if (problems.length) return { ok: false, problems, content: null, mediaType: null };
  const page = queryReviews(queue, filters, options);
  if (!page.ok) return { ok: false, problems: page.problems, content: null, mediaType: null };
  if (page.rows.length > MAX_EXPORT_ROWS) {
    return { ok: false, problems: [problem('EXPORT_LIMIT')], content: null, mediaType: null };
  }
  const rows = page.rows;
  let content;
  let mediaType;
  if (format === 'text') {
    content = textReport(rows, page, locale);
    mediaType = 'text/plain;charset=utf-8';
  } else if (format === 'csv') {
    content = csvReport(rows, locale);
    mediaType = 'text/csv;charset=utf-8';
  } else if (format === 'html') {
    content = htmlReport(rows, page, locale);
    mediaType = 'text/html;charset=utf-8';
  } else {
    content = safeJsonEscape({ version: 1, language: locale, notice: LINES[locale].notice,
      total: page.total, page: page.page, rows }) + '\n';
    mediaType = 'application/json;charset=utf-8';
  }
  return { ok: true, problems: [], content, mediaType, shown: rows.length, total: page.total };
}

/** Group table export never copies record labels or data from raw input. */
export function exportReviewGroups(queue, group, filters = {}, language = 'en', options = {}) {
  if (!EXPORT_LANGUAGES.includes(language)) {
    return { ok: false, problems: [problem('LANGUAGE_INVALID')], content: null };
  }
  const result = groupReviews(queue, group, filters, options);
  if (!result.ok) return { ok: false, problems: result.problems, content: null };
  const heading = language === 'fr' ? 'Groupe,Nombre' : 'Group,Count';
  const lines = [heading, ...result.groups.map((entry) =>
    `${csvCell(entry.key)},${csvCell(entry.count)}`)];
  return { ok: true, problems: [], content: lines.join('\r\n') + '\r\n' };
}

/** Ages are explicitly administrative; they do not assess evidence quality. */
export function exportAgeSummary(queue, asOf, filters = {}, language = 'en', options = {}) {
  if (!EXPORT_LANGUAGES.includes(language)) {
    return { ok: false, problems: [problem('LANGUAGE_INVALID')], content: null };
  }
  const result = reviewAgeSummary(queue, asOf, filters, options);
  if (!result.ok) return { ok: false, problems: result.problems, content: null };
  const title = language === 'fr' ? 'Âge des fiches d’examen' : 'Review item ages';
  const lines = [title, LINES[language].notice, LINES[language].noDecision];
  for (const [key, value] of Object.entries(result.summary)) {
    if (key === 'categories') {
      for (const [category, count] of Object.entries(value)) {
        lines.push(`${category}${nl(language)}${count}`);
      }
    } else lines.push(`${key}${nl(language)}${value ?? 'UNKNOWN'}`);
  }
  return { ok: true, problems: [], content: lines.join('\n') + '\n' };
}

export function exportLabels(language = 'en') {
  return LINES[localeValue(language)];
}
