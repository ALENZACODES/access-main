import { compare, summary, risks, groupByPlace } from './offline-evidence-review-analysis.mjs';
const COPY = Object.freeze({
  en: { title: 'Offline evidence review', intro: 'Evidence inventory only. Unknown means Unknown. Do not use this report as a guarantee of accessibility.', total: 'Records', unknown: 'Unknown records', added: 'Added', removed: 'Removed', changed: 'Changed', unchanged: 'Unchanged', source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Verification tier', status: 'Reported status', item: 'Record', notes: 'Review flags', place: 'Place identifier', none: 'None', printed: 'Review date', caution: 'Conditions may have changed. Confirm details independently before relying on them.', comparison: 'Changes since previous inventory' },
  fr: { title: 'Examen des preuves hors ligne', intro: 'Inventaire des preuves uniquement. Inconnu reste inconnu. Ce rapport ne garantit pas l’accessibilité.', total: 'Fiches', unknown: 'Fiches inconnues', added: 'Ajoutées', removed: 'Retirées', changed: 'Modifiées', unchanged: 'Inchangées', source: 'Source', licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de vérification', status: 'État signalé', item: 'Fiche', notes: 'Points à examiner', place: 'Identifiant du lieu', none: 'Aucun', printed: 'Date d’examen', caution: 'Les conditions peuvent changer. Confirmez les détails de façon indépendante.', comparison: 'Modifications depuis l’inventaire précédent' }
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function csv(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function rowToObject(row) { return { id: row.id, placeId: row.placeId, type: row.type, label: row.label, status: row.status, source: row.source, licence: row.licence, retrievedOn: row.retrievedOn, verificationTier: row.verificationTier, note: row.note ?? '' }; }
export function render(after, { before = null, format = 'html', language = 'en', today = '2026-11-20' } = {}) {
  if (!COPY[language] || !['html', 'json', 'csv', 'text'].includes(format)) return { ok: false, issues: [{ code: 'OPTIONS', path: '$' }] };
  const copy = COPY[language], overview = summary(after), delta = before ? compare(before, after) : null;
  const colon = language === 'fr' ? '\u00a0:' : ':';
  const flags = risks(after, today), groups = groupByPlace(after.records);
  const output = { title: copy.title, today, summary: overview, changes: delta, flags, records: after.records };
  if (format === 'json') return { ok: true, text: JSON.stringify(output, null, 2) + '\n' };
  if (format === 'csv') {
    const columns = ['id', 'placeId', 'type', 'label', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note'];
    return { ok: true, text: `${columns.map(csv).join(',')}\n${after.records.map(row => columns.map(c => csv(rowToObject(row)[c])).join(',')).join('\n')}${after.records.length ? '\n' : ''}` };
  }
  if (format === 'text') {
    const header = `${copy.title}\n${copy.printed}${colon} ${today}\n${copy.intro}\n${copy.total}${colon} ${overview.total}; ${copy.unknown}${colon} ${overview.unknown}\n`;
    const diff = delta ? `${copy.comparison}${colon} ${JSON.stringify(delta.counts)}\n` : '';
    const lines = after.records.map(r => `${r.id} | ${r.placeId} | ${r.label} | ${r.status}\n${copy.source}${colon} ${r.source}; ${copy.licence}${colon} ${r.licence}; ${copy.retrieved}${colon} ${r.retrievedOn}; ${copy.tier}${colon} ${r.verificationTier}`);
    return { ok: true, text: `${header}${diff}${lines.join('\n')}\n${copy.caution}\n` };
  }
  const stats = `<dl class="stats"><div><dt>${escapeHtml(copy.total)}</dt><dd>${overview.total}</dd></div><div><dt>${escapeHtml(copy.unknown)}</dt><dd>${overview.unknown}</dd></div></dl>`;
  const changeBlock = !delta ? '' : `<section aria-labelledby="changes"><h2 id="changes">${escapeHtml(copy.comparison)}</h2><dl class="stats">${['added', 'removed', 'changed', 'unchanged'].map(k => `<div><dt>${escapeHtml(copy[k])}</dt><dd>${delta.counts[k]}</dd></div>`).join('')}</dl></section>`;
  const cards = groups.map(({ placeId, rows }) => `<section aria-labelledby="place-${escapeHtml(placeId)}"><h2 id="place-${escapeHtml(placeId)}">${escapeHtml(copy.place)}${colon} ${escapeHtml(placeId)}</h2>${rows.map(r => `<article><h3>${escapeHtml(r.label)} <small>(${escapeHtml(r.id)})</small></h3><dl><div><dt>${escapeHtml(copy.status)}</dt><dd>${escapeHtml(r.status)}</dd></div><div><dt>${escapeHtml(copy.tier)}</dt><dd>${escapeHtml(r.verificationTier)}</dd></div><div><dt>${escapeHtml(copy.source)}</dt><dd>${escapeHtml(r.source)}</dd></div><div><dt>${escapeHtml(copy.licence)}</dt><dd>${escapeHtml(r.licence)}</dd></div><div><dt>${escapeHtml(copy.retrieved)}</dt><dd>${escapeHtml(r.retrievedOn)}</dd></div>${r.note ? `<div><dt>${escapeHtml(copy.notes)}</dt><dd>${escapeHtml(r.note)}</dd></div>` : ''}</dl></article>`).join('')}</section>`).join('');
  const noteItems = flags.map(flag => `<li><code>${escapeHtml(flag.id)}</code> — ${escapeHtml(flag.code)}</li>`).join('');
  return { ok: true, text: `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;max-width:72rem;margin:auto;padding:1.5rem;color:#16202a;background:#fff}a{color:#084b91}a:focus-visible{outline:4px solid #ac4d00;outline-offset:5px}h1,h2,h3{line-height:1.3}article{padding:1rem;border:2px solid #596573;border-radius:.4rem;margin:1rem 0}dl div{margin:.4rem 0}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}.stats{display:flex;flex-wrap:wrap;gap:1.5rem}.stats>div{padding:.5rem 1rem;border:1px solid #596573} .skip{display:inline-block;min-height:44px;min-width:44px;padding:.5rem}@media print{body{max-width:none}.skip{display:none}}</style></head><body><a class="skip" href="#main">${language === 'fr' ? 'Passer au contenu' : 'Skip to content'}</a><main id="main"><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.printed)}${colon} <time datetime="${escapeHtml(today)}">${escapeHtml(today)}</time></p><p>${escapeHtml(copy.intro)}</p>${stats}${changeBlock}${cards || `<p>${escapeHtml(copy.none)}</p>`}<section aria-labelledby="flags"><h2 id="flags">${escapeHtml(copy.notes)}</h2>${noteItems ? `<ul>${noteItems}</ul>` : `<p>${escapeHtml(copy.none)}</p>`}</section><p>${escapeHtml(copy.caution)}</p></main></body></html>\n` };
}
