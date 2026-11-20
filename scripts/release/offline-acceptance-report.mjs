import { Buffer } from 'node:buffer';
/** Accessible and offline reports of release-check evidence, not certifications. */
import {
  acceptanceSummary, canonicalAcceptanceLedger, acceptanceFingerprint,
} from './offline-acceptance-ledger.mjs';
import { acceptanceCoverage, defaultAcceptancePolicy } from './offline-acceptance-coverage.mjs';
import { compareAcceptanceLedgers } from './offline-acceptance-delta.mjs';

const WORDS = Object.freeze({
  en: Object.freeze({
    title: 'Offline release acceptance review',
    caution: 'Recorded test outcomes are not an accessibility certification.',
    unknown: 'UNKNOWN', source: 'Source', licence: 'Licence', retrieved: 'Retrieved',
    tier: 'Verification tier', route: 'Route', check: 'Check', kind: 'Category',
    state: 'Recorded result', run: 'Test run', digest: 'Artifact SHA-256',
    missing: 'Missing test', fail: 'Recorded failure', pass: 'Recorded pass',
    history: 'Release changes', noChanges: 'No recorded changes',
    issue: 'Validation issue', review: 'Human review required',
    total: 'Total checks', remarks: 'No physical accessibility facts are established.',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des contrôles de publication',
    caution: 'Les résultats consignés ne constituent pas une certification d’accessibilité.',
    unknown: 'UNKNOWN', source: 'Source', licence: 'Licence', retrieved: 'Consulté',
    tier: 'Niveau de contrôle', route: 'Parcours', check: 'Contrôle', kind: 'Catégorie',
    state: 'Résultat consigné', run: 'Essai', digest: 'Empreinte SHA-256',
    missing: 'Contrôle manquant', fail: 'Échec consigné', pass: 'Réussite consignée',
    history: 'Changements de publication', noChanges: 'Aucun changement consigné',
    issue: 'Problème de validation', review: 'Examen humain nécessaire',
    total: 'Total des contrôles', remarks: 'Aucun fait d’accessibilité physique n’est établi.',
  }),
});
const COLUMNS = ['route', 'check', 'kind', 'state', 'source', 'licence', 'retrieved', 'tier', 'run', 'digest'];
const FORMATS = new Set(['text', 'html', 'csv', 'json']);
const MAX_EXPORT_BYTES = 12_000_000;

function locale(value) { return value === 'fr' ? 'fr' : 'en'; }
function words(language) { return WORDS[locale(language)]; }
function colon(lang) { return lang === 'fr' ? '\u00A0:' : ':'; }
function safePlain(value) {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').replace(/\s{2,}/g, ' ');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function csvCell(value) {
  const string = safePlain(value);
  const guarded = /^[\s]*[=+@-]/u.test(string) ? `'${string}` : string;
  return `"${guarded.replace(/"/g, '""')}"`;
}
function normalRows(ledger, language) {
  const lang = locale(language);
  return ledger.routes.flatMap((route) => route.checks.map((check) => ({
    route: `${route.path} (${route.label[lang]})`,
    check: check.label[lang], kind: check.kind, state: check.state,
    source: check.evidence.source, licence: check.evidence.licence,
    retrieved: check.evidence.retrievedOn, tier: check.evidence.tier,
    run: check.evidence.runId, digest: check.evidence.artifactSha256,
    routeId: route.id, checkId: check.id,
  })));
}
function makeFailure(problems) { return { ok: false, problems, text: null, bytes: 0 }; }
function encodeExport(value) {
  const bytes = Buffer.byteLength(value, 'utf8');
  return bytes > MAX_EXPORT_BYTES ? makeFailure([{ code: 'EXPORT_LIMIT', path: '/' }]) :
    { ok: true, problems: [], text: value, bytes };
}

export function acceptanceReportRows(ledger, language = 'en', options = {}) {
  const canonical = canonicalAcceptanceLedger(ledger, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, rows: null };
  const rows = normalRows(canonical.canonical, language);
  rows.sort((a, b) => a.routeId.localeCompare(b.routeId, 'en') ||
    a.checkId.localeCompare(b.checkId, 'en'));
  return { ok: true, problems: [], rows };
}

