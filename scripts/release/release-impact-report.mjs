/** Bilingual, static exports for evidence about release artifact dependencies. */
import { UNKNOWN } from './release-impact-contract.mjs';
import { graphReview } from './release-impact-graph.mjs';
import { compareManifest } from './release-impact-delta.mjs';
import { planManualTasks, reviewManifest } from './release-impact-policy.mjs';
export const LABELS = Object.freeze({
  en: Object.freeze({
    title: 'Release dependency impact ledger', introduction: 'Manual review of supplied release metadata.',
    caution: 'A manifest is not an accessibility inspection. UNKNOWN remains UNKNOWN.',
    summary: 'Summary', assets: 'Assets', roots: 'Entry points', orphans: 'Unreferenced assets',
    cycles: 'Dependency cycles', unknown: 'UNKNOWN', changed: 'Changed', added: 'Added', removed: 'Removed',
    unchanged: 'Unchanged', source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Evidence tier',
    kind: 'Type', locale: 'Language', path: 'Path', bytes: 'Bytes', digest: 'SHA-256', dependencies: 'Dependencies',
    impact: 'Impacted entries', review: 'Review items', priority: 'Priority', code: 'Reason', noItems: 'No recorded differences',
    date: 'Report date', before: 'Before', after: 'After', totalBytes: 'Total bytes', action: 'Suggested next step',
    compare: 'Before and after comparison', controls: 'Report navigation', records: 'Asset inventory',
  }),
  fr: Object.freeze({
    title: 'Registre des impacts des dépendances de publication', introduction: 'Examen manuel des métadonnées de publication fournies.',
    caution: 'Un manifeste ne constitue pas une inspection de l’accessibilité. UNKNOWN reste UNKNOWN.',
    summary: 'Résumé', assets: 'Ressources', roots: 'Points d’entrée', orphans: 'Ressources sans référence',
    cycles: 'Cycles de dépendances', unknown: 'UNKNOWN', changed: 'Modifié', added: 'Ajouté', removed: 'Supprimé',
    unchanged: 'Inchangé', source: 'Source', licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de preuve',
    kind: 'Type', locale: 'Langue', path: 'Chemin', bytes: 'Octets', digest: 'SHA-256', dependencies: 'Dépendances',
    impact: 'Points d’entrée touchés', review: 'Points à examiner', priority: 'Priorité', code: 'Motif', noItems: 'Aucune différence consignée',
    date: 'Date du rapport', before: 'Avant', after: 'Après', totalBytes: 'Total des octets', action: 'Étape proposée',
    compare: 'Comparaison avant et après', controls: 'Navigation du rapport', records: 'Inventaire des ressources',
  }),
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function csvCell(value) {
  const text = String(value ?? UNKNOWN);
  const guarded = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}
export function localPunctuation(text, language) {
  if (language !== 'fr') return text;
  return text.replace(/\s*:/gu, '\u00a0:').replace(/\s*;/gu, '\u202f;')
    .replace(/\s*([!?])/gu, '\u202f$1').replace(/«\s*/gu, '«\u202f').replace(/\s*»/gu, '\u202f»');
}
export function reportData(after, { before = null, today = '9999-12-31' } = {}) {
  const graph = graphReview(after, { today });
  const policy = reviewManifest(after, { today });
  if (!graph.ok || !policy.ok) return { ok: false, issues: [...(graph.issues ?? []), ...(policy.issues ?? [])] };
  const comparison = before === null ? null : compareManifest(before, after, { today });
  if (comparison !== null && !comparison.ok) return comparison;
  return { ok: true, value: { graph: graph.value, policy: policy.value,
    comparison: comparison?.value ?? null, manifest: after, tasks: planManualTasks(policy) }, issues: [] };
}
export function summaryRows(data) {
  return [
    ['assets', data.manifest.assets.length],
    ['roots', data.graph.roots.length],
    ['orphans', data.graph.orphans.length],
    ['cycles', data.graph.cycles.length],
    ['totalBytes', data.manifest.assets.reduce((n, asset) => n + asset.bytes, 0)],
    ['review', data.policy.issues.length],
  ];
}
export function reportText(data, language = 'en', today = '9999-12-31') {
  const copy = LABELS[language];
  const lines = [copy.title, `${copy.date}: ${today}`, copy.introduction, copy.caution, '', copy.summary];
  for (const [key, value] of summaryRows(data)) lines.push(`${copy[key]}: ${value}`);
  lines.push('', copy.records);
  for (const asset of [...data.manifest.assets].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`${asset.id} | ${asset.path} | ${asset.kind} | ${asset.locale} | ${asset.bytes} | ${asset.tier}`);
    lines.push(`  ${copy.source}: ${asset.source} | ${copy.licence}: ${asset.licence} | ${copy.retrieved}: ${asset.retrievedOn}`);
    lines.push(`  ${copy.dependencies}: ${asset.dependsOn.join(', ') || UNKNOWN}`);
  }
  lines.push('', copy.review);
  for (const row of data.policy.issues) lines.push(`${row.id}: ${row.finding} (${row.priority})`);
  if (data.comparison !== null) {
    lines.push('', copy.compare);
    for (const row of data.comparison.items) lines.push(`${row.id}: ${row.kind} | ${row.impactedEntries.join(', ') || UNKNOWN}`);
  }
  return `${lines.map(row => localPunctuation(row, language)).join('\n')}\n`;
}
export function reportCsv(data, language = 'en') {
  const copy = LABELS[language];
  const header = [copy.path, copy.kind, copy.locale, copy.bytes, copy.digest, copy.source, copy.licence, copy.retrieved, copy.tier, copy.dependencies];
  const rows = [header];
  for (const asset of [...data.manifest.assets].sort((a, b) => a.id.localeCompare(b.id))) rows.push([
    asset.path, asset.kind, asset.locale, asset.bytes, asset.sha256, asset.source, asset.licence,
    asset.retrievedOn, asset.tier, asset.dependsOn.join('|') || UNKNOWN,
  ]);
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
export function reportHtml(data, language = 'en', today = '9999-12-31') {
  const copy = LABELS[language];
  const dl = summaryRows(data).map(([key, value]) => `<dt>${escapeHtml(copy[key])}</dt><dd>${value}</dd>`).join('');
  const records = [...data.manifest.assets].sort((a, b) => a.id.localeCompare(b.id)).map(asset => `
<tr><th scope="row">${escapeHtml(asset.id)}</th><td>${escapeHtml(asset.path)}</td><td>${escapeHtml(asset.kind)}</td>
<td>${escapeHtml(asset.locale)}</td><td>${asset.bytes}</td><td>${escapeHtml(asset.tier)}</td>
<td>${escapeHtml(asset.source)}</td><td>${escapeHtml(asset.licence)}</td><td>${escapeHtml(asset.retrievedOn)}</td></tr>`).join('');
  const reviews = data.policy.issues.map(row => `<li><strong>${escapeHtml(row.id)}</strong> ${escapeHtml(row.finding)} — ${escapeHtml(row.priority)}</li>`).join('');
  const changes = data.comparison === null ? '' : `<section aria-labelledby="changes"><h2 id="changes">${escapeHtml(copy.compare)}</h2>
${data.comparison.items.length ? `<ul>${data.comparison.items.map(row => `<li>${escapeHtml(row.id)} — ${escapeHtml(row.kind)} — ${escapeHtml(row.impactedEntries.join(', ') || UNKNOWN)}</li>`).join('')}</ul>` : `<p>${escapeHtml(copy.noItems)}</p>`}</section>`;
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title>
<style>body{max-width:78rem;margin:auto;padding:1rem;font:1rem/1.55 system-ui,sans-serif}a,button{min-height:44px;min-width:44px;display:inline-flex;align-items:center}a:focus-visible{outline:3px solid currentColor;outline-offset:3px}table{border-collapse:collapse;width:100%}th,td{padding:.65rem;border:1px solid currentColor;text-align:left;vertical-align:top;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.35rem}dd{margin:0}section{margin-block:1.75rem}@media(max-width:650px){table{display:block;overflow-x:auto}}</style></head><body><main>
<h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.introduction)}</p><p>${escapeHtml(copy.caution)}</p><p>${escapeHtml(copy.date)}${language === 'fr' ? '\u00a0:' : ':'} ${escapeHtml(today)}</p>
<nav aria-label="${escapeHtml(copy.controls)}"><a href="#summary">${escapeHtml(copy.summary)}</a> <a href="#records">${escapeHtml(copy.records)}</a> <a href="#review">${escapeHtml(copy.review)}</a></nav>
<section aria-labelledby="summary"><h2 id="summary">${escapeHtml(copy.summary)}</h2><dl>${dl}</dl></section>
<section aria-labelledby="records"><h2 id="records">${escapeHtml(copy.records)}</h2><table><thead><tr><th scope="col">ID</th><th scope="col">${escapeHtml(copy.path)}</th><th scope="col">${escapeHtml(copy.kind)}</th><th scope="col">${escapeHtml(copy.locale)}</th><th scope="col">${escapeHtml(copy.bytes)}</th><th scope="col">${escapeHtml(copy.tier)}</th><th scope="col">${escapeHtml(copy.source)}</th><th scope="col">${escapeHtml(copy.licence)}</th><th scope="col">${escapeHtml(copy.retrieved)}</th></tr></thead><tbody>${records}</tbody></table></section>
<section aria-labelledby="review"><h2 id="review">${escapeHtml(copy.review)}</h2>${reviews ? `<ul>${reviews}</ul>` : `<p>${escapeHtml(copy.noItems)}</p>`}</section>${changes}</main></body></html>\n`;
}
export function reportJson(data) {
  return `${JSON.stringify({ schemaVersion: 1, manifest: data.manifest, graph: data.graph, review: data.policy, comparison: data.comparison,
    tasks: data.tasks, warning: data.policy.warning }, null, 2)}\n`;
}
export function renderReport(after, options = {}) {
  const { before = null, language = 'en', format = 'html', today = '9999-12-31' } = options;
  if (!['en', 'fr'].includes(language) || !['html', 'text', 'csv', 'json'].includes(format)) return { ok: false, issues: [{ code: 'INVALID_OUTPUT_OPTION', path: '$' }] };
  const result = reportData(after, { before, today });
  if (!result.ok) return result;
  const content = format === 'html' ? reportHtml(result.value, language, today) :
    format === 'csv' ? reportCsv(result.value, language) :
      format === 'json' ? reportJson(result.value) : reportText(result.value, language, today);
  return { ok: true, value: { content, format, language, suggestedFile: `release-impact-${today}.${format === 'text' ? 'txt' : format}` }, issues: [] };
}
