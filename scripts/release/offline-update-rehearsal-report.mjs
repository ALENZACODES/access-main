/** Accessible, bilingual, data-only reports. Never execute supplied HTML. */
import { Buffer } from 'node:buffer';
import { releaseReview, phaseCoverage, nextManualReviews } from './offline-update-rehearsal-engine.mjs';
import { compareRehearsals } from './offline-update-rehearsal-compare.mjs';
import { RESULTS } from './offline-update-rehearsal-contract.mjs';

export const REPORT_FORMATS = Object.freeze(['text', 'html', 'csv', 'json']);
const FORMAT_SET = new Set(REPORT_FORMATS);
const MAX_OUTPUT = 10_000_000;
export const REPORT_WORDS = Object.freeze({
  en: Object.freeze({
    title: 'Offline update rehearsal review',
    caution: 'Recorded outcomes do not establish accessibility or browser operation.',
    summary: 'Recorded summary', sessions: 'Sessions', assets: 'Assets',
    state: 'Recorded outcome', outcome: 'Supplied result', phase: 'Phase',
    language: 'Language', network: 'Network', identifier: 'Record ID',
    rule: 'Review rule', finding: 'Review finding', path: 'Field path',
    source: 'Source', licence: 'Licence', retrieved: 'Retrieved on',
    tier: 'Source review tier', missing: 'Missing coverage',
    review: 'Human review needed', changes: 'Release differences',
    previous: 'Previous', next: 'Next', unchanged: 'No recorded changes',
    unknown: 'UNKNOWN', count: 'Count', note: 'No physical-place facts were inferred.',
    affected: 'Assets requiring review', evidence: 'Event digest',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne d’une répétition de mise à jour',
    caution: 'Les résultats consignés ne confirment ni l’accessibilité ni le fonctionnement du navigateur.',
    summary: 'Résumé des résultats', sessions: 'Séances', assets: 'Fichiers',
    state: 'Résultat consigné', outcome: 'Résultat fourni', phase: 'Étape',
    language: 'Langue', network: 'Réseau', identifier: 'Identifiant',
    rule: 'Règle d’examen', finding: 'Point à examiner', path: 'Emplacement',
    source: 'Source', licence: 'Licence', retrieved: 'Consulté le',
    tier: 'Niveau de contrôle de la source', missing: 'Couverture manquante',
    review: 'Examen humain nécessaire', changes: 'Différences entre publications',
    previous: 'Avant', next: 'Après', unchanged: 'Aucun changement consigné',
    unknown: 'UNKNOWN', count: 'Nombre', note: 'Aucun fait sur des lieux réels n’a été déduit.',
    affected: 'Fichiers à examiner', evidence: 'Empreinte des événements',
  }),
});
export function locale(value) { return value === 'fr' ? 'fr' : 'en'; }
export function copy(value) { return REPORT_WORDS[locale(value)]; }
export function colon(lang) { return locale(lang) === 'fr' ? '\u00A0:' : ':'; }
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function safeCell(value) {
  const flattened = String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('\t', ' ');
  const guarded = /^[\s]*[=+@-]/u.test(flattened) ? `'${flattened}` : flattened;
  return `"${guarded.replace(/"/g, '""')}"`;
}
export function csvRow(values) { return values.map(safeCell).join(','); }
export function reportRows(document, options = {}) {
  const report = releaseReview(document, options);
  if (!report.ok) return { ok: false, problems: report.problems, rows: [] };
  const rows = report.sessions.map(session => ({
    id: session.id, phase: session.phase, locale: session.locale,
    network: session.network, state: session.state, recorded: session.recorded,
    source: session.evidence.source, licence: session.evidence.licence,
    retrievedOn: session.evidence.retrievedOn, tier: session.evidence.tier,
    digest: session.digest, findings: session.findings.length,
  }));
  return { ok: true, problems: [], rows };
}
export function exportModel(document, options = {}) {
  const report = releaseReview(document, options);
  if (!report.ok) return { ok: false, problems: report.problems, model: null };
  const coverage = phaseCoverage(document, options);
  const manual = nextManualReviews(document, options);
  const rows = reportRows(document, options);
  return { ok: true, problems: [], model: {
    version: 1, summary: report.summary, fingerprint: report.fingerprint,
    rows: rows.rows, coverage: coverage.rows, work: manual.work,
    findings: report.findings.map(item => ({ code: item.code, path: item.path, severity: item.severity })),
    caution: REPORT_WORDS.en.caution,
  } };
}
export function textReport(document, language = 'en', options = {}) {
  const words = copy(language);
  const result = exportModel(document, options);
  if (!result.ok) return `${words.title}\n${words.caution}\n${result.problems.map(p => p.code).join('\n')}`;
  const { model } = result;
  const sep = colon(language);
  const lines = [words.title, words.caution, `${words.sessions}${sep} ${model.summary.sessions}`,
    `${words.assets}${sep} ${model.summary.assets}`, `${words.state}${sep} ${model.summary.state}`];
  for (const row of model.rows) {
    lines.push(`${words.identifier}${sep} ${row.id} | ${words.phase}${sep} ${row.phase}`);
    lines.push(`${words.language}${sep} ${row.locale} | ${words.network}${sep} ${row.network}`);
    lines.push(`${words.state}${sep} ${row.state} | ${words.evidence}${sep} ${row.digest}`);
    lines.push(`${words.source}${sep} ${row.source} | ${words.licence}${sep} ${row.licence}`);
    lines.push(`${words.retrieved}${sep} ${row.retrievedOn} | ${words.tier}${sep} ${row.tier}`);
  }
  for (const entry of model.coverage.filter(item => item.state === 'UNKNOWN')) {
    lines.push(`${words.missing}${sep} ${entry.phase} | ${entry.locale} | ${entry.network} | UNKNOWN`);
  }
  lines.push(words.note);
  return lines.join('\n') + '\n';
}
export function csvReport(document, language = 'en', options = {}) {
  const result = reportRows(document, options);
  if (!result.ok) return null;
  const w = copy(language);
  const header = [w.identifier, w.phase, w.language, w.network, w.state, w.outcome,
    w.source, w.licence, w.retrieved, w.tier, w.evidence, w.finding];
  const rows = result.rows.map(row => [row.id, row.phase, row.locale, row.network,
    row.state, row.recorded, row.source, row.licence, row.retrievedOn,
    row.tier, row.digest, row.findings]);
  return [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}
export function htmlReport(document, language = 'en', options = {}) {
  const w = copy(language);
  const result = exportModel(document, options);
  const lang = locale(language);
  if (!result.ok) return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>${escapeHtml(w.title)}</title><main><h1>${escapeHtml(w.title)}</h1><p role="alert">${escapeHtml(w.caution)}</p></main></html>`;
  const { model } = result;
  const header = [w.identifier, w.phase, w.language, w.network, w.state, w.source,
    w.licence, w.retrieved, w.tier];
  const cells = model.rows.map(row => `<tr>${[row.id, row.phase, row.locale, row.network,
    row.state, row.source, row.licence, row.retrievedOn, row.tier]
    .map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  const missing = model.coverage.filter(item => item.state === 'UNKNOWN');
  const missingItems = missing.map(item => `<li>${escapeHtml(item.phase)} | ${item.locale} | ${item.network} | UNKNOWN</li>`).join('');
  const findings = model.findings.map(item => `<li>${escapeHtml(item.code)} | ${escapeHtml(item.path)}</li>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(w.title)}</title><style>body{max-width:75rem;margin:auto;padding:1.5rem;font:1rem/1.5 system-ui}a:focus-visible,button:focus-visible{outline:3px solid currentColor;outline-offset:3px}table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:.65rem;text-align:start}button{min-width:44px;min-height:44px}.scroll{overflow-x:auto}</style></head><body><main><h1>${escapeHtml(w.title)}</h1><p role="note">${escapeHtml(w.caution)}</p><section aria-labelledby="summary"><h2 id="summary">${escapeHtml(w.summary)}</h2><p>${escapeHtml(w.sessions)}${colon(lang)} ${model.summary.sessions}</p><p>${escapeHtml(w.assets)}${colon(lang)} ${model.summary.assets}</p></section><section aria-labelledby="entries"><h2 id="entries">${escapeHtml(w.sessions)}</h2><div class="scroll"><table><caption>${escapeHtml(w.summary)}</caption><thead><tr>${header.map(label => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div></section><section aria-labelledby="missing"><h2 id="missing">${escapeHtml(w.missing)}</h2><ul>${missingItems}</ul></section><section aria-labelledby="findings"><h2 id="findings">${escapeHtml(w.review)}</h2><ul>${findings}</ul></section><p>${escapeHtml(w.note)}</p></main></body></html>`;
}
export function jsonReport(document, options = {}) {
  const result = exportModel(document, options);
  if (!result.ok) return null;
  return JSON.stringify(result.model, null, 2) + '\n';
}
export function changeReport(previous, next, language = 'en', options = {}) {
  const comparison = compareRehearsals(previous, next, options);
  const w = copy(language);
  if (!comparison.ok) return { ok: false, problems: comparison.problems, text: null };
  const lines = [w.title, w.caution, w.changes];
  const mark = colon(language);
  if (comparison.changes.length === 0) lines.push(w.unchanged);
  for (const item of comparison.changes) {
    lines.push(`${item.kind} | ${item.id} | ${w.previous}${mark} ${JSON.stringify(item.previous)} | ${w.next}${mark} ${JSON.stringify(item.next)}`);
  }
  lines.push(`${w.affected}${mark} ${comparison.affected.length}`);
  lines.push(w.note);
  return { ok: true, problems: [], text: lines.join('\n') + '\n' };
}
export function renderReport(document, format = 'text', language = 'en', options = {}) {
  if (!FORMAT_SET.has(format)) return { ok: false, problems: [{ code: 'FORMAT_INVALID', path: '/format' }], text: null, bytes: 0 };
  const model = exportModel(document, options);
  if (!model.ok) return { ok: false, problems: model.problems, text: null, bytes: 0 };
  const text = format === 'text' ? textReport(document, language, options) :
    format === 'csv' ? csvReport(document, language, options) :
    format === 'html' ? htmlReport(document, language, options) : jsonReport(document, options);
  if (text === null) return { ok: false, problems: [{ code: 'REPORT_INVALID', path: '/' }], text: null, bytes: 0 };
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_OUTPUT) return { ok: false, problems: [{ code: 'OUTPUT_LIMIT', path: '/' }], text: null, bytes: 0 };
  return { ok: true, problems: [], text, bytes };
}
export function localizedHeaders(language = 'en') {
  const w = copy(language);
  return [w.identifier, w.phase, w.language, w.network, w.state, w.outcome,
    w.source, w.licence, w.retrieved, w.tier, w.evidence, w.finding];
}
export function statesAreStable() { return RESULTS.includes('UNKNOWN') && REPORT_WORDS.fr.unknown === 'UNKNOWN'; }