function renderText(rows, summary, coverage, lang) {
  const m = words(lang);
  const lines = [m.title, m.caution, m.remarks,
    `${m.total}${colon(lang)} ${summary.checks}`,
    `${m.unknown}${colon(lang)} ${summary.states.UNKNOWN}`,
    `${m.missing}${colon(lang)} ${coverage.missingCount}`];
  if (coverage.readyForHumanReview) lines.push(m.review + colon(lang) + ' 0');
  else lines.push(`${m.review}${colon(lang)} ${coverage.missingCount + coverage.failureCount + coverage.unknownCount}`);
  for (const row of rows) {
    lines.push(`${m.route}${colon(lang)} ${safePlain(row.route)}`);
    lines.push(`${m.check}${colon(lang)} ${safePlain(row.check)} | ${row.kind} | ${row.state}`);
    lines.push(`${m.source}${colon(lang)} ${row.source}`);
    lines.push(`${m.licence}${colon(lang)} ${row.licence}`);
    lines.push(`${m.retrieved}${colon(lang)} ${row.retrieved}`);
    lines.push(`${m.tier}${colon(lang)} ${row.tier}`);
    lines.push(`${m.run}${colon(lang)} ${row.run}`);
    lines.push(`${m.digest}${colon(lang)} ${row.digest}`);
  }
  for (const entry of coverage.missing) {
    lines.push(`${m.missing}${colon(lang)} ${entry.routeId ?? 'global'} | ${entry.kind}`);
  }
  return lines.join('\n') + '\n';
}

