/** Accessible, deterministic drill reports. No external resources or hidden tracking. */
import { evaluateDrill, gateMatrix, summarizeGates } from './offline-drill-matrix.mjs';
import { canonicalDrill } from './offline-drill-core.mjs';

const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Offline degradation drill',
    warning: 'A captured result does not establish accessibility at a real place.',
    review: 'Human review is needed before interpreting these observations.',
    capture: 'Capture', route: 'Route', language: 'Language', network: 'Network',
    storage: 'Storage', state: 'State', code: 'Code', severity: 'Priority',
    source: 'Source', licence: 'Licence', retrieved: 'Retrieved', tier: 'Source review tier',
    problems: 'Input problems', findings: 'Findings', checks: 'Checks',
    unknown: 'UNKNOWN', noFindings: 'No reported findings for this input.',
    noData: 'No captures were supplied.',
    total: 'Total', pass: 'PASS', fail: 'FAIL', blocks: 'Blocks', reviews: 'Review items',
    caption: 'Captured drill results. These are not field observations.',
    reportStatus: 'Drill summary', file: 'Local export',
  }),
  fr: Object.freeze({
    title: 'Exercice de dégradation hors ligne',
    warning: 'Un résultat saisi ne démontre pas l’accessibilité d’un lieu réel.',
    review: 'Un examen humain est nécessaire avant d’interpréter ces observations.',
    capture: 'Capture', route: 'Parcours', language: 'Langue', network: 'Réseau',
    storage: 'Stockage', state: 'État', code: 'Code', severity: 'Priorité',
    source: 'Source', licence: 'Licence', retrieved: 'Consulté', tier: 'Niveau de contrôle',
    problems: 'Problèmes de saisie', findings: 'Constats', checks: 'Contrôles',
    unknown: 'UNKNOWN', noFindings: 'Aucun constat signalé pour cette saisie.',
    noData: 'Aucune capture fournie.',
    total: 'Total', pass: 'PASS', fail: 'FAIL', blocks: 'Blocages', reviews: 'Éléments à examiner',
    caption: 'Résultats saisis. Il ne s’agit pas d’observations sur le terrain.',
    reportStatus: 'Résumé de l’exercice', file: 'Export local',
  }),
});
export function reportCopy(language = 'en') {
  return COPY[language === 'fr' ? 'fr' : 'en'];
}
export function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function csvCell(value) {
  const text = String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ');
  const guarded = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}
