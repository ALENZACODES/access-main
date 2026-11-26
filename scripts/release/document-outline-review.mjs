/** Review an immutable Markdown outline snapshot. Findings are observations, never certification. */
import { UNKNOWN, validateManifest, lexical } from './document-outline-contract.mjs';
import { analyzeMarkdown, normalizeLinkDestination, readableLabel } from './document-outline-parser.mjs';
export const SEVERITIES = Object.freeze(['block', 'review', 'info']);
export const ISSUE_CODES = Object.freeze([
  'HEADING_MISSING', 'HEADING_FIRST_LEVEL', 'HEADING_SKIP', 'HEADING_DUPLICATE', 'HEADING_EMPTY',
  'LINK_UNSAFE', 'LINK_INSECURE', 'LINK_LABEL', 'LINK_FRAGMENT', 'LINK_TARGET', 'LINK_TARGET_FRAGMENT',
  'IMAGE_NO_ALT', 'TABLE_MISMATCH', 'UNCLOSED_FENCE', 'PAIR_MISSING', 'PAIR_DUPLICATE',
  'PAIR_TITLE_MISMATCH', 'PAIR_OUTLINE_MISMATCH', 'SOURCE_OLD', 'SOURCE_UNKNOWN', 'DOCUMENT_UNREVIEWED',
]);
const finding = (doc, code, line, severity, detail = '') => ({ doc: doc.id, path: doc.path, code, line, severity, detail });
const order = (a, b) => lexical(a.path, b.path) || a.line - b.line || lexical(a.code, b.code);
function daysApart(before, after) { return Math.floor((Date.parse(after + 'T00:00:00Z') - Date.parse(before + 'T00:00:00Z')) / 86400000); }
function outlineShape(parsed) { return parsed.headings.map(h => h.level).join('.'); }
export function reviewDocument(doc, manifest, parsed, { today, maxAgeDays = 365 } = {}) {
  const issues = [];
  if (!parsed.headings.length) issues.push(finding(doc, 'HEADING_MISSING', 1, 'block'));
  if (parsed.headings.length && parsed.headings[0].level !== 1) issues.push(finding(doc, 'HEADING_FIRST_LEVEL', parsed.headings[0].line, 'block'));
  for (let i = 1; i < parsed.headings.length; i += 1) {
    const previous = parsed.headings[i - 1], current = parsed.headings[i];
    if (current.level > previous.level + 1) issues.push(finding(doc, 'HEADING_SKIP', current.line, 'review', `${previous.level}->${current.level}`));
  }
  const duplicate = new Map();
  for (const h of parsed.headings) {
    if (!h.text) issues.push(finding(doc, 'HEADING_EMPTY', h.line, 'block'));
    if (h.id) {
      const n = duplicate.get(h.id) ?? 0;
      if (n > 0) issues.push(finding(doc, 'HEADING_DUPLICATE', h.line, 'review', h.id));
      duplicate.set(h.id, n + 1);
    }
  }
  const byPath = new Map(manifest.documents.map(d => [d.path, d]));
  const outlineByPath = new Map(manifest.documents.map(d => [d.path, analyzeMarkdown(d.body)]));
  for (const link of parsed.links) {
    if (!readableLabel(link.label)) issues.push(finding(doc, 'LINK_LABEL', link.line, 'review', link.label));
    const dest = normalizeLinkDestination(link.destination);
    if (dest.kind === 'invalid') issues.push(finding(doc, 'LINK_UNSAFE', link.line, 'block', link.destination));
    else if (dest.kind === 'external' && dest.insecure) issues.push(finding(doc, 'LINK_INSECURE', link.line, 'review', link.destination));
    else if (dest.kind === 'fragment' && !parsed.anchors.includes(dest.target)) issues.push(finding(doc, 'LINK_FRAGMENT', link.line, 'block', dest.target));
    else if (dest.kind === 'relative') {
      const target = byPath.get(dest.target);
      if (!target) issues.push(finding(doc, 'LINK_TARGET', link.line, 'block', dest.target));
      else if (dest.fragment && !outlineByPath.get(target.path).anchors.includes(dest.fragment)) issues.push(finding(doc, 'LINK_TARGET_FRAGMENT', link.line, 'block', `${target.path}#${dest.fragment}`));
    }
  }
  for (const image of parsed.images) if (!image.alt.trim()) issues.push(finding(doc, 'IMAGE_NO_ALT', image.line, 'review', image.destination));
  for (const table of parsed.tables) if (table.columns !== table.dividerColumns) issues.push(finding(doc, 'TABLE_MISMATCH', table.line, 'review', `${table.columns}/${table.dividerColumns}`));
  for (const alert of parsed.alerts) if (alert.code === 'UNCLOSED_FENCE') issues.push(finding(doc, 'UNCLOSED_FENCE', alert.line, 'block'));
  if (doc.state !== 'reviewed') issues.push(finding(doc, 'DOCUMENT_UNREVIEWED', 1, 'info', doc.state));
  if (doc.tier === UNKNOWN) issues.push(finding(doc, 'SOURCE_UNKNOWN', 1, 'info'));
  if (daysApart(doc.retrievedOn, today) > maxAgeDays) issues.push(finding(doc, 'SOURCE_OLD', 1, 'review', doc.retrievedOn));
  return issues.sort(order);
}
export function pairReview(manifest, parsedById) {
  const byPair = new Map();
  for (const doc of manifest.documents) {
    if (!doc.pairId) continue;
    if (!byPair.has(doc.pairId)) byPair.set(doc.pairId, []);
    byPair.get(doc.pairId).push(doc);
  }
  const issues = [];
  for (const documents of byPair.values()) {
    for (const lang of ['en', 'fr']) {
      const matches = documents.filter(d => d.language === lang);
      if (!matches.length) issues.push(finding(documents[0], 'PAIR_MISSING', 1, 'review', lang));
      else if (matches.length > 1) issues.push(finding(matches[1], 'PAIR_DUPLICATE', 1, 'block', lang));
    }
    const en = documents.find(d => d.language === 'en'), fr = documents.find(d => d.language === 'fr');
    if (!en || !fr) continue;
    if (en.title.trim() === fr.title.trim() && en.title.length > 10) issues.push(finding(fr, 'PAIR_TITLE_MISMATCH', 1, 'info', 'Review matching titles'));
    const left = outlineShape(parsedById.get(en.id)), right = outlineShape(parsedById.get(fr.id));
    if (left !== right) issues.push(finding(fr, 'PAIR_OUTLINE_MISMATCH', 1, 'review', `${left}|${right}`));
  }
  return issues.sort(order);
}
export function reviewManifest(manifest, { today = '2026-11-21', maxAgeDays = 365 } = {}) {
  const validated = validateManifest(manifest, { today });
  if (!validated.ok) return { ok: false, errors: validated.errors };
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0 || maxAgeDays > 100_000) return { ok: false, errors: [{ code: 'MAX_AGE', path: 'maxAgeDays' }] };
  const parsedById = new Map(manifest.documents.map(d => [d.id, analyzeMarkdown(d.body)]));
  const issues = manifest.documents.flatMap(doc => reviewDocument(doc, manifest, parsedById.get(doc.id), { today, maxAgeDays }));
  issues.push(...pairReview(manifest, parsedById));
  issues.sort(order);
  const counts = { block: 0, review: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  const documents = manifest.documents.map(doc => ({ id: doc.id, path: doc.path, language: doc.language,
    state: doc.state, pairId: doc.pairId ?? UNKNOWN, headings: parsedById.get(doc.id).headings.length,
    links: parsedById.get(doc.id).links.length, images: parsedById.get(doc.id).images.length,
    tables: parsedById.get(doc.id).tables.length, source: doc.source, licence: doc.licence,
    retrievedOn: doc.retrievedOn, tier: doc.tier })).sort((a,b)=>lexical(a.path,b.path));
  return { ok: true, value: { capturedOn: manifest.capturedOn, today, counts, documents, issues } };
}
export function issueSummary(result) {
  if (!result?.ok) return UNKNOWN;
  const counts = result.value.counts;
  return `${counts.block} block, ${counts.review} review, ${counts.info} info`;
}
