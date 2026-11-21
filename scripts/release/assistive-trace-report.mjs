/** Deterministic bilingual evidence reports. No network, storage or user data. */
import { Buffer } from 'node:buffer';
import { replayTrace } from './assistive-trace-replay.mjs';
import { coverageCells, coverageGaps, traceWorklist } from './assistive-trace-coverage.mjs';
import { fingerprintTrace } from './assistive-trace-contract.mjs';

export const REPORT_FORMATS = Object.freeze(['text', 'html', 'csv', 'json']);
export const REPORT_LIMIT = 12_000_000;
const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Offline assistive-technology trace review', caution: 'Recorded events do not establish actual browser or device behaviour.',
    language: 'Language', network: 'Connection state', channel: 'Interaction channel', state: 'Recorded outcome',
    count: 'Recorded steps', source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Source review tier',
    missing: 'Missing observation', worklist: 'Human review worklist', issues: 'Review findings',
    empty: 'No captured journeys.', fingerprint: 'Trace SHA-256', unknown: 'UNKNOWN',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des interactions avec les technologies d’assistance',
    caution: 'Les événements consignés ne prouvent pas le comportement réel du navigateur ou de l’appareil.',
    language: 'Langue', network: 'État de connexion', channel: 'Canal d’interaction', state: 'Résultat consigné',
    count: 'Étapes consignées', source: 'Source', licence: 'Licence', retrieved: 'Consulté le', tier: 'Niveau de contrôle de la source',
    missing: 'Observation manquante', worklist: 'Liste d’examen humain', issues: 'Constats à examiner',
    empty: 'Aucun parcours consigné.', fingerprint: 'Empreinte SHA-256', unknown: 'UNKNOWN',
  }),
});
const HEADERS = ['language', 'network', 'channel', 'state', 'count'];

export function reportCopy(locale) { return COPY[locale === 'fr' ? 'fr' : 'en']; }
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function safeCell(value) {
  const raw = String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('\t', ' ');
  const text = /^\s*[=+@-]/u.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}
export function csvRow(cells) { return cells.map(safeCell).join(','); }
export function modelFor(value, options = {}) {
  const replay = replayTrace(value, options);
  if (!replay.ok) return { ok: false, problems: replay.problems, model: null };
  const coverage = coverageCells(value, options);
  const gaps = coverageGaps(value, options);
  const tasks = traceWorklist(value, options);
  const digest = fingerprintTrace(value, options);
  return { ok: true, problems: [], model: {
    status: replay.result.status, journeys: replay.result.journeys,
    findings: replay.result.findings, cells: coverage.cells,
    gaps: gaps.gaps, tasks: tasks.tasks, fingerprint: digest.digest,
    sources: value.sources.map((source) => ({
      id: source.id, title: source.title, url: source.url,
      licence: source.licence, retrievedOn: source.retrievedOn, tier: source.tier,
    })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
  } };
}
export function textReport(value, language = 'en', options = {}) {
  const result = modelFor(value, options);
  const copy = reportCopy(language);
  const colon = language === 'fr' ? '\u00A0:' : ':';
  if (!result.ok) return [copy.title, copy.caution, ...result.problems.map((p) => `${p.code} ${p.path}`)].join('\n');
  const m = result.model;
  const lines = [copy.title, copy.caution, `${copy.state}${colon} ${m.status}`, `${copy.fingerprint}${colon} ${m.fingerprint}`];
  if (m.journeys.length === 0) lines.push(copy.empty);
  for (const item of m.journeys) {
    lines.push(`${item.id} | ${item.locale} | ${item.network} | ${item.state}`);
    for (const step of item.steps) lines.push(`  ${step.id} | ${step.channel} | ${step.state} | ${step.events}`);
  }
  lines.push(`${copy.issues}${colon} ${m.findings.length}`);
  for (const finding of m.findings) lines.push(`${finding.code} ${finding.path}`);
  lines.push(`${copy.worklist}${colon} ${m.tasks.length}`);
  for (const task of m.tasks) lines.push(`${task.locale} | ${task.network} | ${task.channel} | ${task.status}`);
  for (const source of m.sources) {
    lines.push(`${copy.source}${colon} ${source.url}`);
    lines.push(`${copy.licence}${colon} ${source.licence}`);
    lines.push(`${copy.retrieved}${colon} ${source.retrievedOn}`);
    lines.push(`${copy.tier}${colon} ${source.tier}`);
  }
  return lines.join('\n') + '\n';
}
export function csvReport(value, language = 'en', options = {}) {
  const result = modelFor(value, options);
  if (!result.ok) return null;
  const copy = reportCopy(language);
  const lines = [csvRow(HEADERS.map((key) => copy[key]))];
  for (const cell of result.model.cells) lines.push(csvRow([
    cell.locale, cell.network, cell.channel, cell.state, cell.counts.total,
  ]));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
export function htmlReport(value, language = 'en', options = {}) {
  const result = modelFor(value, options);
  if (!result.ok) return null;
  const copy = reportCopy(language);
  const lang = language === 'fr' ? 'fr' : 'en';
  const rows = result.model.cells.map((cell) => `<tr><th scope="row">${escapeHtml(cell.locale)} · ${escapeHtml(cell.network)} · ${escapeHtml(cell.channel)}</th><td>${escapeHtml(cell.state)}</td><td>${cell.counts.total}</td></tr>`).join('');
  const sources = result.model.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${escapeHtml(source.title)}</a> — ${escapeHtml(copy.licence)} ${escapeHtml(source.licence)}, ${escapeHtml(copy.retrieved)} ${escapeHtml(source.retrievedOn)}, ${escapeHtml(copy.tier)} ${escapeHtml(source.tier)}</li>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(copy.title)}</title><style>body{font:1rem/1.5 system-ui,sans-serif;max-width:72rem;margin:auto;padding:1rem}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid;padding:.75rem;text-align:left}button,a{min-height:44px;min-width:44px}</style></head><body><main><h1>${escapeHtml(copy.title)}</h1><p role="note">${escapeHtml(copy.caution)}</p><p>${escapeHtml(copy.state)}${lang === 'fr' ? '\u00A0:' : ':'} ${result.model.status}</p><table><caption>${escapeHtml(copy.worklist)}</caption><thead><tr><th scope="col">${escapeHtml(copy.channel)}</th><th scope="col">${escapeHtml(copy.state)}</th><th scope="col">${escapeHtml(copy.count)}</th></tr></thead><tbody>${rows}</tbody></table><h2>${escapeHtml(copy.source)}</h2><ul>${sources}</ul></main></body></html>`;
}
export function jsonReport(value, options = {}) {
  const result = modelFor(value, options);
  return result.ok ? JSON.stringify(result.model, null, 2) + '\n' : null;
}
export function exportReport(value, format = 'text', language = 'en', options = {}) {
  if (!REPORT_FORMATS.includes(format)) return { ok: false, problems: [{ code: 'FORMAT_INVALID', path: '/format' }], content: null };
  const model = modelFor(value, options);
  if (!model.ok) return { ok: false, problems: model.problems, content: null };
  const content = { text: () => textReport(value, language, options),
    html: () => htmlReport(value, language, options),
    csv: () => csvReport(value, language, options),
    json: () => jsonReport(value, options) }[format]();
  if (Buffer.byteLength(content, 'utf8') > REPORT_LIMIT) return { ok: false, problems: [{ code: 'REPORT_LIMIT', path: '/' }], content: null };
  return { ok: true, problems: [], content };
}
