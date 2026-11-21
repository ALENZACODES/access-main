/** Human-readable, accessible, bilingual local audit reports. */
import { toDisplay } from './offline-dossier-contract.mjs';
import { compareAudits } from './offline-dossier-audit.mjs';
import { reviewDossier, reviewJson, reviewText } from './offline-dossier-policy.mjs';
const COPY = Object.freeze({
  en: {
    title: 'Offline evidence dossier audit', caution: 'Digest matches concern file bytes only, not accessibility conditions.',
    empty: 'No evidence files were listed.', total: 'Files', match: 'Digest matches', unknown: 'UNKNOWN evidence',
    issues: 'Files requiring review', item: 'File', status: 'File result', evidence: 'Evidence state', source: 'Source',
    licence: 'Licence', retrieved: 'Retrieved on', tier: 'Verification tier', path: 'Relative file path',
    location: 'Place identifier', category: 'Feature category', expected: 'Expected size', actual: 'Read size',
    comparison: 'Differences from previous audit', added: 'Added', removed: 'Removed', changed: 'Changed',
    unchanged: 'Unchanged', none: 'None', date: 'Audit date', skip: 'Skip to content',
    complete: 'All listed file digests match.', incomplete: 'One or more listed files need review.'
  },
  fr: {
    title: 'Examen hors ligne des dossiers de preuves', caution: 'Les empreintes concordantes concernent les octets des fichiers uniquement, pas les conditions d’accessibilité.',
    empty: 'Aucun fichier de preuve n’est répertorié.', total: 'Fichiers', match: 'Empreintes concordantes', unknown: 'Preuves UNKNOWN',
    issues: 'Fichiers à examiner', item: 'Fichier', status: 'Résultat du fichier', evidence: 'État des preuves', source: 'Source',
    licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de vérification', path: 'Chemin relatif',
    location: 'Identifiant du lieu', category: 'Catégorie de caractéristique', expected: 'Taille attendue', actual: 'Taille lue',
    comparison: 'Différences depuis le précédent examen', added: 'Ajoutés', removed: 'Retirés', changed: 'Modifiés',
    unchanged: 'Inchangés', none: 'Aucun', date: 'Date d’examen', skip: 'Aller au contenu',
    complete: 'Toutes les empreintes des fichiers répertoriés concordent.', incomplete: 'Un ou plusieurs fichiers répertoriés nécessitent un examen.'
  }
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function safeCsv(value) {
  let result = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}
export function punctuation(language) {
  return { colon: language === 'fr' ? '\u00a0:' : ':', semicolon: language === 'fr' ? '\u202f;' : ';' };
}
export function viewRows(audit) {
  return audit.results.map(result => ({
    id: result.id, path: result.item.path, placeId: result.item.placeId,
    category: result.item.category, status: result.status, evidenceStatus: toDisplay(result.item.status),
    source: result.item.source, licence: result.item.licence, retrievedOn: result.item.retrievedOn,
    verificationTier: toDisplay(result.item.verificationTier), expectedBytes: result.expectedBytes,
    actualBytes: result.actualBytes, expectedSha256: result.expectedSha256,
    actualSha256: result.actualSha256, note: result.item.note ?? ''
  }));
}
export function renderDossierAudit(audit, { before = null, language = 'en', format = 'html', today = '2026-11-20' } = {}) {
  if (!COPY[language] || !['html', 'text', 'csv', 'json'].includes(format)) return { ok: false, error: 'OPTIONS' };
  const copy = COPY[language], rows = viewRows(audit), diff = before ? compareAudits(before, audit) : null;
  const review = reviewDossier(audit, { today });
  const punct = punctuation(language);
  if (format === 'json') return { ok: true, text: `${JSON.stringify({ title: copy.title, today, complete: audit.complete, counts: audit.counts, groups: audit.groups, comparison: diff, review: reviewJson(review), rows }, null, 2)}\n` };
  if (format === 'csv') {
    const keys = ['id', 'path', 'placeId', 'category', 'status', 'evidenceStatus', 'source', 'licence', 'retrievedOn', 'verificationTier', 'expectedBytes', 'actualBytes', 'expectedSha256', 'actualSha256', 'note'];
    return { ok: true, text: `${keys.map(safeCsv).join(',')}\n${rows.map(row => keys.map(key => safeCsv(row[key])).join(',')).join('\n')}${rows.length ? '\n' : ''}` };
  }
  if (format === 'text') {
    const summary = `${copy.total}${punct.colon} ${audit.counts.total}${punct.semicolon} ${copy.match}${punct.colon} ${audit.counts.MATCH}${punct.semicolon} ${copy.unknown}${punct.colon} ${audit.counts.unknownEvidence}`;
    const changed = diff ? `${copy.comparison}${punct.colon} ${diff.counts.added}/${diff.counts.removed}/${diff.counts.changed}/${diff.counts.unchanged}\n` : '';
    const lines = rows.map(row => `${row.id} | ${row.status} | ${row.evidenceStatus}\n${copy.path}${punct.colon} ${row.path}${punct.semicolon} ${copy.location}${punct.colon} ${row.placeId}${punct.semicolon} ${copy.category}${punct.colon} ${row.category}${punct.semicolon} ${copy.source}${punct.colon} ${row.source}${punct.semicolon} ${copy.licence}${punct.colon} ${row.licence}${punct.semicolon} ${copy.retrieved}${punct.colon} ${row.retrievedOn}${punct.semicolon} ${copy.tier}${punct.colon} ${row.verificationTier}`);
    return { ok: true, text: `${copy.title}\n${copy.date}${punct.colon} ${today}\n${summary}\n${audit.complete ? copy.complete : copy.incomplete}\n${changed}${lines.join('\n')}\n${reviewText(review, language)}${copy.caution}\n` };
  }
  const entries = rows.map((row, index) => {
    const values = [
      [copy.status, row.status], [copy.evidence, row.evidenceStatus], [copy.path, row.path],
      [copy.location, row.placeId], [copy.category, row.category], [copy.source, row.source],
      [copy.licence, row.licence], [copy.retrieved, row.retrievedOn],
      [copy.tier, row.verificationTier], [copy.expected, row.expectedBytes],
      [copy.actual, row.actualBytes ?? 'UNKNOWN']
    ];
    return `<article aria-labelledby="entry-${index}"><h3 id="entry-${index}">${escapeHtml(row.id)}</h3><dl>${values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></article>`;
  }).join('');
  const deltas = diff ? `<section aria-labelledby="comparison"><h2 id="comparison">${escapeHtml(copy.comparison)}</h2><dl>${['added', 'removed', 'changed', 'unchanged'].map(key => `<div><dt>${escapeHtml(copy[key])}</dt><dd>${diff.counts[key]}</dd></div>`).join('')}</dl></section>` : '';
  const reviewItems = review.findings.map(flag => `<li>${escapeHtml(flag.placeId)} — ${escapeHtml(flag.category)} — ${escapeHtml(flag.id ?? 'UNKNOWN')} — ${escapeHtml(flag.code)}</li>`).join('');
  const reviewSection = `<section aria-labelledby="review"><h2 id="review">${language === 'fr' ? 'Points à examiner' : 'Review findings'}</h2>${reviewItems ? `<ul>${reviewItems}</ul>` : `<p>${escapeHtml(copy.none)}</p>`}</section>`;
  const doc = `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;background:#fff;color:#152330;max-width:76rem;margin:auto;padding:1rem}a{color:#064781}a:focus-visible{outline:4px solid #a64700;outline-offset:4px}.skip{display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding:.5rem}article{padding:1rem;border:2px solid #627380;border-radius:.4rem;margin:1rem 0}h1,h2,h3{line-height:1.25}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.75rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}p{max-width:80ch}@media print{.skip{display:none}}</style></head><body><a class="skip" href="#main">${escapeHtml(copy.skip)}</a><main id="main"><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.date)}${punct.colon} <time datetime="${escapeHtml(today)}">${escapeHtml(today)}</time></p><p>${escapeHtml(audit.complete ? copy.complete : copy.incomplete)}</p><dl><div><dt>${escapeHtml(copy.total)}</dt><dd>${audit.counts.total}</dd></div><div><dt>${escapeHtml(copy.match)}</dt><dd>${audit.counts.MATCH}</dd></div><div><dt>${escapeHtml(copy.unknown)}</dt><dd>${audit.counts.unknownEvidence}</dd></div></dl>${deltas}${reviewSection}<section aria-labelledby="results"><h2 id="results">${escapeHtml(copy.issues)}</h2>${entries || `<p>${escapeHtml(copy.empty)}</p>`}</section><p>${escapeHtml(copy.caution)}</p></main></body></html>\n`;
  return { ok: true, text: doc };
}
