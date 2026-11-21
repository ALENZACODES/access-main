import { UNKNOWN, validateLedger } from './review-ledger-contract.mjs';
import { analyzeLedger } from './review-ledger-engine.mjs';
import { reviewQueue, placeCoverage, readinessChecklist } from './review-ledger-queue.mjs';
import { compareLedgers, evidenceReconciliation } from './review-ledger-compare.mjs';
const COPY = Object.freeze({
  en: { title: 'Offline review ledger', summary: 'Review summary', cases: 'Cases', observations: 'Evidence records', events: 'Review events', unknown: 'UNKNOWN', conflicts: 'Conflicts', pending: 'Pending reviews', date: 'Review date', source: 'Source', licence: 'Licence', retrieved: 'Retrieved on', tier: 'Verification tier', status: 'Reported status', decision: 'Review decision', feature: 'Feature', place: 'Place identifier', priority: 'Review priority', noCases: 'No cases', changes: 'Differences since previous ledger', added: 'Added', removed: 'Removed', changed: 'Changed', caution: 'These are evidence records only. UNKNOWN means that no supported conclusion is available. Confirm current conditions independently.', skip: 'Skip to content', findings: 'Review flags', coverage: 'Evidence coverage', action: 'Workflow state', note: 'This is not a guarantee of accessibility.' },
  fr: { title: 'Registre d’examen hors ligne', summary: 'Résumé de l’examen', cases: 'Dossiers', observations: 'Fiches de preuve', events: 'Événements de l’examen', unknown: 'UNKNOWN', conflicts: 'Contradictions', pending: 'Examens en attente', date: 'Date de l’examen', source: 'Source', licence: 'Licence', retrieved: 'Date de récupération', tier: 'Niveau de vérification', status: 'État signalé', decision: 'Décision de l’examen', feature: 'Élément', place: 'Identifiant du lieu', priority: 'Priorité de l’examen', noCases: 'Aucun dossier', changes: 'Différences depuis le registre précédent', added: 'Ajoutés', removed: 'Retirés', changed: 'Modifiés', caution: 'Ces fiches décrivent uniquement des preuves. UNKNOWN signifie qu’aucune conclusion étayée n’est disponible. Confirmez les conditions actuelles indépendamment.', skip: 'Passer au contenu', findings: 'Points à examiner', coverage: 'Couverture des preuves', action: 'État du suivi', note: 'Ceci ne garantit pas l’accessibilité.' }
});
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function csvSafe(value) {
  const str = String(value ?? '');
  const safe = /^[\s]*[=+@-]/u.test(str) ? `'${str}` : str;
  return `"${safe.replaceAll('"', '""')}"`;
}
function display(value) { return value === 'unknown' || value === null || value === undefined ? UNKNOWN : value; }
function fragment(label, value) { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display(value))}</dd></div>`; }
function line(label, value, sep) { return `${label}${sep} ${display(value)}`; }
export function prepareReport(ledger, { before = null, language = 'en', today = '2026-11-20' } = {}) {
  if (!COPY[language]) return { ok: false, issues: [{ code: 'LANGUAGE_INVALID', path: '$' }] };
  const valid = validateLedger(ledger, { today });
  if (!valid.ok) return valid;
  const analysis = analyzeLedger(ledger, { today });
  if (!analysis.ok) return analysis;
  const queue = reviewQueue(ledger, { today, includeClosed: true });
  const coverage = placeCoverage(ledger, { today });
  const flags = evidenceReconciliation(ledger, { today });
  const checklist = readinessChecklist(ledger, { today });
  const comparison = before ? compareLedgers(before, ledger, { today }) : null;
  if (comparison && !comparison.ok) return comparison;
  return { ok: true, copy: COPY[language], today, language, analysis, queue, coverage, flags, checklist, comparison, observations: ledger.observations, cases: ledger.cases, events: ledger.events };
}
export function renderReport(ledger, { before = null, language = 'en', format = 'html', today = '2026-11-20' } = {}) {
  if (!['html', 'text', 'csv', 'json'].includes(format)) return { ok: false, issues: [{ code: 'FORMAT_INVALID', path: '$' }] };
  const result = prepareReport(ledger, { before, language, today });
  if (!result.ok) return result;
  const { copy, analysis, queue, flags, comparison } = result;
  const sep = language === 'fr' ? '\u00a0:' : ':';
  const semi = language === 'fr' ? '\u202f; ' : '; ';
  if (format === 'json') {
    const data = { schemaVersion: 1, language, today, notice: copy.caution, summary: analysis.totals, cases: queue.rows, findings: flags.findings, coverage: result.coverage.rows, comparison, observations: result.observations.map(x => ({ ...x, status: display(x.status), verificationTier: display(x.verificationTier) })), reviewEvents: result.events.map(x => ({ ...x, verificationTier: display(x.verificationTier) })) };
    return { ok: true, text: `${JSON.stringify(data, null, 2)}\n` };
  }
  if (format === 'csv') {
    const columns = ['id', 'placeId', 'feature', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'summary', 'documentHash'];
    const lines = [columns.map(csvSafe).join(',')];
    for (const observation of result.observations) lines.push(columns.map(field => csvSafe(display(observation[field]))).join(','));
    return { ok: true, text: `${lines.join('\n')}\n` };
  }
  if (format === 'text') {
    const lines = [copy.title, line(copy.date, today, sep), copy.caution, `${line(copy.cases, analysis.totals.cases, sep)}${semi}${line(copy.observations, analysis.totals.observations, sep)}${semi}${line(copy.events, analysis.totals.events, sep)}`, `${line(copy.pending, queue.counts.pending, sep)}${semi}${line(copy.conflicts, queue.counts.conflict, sep)}`];
    for (const row of queue.rows) {
      lines.push(`${row.id} | ${row.placeId} | ${row.feature} | ${display(row.status)} | ${row.state} | ${row.decision}`);
      for (const observation of result.observations.filter(x => result.cases.find(c => c.id === row.id)?.observationIds.includes(x.id))) lines.push(`${line(copy.source, observation.source, sep)}${semi}${line(copy.licence, observation.licence, sep)}${semi}${line(copy.retrieved, observation.retrievedOn, sep)}${semi}${line(copy.tier, observation.verificationTier, sep)}`);
    }
    lines.push(`${line(copy.findings, flags.counts.total, sep)}${semi}${line(copy.coverage, result.coverage.rows.length, sep)}`);
    if (comparison) lines.push(line(copy.changes, JSON.stringify(comparison.conclusions), sep));
    lines.push(copy.note);
    return { ok: true, text: `${lines.join('\n')}\n` };
  }
  const statRows = [fragment(copy.cases, analysis.totals.cases), fragment(copy.observations, analysis.totals.observations), fragment(copy.events, analysis.totals.events), fragment(copy.unknown, analysis.totals.UNKNOWN), fragment(copy.conflicts, queue.counts.conflict), fragment(copy.pending, queue.counts.pending)].join('');
  const cases = queue.rows.map(row => {
    const caseRecord = result.cases.find(x => x.id === row.id);
    const provenance = (caseRecord?.observationIds ?? []).map(id => result.observations.find(x => x.id === id)).filter(Boolean);
    return `<article><h3>${escapeHtml(row.id)}</h3><dl>${fragment(copy.place, row.placeId)}${fragment(copy.feature, row.feature)}${fragment(copy.status, row.status)}${fragment(copy.action, row.state)}${fragment(copy.decision, row.decision)}${fragment(copy.priority, row.priority)}</dl><ul>${provenance.map(x => `<li><strong>${escapeHtml(x.id)}</strong><dl>${fragment(copy.source, x.source)}${fragment(copy.licence, x.licence)}${fragment(copy.retrieved, x.retrievedOn)}${fragment(copy.tier, x.verificationTier)}${fragment(copy.status, x.status)}</dl></li>`).join('')}</ul></article>`;
  }).join('');
  const issues = flags.findings.map(x => `<li>${escapeHtml(x.id)} — ${escapeHtml(x.code)}${x.observationId ? ` (${escapeHtml(x.observationId)})` : ''}</li>`).join('');
  const comparisonBlock = comparison ? `<section aria-labelledby="comparison"><h2 id="comparison">${escapeHtml(copy.changes)}</h2><dl>${fragment(copy.added, comparison.events.counts.added)}${fragment(copy.removed, comparison.events.counts.removed)}${fragment(copy.changed, comparison.events.counts.changed)}</dl></section>` : '';
  const html = `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;max-width:74rem;margin:auto;padding:1rem;color:#18232d;background:white}h1,h2,h3{line-height:1.3}a{color:#07559d}a:focus-visible{outline:4px solid #a64a00;outline-offset:4px}.skip{display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding:.25rem .75rem}article{padding:1rem;margin:1rem 0;border:2px solid #536575;border-radius:.5rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}dl div{margin:.4rem 0}.stats{display:flex;flex-wrap:wrap;gap:1rem}.stats>div{border:1px solid #536575;padding:.5rem 1rem}li{overflow-wrap:anywhere}@media print{.skip{display:none}}</style></head><body><a href="#main" class="skip">${escapeHtml(copy.skip)}</a><main id="main"><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.date)}${sep} <time datetime="${escapeHtml(today)}">${escapeHtml(today)}</time></p><p>${escapeHtml(copy.caution)}</p><section aria-labelledby="summary"><h2 id="summary">${escapeHtml(copy.summary)}</h2><dl class="stats">${statRows}</dl></section><section aria-labelledby="cases"><h2 id="cases">${escapeHtml(copy.cases)}</h2>${cases || `<p>${escapeHtml(copy.noCases)}</p>`}</section><section aria-labelledby="findings"><h2 id="findings">${escapeHtml(copy.findings)}</h2>${issues ? `<ul>${issues}</ul>` : '<p>—</p>'}</section>${comparisonBlock}<p>${escapeHtml(copy.note)}</p></main></body></html>\n`;
  return { ok: true, text: html };
}
export function reportCsvRows(ledger, options = {}) {
  const out = renderReport(ledger, { ...options, format: 'csv' });
  if (!out.ok) return out;
  return { ok: true, lines: out.text.trimEnd().split('\n') };
}
export function reportTextLines(ledger, options = {}) {
  const out = renderReport(ledger, { ...options, format: 'text' });
  if (!out.ok) return out;
  return { ok: true, lines: out.text.trimEnd().split('\n') };
}
