/**
 * Offline presentation of review data. These exports describe submitted
 * evidence; they never assert that any location is accessible.
 */
import { parseHandoffJson, stableJson, validateHandoff } from './offline-handoff-schema.mjs';
import {
  compareHandoffReviews, groupReviewsByRecord, replayReviews,
  reviewCounts, sourceCoverage, triageReviews,
} from './offline-handoff-workflow.mjs';

export const HANDOFF_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Offline evidence handoff',
    caution: 'Review status does not establish real-world accessibility.',
    unknown: 'UNKNOWN', record: 'Record', field: 'Field', state: 'State',
    decision: 'Review', priority: 'Priority', sources: 'Sources',
    retrieved: 'Retrieved', licence: 'Licence', tier: 'Source tier',
    summary: 'Review summary', empty: 'No review items',
    items: 'Claims', records: 'Records', count: 'Count',
    pending: 'Pending', needsSource: 'Source needed', deferred: 'Deferred',
    reviewed: 'Reviewed', dismissed: 'Dismissed',
    compare: 'Review comparison', changed: 'Changes',
    invalid: 'Invalid review packet', before: 'Earlier', after: 'Later',
    noChanges: 'No changes found in the supplied review packets.',
  }),
  fr: Object.freeze({
    title: 'Transfert des références hors ligne',
    caution: 'Le statut d’examen ne prouve pas l’accessibilité réelle.',
    unknown: 'UNKNOWN', record: 'Fiche', field: 'Champ', state: 'État',
    decision: 'Examen', priority: 'Priorité', sources: 'Sources',
    retrieved: 'Récupéré', licence: 'Licence', tier: 'Niveau de source',
    summary: 'Résumé des examens', empty: 'Aucun élément à examiner',
    items: 'Déclarations', records: 'Fiches', count: 'Nombre',
    pending: 'En attente', needsSource: 'Source requise', deferred: 'Reporté',
    reviewed: 'Examiné', dismissed: 'Retiré',
    compare: 'Comparaison des examens', changed: 'Modifications',
    invalid: 'Dossier d’examen invalide', before: 'Avant', after: 'Après',
    noChanges: 'Aucune modification dans les dossiers fournis.',
  }),
});

export function copyFor(language) {
  return HANDOFF_COPY[language === 'fr' ? 'fr' : 'en'];
}

export function punctuation(language) {
  return language === 'fr' ? '\u00a0:' : ':';
}

export function labelValue(label, value, language) {
  return `${label}${punctuation(language)} ${value}`;
}

