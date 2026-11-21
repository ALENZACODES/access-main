/** Standalone bilingual report generator. No external templates or network calls. */
import { summarize, compareChains, UNKNOWN } from './offline-receipt-chain.mjs';
const COPY = {
  en: { title: 'Offline receipt handoff', date: 'Review date', record: 'Receipt', place: 'Place identifier', kind: 'Kind', status: 'Status', source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Verification tier', hash: 'Receipt hash', head: 'Chain head', total: 'Receipts', unknown: 'UNKNOWN', none: 'No receipts', warning: 'A receipt documents an audit handoff, not accessibility conditions. UNKNOWN remains UNKNOWN.', compare: 'Chain comparison', prefix: 'Common prefix', appended: 'Appended', removed: 'Removed', diverged: 'History diverged', yes: 'Yes', no: 'No', skip: 'Skip to content' },
  fr: { title: 'Transmission des reçus hors ligne', date: 'Date d’examen', record: 'Reçu', place: 'Identifiant du lieu', kind: 'Type', status: 'État', source: 'Source', licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de vérification', hash: 'Empreinte du reçu', head: 'Dernière empreinte', total: 'Reçus', unknown: 'UNKNOWN', none: 'Aucun reçu', warning: 'Un reçu documente une transmission d’audit, pas les conditions d’accessibilité. UNKNOWN reste UNKNOWN.', compare: 'Comparaison des chaînes', prefix: 'Préfixe commun', appended: 'Ajoutés', removed: 'Retirés', diverged: 'Historique divergent', yes: 'Oui', no: 'Non', skip: 'Passer au contenu' }
};
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const csv = value => { const text = String(value ?? ''); const safe = /^[=+@\-\t\r]/u.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
const shown = value => value === 'unknown' ? UNKNOWN : value;
export function renderReceiptChain(chain, { language = 'en', format = 'html', today = '2026-11-20', before = null } = {}) {
  if (!COPY[language] || !['html', 'csv', 'json', 'text'].includes(format)) return { ok: false, issues: [{ code: 'INVALID_OPTIONS' }] };
  const c = COPY[language], data = summarize(chain), comparison = before ? compareChains(before, chain) : null;
  const col = language === 'fr' ? '\u00a0:' : ':';
  const sep = language === 'fr' ? '\u202f; ' : '; ';
  if (format === 'json') return { ok: true, text: JSON.stringify({ schemaVersion: 1, summary: data, comparison, receipts: chain.receipts.map(r => ({ ...r, status: shown(r.status), verificationTier: shown(r.verificationTier) })) }, null, 2) + '\n' };
  if (format === 'csv') {
    const header = ['id', 'placeId', 'kind', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'previous', 'payloadHash', 'hash'];
    const lines = chain.receipts.map(r => header.map(k => csv(shown(r[k]))).join(','));
    return { ok: true, text: `${header.map(csv).join(',')}\n${lines.join('\n')}${lines.length ? '\n' : ''}` };
  }
  if (format === 'text') {
    const lines = chain.receipts.map(r => `${c.record}${col} ${r.id}${sep}${c.place}${col} ${r.placeId}${sep}${c.status}${col} ${shown(r.status)}\n${c.source}${col} ${r.source}${sep}${c.licence}${col} ${r.licence}${sep}${c.retrieved}${col} ${r.retrievedOn}${sep}${c.tier}${col} ${shown(r.verificationTier)}\n${c.hash}${col} ${r.hash}`);
    return { ok: true, text: `${c.title}\n${c.date}${col} ${today}\n${c.total}${col} ${data.counts.total}\n${lines.join('\n') || c.none}\n${comparison ? `${c.compare}${col} ${comparison.commonPrefix}\n` : ''}${c.warning}\n` };
  }
  const cards = chain.receipts.map((r, i) => `<article><h2>${esc(c.record)} ${i + 1}${col} ${esc(r.id)}</h2><dl>${[[c.place,r.placeId],[c.kind,r.kind],[c.status,shown(r.status)],[c.source,r.source],[c.licence,r.licence],[c.retrieved,r.retrievedOn],[c.tier,shown(r.verificationTier)],[c.hash,r.hash]].map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></article>`).join('');
  const diff = comparison ? `<section aria-labelledby="comparison"><h2 id="comparison">${esc(c.compare)}</h2><p>${esc(c.prefix)}${col} ${comparison.commonPrefix}${sep}${esc(c.appended)}${col} ${comparison.appended.length}${sep}${esc(c.removed)}${col} ${comparison.removed.length}${sep}${esc(c.diverged)}${col} ${comparison.diverged ? c.yes : c.no}</p></section>` : '';
  return { ok: true, text: `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;max-width:72rem;margin:auto;padding:1.25rem;color:#14232e;background:white}a:focus-visible{outline:4px solid #a44700;outline-offset:4px}.skip{display:inline-flex;align-items:center;min-height:44px;min-width:44px}article{border:1px solid #5c6670;border-radius:6px;padding:1rem;margin:1rem 0}dt{font-weight:bold}dd{overflow-wrap:anywhere;margin:0 0 .5rem}h1,h2{line-height:1.25}@media print{.skip{display:none}}</style></head><body><a class="skip" href="#main">${esc(c.skip)}</a><main id="main"><h1>${esc(c.title)}</h1><p>${esc(c.date)}${col} <time datetime="${esc(today)}">${esc(today)}</time></p><p>${esc(c.total)}${col} ${data.counts.total}</p><p>${esc(c.head)}${col} ${esc(data.head ?? UNKNOWN)}</p>${diff}${cards || `<p>${esc(c.none)}</p>`}<p>${esc(c.warning)}</p></main></body></html>\n` };
}
