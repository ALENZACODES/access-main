/** Standalone bilingual exports of validated offline interaction evidence. */
import { analyze } from './interaction-evidence-analysis.mjs';
import { compare } from './interaction-evidence-delta.mjs';
import { UNKNOWN } from './interaction-evidence-contract.mjs';
export const WORDS = Object.freeze({
  en: { title: 'Offline interaction evidence review', intro: 'Only manually recorded checks are shown. This report does not establish that any route or place is accessible.',
    captured: 'Recorded on', route: 'Route', language: 'Language', checks: 'Checks', results: 'Results', review: 'Review flags',
    kind: 'Check type', status: 'Recorded result', source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Evidence tier',
    path: 'Path', id: 'Check identifier', none: 'None recorded', changes: 'Changes since earlier snapshot',
    regression: 'Recorded regressions', improvement: 'Recorded improvements', missing: 'Missing evidence',
    warning: 'UNKNOWN remains UNKNOWN. Confirm the evidence independently before relying on it.',
    difference: 'Changed fields', old: 'Earlier', current: 'Current', noComparison: 'No earlier snapshot supplied',
    skip: 'Skip to report', summary: 'Summary', flags: 'Review items', conflict: 'Contradictory observations',
  },
  fr: { title: 'Examen hors ligne des preuves d’interaction', intro: 'Seuls les contrôles consignés manuellement sont affichés. Ce rapport ne prouve l’accessibilité d’aucun parcours ni lieu.',
    captured: 'Date de saisie', route: 'Parcours', language: 'Langue', checks: 'Contrôles', results: 'Résultats', review: 'Points à examiner',
    kind: 'Type de contrôle', status: 'Résultat consigné', source: 'Source', licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de preuve',
    path: 'Chemin', id: 'Identifiant du contrôle', none: 'Aucun élément consigné', changes: 'Modifications depuis l’état précédent',
    regression: 'Régressions consignées', improvement: 'Améliorations consignées', missing: 'Preuves manquantes',
    warning: 'UNKNOWN reste UNKNOWN. Examinez les preuves indépendamment avant de les utiliser.',
    difference: 'Champs modifiés', old: 'Précédent', current: 'Actuel', noComparison: 'Aucun état précédent fourni',
    skip: 'Passer au rapport', summary: 'Résumé', flags: 'Points à examiner', conflict: 'Observations contradictoires',
  },
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function display(value) { return value === undefined || value === null || value === 'unknown' ? UNKNOWN : String(value); }
export function localPunctuation(lang) { return lang === 'fr' ? { colon: '\u00a0:', semicolon: '\u202f; ' } : { colon: ':', semicolon: '; ' }; }
export function serialized(report, delta, lang, day) {
  return { title: WORDS[lang].title, language: lang, date: day, counts: report.counts, byKind: report.byKind,
    byLanguage: report.byLanguage, observations: report.observations.map(row => ({ ...row, verificationTier: display(row.verificationTier) })),
    reviews: report.reviews, missing: report.missing, conflicts: report.conflicts, comparison: delta,
    caution: WORDS[lang].warning };
}
export function reportText(report, delta, lang, day) {
  const w = WORDS[lang], p = localPunctuation(lang);
  const lines = [w.title, `${w.captured}${p.colon} ${day}`, w.intro,
    `${w.checks}${p.colon} ${report.checkCount}${p.semicolon}${w.review}${p.colon} ${report.reviews.length}`];
  for (const item of report.observations) lines.push(`${w.path}${p.colon} ${item.path}${p.semicolon}${w.language}${p.colon} ${item.language}${p.semicolon}${w.id}${p.colon} ${item.id}\n${w.kind}${p.colon} ${item.kind}${p.semicolon}${w.status}${p.colon} ${item.result}\n${w.source}${p.colon} ${item.source}${p.semicolon}${w.licence}${p.colon} ${item.licence}${p.semicolon}${w.retrieved}${p.colon} ${item.retrievedOn}${p.semicolon}${w.tier}${p.colon} ${display(item.verificationTier)}`);
  for (const item of report.reviews) lines.push(`${w.flags}${p.colon} ${item.key}${p.semicolon}${item.code}`);
  if (delta) {
    lines.push(`${w.changes}${p.colon} ${delta.changes.length}`);
    for (const row of delta.changes.filter(x => x.kind !== 'unchanged')) lines.push(`${row.key}${p.semicolon}${row.kind}${p.semicolon}${row.fields.join(', ') || UNKNOWN}`);
  } else lines.push(w.noComparison);
  lines.push(w.warning);
  return `${lines.join('\n')}\n`;
}
export function reportCsv(report) {
  const cols = ['path', 'language', 'id', 'kind', 'result', 'source', 'licence', 'retrievedOn', 'verificationTier'];
  return `${cols.map(csvCell).join(',')}\n${report.observations.map(row => cols.map(key => csvCell(display(row[key]))).join(',')).join('\n')}${report.observations.length ? '\n' : ''}`;
}
export function reportHtml(report, delta, lang, day) {
  const w = WORDS[lang], p = localPunctuation(lang);
  const esc = escapeHtml;
  const heading = `<h1>${esc(w.title)}</h1><p>${esc(w.intro)}</p><p>${esc(w.captured)}${p.colon} <time datetime="${esc(day)}">${esc(day)}</time></p>`;
  const numbers = `<section aria-labelledby="summary"><h2 id="summary">${esc(w.summary)}</h2><dl><dt>${esc(w.checks)}</dt><dd>${report.checkCount}</dd><dt>${esc(w.review)}</dt><dd>${report.reviews.length}</dd><dt>PASS</dt><dd>${report.counts.PASS}</dd><dt>FAIL</dt><dd>${report.counts.FAIL}</dd><dt>${UNKNOWN}</dt><dd>${report.counts.UNKNOWN}</dd></dl></section>`;
  const items = report.observations.map((row, i) => `<article aria-labelledby="check-${i}"><h3 id="check-${i}">${esc(row.path)} — ${esc(row.id)}</h3><dl><dt>${esc(w.language)}</dt><dd>${esc(row.language)}</dd><dt>${esc(w.kind)}</dt><dd>${esc(row.kind)}</dd><dt>${esc(w.status)}</dt><dd>${esc(row.result)}</dd><dt>${esc(w.source)}</dt><dd>${esc(row.source)}</dd><dt>${esc(w.licence)}</dt><dd>${esc(row.licence)}</dd><dt>${esc(w.retrieved)}</dt><dd>${esc(row.retrievedOn)}</dd><dt>${esc(w.tier)}</dt><dd>${esc(display(row.verificationTier))}</dd></dl></article>`).join('');
  const flags = report.reviews.map(row => `<li><code>${esc(row.key)}</code> — ${esc(row.code)}</li>`).join('');
  const changed = delta ? `<section aria-labelledby="changes"><h2 id="changes">${esc(w.changes)}</h2><ul>${delta.changes.filter(x => x.kind !== 'unchanged').map(x => `<li><code>${esc(x.key)}</code> — ${esc(x.kind)}${p.semicolon}${esc(x.fields.join(', ') || UNKNOWN)}</li>`).join('') || `<li>${esc(w.none)}</li>`}</ul></section>` : `<p>${esc(w.noComparison)}</p>`;
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(w.title)}</title><style>body{font:1rem/1.65 system-ui,sans-serif;max-width:70rem;margin:auto;padding:1.5rem;color:#172329;background:#fff}h1,h2,h3{line-height:1.3}article{border:1px solid #4b5964;border-radius:8px;padding:1rem;margin:1.25rem 0}dt{font-weight:700}dd{margin:0 0 .5rem;overflow-wrap:anywhere}a{color:#084b91}a:focus-visible{outline:4px solid #a34a00;outline-offset:4px}.skip{display:inline-flex;min-width:44px;min-height:44px;align-items:center}@media print{body{max-width:none}.skip{display:none}}</style></head><body><a class="skip" href="#main">${esc(w.skip)}</a><main id="main">${heading}${numbers}<section aria-labelledby="observations"><h2 id="observations">${esc(w.results)}</h2>${items || `<p>${esc(w.none)}</p>`}</section><section aria-labelledby="flags"><h2 id="flags">${esc(w.flags)}</h2>${flags ? `<ul>${flags}</ul>` : `<p>${esc(w.none)}</p>`}</section>${changed}<p role="note">${esc(w.warning)}</p></main></body></html>\n`;
}
export function render(snapshot, { before = null, format = 'html', language = 'en', today = '2026-11-21' } = {}) {
  if (!Object.hasOwn(WORDS, language) || !['html', 'text', 'csv', 'json'].includes(format)) return { ok: false, issues: [{ code: 'OPTIONS', path: '$' }] };
  const after = analyze(snapshot, { today });
  if (!after.ok) return after;
  const delta = before ? compare(before, snapshot, { today }) : null;
  if (delta && !delta.ok) return delta;
  const comparison = delta?.value ?? null;
  const data = after.value;
  const body = format === 'json' ? `${JSON.stringify(serialized(data, comparison, language, today), null, 2)}\n` :
    format === 'csv' ? reportCsv(data) :
      format === 'text' ? reportText(data, comparison, language, today) : reportHtml(data, comparison, language, today);
  return { ok: true, text: body, issues: [] };
}