export function htmlEscape(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

export function csvCell(value) {
  const raw = String(value ?? '');
  const neutral = /^[\s]*[=+@-]/u.test(raw) ? `'${raw}` : raw;
  return `"${neutral.replace(/"/gu, '""')}"`;
}

export function sourceLookup(document) {
  return new Map(document.sources.map((source) => [source.id, source]));
}

export function sourceDescription(source, language) {
  if (!source) return 'UNKNOWN';
  const copy = copyFor(language);
  return [source.title, source.url,
    labelValue(copy.licence, source.licence, language),
    labelValue(copy.retrieved, source.retrievedOn, language),
    labelValue(copy.tier, source.tier, language)].join(' | ');
}

export function formatTextHandoff(document, language = 'en') {
  const valid = validateHandoff(document);
  if (!valid.ok) return null;
  const replay = replayReviews(document);
  if (!replay.ok) return null;
  const copy = copyFor(language);
  const counts = reviewCounts(replay.items);
  const lookup = sourceLookup(document);
  const lines = [copy.title, copy.caution, '', copy.summary,
    labelValue(copy.items, counts.items, language),
    labelValue(copy.records, counts.records, language),
    labelValue(copy.unknown, counts.states.UNKNOWN, language), ''];
  if (replay.items.length === 0) lines.push(copy.empty);
  for (const item of replay.items) {
    lines.push(labelValue(copy.record, item.recordId, language));
    lines.push(labelValue(copy.field, item.field, language));
    lines.push(labelValue(copy.state, item.state, language));
    lines.push(labelValue(copy.decision, item.decision, language));
    lines.push(labelValue(copy.priority, item.priority, language));
    lines.push(item.label[language === 'fr' ? 'fr' : 'en']);
    for (const id of item.sourceIds) lines.push(sourceDescription(lookup.get(id), language));
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function formatCsvHandoff(document, language = 'en') {
  const valid = validateHandoff(document);
  if (!valid.ok) return null;
  const replay = replayReviews(document);
  if (!replay.ok) return null;
  const copy = copyFor(language);
  const heading = [copy.record, copy.field, copy.state, copy.decision,
    copy.priority, copy.sources, copy.retrieved, copy.licence, copy.tier];
  const lookup = sourceLookup(document);
  const rows = [heading.map(csvCell).join(',')];
  for (const item of replay.items) {
    const sources = item.sourceIds.map((id) => lookup.get(id));
    rows.push([
      item.recordId, item.field, item.state, item.decision, item.priority,
      sources.map((source) => source.url).join(' | '),
      sources.map((source) => source.retrievedOn).join(' | '),
      sources.map((source) => source.licence).join(' | '),
      sources.map((source) => source.tier).join(' | '),
    ].map(csvCell).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

export function formatHtmlHandoff(document, language = 'en') {
  const valid = validateHandoff(document);
  if (!valid.ok) return null;
  const replay = replayReviews(document);
  if (!replay.ok) return null;
  const copy = copyFor(language);
  const locale = language === 'fr' ? 'fr' : 'en';
  const lookup = sourceLookup(document);
  const counts = reviewCounts(replay.items);
  const rows = replay.items.map((item) => {
    const citations = item.sourceIds.map((id) => {
      const source = lookup.get(id);
      return `<li>${htmlEscape(sourceDescription(source, locale))}</li>`;
    }).join('');
    const citationList = citations ? `<ul>${citations}</ul>` : htmlEscape(copy.unknown);
    return `<tr><th scope="row">${htmlEscape(item.recordId)}</th>` +
      `<td>${htmlEscape(item.field)}</td><td>${htmlEscape(item.state)}</td>` +
      `<td>${htmlEscape(item.decision)}</td><td>${htmlEscape(item.priority)}</td>` +
      `<td>${citationList}</td></tr>`;
  }).join('\n');
  const th = [copy.record, copy.field, copy.state, copy.decision,
    copy.priority, copy.sources].map((label) => `<th scope="col">${htmlEscape(label)}</th>`).join('');
  const styles = 'body{font:1rem/1.5 system-ui;margin:1rem;max-width:70rem}' +
    ':focus-visible{outline:3px solid currentColor;outline-offset:3px}' +
    'table{width:100%;border-collapse:collapse}th,td{border:1px solid;padding:.75rem;text-align:start}' +
    'td ul{margin:0;padding-inline-start:1.5rem}a{min-height:44px;min-width:44px}';
  return `<!doctype html>\n<html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${htmlEscape(copy.title)}</title><style>${styles}</style></head>` +
    `<body><main id="main"><h1 tabindex="-1">${htmlEscape(copy.title)}</h1>` +
    `<p>${htmlEscape(copy.caution)}</p><h2>${htmlEscape(copy.summary)}</h2>` +
    `<p>${htmlEscape(labelValue(copy.items, counts.items, locale))}</p>` +
    `<p>${htmlEscape(labelValue(copy.unknown, counts.states.UNKNOWN, locale))}</p>` +
    `<div role="region" aria-label="${htmlEscape(copy.summary)}" tabindex="0"` +
    ` style="overflow-x:auto"><table><thead><tr>${th}</tr></thead>` +
    `<tbody>${rows || `<tr><td colspan="6">${htmlEscape(copy.empty)}</td></tr>`}</tbody>` +
    `</table></div></main></body></html>\n`;
}

export function formatJsonHandoff(document) {
  const valid = validateHandoff(document);
  if (!valid.ok) return null;
  const replay = replayReviews(document);
  if (!replay.ok) return null;
  const coverage = sourceCoverage(document);
  return `${stableJson({
    version: document.version,
    reviewItems: replay.items,
    summary: reviewCounts(replay.items),
    coverage: coverage.coverage,
    caution: 'Review status does not establish real-world accessibility.',
  })}\n`;
}

export function compareTextHandoffs(earlier, later, language = 'en') {
  const comparison = compareHandoffReviews(earlier, later);
  if (!comparison.ok) return null;
  const copy = copyFor(language);
  const lines = [copy.compare, copy.caution,
    labelValue(copy.changed, comparison.changes.length, language)];
  if (comparison.changes.length === 0) lines.push(copy.noChanges);
  for (const change of comparison.changes) {
    lines.push(labelValue(change.id, change.kind, language));
    if (change.before) lines.push(labelValue(copy.before,
      `${change.before.state} / ${change.before.decision}`, language));
    if (change.after) lines.push(labelValue(copy.after,
      `${change.after.state} / ${change.after.decision}`, language));
  }
  return `${lines.join('\n')}\n`;
}

export function formatGroupedText(document, language = 'en') {
  const replay = replayReviews(document);
  if (!replay.ok) return null;
  const copy = copyFor(language);
  const lines = [copy.title, copy.caution];
  for (const group of groupReviewsByRecord(replay.items)) {
    lines.push(labelValue(copy.record, group.recordId, language));
    for (const item of triageReviews(group.entries)) {
      lines.push(`- ${labelValue(item.field, item.state, language)} | ${item.decision} | ${item.priority}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function exportAllHandoffFormats(document) {
  const valid = validateHandoff(document);
  if (!valid.ok) return { ok: false, issues: valid.issues, files: null };
  if (!replayReviews(document).ok) return { ok: false, issues: replayReviews(document).issues, files: null };
  return { ok: true, issues: [], files: {
    'handoff.en.txt': formatTextHandoff(document, 'en'),
    'handoff.fr.txt': formatTextHandoff(document, 'fr'),
    'handoff.en.csv': formatCsvHandoff(document, 'en'),
    'handoff.fr.csv': formatCsvHandoff(document, 'fr'),
    'handoff.en.html': formatHtmlHandoff(document, 'en'),
    'handoff.fr.html': formatHtmlHandoff(document, 'fr'),
    'handoff.json': formatJsonHandoff(document),
  } };
}

export function inspectExportedHandoff(source) {
  const parsed = parseHandoffJson(source);
  if (!parsed.ok) return { ok: false, issues: parsed.issues, rendered: null };
  return { ok: true, issues: [], rendered: exportAllHandoffFormats(parsed.document).files };
}
