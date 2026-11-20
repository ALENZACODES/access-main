/** Deterministic text, CSV, HTML, and JSON rendering for retention audits. */
import { retentionCanonical } from './offline-release-retention.mjs';
import { compareRetention, retainedCoverage } from './offline-release-retention-delta.mjs';

export const RETENTION_MESSAGES = Object.freeze({
  en: Object.freeze({
    title: 'Offline release retention review',
    caution: 'This is a document review, not confirmation of real-world accessibility.',
    source: 'Source', licence: 'Licence', retrieved: 'Retrieved', tier: 'Tier',
    state: 'Lifecycle', claims: 'Claims', digest: 'Digest', bytes: 'Bytes',
    empty: 'No retained assets', changed: 'Changes', records: 'Records',
    unknown: 'UNKNOWN', noChanges: 'No recorded changes',
  }),
  fr: Object.freeze({
    title: 'Examen hors ligne des éléments conservés',
    caution: 'Cet examen documentaire ne confirme pas l’accessibilité réelle.',
    source: 'Source', licence: 'Licence', retrieved: 'Consulté', tier: 'Niveau',
    state: 'Cycle de vie', claims: 'Déclarations', digest: 'Empreinte', bytes: 'Octets',
    empty: 'Aucun élément conservé', changed: 'Changements', records: 'Fiches',
    unknown: 'UNKNOWN', noChanges: 'Aucun changement documenté',
  }),
});
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function csvCell(input) {
  const value = String(input ?? '').replace(/\r\n?/g, '\n');
  const escaped = /^[\s]*[=+@\-\t\r]/u.test(value) ? `'${value}` : value;
  return `"${escaped.replace(/"/g, '""')}"`;
}
function safeText(text) { return String(text).replace(/[\r\n\t]/g, ' '); }
function term(key, value, language, messages) {
  const colon = language === 'fr' ? '\u00A0:' : ':';
  return `${messages[key]}${colon} ${safeText(value)}`;
}
function validLanguage(language) { return language === 'fr' ? 'fr' : 'en'; }
function reportData(document, options) {
  const canonical = retentionCanonical(document, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, records: [] };
  return { ok: true, problems: [], records: canonical.document.records };
}
export function retentionTextReport(document, language = 'en', options = {}) {
  const locale = validLanguage(language);
  const messages = RETENTION_MESSAGES[locale];
  const data = reportData(document, options);
  if (!data.ok) return { ok: false, problems: data.problems, text: null };
  const lines = [messages.title, messages.caution];
  if (!data.records.length) lines.push(messages.empty);
  for (const record of data.records) {
    lines.push(`${record.id} | ${safeText(record.labels[locale])}`);
    lines.push(term('source', record.source, locale, messages));
    lines.push(term('licence', record.licence, locale, messages));
    lines.push(term('retrieved', record.retrievedOn, locale, messages));
    lines.push(term('tier', record.tier, locale, messages));
    lines.push(term('state', record.state, locale, messages));
    lines.push(term('claims', record.claims.length ? record.claims.join(', ') : 'UNKNOWN', locale, messages));
    lines.push(term('digest', record.digest, locale, messages));
    lines.push(term('bytes', record.bytes, locale, messages));
  }
  return { ok: true, problems: [], text: lines.join('\n') + '\n' };
}
export function retentionCsvReport(document, language = 'en', options = {}) {
  const locale = validLanguage(language);
  const messages = RETENTION_MESSAGES[locale];
  const data = reportData(document, options);
  if (!data.ok) return { ok: false, problems: data.problems, text: null };
  const heading = ['id', 'path', 'kind', messages.state, 'label', messages.claims,
    messages.source, messages.licence, messages.retrieved, messages.tier, messages.digest, messages.bytes];
  const rows = [heading.map(csvCell).join(',')];
  for (const record of data.records) {
    rows.push([
      record.id, record.path, record.kind, record.state, record.labels[locale],
      record.claims.join('|') || 'UNKNOWN', record.source, record.licence,
      record.retrievedOn, record.tier, record.digest, record.bytes,
    ].map(csvCell).join(','));
  }
  return { ok: true, problems: [], text: '\uFEFF' + rows.join('\r\n') + '\r\n' };
}
export function retentionHtmlReport(document, language = 'en', options = {}) {
  const locale = validLanguage(language);
  const messages = RETENTION_MESSAGES[locale];
  const data = reportData(document, options);
  if (!data.ok) return { ok: false, problems: data.problems, text: null };
  const headings = ['ID', 'Label', messages.state, messages.claims, messages.source,
    messages.licence, messages.retrieved, messages.tier];
  const header = headings.map((name) => `<th scope="col">${escapeHtml(name)}</th>`).join('');
  const body = data.records.map((record) => {
    const values = [record.id, record.labels[locale], record.state, record.claims.join(' | ') || 'UNKNOWN',
      record.source, record.licence, record.retrievedOn, record.tier];
    return `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
  }).join('');
  const empty = data.records.length ? '' : `<p>${escapeHtml(messages.empty)}</p>`;
  const html = '<!doctype html>\n' +
    `<html lang="${locale}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(messages.title)}</title></head>` +
    `<body><main><h1>${escapeHtml(messages.title)}</h1>` +
    `<p>${escapeHtml(messages.caution)}</p>${empty}` +
    `<table><caption>${escapeHtml(messages.records)}</caption><thead><tr>${header}</tr></thead>` +
    `<tbody>${body}</tbody></table></main></body></html>\n`;
  return { ok: true, problems: [], text: html };
}
export function retentionJsonReport(document, options = {}) {
  const canonical = retentionCanonical(document, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, text: null };
  const coverage = retainedCoverage(document, options);
  return { ok: true, problems: [], text: JSON.stringify({
    version: 1, kind: 'offline-retention-report',
    summary: coverage.summary, records: canonical.document.records,
  }, null, 2) + '\n' };
}
export function retentionDeltaTextReport(earlier, later, language = 'en', options = {}) {
  const locale = validLanguage(language);
  const messages = RETENTION_MESSAGES[locale];
  const diff = compareRetention(earlier, later, options);
  if (!diff.ok) return { ok: false, problems: diff.problems, text: null };
  const lines = [messages.title, messages.caution,
    term('changed', diff.summary.changes, locale, messages)];
  if (!diff.changes.length) lines.push(messages.noChanges);
  for (const entry of diff.changes) {
    lines.push(`${entry.id} | ${entry.kind} | ${entry.severity}`);
    lines.push(term('claims', `${entry.beforeClaims?.join('|') || 'UNKNOWN'} -> ${entry.afterClaims?.join('|') || 'UNKNOWN'}`, locale, messages));
    if (entry.afterSource) lines.push(term('source', entry.afterSource, locale, messages));
    if (entry.afterLicence) lines.push(term('licence', entry.afterLicence, locale, messages));
    if (entry.afterDate) lines.push(term('retrieved', entry.afterDate, locale, messages));
    if (entry.afterTier !== null) lines.push(term('tier', entry.afterTier, locale, messages));
  }
  return { ok: true, problems: [], text: lines.join('\n') + '\n' };
}
export function retentionDeltaCsvReport(earlier, later, options = {}) {
  const diff = compareRetention(earlier, later, options);
  if (!diff.ok) return { ok: false, problems: diff.problems, text: null };
  const rows = [['id', 'change', 'risk', 'previousState', 'nextState', 'nextClaims',
    'source', 'licence', 'retrievedOn', 'tier']];
  for (const item of diff.changes) {
    rows.push([item.id, item.kind, item.severity, item.beforeState, item.afterState,
      item.afterClaims?.join('|') || 'UNKNOWN', item.afterSource, item.afterLicence,
      item.afterDate, item.afterTier]);
  }
  return { ok: true, problems: [], text: '\uFEFF' + rows.map((row) => row.map(csvCell).join(','))
    .join('\r\n') + '\r\n' };
}
export function retentionDeltaJsonReport(earlier, later, options = {}) {
  const diff = compareRetention(earlier, later, options);
  return { ok: diff.ok, problems: diff.problems,
    text: diff.ok ? JSON.stringify({ version: 1, kind: 'offline-retention-delta',
      summary: diff.summary, changes: diff.changes }, null, 2) + '\n' : null };
}