function renderCsv(rows, lang) {
  const m = words(lang);
  const headings = COLUMNS.map((key) => csvCell(m[key])).join(',');
  const lines = [headings];
  for (const row of rows) lines.push(COLUMNS.map((key) => csvCell(row[key])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function renderHtml(rows, summary, coverage, lang) {
  const m = words(lang);
  const headers = COLUMNS.map((key, i) => `<th scope="col" id="col-${i}">${escapeHtml(m[key])}</th>`).join('');
  const body = rows.map((row) => '<tr>' + COLUMNS.map((key, i) =>
    `<td headers="col-${i}">${escapeHtml(row[key])}</td>`).join('') + '</tr>').join('\n');
  const gaps = coverage.missing.map((entry) => `<li>${escapeHtml(entry.routeId ?? 'global')} / ${escapeHtml(entry.kind)}</li>`).join('');
  return '<!doctype html>\n' +
    `<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(m.title)}</title><style>` +
    ':root{color-scheme:light dark;font-family:system-ui,sans-serif}body{max-width:80rem;margin:auto;padding:1rem;line-height:1.6}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid currentColor;padding:.7rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
    'a:focus-visible{outline:3px solid currentColor;outline-offset:3px}a{min-height:44px;min-width:44px;display:inline-flex;align-items:center}' +
    '.scroll{overflow-x:auto}caption{text-align:left;padding:.5rem;font-weight:700}</style></head><body>' +
    `<a href="#main">${escapeHtml(lang === 'fr' ? 'Aller au contenu principal' : 'Skip to main content')}</a>` +
    `<main id="main" tabindex="-1"><h1>${escapeHtml(m.title)}</h1>` +
    `<p>${escapeHtml(m.caution)}</p><p>${escapeHtml(m.remarks)}</p>` +
    `<section aria-labelledby="summary"><h2 id="summary">${escapeHtml(m.total)}</h2><p>${summary.checks}</p>` +
    `<p>${escapeHtml(m.unknown)}${colon(lang)} ${summary.states.UNKNOWN}</p></section>` +
    `<section aria-labelledby="missing"><h2 id="missing">${escapeHtml(m.missing)}${colon(lang)} ${coverage.missingCount}</h2>` +
    `<ul>${gaps}</ul></section><section aria-labelledby="details"><h2 id="details">${escapeHtml(m.check)}</h2>` +
    `<div class="scroll" role="region" aria-label="${escapeHtml(lang === 'fr' ? 'Tableau des contrôles' : 'Checks table')}" tabindex="0">` +
    `<table><caption>${escapeHtml(m.title)}</caption><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>` +
    '</section></main></body></html>\n';
}

export function renderAcceptanceReport(ledger, format = 'text', language = 'en', options = {}) {
  if (!FORMATS.has(format)) return makeFailure([{ code: 'FORMAT_INVALID', path: '/format' }]);
  if (!['en', 'fr'].includes(language)) return makeFailure([{ code: 'LANG_INVALID', path: '/language' }]);
  const canonical = canonicalAcceptanceLedger(ledger, options);
  if (!canonical.ok) return makeFailure(canonical.problems);
  const summary = acceptanceSummary(canonical.canonical, options);
  const coverage = acceptanceCoverage(canonical.canonical, options.policy ?? defaultAcceptancePolicy(), options);
  if (!summary.ok || !coverage.ok) return makeFailure([...summary.problems, ...coverage.problems]);
  const rows = normalRows(canonical.canonical, language)
    .sort((a, b) => a.routeId.localeCompare(b.routeId, 'en') || a.checkId.localeCompare(b.checkId, 'en'));
  let output;
  if (format === 'json') {
    const fingerprint = acceptanceFingerprint(canonical.canonical, options).fingerprint;
    output = JSON.stringify({ version: 1, fingerprint, capturedOn: ledger.capturedOn,
      summary: summary.summary, coverage: coverage.coverage,
      rows: rows.map(({ routeId, checkId, ...rest }) => ({ routeId, checkId, ...rest })) }, null, 2) + '\n';
  } else if (format === 'csv') output = renderCsv(rows, language);
  else if (format === 'html') output = renderHtml(rows, summary.summary, coverage.coverage, language);
  else output = renderText(rows, summary.summary, coverage.coverage, language);
  return encodeExport(output);
}

export function renderAcceptanceDelta(result, format = 'text', language = 'en') {
  if (!result?.ok || !Array.isArray(result.changes)) return makeFailure([{ code: 'DELTA_INVALID', path: '/' }]);
  if (!FORMATS.has(format) || !['en', 'fr'].includes(language)) {
    return makeFailure([{ code: 'FORMAT_INVALID', path: '/' }]);
  }
  const m = words(language);
  const rows = result.changes.map((entry) => ({
    routeId: entry.routeId, checkId: entry.checkId ?? '',
    kind: entry.kind, priority: entry.priority,
  }));
  if (format === 'json') return encodeExport(JSON.stringify({ version: 1, changes: rows, summary: result.summary }, null, 2) + '\n');
  if (format === 'csv') {
    const cols = ['routeId', 'checkId', 'kind', 'priority'];
    return encodeExport('\uFEFF' + [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n');
  }
  if (format === 'text') return encodeExport([m.history, m.caution,
    ...(rows.length ? rows.map((row) => `${row.routeId}/${row.checkId} ${row.kind} (${row.priority})`) : [m.noChanges])].join('\n') + '\n');
  const rowsHtml = rows.map((row) => `<tr><th scope="row">${escapeHtml(row.routeId)}</th><td>${escapeHtml(row.checkId)}</td><td>${escapeHtml(row.kind)}</td><td>${row.priority}</td></tr>`).join('');
  return encodeExport('<!doctype html>\n' + `<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(m.history)}</title></head>` +
    `<body><main><h1>${escapeHtml(m.history)}</h1><p>${escapeHtml(m.caution)}</p>` +
    `<table><caption>${escapeHtml(m.history)}</caption><thead><tr><th scope="col">Route</th><th scope="col">ID</th><th scope="col">${escapeHtml(m.kind)}</th><th scope="col">Priority</th></tr></thead><tbody>${rowsHtml}</tbody></table>` +
    '</main></body></html>\n');
}

export function supportedAcceptanceFormats() { return [...FORMATS].sort(); }
export function localizedAcceptanceWords(language = 'en') { return { ...words(language) }; }
export function compareAcceptanceReport(before, after, format = 'text', language = 'en', options = {}) {
  const delta = compareAcceptanceLedgers(before, after, options);
  return delta.ok ? renderAcceptanceDelta(delta, format, language) : makeFailure(delta.problems);
}
