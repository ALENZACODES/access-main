/**
 * Additional shipped-copy gate. Scanner targets rendered or directly presented
 * document formats, not identifier names in compiled JavaScript libraries.
 * The older binary-safe checker continues to scan JS for forbidden brand text.
 */
import { readdir, readFile, lstat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const COPY_EXTENSIONS = new Set(['.html', '.htm', '.svg', '.xml', '.txt', '.md', '.vtt', '.webmanifest', '.json']);
const MAX_COPY_BYTES = 2_097_152;

// Assemble diagnostic terms at runtime, preventing the scanner file itself
// from containing an accidental user-facing instance of a disallowed phrase.
export const prohibitedTerms = Object.freeze([
  { name: 'EN_CONFIRMATION', value: ['ver', 'ified'].join(''), boundary: true },
  { name: 'EN_REQUEST_CONFIRMATION', value: ['ver', 'ify'].join(''), boundary: true },
  { name: 'FR_CONFIRMATION', value: ['vér', 'ifié'].join(''), boundary: false },
  { name: 'FR_REQUEST_CONFIRMATION', value: ['vér', 'ifier'].join(''), boundary: false },
  { name: 'FR_UNACCENTED_CONFIRMATION', value: ['ver', 'ifier'].join(''), boundary: false },
  { name: 'REALTIME_CLAIM', value: ['real', '-time'].join(''), boundary: true },
  { name: 'PARTNER_CLAIM', value: ['partner', 'ship'].join(''), boundary: true },
  { name: 'PROMISE_CLAIM', value: ['guaran', 'tee'].join(''), boundary: true },
  { name: 'AAA_CLAIM', value: ['AAA', '-conformant'].join(''), boundary: false },
]);

export function isCopyFile(path) {
  return COPY_EXTENSIONS.has(extname(path).toLowerCase());
}

export function scanCopyTerms(text, path = 'document') {
  const results = [];
  if (typeof text !== 'string') throw new TypeError('Text must be a string');
  for (const term of prohibitedTerms) {
    const pattern = term.boundary
      ? new RegExp(`(?<![\\p{L}\\p{N}_])${term.value}(?![\\p{L}\\p{N}_])`, 'giu')
      : new RegExp(`(?<![\\p{L}\\p{N}_])${term.value}[\\p{L}]*`, 'giu');
    for (const match of text.matchAll(pattern)) {
      const before = text.slice(0, match.index);
      const line = before.split('\n').length;
      results.push({ file: path, rule: term.name, line });
    }
  }
  return results.sort((a, b) => a.file.localeCompare(b.file, 'en') || a.line - b.line || a.rule.localeCompare(b.rule, 'en'));
}

export function scanCopyDocument(path, bytes) {
  if (!isCopyFile(path)) return [];
  if (bytes.length > MAX_COPY_BYTES) return [{ file: path, rule: 'COPY_TOO_LARGE', line: 0 }];
  let content;
  try { content = decoder.decode(bytes); }
  catch { return [{ file: path, rule: 'COPY_UTF8', line: 0 }]; }
  const findings = scanCopyTerms(content, path);
  if (content.includes('\uFFFD')) findings.push({ file: path, rule: 'COPY_REPLACEMENT', line: 0 });
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule, 'en'));
}

export async function scanShippedCopy(dir) {
  const root = resolve(dir);
  const results = [];
  async function walk(folder) {
    const children = (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const child of children) {
      const absolute = join(folder, child.name);
      const relativePath = relative(root, absolute).split(sep).join('/');
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) { results.push({ file: relativePath, rule: 'COPY_SYMLINK', line: 0 }); continue; }
      if (info.isDirectory()) { await walk(absolute); continue; }
      if (!info.isFile()) { results.push({ file: relativePath, rule: 'COPY_ENTRY', line: 0 }); continue; }
      if (isCopyFile(relativePath)) results.push(...scanCopyDocument(relativePath, await readFile(absolute)));
    }
  }
  await walk(root);
  return results.sort((a, b) => a.file.localeCompare(b.file, 'en') || a.line - b.line || a.rule.localeCompare(b.rule, 'en'));
}
