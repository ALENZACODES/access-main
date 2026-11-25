/** Conservative Markdown outline lexer. Only parses local supplied text, never fetches links. */
import { lexical } from './document-outline-contract.mjs';
export function normalizeLineEndings(body) { return body.replace(/\r\n?/gu, '\n'); }
export function slug(text) {
  return text.normalize('NFKD').toLowerCase().replace(/<[^>]*>/gu, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/gu, ' ').replace(/\[[^\]]+\]\([^)]*\)/gu, '')
    .replace(/[\p{M}]/gu, '').replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim().replace(/\s+/gu, '-').replace(/-+/gu, '-');
}
export function readableLabel(label) { return typeof label === 'string' && label.trim().length > 0 && !/^\s*(?:here|click here|more|read more|ici|cliquez ici|en savoir plus)\s*$/iu.test(label); }
export function headingFromLine(line) {
  const atx = line.match(/^ {0,3}(#{1,6})(?:\s+|$)(.*)$/u);
  if (!atx) return null;
  const text = atx[2].replace(/\s+#+\s*$/u, '').trim();
  return { level: atx[1].length, text, id: slug(text) };
}
export function fenceFromLine(line) { const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u); return m ? { mark: m[1][0], length: m[1].length, language: m[2].trim() } : null; }
export function linksInLine(line) {
  const links = [];
  // Skip images; preserve only Markdown inline links. Reference-style links require a separate definition lookup.
  const re = /(?<!!)\[([^\]\n]+)\]\((<?[^)\n]*>?)\)/gu;
  for (const m of line.matchAll(re)) {
    const raw = m[2].trim();
    const destination = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw.split(/\s+["']/u, 1)[0];
    links.push({ label: m[1], destination, offset: m.index });
  }
  return links;
}
export function imagesInLine(line) {
  const images = [];
  for (const m of line.matchAll(/!\[([^\]\n]*)\]\(([^)\n]+)\)/gu)) images.push({ alt: m[1], destination: m[2], offset: m.index });
  return images;
}
export function isTableDivider(line) { return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line); }
export function tableColumns(line) { return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').length; }
export function analyzeMarkdown(body) {
  const lines = normalizeLineEndings(body).split('\n');
  const headings = [], links = [], images = [], tables = [], fences = [], alerts = [];
  let fenced = null, htmlBlock = false, setext = false;
  const slugs = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i], number = i + 1;
    const fence = fenceFromLine(line);
    if (fenced) {
      if (fence && fence.mark === fenced.mark && fence.length >= fenced.length && !fence.language) { fences.push({ start: fenced.start, end: number, language: fenced.language }); fenced = null; }
      continue;
    }
    if (fence) { fenced = { ...fence, start: number }; continue; }
    if (/^\s*<!--/u.test(line)) htmlBlock = true;
    if (htmlBlock) { if (line.includes('-->')) htmlBlock = false; continue; }
    const h = headingFromLine(line);
    if (h) {
      const occurrence = slugs.get(h.id) ?? 0; slugs.set(h.id, occurrence + 1);
      headings.push({ ...h, anchor: occurrence ? `${h.id}-${occurrence}` : h.id, line: number, style: 'atx' });
      if (!h.text) alerts.push({ code: 'EMPTY_HEADING', line: number });
      continue;
    }
    const next = lines[i + 1];
    if (line.trim() && next && /^ {0,3}(=+|-+)\s*$/u.test(next) && !line.includes('|')) {
      const level = next.trim().startsWith('=') ? 1 : 2;
      const text = line.trim(), id = slug(text), occurrence = slugs.get(id) ?? 0;
      slugs.set(id, occurrence + 1);
      headings.push({ level, text, id, anchor: occurrence ? `${id}-${occurrence}` : id, line: number, style: 'setext' });
      setext = true;
    } else setext = false;
    for (const link of linksInLine(line)) links.push({ ...link, line: number });
    for (const image of imagesInLine(line)) images.push({ ...image, line: number });
    if (isTableDivider(next ?? '') && !setext) {
      tables.push({ line: number, columns: tableColumns(line), dividerColumns: tableColumns(next), header: line });
    }
  }
  if (fenced) alerts.push({ code: 'UNCLOSED_FENCE', line: fenced.start });
  return { headings, links, images, tables, fences, alerts, lines: lines.length, anchors: [...new Set(headings.map(h => h.anchor))].sort(lexical) };
}
export function normalizeLinkDestination(raw) {
  if (typeof raw !== 'string') return { kind: 'invalid', target: '' };
  const value = raw.trim();
  // eslint-disable-next-line no-control-regex -- control characters are rejected on purpose
  if (!value || /[\u0000-\u001f\u007f\\]/u.test(value)) return { kind: 'invalid', target: value };
  if (value.startsWith('#')) return { kind: 'fragment', target: decodeFragment(value.slice(1)) };
  if (/^(?:https?):\/\//iu.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) return { kind: 'invalid', target: value };
      return { kind: 'external', target: url.href, insecure: url.protocol === 'http:' };
    } catch { return { kind: 'invalid', target: value }; }
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(value) || value.startsWith('//') || value.startsWith('/')) return { kind: 'invalid', target: value };
  const [path, fragment = ''] = value.split('#');
  if (!path || path.includes('..') || path.startsWith('.') || !/^[a-zA-Z0-9/._-]+\.md$/u.test(path)) return { kind: 'invalid', target: value };
  return { kind: 'relative', target: path, fragment: decodeFragment(fragment) };
}
export function decodeFragment(fragment) {
  try { const decoded = decodeURIComponent(fragment); return decoded.toLowerCase(); }
  catch { return fragment.toLowerCase(); }
}
