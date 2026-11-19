/**
 * Accessible, deterministic exports of a validated offline source register.
 * These reports are administrative summaries and never certify access facts.
 */
import {
  canonicalRegister, sourceHealth, registerFingerprint, validateRegister,
} from './offline-source-register.mjs';

export const REPORT_FORMATS = Object.freeze(['text', 'html', 'csv', 'json']);
const REPORT_MAX = 12_000_000;
const COPY = Object.freeze({
  en: Object.freeze({
    heading: 'Offline evidence source register',
    note: 'Review status is not a finding about real-world accessibility.',
    unknown: 'UNKNOWN', sources: 'Sources', references: 'References',
    status: 'Source status', state: 'Claim state', source: 'Source',
    licence: 'Licence', retrieved: 'Retrieved', tier: 'Source tier',
    id: 'Identifier', field: 'Field', observation: 'Observed',
    review: 'Needs review', none: 'None', withdrawn: 'Withdrawn',
    retired: 'Retired', listed: 'Listed', 'needs-review': 'Needs review',
    title: 'Title', type: 'Type', count: 'Dependents',
  }),
  fr: Object.freeze({
    heading: 'Registre hors ligne des sources',
    note: 'Le statut d’examen ne confirme pas l’accessibilité réelle.',
    unknown: 'UNKNOWN', sources: 'Sources', references: 'Références',
    status: 'État de la source', state: 'État de la déclaration', source: 'Source',
    licence: 'Licence', retrieved: 'Consulté', tier: 'Niveau de la source',
    id: 'Identifiant', field: 'Champ', observation: 'Observé',
    review: 'À examiner', none: 'Aucun', withdrawn: 'Retiré',
    retired: 'Archivé', listed: 'Répertorié', 'needs-review': 'À examiner',
    title: 'Titre', type: 'Type', count: 'Références liées',
  }),
});

