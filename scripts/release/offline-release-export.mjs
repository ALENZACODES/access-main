/** Portable, screen-reader-friendly offline release audit summaries. */
import { inspectRelease, fingerprintRelease, problem } from './offline-release-contract.mjs';
import { manifestGraphSummary, offlineRiskRegister, entryPointAnalysis } from './offline-release-graph.mjs';
import { compareRelease, reviewRequiredChanges } from './offline-release-delta.mjs';

const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Offline release evidence', caution: 'This report does not establish real-world accessibility.',
    release: 'Release', sources: 'Sources', assets: 'Assets', claims: 'Claims',
    unknown: 'UNKNOWN', yes: 'YES', no: 'NO', bytes: 'Bytes',
    risks: 'Review findings', issue: 'Issue', path: 'Path',
    kind: 'Kind', count: 'Count', identifier: 'Identifier',
    changeTitle: 'Offline release change review', changeCaution: 'Changes require independent review.',
    changes: 'Changes', review: 'Review required', before: 'Earlier release',
    after: 'Later release', empty: 'No changes in the supplied release manifests.',
    invalid: 'The supplied manifest is not valid.', entryTitle: 'Offline entry points',
    available: 'Structurally available', notAvailable: 'Cannot confirm offline availability',
    sourceNote: 'Source dates and licences identify supplied evidence; they are not endorsements.',
  }),
  fr: Object.freeze({
    title: 'Données de publication hors ligne',
    caution: 'Ce rapport ne confirme pas l’accessibilité réelle.',
    release: 'Publication', sources: 'Sources', assets: 'Ressources', claims: 'Déclarations',
    unknown: 'UNKNOWN', yes: 'YES', no: 'NO', bytes: 'Octets',
    risks: 'Points à examiner', issue: 'Problème', path: 'Chemin',
    kind: 'Type', count: 'Nombre', identifier: 'Identifiant',
    changeTitle: 'Examen des changements hors ligne',
    changeCaution: 'Les changements nécessitent un examen indépendant.',
    changes: 'Changements', review: 'Examen nécessaire', before: 'Publication précédente',
    after: 'Publication suivante', empty: 'Aucun changement dans les manifestes fournis.',
    invalid: 'Le manifeste fourni n’est pas valide.', entryTitle: 'Pages accessibles hors ligne',
    available: 'Disponible selon la structure', notAvailable: 'Disponibilité hors ligne non confirmée',
    sourceNote: 'Les dates et licences décrivent les sources fournies, sans cautionnement.',
  }),
});
const FORMATS = new Set(['text', 'html', 'csv', 'json']);
const LOCALES = new Set(['en', 'fr']);
function asLocale(value) { return LOCALES.has(value) ? value : 'en'; }
function escapeHtml(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function csvCell(value) {
  let text = String(value ?? '').replace(/[\r\n\t]/gu, ' ');
  if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
function csvLine(cells) { return cells.map(csvCell).join(','); }
function textLine(label, value, locale) {
  return `${label}${locale === 'fr' ? '\u00A0:' : ':'} ${value}`;
}
function quoteSafe(value) {
  return String(value).replace(/[\r\n\t]/gu, ' ').slice(0, 512);
}
function htmlDocument(locale, title, contents) {
  return `<!doctype html>\n<html lang="${locale}">\n<head>\n<meta charset="utf-8">\n` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    `<title>${escapeHtml(title)}</title>\n<style>` +
    'body{font-family:system-ui,sans-serif;line-height:1.6;max-width:72ch;margin:0 auto;padding:1rem}' +
    'a:focus-visible{outline:3px solid currentColor;outline-offset:3px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid currentColor;padding:.5rem;text-align:start}' +
    'th{font-weight:700}caption{text-align:start;font-weight:700}' +
    '.scroll{overflow-x:auto}h1,h2{line-height:1.3}</style>\n</head>\n<body>\n' +
    `<main id="main"><h1>${escapeHtml(title)}</h1>${contents}</main>\n</body>\n</html>\n`;
}
function dl(items) {
  return `<dl>${items.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`;
}
function htmlTable(caption, columns, rows) {
  const head = `<thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="scroll" role="region" tabindex="0" aria-label="${escapeHtml(caption)}">` +
    `<table><caption>${escapeHtml(caption)}</caption>${head}${body}</table></div>`;
}
function auditData(document, options) {
  const check = inspectRelease(document, options);
  if (!check.ok) return { ok: false, issues: check.issues, report: null };
  const graph = manifestGraphSummary(document, options);
  const risks = offlineRiskRegister(document, options);
  const entries = entryPointAnalysis(document, options);
  const fingerprint = fingerprintRelease(document, options);
  return { ok: true, issues: [], report: {
    version: 1, releaseId: document.releaseId,
    createdOn: document.createdOn, fingerprint: fingerprint.fingerprint,
    counts: check.summary, graph: graph.summary,
    risks: risks.risks, entryPoints: entries.entries,
    sources: document.sources.map((source) => ({ id: source.id, url: source.url,
      licence: source.licence, retrievedOn: source.retrievedOn, tier: source.tier })),
  } };
}
export function buildReleaseAudit(document, options = {}) { return auditData(document, options); }
export function renderReleaseText(document, locale = 'en', options = {}) {
  const language = asLocale(locale);
  const copy = COPY[language];
  const check = auditData(document, options);
  if (!check.ok) return `${copy.title}\n${copy.invalid}\n${check.issues.map((issue) => issue.code).join('\n')}\n`;
  const report = check.report;
  const lines = [copy.title, copy.caution, copy.sourceNote,
    textLine(copy.release, report.releaseId, language),
    textLine(copy.sources, report.counts.sources, language),
    textLine(copy.assets, report.counts.assets, language),
    textLine(copy.claims, report.counts.claims, language),
    textLine(copy.unknown, report.counts.states.UNKNOWN, language),
    textLine(copy.bytes, report.counts.totalBytes, language),
    textLine(copy.risks, report.risks.length, language)];
  for (const risk of report.risks) lines.push(`${risk.kind} | ${risk.id} | ${quoteSafe(risk.detail)}`);
  for (const entry of report.entryPoints) lines.push(`${entry.id} | ${entry.state}`);
  return lines.join('\n') + '\n';
}
export function renderReleaseHtml(document, locale = 'en', options = {}) {
  const language = asLocale(locale);
  const copy = COPY[language];
  const check = auditData(document, options);
  if (!check.ok) return htmlDocument(language, copy.title,
    `<p role="alert">${escapeHtml(copy.invalid)}</p>` +
    `<ul>${check.issues.map((issue) => `<li>${escapeHtml(issue.code)}</li>`).join('')}</ul>`);
  const report = check.report;
  const summary = dl([[copy.release, report.releaseId], [copy.sources, report.counts.sources],
    [copy.assets, report.counts.assets], [copy.claims, report.counts.claims],
    [copy.unknown, report.counts.states.UNKNOWN], [copy.bytes, report.counts.totalBytes]]);
  const risks = htmlTable(copy.risks, [copy.kind, copy.identifier, copy.path],
    report.risks.map((risk) => [risk.kind, risk.id, risk.detail]));
  const entries = htmlTable(copy.entryTitle, [copy.identifier, copy.path, copy.kind],
    report.entryPoints.map((entry) => [entry.id, entry.path, entry.state]));
  return htmlDocument(language, copy.title,
    `<p>${escapeHtml(copy.caution)}</p><p>${escapeHtml(copy.sourceNote)}</p>` +
    `<section aria-labelledby="counts"><h2 id="counts">${escapeHtml(copy.count)}</h2>${summary}</section>` +
    `<section aria-labelledby="risks"><h2 id="risks">${escapeHtml(copy.risks)}</h2>${risks}</section>` +
    `<section aria-labelledby="entries"><h2 id="entries">${escapeHtml(copy.entryTitle)}</h2>${entries}</section>`);
}
export function renderReleaseCsv(document, locale = 'en', options = {}) {
  const copy = COPY[asLocale(locale)];
  const check = auditData(document, options);
  if (!check.ok) return csvLine([copy.issue, copy.path]) + '\n' +
    check.issues.map((issue) => csvLine([issue.code, issue.path])).join('\n') + '\n';
  const lines = [csvLine([copy.kind, copy.identifier, copy.path])];
  for (const risk of check.report.risks) lines.push(csvLine([risk.kind, risk.id, risk.detail]));
  for (const entry of check.report.entryPoints) lines.push(csvLine(['entry', entry.id, entry.state]));
  return lines.join('\n') + '\n';
}
export function renderReleaseJson(document, options = {}) {
  const check = auditData(document, options);
  return JSON.stringify({ ok: check.ok, issues: check.issues, report: check.report }, null, 2) + '\n';
}
export function renderReleaseReport(document, format = 'text', locale = 'en', options = {}) {
  if (!FORMATS.has(format)) return { ok: false, issues: [problem('FORMAT_INVALID', '/format')], content: null };
  if (!LOCALES.has(locale)) return { ok: false, issues: [problem('LOCALE_INVALID', '/locale')], content: null };
  const check = inspectRelease(document, options);
  if (!check.ok) return { ok: false, issues: check.issues, content: null };
  const renderers = {
    text: () => renderReleaseText(document, locale, options),
    html: () => renderReleaseHtml(document, locale, options),
    csv: () => renderReleaseCsv(document, locale, options),
    json: () => renderReleaseJson(document, options),
  };
  return { ok: true, issues: [], content: renderers[format]() };
}
export function renderDeltaText(before, after, locale = 'en', options = {}) {
  const language = asLocale(locale);
  const copy = COPY[language];
  const check = compareRelease(before, after, options);
  if (!check.ok) return `${copy.changeTitle}\n${copy.invalid}\n` +
    check.issues.map((issue) => issue.code).join('\n') + '\n';
  const review = reviewRequiredChanges(before, after, options);
  const lines = [copy.changeTitle, copy.changeCaution,
    textLine(copy.before, before.releaseId, language),
    textLine(copy.after, after.releaseId, language),
    textLine(copy.changes, check.summary.total, language),
    textLine(copy.review, review.count, language)];
  if (check.changes.length === 0) lines.push(copy.empty);
  for (const change of check.changes) lines.push(`${change.kind} | ${change.id} | ${change.keys.join(',')}`);
  return lines.join('\n') + '\n';
}
export function renderDeltaHtml(before, after, locale = 'en', options = {}) {
  const language = asLocale(locale);
  const copy = COPY[language];
  const check = compareRelease(before, after, options);
  if (!check.ok) return htmlDocument(language, copy.changeTitle,
    `<p role="alert">${escapeHtml(copy.invalid)}</p>`);
  const review = reviewRequiredChanges(before, after, options);
  const summary = dl([[copy.before, before.releaseId], [copy.after, after.releaseId],
    [copy.changes, check.summary.total], [copy.review, review.count]]);
  const table = htmlTable(copy.changes, [copy.kind, copy.identifier, copy.path],
    check.changes.map((change) => [change.kind, change.id, change.keys.join(', ')]));
  return htmlDocument(language, copy.changeTitle,
    `<p>${escapeHtml(copy.changeCaution)}</p>${summary}${table}`);
}
export function renderDeltaCsv(before, after, locale = 'en', options = {}) {
  const copy = COPY[asLocale(locale)];
  const check = compareRelease(before, after, options);
  if (!check.ok) return csvLine([copy.issue, copy.path]) + '\n' +
    check.issues.map((issue) => csvLine([issue.code, issue.path])).join('\n') + '\n';
  return [csvLine([copy.kind, copy.identifier, copy.path]),
    ...check.changes.map((change) => csvLine([change.kind, change.id, change.keys.join(',')]))].join('\n') + '\n';
}
export function renderDeltaJson(before, after, options = {}) {
  const check = compareRelease(before, after, options);
  return JSON.stringify({ version: 1, ok: check.ok, issues: check.issues,
    summary: check.summary, changes: check.changes }, null, 2) + '\n';
}
export function renderDeltaReport(before, after, format = 'text', locale = 'en', options = {}) {
  if (!FORMATS.has(format)) return { ok: false, issues: [problem('FORMAT_INVALID', '/format')], content: null };
  if (!LOCALES.has(locale)) return { ok: false, issues: [problem('LOCALE_INVALID', '/locale')], content: null };
  const check = compareRelease(before, after, options);
  if (!check.ok) return { ok: false, issues: check.issues, content: null };
  const renderers = {
    text: () => renderDeltaText(before, after, locale, options),
    html: () => renderDeltaHtml(before, after, locale, options),
    csv: () => renderDeltaCsv(before, after, locale, options),
    json: () => renderDeltaJson(before, after, options),
  };
  return { ok: true, issues: [], content: renderers[format]() };
}
