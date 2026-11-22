/** Static document-outline review exports. No remote services or executable content. */
import { UNKNOWN } from './document-outline-contract.mjs';
import { reviewManifest } from './document-outline-review.mjs';
import { compareManifest } from './document-outline-delta.mjs';
import { planHumanReview } from './document-outline-policy.mjs';
export const WORDS = Object.freeze({
  en: Object.freeze({ title: 'Documentation navigation review', caution: 'Recorded observations require human review. UNKNOWN stays UNKNOWN.',
    overview: 'Summary', inventory: 'Documents', findings: 'Findings', tasks: 'Manual review tasks', delta: 'Changes',
    doc: 'Document', path: 'Path', lang: 'Language', state: 'State', source: 'Source', licence: 'Licence', date: 'Retrieved on',
    tier: 'Evidence tier', severity: 'Severity', code: 'Reason', line: 'Line', detail: 'Details', noIssues: 'No recorded findings',
    headings: 'Headings', links: 'Links', images: 'Images', tables: 'Tables', action: 'Action', key: 'Review key',
    before: 'Before', after: 'After', added: 'Added findings', resolved: 'No longer present', documentChanges: 'Document changes',
    skip: 'Skip to report', review: 'Review is required before publication', dateReport: 'Report date' }),
  fr: Object.freeze({ title: 'Examen de la navigation documentaire', caution: 'Les observations consignées nécessitent un examen humain. UNKNOWN reste UNKNOWN.',
    overview: 'Résumé', inventory: 'Documents', findings: 'Constats', tasks: 'Tâches d’examen manuel', delta: 'Modifications',
    doc: 'Document', path: 'Chemin', lang: 'Langue', state: 'État', source: 'Source', licence: 'Licence', date: 'Date de récupération',
    tier: 'Niveau de preuve', severity: 'Importance', code: 'Motif', line: 'Ligne', detail: 'Détails', noIssues: 'Aucun constat consigné',
    headings: 'Titres', links: 'Liens', images: 'Images', tables: 'Tableaux', action: 'Action', key: 'Clé d’examen',
    before: 'Avant', after: 'Après', added: 'Nouveaux constats', resolved: 'Constats disparus', documentChanges: 'Modifications des documents',
    skip: 'Accéder au rapport', review: 'Examen requis avant publication', dateReport: 'Date du rapport' }),
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function guardCsv(value) {
  const raw = String(value ?? UNKNOWN);
  const protectedValue = /^[\s]*[=+@-]/u.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}
export function frenchPunctuation(text, lang) {
  if (lang !== 'fr') return text;
  return text.replace(/\s*:/gu, '\u00a0:').replace(/\s*;/gu, '\u202f;')
    .replace(/\s*([!?])/gu, '\u202f$1').replace(/«\s*/gu, '«\u202f').replace(/\s*»/gu, '\u202f»');
}
const table = (heads, rows) => [heads, ...rows].map(cells => cells.map(guardCsv).join(',')).join('\r\n');
export function reportJson(review, delta = null) {
  return JSON.stringify({ schemaVersion: 1, report: review.value, comparison: delta?.ok ? delta.value : null }, null, 2) + '\n';
}
export function reportCsv(review, lang = 'en', delta = null) {
  const w = WORDS[lang];
  const rows = review.value.issues.map(i => [i.path, i.severity, i.code, i.line, i.detail || UNKNOWN]);
  let out = table([w.path, w.severity, w.code, w.line, w.detail], rows) + '\r\n';
  if (delta?.ok) out += '\r\n' + table([w.documentChanges, w.path, w.code], delta.value.documents.map(x => [x.id, x.path, x.kind])) + '\r\n';
  return out;
}
export function reportText(review, lang = 'en', delta = null) {
  const w = WORDS[lang], r = review.value;
  const lines = [w.title, '='.repeat(w.title.length), w.caution, '', `${w.dateReport}: ${r.today}`,
    `${w.inventory}: ${r.documents.length}`, `${w.findings}: ${r.issues.length}`, '', w.findings, '-'.repeat(w.findings.length)];
  if (!r.issues.length) lines.push(w.noIssues);
  for (const issue of r.issues) lines.push(`${issue.path}:${issue.line} ${issue.severity} ${issue.code} ${issue.detail || UNKNOWN}`);
  if (delta?.ok) {
    lines.push('', w.delta, '-'.repeat(w.delta.length));
    for (const item of delta.value.documents) if (item.kind !== 'unchanged') lines.push(`${item.id}: ${item.kind} (${item.fields.join(', ') || UNKNOWN})`);
  }
  return frenchPunctuation(lines.join('\n') + '\n', lang);
}
function htmlTable(heads, rows, id) {
  const tr = cells => `<tr>${cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
  return `<table id="${id}"><thead><tr>${heads.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table>`;
}
export function reportHtml(review, lang = 'en', delta = null) {
  const w = WORDS[lang], r = review.value;
  const rows = r.documents.map(d => [d.path, d.language, d.state, d.headings, d.links, d.source, d.licence, d.retrievedOn, d.tier]);
  const issues = r.issues.map(i => [i.path, i.line, i.severity, i.code, i.detail || UNKNOWN]);
  const tasks = planHumanReview(review).map(t => [t.key, t.severity, t.action]);
  const head = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(w.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:80rem;margin:auto;padding:1rem;line-height:1.6;color:#172b42;background:#fff}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #52657b;padding:.65rem;text-align:left;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #154d88;outline-offset:3px}.skip{display:inline-block;min-height:44px;padding:.5rem}section{margin-block:2rem}@media(max-width:45rem){table{display:block;overflow-x:auto}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body>`;
  const colon = lang === 'fr' ? '\u00a0:' : ':';
  const summary = `<p>${escapeHtml(w.caution)}</p><section aria-labelledby="overview"><h2 id="overview">${escapeHtml(w.overview)}</h2><p>${escapeHtml(w.dateReport)}${colon} ${escapeHtml(r.today)}</p><p>${escapeHtml(w.inventory)}${colon} ${r.documents.length}${lang === 'fr' ? '\u202f;' : ';'} ${escapeHtml(w.findings)}${colon} ${r.issues.length}</p></section>`;
  const docs = `<section aria-labelledby="inventory"><h2 id="inventory">${escapeHtml(w.inventory)}</h2>${htmlTable([w.path,w.lang,w.state,w.headings,w.links,w.source,w.licence,w.date,w.tier], rows, 'documents')}</section>`;
  const problems = `<section aria-labelledby="findings"><h2 id="findings">${escapeHtml(w.findings)}</h2>${issues.length ? htmlTable([w.path,w.line,w.severity,w.code,w.detail],issues,'issues') : `<p>${escapeHtml(w.noIssues)}</p>`}</section>`;
  const reviewTasks = `<section aria-labelledby="tasks"><h2 id="tasks">${escapeHtml(w.tasks)}</h2>${tasks.length ? htmlTable([w.key,w.severity,w.action],tasks,'reviews') : `<p>${escapeHtml(w.noIssues)}</p>`}</section>`;
  const changes = delta?.ok ? `<section aria-labelledby="changes"><h2 id="changes">${escapeHtml(w.delta)}</h2>${htmlTable([w.doc,w.path,w.code],delta.value.documents.map(d=>[d.id,d.path,d.kind]),'delta')}</section>` : '';
  return `${head}<a class="skip" href="#main">${escapeHtml(w.skip)}</a><main id="main"><h1>${escapeHtml(w.title)}</h1>${summary}${docs}${problems}${reviewTasks}${changes}</main></body></html>\n`;
}
export function renderReport(manifest, { language = 'en', format = 'html', today = '2026-11-21', before = null, maxAgeDays = 365 } = {}) {
  if (!Object.hasOwn(WORDS, language) || !['html','json','csv','text'].includes(format)) return { ok: false, errors: [{ code: 'REPORT_OPTIONS' }] };
  const review = reviewManifest(manifest, { today, maxAgeDays });
  if (!review.ok) return review;
  const delta = before === null ? null : compareManifest(before, manifest, { today, maxAgeDays });
  if (delta !== null && !delta.ok) return delta;
  const content = format === 'json' ? reportJson(review, delta) : format === 'csv' ? reportCsv(review, language, delta)
    : format === 'text' ? reportText(review, language, delta) : reportHtml(review, language, delta);
  return { ok: true, content, mime: { html: 'text/html', json: 'application/json', csv: 'text/csv', text: 'text/plain' }[format], review, delta };
}
