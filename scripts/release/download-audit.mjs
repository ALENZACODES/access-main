/** Offline download and export artifact safety checks. */
import { extname, posix } from 'node:path';
import { finding, tokenizeHtml, isOpenLicence, isValidDate } from './site-audit.mjs';

function hasForbiddenPathCharacter(value) {
  return [...value].some((character) => character === '\\' || character.codePointAt(0) < 32);
}

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.csv', '.txt', '.json', '.geojson', '.gpx', '.kml', '.xml', '.html',
]);
const ALLOWED_MIME = new Map([
  ['.pdf', new Set(['application/pdf'])],
  ['.csv', new Set(['text/csv', 'application/csv'])],
  ['.txt', new Set(['text/plain'])],
  ['.json', new Set(['application/json'])],
  ['.geojson', new Set(['application/geo+json', 'application/json'])],
  ['.gpx', new Set(['application/gpx+xml', 'application/xml'])],
  ['.kml', new Set(['application/vnd.google-earth.kml+xml', 'application/xml'])],
  ['.xml', new Set(['application/xml', 'text/xml'])],
  ['.html', new Set(['text/html'])],
]);
const PRIVATE_FILENAMES = [
  /^\.env(?:\.|$)/i, /(?:^|[._-])secrets?(?:[._-]|$)/i,
  /(?:^|[._-])private(?:[._-]|$)/i, /(?:^|[._-])credential(?:[._-]|$)/i,
  /(?:^|[._-])token(?:[._-]|$)/i,
];
const DANGEROUS_SUFFIXES = /\.(?:exe|bat|cmd|com|ps1|sh|msi|jar|dmg|app|apk|ipa|scr|vbs|hta|reg)$/i;
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const SAFE_NAME = /^[\p{L}\p{N}_.() -]+$/u;
const BOM = '\uFEFF';
const DANGEROUS_CSV_PREFIX = /^[\s\uFEFF]*[=+@\-\t\r]/;
const FORMULA_EXEMPT = /^-\d+(?:\.\d+)?$/;

