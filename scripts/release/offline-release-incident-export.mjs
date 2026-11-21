/** Deterministic accessible, offline-only incident review exports. */
import { incidentSummary, inspectIncidentRegister } from './offline-release-incidents.mjs';
import { activeIncidentItems, readinessByScope } from './offline-release-incident-plan.mjs';
import { compareIncidentRegisters } from './offline-release-incident-delta.mjs';

const MESSAGES = Object.freeze({
  en: Object.freeze({
    title: 'Offline release incident review',
    caution: 'Review records do not establish real-world accessibility.',
    empty: 'No incidents recorded.',
    source: 'Source', licence: 'Licence', retrieved: 'Retrieved', tier: 'Source tier',
    status: 'Review status', severity: 'Severity', area: 'Area',
    claimState: 'Claim state', count: 'Incidents', changes: 'Changes',
    noChanges: 'No recorded changes.', unresolved: 'Open review items',
    missing: 'Unknown',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des incidents de publication',
    caution: 'Ces fiches ne confirment pas l’accessibilité réelle.',
    empty: 'Aucun incident enregistré.',
    source: 'Source', licence: 'Licence', retrieved: 'Consulté', tier: 'Niveau de source',
    status: 'Statut d’examen', severity: 'Gravité', area: 'Domaine',
    claimState: 'État de la déclaration', count: 'Incidents', changes: 'Modifications',
    noChanges: 'Aucune modification consignée.', unresolved: 'Fiches à examiner',
    missing: 'UNKNOWN',
  }),
});
function messages(language) { return MESSAGES[language === 'fr' ? 'fr' : 'en']; }
function safeText(value) { return String(value).replace(/[\r\n\t]/gu, ' ').slice(0, 2048); }
function html(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function csv(value) {
  let text = safeText(value);
  if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
function marker(language) { return language === 'fr' ? '\u00A0:' : ':'; }
export function exportSummaryText(register, language = 'en', options = {}) {
  const check = incidentSummary(register, options);
  if (!check.ok) return { ok: false, text: null, problems: check.problems };
  const m = messages(language);
  const mark = marker(language);
  const lines = [m.title, m.caution, `${m.count}${mark} ${check.summary.total}`];
  if (check.summary.total === 0) lines.push(m.empty);
  for (const item of [...register.incidents].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    lines.push(`${item.id} | ${safeText(item.title[language === 'fr' ? 'fr' : 'en'])} | ${item.status} | UNKNOWN`);
    for (const source of [...item.sources].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
      lines.push(`${m.source}${mark} ${source.source}`);
      lines.push(`${m.licence}${mark} ${source.licence}`);
      lines.push(`${m.retrieved}${mark} ${source.retrievedOn}`);
      lines.push(`${m.tier}${mark} ${source.tier}`);
    }
  }
  return { ok: true, text: `${lines.join('\n')}\n`, problems: [] };
}
export function exportIncidentHtml(register, language = 'en', options = {}) {
  const check = inspectIncidentRegister(register, options);
  if (!check.ok) return { ok: false, html: null, problems: check.problems };
  const locale = language === 'fr' ? 'fr' : 'en';
  const m = messages(locale);
  const items = [...register.incidents].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const rows = items.map((item) => {
    const sources = [...item.sources].sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const colon = marker(locale);
    const separator = locale === 'fr' ? '\u202F;' : ';';
    const evidence = sources.map((source) =>
      `<li>${html(m.source)}${colon} <a href="${html(source.source)}">${html(source.id)}</a>${separator} ` +
      `${html(m.licence)}${colon} ${html(source.licence)}${separator} ` +
      `${html(m.retrieved)}${colon} <time datetime="${html(source.retrievedOn)}">${html(source.retrievedOn)}</time>${separator} ` +
      `${html(m.tier)}${colon} ${html(source.tier)}</li>`).join('');
    return `<article aria-labelledby="incident-${html(item.id)}">` +
      `<h2 id="incident-${html(item.id)}">${html(item.title[locale])}</h2>` +
      `<p>${html(item.summary[locale])}</p>` +
      `<dl><dt>${html(m.status)}</dt><dd>${html(item.status)}</dd>` +
      `<dt>${html(m.severity)}</dt><dd>${html(item.severity)}</dd>` +
      `<dt>${html(m.area)}</dt><dd>${html(item.area)}</dd>` +
      `<dt>${html(m.claimState)}</dt><dd>UNKNOWN</dd></dl>` +
      `<h3>${html(m.source)}</h3><ul>${evidence}</ul></article>`;
  }).join('');
  const output = `<!doctype html><html lang="${locale}"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${html(m.title)}</title></head><body><main><h1>${html(m.title)}</h1>` +
    `<p role="note">${html(m.caution)}</p>` +
    (items.length ? rows : `<p>${html(m.empty)}</p>`) + '</main></body></html>\n';
  return { ok: true, html: output, problems: [] };
}
export function exportIncidentCsv(register, language = 'en', options = {}) {
  const checked = inspectIncidentRegister(register, options);
  if (!checked.ok) return { ok: false, csv: null, problems: checked.problems };
  const locale = language === 'fr' ? 'fr' : 'en';
  const columns = ['id', 'area', 'severity', 'status', 'title', 'claimState',
    'source', 'licence', 'retrievedOn', 'tier'];
  const lines = [columns.map(csv).join(',')];
  for (const item of [...register.incidents].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    for (const source of [...item.sources].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
      lines.push([item.id, item.area, item.severity, item.status, item.title[locale],
        'UNKNOWN', source.source, source.licence, source.retrievedOn, source.tier]
        .map(csv).join(','));
    }
  }
  return { ok: true, csv: `${lines.join('\r\n')}\r\n`, problems: [] };
}
export function exportIncidentJson(register, options = {}) {
  const checked = inspectIncidentRegister(register, options);
  if (!checked.ok) return { ok: false, json: null, problems: checked.problems };
  const items = [...register.incidents].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const summary = incidentSummary(register, options).summary;
  return { ok: true, json: `${JSON.stringify({
    format: 'offline-release-incident-report-1', summary,
    items: items.map((item) => ({ id: item.id, title: item.title, area: item.area,
      severity: item.severity, status: item.status, claimState: 'UNKNOWN',
      sources: item.sources.map((source) => ({ ...source })),
    })),
  }, null, 2)}\n`, problems: [] };
}
export function exportWorklistHtml(register, language = 'en', options = {}) {
  const active = activeIncidentItems(register, options);
  const ready = readinessByScope(register, options);
  if (!active.ok || !ready.ok) {
    return { ok: false, html: null, problems: [...active.problems, ...ready.problems] };
  }
  const locale = language === 'fr' ? 'fr' : 'en';
  const m = messages(locale);
  const entries = active.items.map((item) =>
    `<li>${html(item.title[locale])} — ${html(item.severity)} — ${html(item.area)} — UNKNOWN</li>`).join('');
  const output = `<section lang="${locale}" aria-labelledby="review-worklist">` +
    `<h2 id="review-worklist">${html(m.unresolved)}</h2>` +
    `<p>${html(m.caution)}</p><p>${active.items.length}</p>` +
    `<ul>${entries}</ul></section>\n`;
  return { ok: true, html: output, problems: [] };
}
export function exportChangeText(earlier, later, language = 'en', options = {}) {
  const comparison = compareIncidentRegisters(earlier, later, options);
  if (!comparison.ok) return { ok: false, text: null, problems: comparison.problems };
  const m = messages(language);
  const mark = marker(language);
  const lines = [m.title, m.caution, `${m.changes}${mark} ${comparison.changes.length}`];
  if (comparison.changes.length === 0) lines.push(m.noChanges);
  for (const entry of comparison.changes) {
    lines.push(`${entry.id} | ${entry.kind} | UNKNOWN`);
  }
  return { ok: true, text: `${lines.join('\n')}\n`, problems: [] };
}
export function exportBundle(register, language = 'en', options = {}) {
  const text = exportSummaryText(register, language, options);
  const htmlReport = exportIncidentHtml(register, language, options);
  const csvReport = exportIncidentCsv(register, language, options);
  const jsonReport = exportIncidentJson(register, options);
  const problems = [...text.problems, ...htmlReport.problems, ...csvReport.problems,
    ...jsonReport.problems];
  if (problems.length) return { ok: false, files: null, problems };
  return { ok: true, problems: [], files: {
    'incident-review.txt': text.text,
    'incident-review.html': htmlReport.html,
    'incident-review.csv': csvReport.csv,
    'incident-review.json': jsonReport.json,
  } };
}