export function reportLanguage(language) { return language === 'fr' ? 'fr' : 'en'; }
export function reportStrings(language) { return COPY[reportLanguage(language)]; }
export function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function cell(value) {
  const text = String(value ?? '').replace(/\r\n?|\n/g, ' ');
  const neutral = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${neutral.replace(/"/g, '""')}"`;
}
export function colon(language) { return reportLanguage(language) === 'fr' ? '\u00A0:' : ':'; }
export function labelValue(label, value, language) { return `${label}${colon(language)} ${value}`; }
export function isolateText(value) { return String(value).replace(/[\r\n\t]/g, ' '); }

function inspect(register, options) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, data: null };
  const health = sourceHealth(register, options);
  const hash = registerFingerprint(register, options);
  if (!health.ok || !hash.ok) {
    return { ok: false, problems: [...health.problems, ...hash.problems], data: null };
  }
  return { ok: true, problems: [], data: {
    canonical: canonicalRegister(register), summary: health.summary, hash: hash.fingerprint,
  } };
}

function textLines(data, language) {
  const l = reportLanguage(language);
  const copy = COPY[l];
  const lines = [copy.heading, copy.note,
    labelValue(copy.sources, data.summary.sources, l),
    labelValue(copy.references, data.summary.references, l)];
  for (const src of data.canonical.sources) {
    lines.push('');
    lines.push(`${src.id} | ${isolateText(src.title[l])}`);
    lines.push(labelValue(copy.source, src.url, l));
    lines.push(labelValue(copy.licence, src.licence, l));
    lines.push(labelValue(copy.retrieved, src.retrievedOn, l));
    lines.push(labelValue(copy.tier, src.tier, l));
    lines.push(labelValue(copy.status, src.state, l));
    lines.push(labelValue(copy.count, data.summary.dependencies[src.id], l));
  }
  lines.push('');
  lines.push(labelValue(copy.review, data.summary.reviewNeeded.length, l));
  for (const ref of data.summary.reviewNeeded) {
    lines.push(`${ref.sourceId} | ${ref.referenceId} | ${ref.state} | ${ref.reason}`);
  }
  return lines.join('\n') + '\n';
}

function htmlDocument(data, language) {
  const l = reportLanguage(language);
  const copy = COPY[l];
  const summary = `<p>${escapeHtml(copy.note)}</p><dl><dt>${escapeHtml(copy.sources)}</dt><dd>${data.summary.sources}</dd>` +
    `<dt>${escapeHtml(copy.references)}</dt><dd>${data.summary.references}</dd></dl>`;
  const columns = [copy.id, copy.title, copy.source, copy.licence, copy.retrieved, copy.tier, copy.status, copy.count];
  const header = columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('');
  const rows = data.canonical.sources.map((src) => `<tr>${[
    src.id, src.title[l], src.url, src.licence, src.retrievedOn, src.tier,
    src.state, data.summary.dependencies[src.id],
  ].map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  const reviewRows = data.summary.reviewNeeded.map((ref) => `<li>${escapeHtml(ref.sourceId)} | ` +
    `${escapeHtml(ref.referenceId)} | ${escapeHtml(ref.state)} | ${escapeHtml(ref.reason)}</li>`).join('');
  return '<!doctype html>\n' +
    `<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(copy.heading)}</title><style>` +
    'body{font:1rem/1.6 system-ui,sans-serif;margin:1rem;max-width:80rem}' +
    ':focus-visible{outline:3px solid currentColor;outline-offset:3px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:.75rem;text-align:start}' +
    'th{font-weight:700}td{overflow-wrap:anywhere}.table-scroll{overflow-x:auto}' +
    'a{min-width:44px;min-height:44px;display:inline-flex;align-items:center}' +
    '@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}' +
    '</style></head><body><main>' +
    `<h1>${escapeHtml(copy.heading)}</h1>${summary}` +
    `<div class="table-scroll" role="region" tabindex="0" aria-label="${escapeHtml(copy.sources)}">` +
    `<table><caption>${escapeHtml(copy.sources)}</caption><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>` +
    `<section aria-labelledby="review-heading"><h2 id="review-heading">${escapeHtml(copy.review)}</h2>` +
    `<p>${data.summary.reviewNeeded.length}</p><ul>${reviewRows}</ul></section>` +
    '</main></body></html>\n';
}

function csvDocument(data, language) {
  const copy = COPY[reportLanguage(language)];
  const headers = [copy.id, copy.title, copy.type, copy.source, copy.licence,
    copy.retrieved, copy.tier, copy.status, copy.count];
  const rows = data.canonical.sources.map((src) => [src.id, src.title[reportLanguage(language)], src.type,
    src.url, src.licence, src.retrievedOn, src.tier, src.state, data.summary.dependencies[src.id]]);
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

function jsonDocument(data) {
  return JSON.stringify({
    version: 1,
    kind: 'offline-source-register-review',
    fingerprint: data.hash,
    summary: { ...data.summary,
      dependencies: Object.fromEntries(Object.entries(data.summary.dependencies)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))),
    },
    register: data.canonical,
    caution: 'No review status establishes an accessibility fact.',
  }, null, 2) + '\n';
}

/** Refuses to serialize invalid source evidence; no user identifiers or network. */
export function exportRegister(register, format = 'text', language = 'en', options = {}) {
  if (!REPORT_FORMATS.includes(format)) {
    return { ok: false, problems: [{ code: 'FORMAT_INVALID', path: '/format' }], content: null, mime: null };
  }
  if (language !== 'en' && language !== 'fr') {
    return { ok: false, problems: [{ code: 'LANGUAGE_INVALID', path: '/language' }], content: null, mime: null };
  }
  const result = inspect(register, options);
  if (!result.ok) return { ok: false, problems: result.problems, content: null, mime: null };
  const writers = {
    text: () => textLines(result.data, language),
    html: () => htmlDocument(result.data, language),
    csv: () => csvDocument(result.data, language),
    json: () => jsonDocument(result.data),
  };
  const content = writers[format]();
  if (Buffer.byteLength(content) > REPORT_MAX) {
    return { ok: false, problems: [{ code: 'REPORT_LIMIT', path: '/' }], content: null, mime: null };
  }
  const mime = {
    text: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    json: 'application/json; charset=utf-8',
  }[format];
  return { ok: true, problems: [], content, mime };
}

/** Small, deterministic manifest accompanies exported bytes. */
export function exportManifest(register, options = {}) {
  const checked = inspect(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, manifest: null };
  const reports = [];
  for (const format of REPORT_FORMATS) {
    for (const language of format === 'json' ? ['en'] : ['en', 'fr']) {
      const output = exportRegister(register, format, language, options);
      if (!output.ok) return { ok: false, problems: output.problems, manifest: null };
      reports.push({
        format, language, mime: output.mime,
        bytes: Buffer.byteLength(output.content),
        digest: 'sha256:' + createHashForText(output.content),
      });
    }
  }
  return { ok: true, problems: [], manifest: { version: 1, sourceFingerprint: checked.data.hash, reports } };
}

import { createHash } from 'node:crypto';
function createHashForText(text) { return createHash('sha256').update(text, 'utf8').digest('hex'); }