export function downloadableSuffix(path) {
  return extname(String(path).split(/[?#]/, 1)[0]).toLowerCase();
}

export function safeDownloadName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..') return false;
  if (!SAFE_NAME.test(name) || name.includes('..')) return false;
  if (DANGEROUS_SUFFIXES.test(name)) return false;
  return !PRIVATE_FILENAMES.some((pattern) => pattern.test(name));
}

/**
 * Limit static file references to the release tree. The caller supplies the
 * shipped inventory rather than reading URLs or making network requests.
 */
export function resolveDownload(from, href, files) {
  if (typeof href !== 'string' || href.trim() === '') return { kind: 'empty' };
  const trimmed = href.trim();
  if (trimmed.startsWith('#')) return { kind: 'fragment' };
  if (trimmed.startsWith('blob:')) return { kind: 'runtime' };
  if (REMOTE.test(trimmed)) return { kind: 'remote' };
  if (trimmed.startsWith('/')) return { kind: 'absolute' };
  let decoded;
  try { decoded = decodeURIComponent(trimmed.split(/[?#]/, 1)[0]); } catch {
    return { kind: 'invalid' };
  }
  if (hasForbiddenPathCharacter(decoded)) return { kind: 'invalid' };
  const path = posix.normalize(posix.join(posix.dirname(from), decoded));
  if (path === '..' || path.startsWith('../')) return { kind: 'escape' };
  return files.has(path) ? { kind: 'local', path } : { kind: 'missing', path };
}

export function inspectDownloadAnchors(html, file, files) {
  const issues = [];
  for (const tag of tokenizeHtml(html)) {
    if (tag.name !== 'a' || !Object.hasOwn(tag.attrs, 'download')) continue;
    const href = tag.attrs.href;
    const path = resolveDownload(file, href, files);
    if (path.kind !== 'local' && path.kind !== 'runtime') {
      issues.push(finding('DOWNLOAD_TARGET', file,
        `Download link cannot use a ${path.kind} destination`));
    }
    const filename = tag.attrs.download;
    if (filename && !safeDownloadName(filename)) {
      issues.push(finding('DOWNLOAD_NAME', file,
        'Download filename contains unsafe characters or extension'));
    }
    if (path.kind === 'local') {
      const extension = downloadableSuffix(path.path);
      if (!DOCUMENT_EXTENSIONS.has(extension)) {
        issues.push(finding('DOWNLOAD_FORMAT', file,
          `Unsupported downloadable document extension: ${extension || '(none)'}`));
      }
      if (filename && downloadableSuffix(filename) &&
        downloadableSuffix(filename) !== extension) {
        issues.push(finding('DOWNLOAD_EXTENSION', file,
          'Download name extension does not match the shipped file'));
      }
    }
    if (path.kind === 'runtime' && !filename) {
      issues.push(finding('DOWNLOAD_RUNTIME_NAME', file,
        'Generated download needs an explicit filename'));
    }
  }
  return issues;
}

/** Only inspect structured export records that explicitly declare an export. */
export function inspectExportManifest(json, file, files) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const exports = json.exports;
  if (exports === undefined) return [];
  const issues = [];
  const add = (code, detail) => issues.push(finding(code, file, detail));
  if (!Array.isArray(exports)) {
    add('DOWNLOAD_MANIFEST_SHAPE', 'exports must be an array');
    return issues;
  }
  const names = new Set();
  for (const [index, item] of exports.entries()) {
    const location = `exports[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      add('DOWNLOAD_ENTRY', `${location} must be an object`);
      continue;
    }
    if (!safeDownloadName(item.filename)) {
      add('DOWNLOAD_MANIFEST_NAME', `${location} requires a safe filename`);
      continue;
    }
    if (names.has(item.filename)) {
      add('DOWNLOAD_DUPLICATE', `Duplicate export filename: ${item.filename}`);
    }
    names.add(item.filename);
    const extension = downloadableSuffix(item.filename);
    if (!DOCUMENT_EXTENSIONS.has(extension)) {
      add('DOWNLOAD_MANIFEST_FORMAT', `${location} uses an unsupported format`);
    }
    if (!ALLOWED_MIME.get(extension)?.has(item.mime)) {
      add('DOWNLOAD_MIME', `${location} has a MIME type inconsistent with its extension`);
    }
    if (!item.labels || typeof item.labels.en !== 'string' ||
      !item.labels.en.trim() || typeof item.labels.fr !== 'string' ||
      !item.labels.fr.trim()) {
      add('DOWNLOAD_LOCALE', `${location} requires EN and FR names`);
    }
    if (!item.source || typeof item.source !== 'string' || !item.source.trim()) {
      add('DOWNLOAD_SOURCE', `${location} needs a source`);
    }
    if (!isOpenLicence(item.licence)) {
      add('DOWNLOAD_LICENCE', `${location} needs a licence`);
    }
    if (!isValidDate(item.date)) {
      add('DOWNLOAD_DATE', `${location} needs an ISO publication date`);
    }
    if (item.path) {
      const target = resolveDownload(file, item.path, files);
      if (target.kind !== 'local') add('DOWNLOAD_MANIFEST_TARGET',
        `${location} references an unavailable local file`);
    }
  }
  return issues;
}

/** RFC 4180-style parser with explicit malformed-quote detection. */
export function parseCsv(text) {
  if (typeof text !== 'string') throw new TypeError('CSV must be text');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  let atStart = true;
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"'; i += 1;
      } else if (char === '"') {
        quoted = false; afterQuote = true;
      } else field += char;
      continue;
    }
    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n') {
      throw new SyntaxError(`Unexpected character after quoted field at ${i}`);
    }
    if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; atStart = true; afterQuote = false;
      if (char !== ',') {
        rows.push(row); row = [];
        if (char === '\r' && source[i + 1] === '\n') i += 1;
      }
    } else if (char === '"' && atStart) {
      quoted = true; atStart = false;
    } else if (char === '"') {
      throw new SyntaxError(`Unexpected quote at ${i}`);
    } else {
      field += char; atStart = false;
    }
  }
  if (quoted) throw new SyntaxError('Unterminated CSV quoted field');
  if (row.length || field || afterQuote || source.endsWith(',')) {
    row.push(field); rows.push(row);
  }
  return rows;
}

export function inspectCsv(text, file = 'records.csv') {
  const issues = [];
  let rows;
  try { rows = parseCsv(text); } catch (error) {
    return [finding('DOWNLOAD_CSV_PARSE', file,
      error instanceof Error ? error.message : 'Invalid CSV')];
  }
  if (!rows.length) return [finding('DOWNLOAD_CSV_EMPTY', file, 'CSV has no header row')];
  const width = rows[0].length;
  const headers = new Set();
  for (const header of rows[0]) {
    if (!header.trim()) issues.push(finding('DOWNLOAD_CSV_HEADER', file,
      'CSV header cells must not be empty'));
    if (headers.has(header)) issues.push(finding('DOWNLOAD_CSV_DUPLICATE', file,
      `Duplicate CSV column: ${header}`));
    headers.add(header);
  }
  for (const [index, row] of rows.entries()) {
    if (row.length !== width) issues.push(finding('DOWNLOAD_CSV_COLUMNS', file,
      `Row ${index + 1} has ${row.length} columns, expected ${width}`));
    for (const cell of row) {
      if (DANGEROUS_CSV_PREFIX.test(cell) && !FORMULA_EXEMPT.test(cell.trim())) {
        issues.push(finding('DOWNLOAD_CSV_FORMULA', file,
          `Row ${index + 1} contains a spreadsheet formula-like value`));
      }
    }
  }
  return issues;
}