export function csvRow(values) {
  return values.map(csvCell).join(',');
}
export function reportModel(input, options = {}) {
  const result = evaluateDrill(input, options);
  if (!result.ok) return { ok: false, problems: result.problems,
    model: { summary: null, rows: [], checks: [], findings: [] } };
  const rows = gateMatrix(result, input);
  const checks = summarizeGates(rows);
  return { ok: true, problems: [], model: {
    summary: result.summary,
    rows,
    checks,
    findings: result.findings,
    claims: input.captures.flatMap((capture) => capture.claims.map((claim) => ({
      captureId: capture.id, route: capture.route, locale: capture.locale,
      claimId: claim.id, state: claim.state, sourceId: claim.sourceId,
    }))).sort((a, b) => a.captureId.localeCompare(b.captureId, 'en') || a.claimId.localeCompare(b.claimId, 'en')),
    provenance: input.sources.map((source) => ({
      id: source.id, ...source.provenance,
    })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
  } };
}
function colon(language) {
  return language === 'fr' ? '\u00A0:' : ':';
}
function line(label, value, language) {
  return `${label}${colon(language)} ${value}`;
}
export function textReport(input, language = 'en', options = {}) {
  const locale = language === 'fr' ? 'fr' : 'en';
  const t = reportCopy(locale);
  const evaluated = reportModel(input, options);
  const lines = [t.title, t.warning, t.review];
  if (!evaluated.ok) {
    lines.push(line(t.problems, evaluated.problems.length, locale));
    for (const problem of evaluated.problems) lines.push(`${problem.code} ${problem.path}`);
    return `${lines.join('\n')}\n`;
  }
  const { summary, rows, checks, findings, provenance } = evaluated.model;
  lines.push(line(t.total, summary.total, locale));
  lines.push(line(t.blocks, summary.blocks, locale));
  lines.push(line(t.reviews, summary.reviews, locale));
  lines.push(line(t.reportStatus, summary.status, locale));
  if (!rows.length) lines.push(t.noData);
  for (const row of rows) {
    lines.push(`${row.captureId} | ${row.route} | ${row.locale} | ${row.status}`);
    for (const [name, status] of Object.entries(row.checks)) lines.push(`  ${name} | ${status}`);
  }
  for (const check of checks) lines.push(`  ${check.rule} | ${check.status} | ${check.pass}/${check.fail}/${check.unknown}`);
  if (!findings.length) lines.push(t.noFindings);
  for (const finding of findings) lines.push(`${finding.capture} | ${finding.code} | ${finding.severity} | ${finding.path}`);
  for (const source of provenance) {
    lines.push(`${source.id} | ${t.source}${colon(locale)} ${source.source}`);
    lines.push(`  ${t.licence}${colon(locale)} ${source.licence}`);
    lines.push(`  ${t.retrieved}${colon(locale)} ${source.retrievedOn}`);
    lines.push(`  ${t.tier}${colon(locale)} ${source.tier}`);
  }
  return `${lines.join('\n')}\n`;
}
export function csvReport(input, language = 'en', options = {}) {
  const t = reportCopy(language);
  const evaluated = reportModel(input, options);
  const records = [[t.capture, t.route, t.language, t.state, t.code, t.severity, t.source, t.licence, t.retrieved, t.tier]];
  if (!evaluated.ok) {
    for (const problem of evaluated.problems) records.push(['INPUT', '', '', 'UNKNOWN', problem.code, 'block', '', '', '', '']);
  } else {
    const captures = new Map(input.captures.map((capture) => [capture.id, capture]));
    const sources = new Map(input.sources.map((entry) => [entry.id, entry.provenance]));
    for (const claim of evaluated.model.claims) {
      const source = sources.get(claim.sourceId);
      records.push([claim.captureId, claim.route, claim.locale, claim.state,
        `CLAIM:${claim.claimId}`, 'information', source?.source ?? 'UNKNOWN',
        source?.licence ?? 'UNKNOWN', source?.retrievedOn ?? 'UNKNOWN', source?.tier ?? 'UNKNOWN']);
    }
    for (const item of evaluated.model.findings) {
      const capture = captures.get(item.capture);
      records.push([item.capture, capture?.route ?? '', capture?.locale ?? '', capture ?
        evaluated.model.rows.find((r) => r.captureId === item.capture)?.status ?? 'UNKNOWN' : 'UNKNOWN',
      item.code, item.severity, item.source?.source ?? capture?.provenance.source ?? '',
      item.source?.licence ?? capture?.provenance.licence ?? '',
      item.source?.retrievedOn ?? capture?.provenance.retrievedOn ?? '',
      item.source?.tier ?? capture?.provenance.tier ?? 'UNKNOWN']);
    }
  }
  return '\uFEFF' + records.map(csvRow).join('\r\n') + '\r\n';
}
function htmlTable(headers, rows, caption) {
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${headers.map((v) => `<th scope="col">${escapeHtml(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
export function htmlReport(input, language = 'en', options = {}) {
  const locale = language === 'fr' ? 'fr' : 'en';
  const t = reportCopy(locale);
  const evaluated = reportModel(input, options);
  const sections = [`<h1>${escapeHtml(t.title)}</h1>`,
    `<p role="note">${escapeHtml(t.warning)}</p>`,
    `<p>${escapeHtml(t.review)}</p>`];
  if (!evaluated.ok) {
    sections.push(`<h2>${escapeHtml(t.problems)}</h2>`);
    sections.push(`<ul>${evaluated.problems.map((p) => `<li>${escapeHtml(p.code)} ${escapeHtml(p.path)}</li>`).join('')}</ul>`);
  } else {
    const { summary, rows, checks, findings, provenance } = evaluated.model;
    sections.push(`<section aria-labelledby="drill-summary"><h2 id="drill-summary">${escapeHtml(t.reportStatus)}</h2>`);
    sections.push(`<p>${escapeHtml(summary.status)} | ${escapeHtml(t.total)}${colon(locale)} ${summary.total} | ${escapeHtml(t.blocks)}${colon(locale)} ${summary.blocks}</p></section>`);
    sections.push(`<section aria-labelledby="drill-captures"><h2 id="drill-captures">${escapeHtml(t.capture)}</h2>`);
    sections.push(htmlTable([t.capture, t.route, t.language, t.state],
      rows.map((r) => [r.captureId, r.route, r.locale, r.status]), t.caption));
    sections.push('</section>');
    sections.push(`<section aria-labelledby="drill-checks"><h2 id="drill-checks">${escapeHtml(t.checks)}</h2>`);
    sections.push(htmlTable([t.code, t.pass, t.fail, t.unknown],
      checks.map((r) => [r.rule, r.pass, r.fail, r.unknown]), t.caption));
    sections.push('</section>');
    sections.push(`<section aria-labelledby="drill-findings"><h2 id="drill-findings">${escapeHtml(t.findings)}</h2>`);
    if (!findings.length) sections.push(`<p>${escapeHtml(t.noFindings)}</p>`);
    else sections.push(htmlTable([t.capture, t.code, t.severity, t.source],
      findings.map((r) => [r.capture, r.code, r.severity, r.source?.source ?? 'UNKNOWN']), t.caption));
    sections.push('</section>');
    sections.push(`<section aria-labelledby="drill-sources"><h2 id="drill-sources">${escapeHtml(t.source)}</h2>`);
    sections.push(htmlTable([t.source, t.licence, t.retrieved, t.tier],
      provenance.map((r) => [r.source, r.licence, r.retrievedOn, r.tier]), t.caption));
    sections.push('</section>');
  }
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(t.title)}</title><style>body{font:1rem/1.55 system-ui,sans-serif;max-width:75rem;margin:auto;padding:1rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.7rem;border:1px solid currentColor;text-align:start}th{font-weight:700}section{overflow-x:auto}a:focus-visible,button:focus-visible{outline:3px solid currentColor;outline-offset:3px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><main>${sections.join('\n')}</main></body></html>\n`;
}
export function jsonReport(input, options = {}) {
  const evaluated = reportModel(input, options);
  const canonical = canonicalDrill(input, options);
  const body = { version: 1, ok: evaluated.ok, problems: evaluated.problems,
    model: evaluated.model, inputFingerprint: canonical.ok ? canonical.document.captures.map((c) => c.id) : [] };
  return `${JSON.stringify(body, null, 2)}\n`;
}
export function reportByFormat(input, format, language = 'en', options = {}) {
  if (format === 'text') return textReport(input, language, options);
  if (format === 'csv') return csvReport(input, language, options);
  if (format === 'html') return htmlReport(input, language, options);
  if (format === 'json') return jsonReport(input, options);
  return null;
}
