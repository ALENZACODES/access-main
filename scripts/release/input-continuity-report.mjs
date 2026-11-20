/** Screen-reader-friendly, deterministic EN/FR manual review exports. */
import { Buffer } from 'node:buffer';
import { analyze, coverage, reviewTasks } from './input-continuity-analysis.mjs';
import { compare } from './input-continuity-delta.mjs';
import { parityReview } from './input-continuity-parity.mjs';

export const COPY = Object.freeze({
 en: Object.freeze({ title: 'Input continuity evidence review', caution: 'Recorded observations only. No unrecorded activity is treated as successful.', session: 'Session', task: 'Task', input: 'Input method', language: 'Language', network: 'Connection', result: 'Recorded result', review: 'Review status', rule: 'Check', source: 'Source', licence: 'Licence', retrieved: 'Retrieved', tier: 'Source review tier', gaps: 'Missing observations', changes: 'Changes', empty: 'No recorded sessions', unknown: 'UNKNOWN', warning: 'Human review is required before any accessibility claim.' }),
 fr: Object.freeze({ title: 'Examen de la continuité des commandes', caution: 'Observations consignées uniquement. Une activité non observée ne constitue pas une réussite.', session: 'Séance', task: 'Tâche', input: 'Mode de commande', language: 'Langue', network: 'Connexion', result: 'Résultat consigné', review: 'État de l’examen', rule: 'Contrôle', source: 'Source', licence: 'Licence', retrieved: 'Consulté', tier: 'Niveau d’examen de la source', gaps: 'Observations manquantes', changes: 'Changements', empty: 'Aucune séance consignée', unknown: 'UNKNOWN', warning: 'Un examen humain est nécessaire avant toute déclaration sur l’accessibilité.' }),
});
export const locale = language => COPY[language === 'fr' ? 'fr' : 'en'];
export const colon = language => language === 'fr' ? '\u00a0:' : ':';
export const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const cleanCell = value => String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('\t', ' ');
export const csvCell = value => {
 const source = cleanCell(value); const neutralized = /^[\s]*[=+@-]/u.test(source) ? `'${source}` : source;
 return `"${neutralized.replaceAll('"', '""')}"`;
};
export const csvRow = values => values.map(csvCell).join(',');
export function rows(report) {
 return report.reviews.flatMap(r => Object.entries(r.rules).map(([rule, state]) => ({ session: r.id, task: r.task, input: r.input, language: r.language, network: r.network, result: r.recorded, state, rule, source: r.provenance.source, licence: r.provenance.licence, retrieved: r.provenance.retrievedOn, tier: r.provenance.tier })));
}
function limited(text) {
 return Buffer.byteLength(text, 'utf8') <= 8_000_000 ? { ok: true, text, issues: [] } : { ok: false, text: null, issues: [{ code: 'OUTPUT_LIMIT', path: '/' }] };
}
export function textReport(document, { language = 'en', today } = {}) {
 const result = analyze(document, { today }); if (!result.ok) return { ok: false, text: null, issues: result.issues };
 const c = locale(language), list = rows(result);
 const lines = [c.title, c.caution, '', `${c.session}${colon(language)} ${result.summary.total}`, `${c.gaps}${colon(language)} ${result.summary.unknownRules}`, ''];
 for (const r of list) lines.push(`${r.session} | ${r.language} | ${r.task} | ${r.input} | ${r.network} | ${r.rule}${colon(language)} ${r.state} | ${c.source}${colon(language)} ${r.source}`);
 if (!list.length) lines.push(c.empty);
 lines.push('', c.warning);
 return limited(`${lines.join('\n')}\n`);
}
export function csvReport(document, { language = 'en', today } = {}) {
 const result = analyze(document, { today }); if (!result.ok) return { ok: false, text: null, issues: result.issues };
 const c = locale(language);
 const header = [c.session, c.task, c.input, c.language, c.network, c.result, c.rule, c.review, c.source, c.licence, c.retrieved, c.tier];
 const records = rows(result).map(row => [row.session, row.task, row.input, row.language, row.network, row.result, row.rule, row.state, row.source, row.licence, row.retrieved, row.tier]);
 return limited(`${[header, ...records].map(csvRow).join('\n')}\n`);
}
export function htmlReport(document, { language = 'en', today } = {}) {
 const result = analyze(document, { today }); if (!result.ok) return { ok: false, text: null, issues: result.issues };
 const c = locale(language), data = rows(result);
 const headers = [c.session, c.task, c.input, c.language, c.network, c.rule, c.review, c.source, c.licence, c.retrieved, c.tier];
 const body = data.map(x => `<tr>${[x.session, x.task, x.input, x.language, x.network, x.rule, x.state, x.source, x.licence, x.retrieved, x.tier].map(y => `<td>${escapeHtml(y)}</td>`).join('')}</tr>`).join('\n');
 const markup = `<!doctype html>\n<html lang="${language === 'fr' ? 'fr' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.title)}</title></head><body><main><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.caution)}</p><p>${escapeHtml(c.gaps)}${colon(language)} ${result.summary.unknownRules}</p><table><caption>${escapeHtml(c.title)}</caption><thead><tr>${headers.map(x => `<th scope="col">${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><p>${escapeHtml(c.warning)}</p></main></body></html>\n`;
 return limited(markup);
}
export function jsonReport(document, { today } = {}) {
 const result = analyze(document, { today }); if (!result.ok) return { ok: false, text: null, issues: result.issues };
 return limited(`${JSON.stringify({ version: 1, result, coverage: coverage(document, [], { today }), parity: parityReview(document, { today }), review: reviewTasks(document, { today }) }, null, 2)}\n`);
}
export function deltaReport(before, after, { language = 'en', format = 'text', today } = {}) {
 const result = compare(before, after, { today }); if (!result.ok) return { ok: false, text: null, issues: result.issues };
 if (format === 'json') return limited(`${JSON.stringify(result, null, 2)}\n`);
 const c = locale(language);
 if (format === 'csv') return limited(`${[csvRow([c.changes, c.session, c.result, c.review]), ...result.changes.map(change => csvRow([change.kind, change.id, `${change.before ?? 'UNKNOWN'} -> ${change.after ?? 'UNKNOWN'}`, change.priority]))].join('\n')}\n`);
 if (format === 'html') {
  const body = result.changes.map(change => `<li>${escapeHtml(change.kind)}${colon(language)} ${escapeHtml(change.id)} (${escapeHtml(change.priority)})</li>`).join('');
  return limited(`<!doctype html><html lang="${language === 'fr' ? 'fr' : 'en'}"><head><meta charset="utf-8"><title>${escapeHtml(c.changes)}</title></head><body><main><h1>${escapeHtml(c.changes)}</h1><ul>${body}</ul><p>${escapeHtml(c.warning)}</p></main></body></html>\n`);
 }
 return limited(`${c.changes}${colon(language)} ${result.summary.total}\n${result.changes.map(x => `${x.kind} | ${x.id} | ${x.priority}`).join('\n')}\n${c.warning}\n`);
}
export function render(document, options = {}) {
 if (options.before) return deltaReport(options.before, document, options);
 switch (options.format) {
  case 'json': return jsonReport(document, options);
  case 'csv': return csvReport(document, options);
  case 'html': return htmlReport(document, options);
  case 'text': return textReport(document, options);
  default: return { ok: false, text: null, issues: [{ code: 'FORMAT', path: '/format' }] };
 }
}
