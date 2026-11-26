/** Reports display inventory observations, never claims of live availability. */
import { UNKNOWN } from './reference-contract.mjs';
import { queueForReview } from './reference-review.mjs';
export const WORDS = Object.freeze({
  en: { title: 'Outbound reference review', intro: 'Manual inventory only. Link destinations were not opened or independently checked.', count: 'References', date: 'Review date', route: 'Route', english: 'English', french: 'French', unknown: UNKNOWN, findings: 'Review findings', status: 'Recorded status', id: 'Reference ID', category: 'Category', severity: 'Priority', detail: 'Detail', changes: 'Recorded changes', none: 'No findings in this inventory; destinations were not checked.', skip: 'Skip to findings', added: 'Added', removed: 'Removed', modified: 'Modified', before: 'Earlier snapshot', after: 'Later snapshot' },
  fr: { title: 'Examen des liens externes', intro: 'Inventaire manuel uniquement. Les destinations n’ont pas été ouvertes ni contrôlées indépendamment.', count: 'Références', date: 'Date de l’examen', route: 'Parcours', english: 'Anglais', french: 'Français', unknown: UNKNOWN, findings: 'Points à examiner', status: 'État consigné', id: 'Identifiant du lien', category: 'Catégorie', severity: 'Priorité', detail: 'Détail', changes: 'Modifications consignées', none: 'Aucun point dans cet inventaire ; les destinations n’ont pas été contrôlées.', skip: 'Aller aux points à examiner', added: 'Ajouté', removed: 'Supprimé', modified: 'Modifié', before: 'Relevé précédent', after: 'Relevé suivant' },
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function csvCell(value) {
  const string = String(value ?? '');
  const prefix = /^[\t\r\n\s]*[=+@-]/u.test(string) ? "'" : '';
  return `"${(prefix + string).replaceAll('"', '""')}"`;
}
export function rowsForReport(report, delta = null) {
  const rows = [['reference', 'code', 'severity', 'category', 'detail']];
  for (const item of queueForReview(report)) rows.push([item.id, item.code, item.severity, item.category, item.detail]);
  if (delta) for (const change of delta.changes) rows.push([change.id, `CHANGE_${change.kind.toUpperCase()}`, change.classification, 'change', change.fields.join('|')]);
  return rows;
}
export function reportCsv(report, delta = null) { return `${rowsForReport(report, delta).map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`; }
export function reportText(report, { language = 'en', delta = null } = {}) {
  const w = WORDS[language];
  if (!w) throw Error('LANGUAGE');
  const lines = [w.title, w.intro, `${w.date}: ${report.reviewedOn}`, `${w.count}: ${report.total}`, ''];
  for (const route of report.routes) lines.push(`${w.route}: ${route.path} (${w.english}: ${route.english}; ${w.french}: ${route.french}; ${UNKNOWN}: ${route.unknown})`);
  lines.push('', w.findings);
  for (const item of queueForReview(report)) lines.push(`${item.id} | ${item.code} | ${item.severity} | ${item.category}${item.detail ? ` | ${item.detail}` : ''}`);
  if (!report.findings.length) lines.push(w.none);
  if (delta) {
    lines.push('', w.changes, `${w.before}: ${delta.beforeDate}`, `${w.after}: ${delta.afterDate}`);
    for (const change of delta.changes) lines.push(`${change.id} | ${change.kind} | ${change.classification} | ${change.fields.join(',')}`);
  }
  return `${lines.join('\n')}\n`;
}
export function reportHtml(report, { language = 'en', delta = null } = {}) {
  const w = WORDS[language];
  if (!w) throw Error('LANGUAGE');
  const routeRows = report.routes.map(row => `<tr><th scope="row">${escapeHtml(row.path)}</th><td>${row.english}</td><td>${row.french}</td><td>${row.unknown}</td></tr>`).join('');
  const issueRows = queueForReview(report).map(row => `<li><strong>${escapeHtml(row.id)}</strong> — ${escapeHtml(row.code)} (${escapeHtml(row.severity)})${row.detail ? `: ${escapeHtml(row.detail)}` : ''}</li>`).join('');
  const deltaRows = delta ? `<section aria-labelledby="changes"><h2 id="changes">${w.changes}</h2><p>${w.before}: ${escapeHtml(delta.beforeDate)}. ${w.after}: ${escapeHtml(delta.afterDate)}</p><ul>${delta.changes.map(change => `<li>${escapeHtml(change.id)}: ${escapeHtml(change.kind)} — ${escapeHtml(change.classification)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${w.title}</title><style>body{font:1rem/1.55 system-ui,sans-serif;max-width:70rem;margin:0 auto;padding:1rem;color:#172635;background:#fff}a:focus-visible{outline:3px solid #174c80;outline-offset:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #62717d;padding:.7rem;text-align:left}li{margin:.5rem 0}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><a href="#findings">${w.skip}</a><main><h1>${w.title}</h1><p>${w.intro}</p><p>${w.date}: ${escapeHtml(report.reviewedOn)}. ${w.count}: ${report.total}</p><table><caption>${w.route}</caption><thead><tr><th scope="col">${w.route}</th><th scope="col">${w.english}</th><th scope="col">${w.french}</th><th scope="col">${UNKNOWN}</th></tr></thead><tbody>${routeRows}</tbody></table><section id="findings" aria-labelledby="findings-title"><h2 id="findings-title">${w.findings}</h2>${issueRows ? `<ul>${issueRows}</ul>` : `<p>${w.none}</p>`}</section>${deltaRows}</main></body></html>`;
}
export function renderReport(report, { format = 'text', language = 'en', delta = null } = {}) {
  if (!WORDS[language]) throw Error('LANGUAGE');
  if (format === 'text') return reportText(report, { language, delta });
  if (format === 'csv') return reportCsv(report, delta);
  if (format === 'html') return reportHtml(report, { language, delta });
  if (format === 'json') return `${JSON.stringify({ report, delta }, null, 2)}\n`;
  throw Error('FORMAT');
}
