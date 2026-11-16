/**
 * Conservative, dependency-free static checks for a built, offline-capable site.
 * This module checks evidence present in an artifact; it does not certify
 * runtime accessibility, offline operation, or the accuracy of a claim.
 */
import { readFile, readdir, lstat } from 'node:fs/promises';
import { extname, join, posix, relative, resolve, sep } from 'node:path';

export const SITE_TEXT_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.svg', '.xml',
]);

export const OPEN_LICENCES = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0',
]);

export const ACCESS_STATES = new Set(['YES', 'NO', 'UNKNOWN']);

const REPLACEMENT = '\uFFFD';
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_NAMES = new Set([
  'stepFreeEntrance', 'accessibleWashroom', 'accessibleParking',
  'liftAvailable', 'stepFree', 'doorWidth', 'turningSpace',
  'accessibleEntrance', 'accessibleToilet', 'accessibleWashrooms',
  'elevator', 'ramp', 'automaticDoor', 'accessibleSeating',
]);
const SOURCE_FIELDS = ['source', 'sourceUrl', 'source_url'];
const LICENCE_FIELDS = ['licence', 'license', 'licenceId', 'licenseId'];
const DATE_FIELDS = ['observedOn', 'observed_on', 'updatedAt', 'updated_at', 'date'];
const TILE_HOST_PATTERNS = [
  /(^|\.)tile\.openstreetmap\.org$/i,
  /(^|\.)tiles\.mapbox\.com$/i,
  /(^|\.)api\.mapbox\.com$/i,
  /(^|\.)basemaps\.cartocdn\.com$/i,
  /(^|\.)tile\.thunderforest\.com$/i,
  /(^|\.)tiles\.stadiamaps\.com$/i,
  /(^|\.)maps\.googleapis\.com$/i,
  /(^|\.)server\.arcgisonline\.com$/i,
];

/** @typedef {{ code: string, file: string, detail: string, level: 'error'|'warning' }} Finding */

export function finding(code, file, detail, level = 'error') {
  return { code, file, detail, level };
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !VALID_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isOpenLicence(value) {
  return typeof value === 'string' && OPEN_LICENCES.has(value);
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function provenanceOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, missing: ['source', 'licence', 'date'] };
  }
  const get = (names) => names.find((name) => Object.hasOwn(value, name));
  const source = get(SOURCE_FIELDS);
  const licence = get(LICENCE_FIELDS);
  const date = get(DATE_FIELDS);
  const missing = [];
  if (!source || !hasText(value[source])) missing.push('source');
  if (!licence || !isOpenLicence(value[licence])) missing.push('licence');
  if (!date || !isValidDate(value[date])) missing.push('date');
  return { valid: missing.length === 0, missing };
}

/**
 * A claim is evaluated only if a recognised field contains an explicit state.
 * Numbers and strings such as a door width must not be promoted into access.
 */
export function accessibilityClaims(document) {
  const claims = [];
  const visited = new WeakSet();
  function walk(value, pointer, depth) {
    if (!value || typeof value !== 'object' || depth > 48) return;
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, `${pointer}/${index}`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const childPointer = `${pointer}/${escapeJsonPointer(key)}`;
      if (FIELD_NAMES.has(key)) {
        const explicit = typeof child === 'string' && ACCESS_STATES.has(child);
        const objectState = child && typeof child === 'object' &&
          !Array.isArray(child) && Object.hasOwn(child, 'state');
        if (explicit || objectState) {
          claims.push({ pointer: childPointer, value: child, parent: value });
        }
      }
      walk(child, childPointer, depth + 1);
    }
  }
  walk(document, '', 0);
  return claims;
}

function escapeJsonPointer(value) {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function inspectClaims(document, file) {
  const issues = [];
  for (const claim of accessibilityClaims(document)) {
    const state = typeof claim.value === 'string' ? claim.value : claim.value.state;
    if (!ACCESS_STATES.has(state)) {
      issues.push(finding('CLAIM_STATE', file,
        `${claim.pointer}: state must be YES, NO, or UNKNOWN`));
      continue;
    }
    if (state === 'UNKNOWN') continue;
    const own = provenanceOf(claim.value);
    const parent = provenanceOf(claim.parent);
    // A direct claim may carry its own provenance; a primitive claim may
    // inherit the owning record's provenance, but never an unrelated record.
    if (!own.valid && !parent.valid) {
      issues.push(finding('CLAIM_PROVENANCE', file,
        `${claim.pointer}: missing open source/licence/date evidence`));
    }
  }
  return issues;
}

export function decodeUtf8(bytes, file) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { text: null, issues: [finding('INVALID_UTF8', file, 'Invalid UTF-8')] };
  }
  const issues = text.includes(REPLACEMENT) ?
    [finding('REPLACEMENT', file, 'Unexpected U+FFFD replacement character')] : [];
  return { text, issues };
}

export function findTileHosts(text, file) {
  const issues = [];
  const seen = new Set();
  // Avoid mistaking documentation about hostnames for network use: only
  // scan absolute URLs found in deployed text.
  const urls = text.match(/https?:\/\/[^\s"'<>`\\)]+/gi) ?? [];
  for (const raw of urls) {
    let url;
    try { url = new URL(raw.replace(/[.,;]+$/, '')); } catch { continue; }
    if (TILE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
      if (!seen.has(url.hostname)) {
        issues.push(finding('REMOTE_MAP_TILES', file,
          `Remote map host: ${url.hostname}`));
        seen.add(url.hostname);
      }
    }
  }
  return issues;
}

export function tokenizeHtml(html) {
  const tags = [];
  // Parse tags conservatively: quoted > signs are not tag terminators.
  const regex = /<([a-zA-Z][\w:-]*)(?=[\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    const raw = match[2];
    const attrs = {};
    const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let attr;
    while ((attr = attrRegex.exec(raw)) !== null) {
      const key = attr[1].toLowerCase();
      if (!Object.hasOwn(attrs, key)) {
        attrs[key] = attr[2] ?? attr[3] ?? attr[4] ?? '';
      }
    }
    tags.push({ name, attrs, offset: match.index });
  }
  return tags;
}

export function checkHtml(html, file) {
  const issues = [];
  const tags = tokenizeHtml(html);
  const document = tags.find((tag) => tag.name === 'html');
  const language = document?.attrs.lang?.trim().toLowerCase();
  if (!language || !/^(en|fr)(?:-[a-z0-9]+)*$/.test(language)) {
    issues.push(finding('HTML_LANG', file, 'HTML root requires an EN or FR lang'));
  }
  if (!tags.some((tag) => tag.name === 'meta' &&
      tag.attrs.name?.toLowerCase() === 'viewport')) {
    issues.push(finding('VIEWPORT', file, 'Missing viewport meta tag'));
  }
  if (!tags.some((tag) => tag.name === 'title')) {
    issues.push(finding('PAGE_TITLE', file, 'Missing title element'));
  }
  for (const tag of tags) {
    if (tag.name === 'img' && !Object.hasOwn(tag.attrs, 'alt')) {
      issues.push(finding('IMAGE_ALT', file, 'Image has no alt attribute'));
    }
    if (tag.name === 'iframe' && !hasText(tag.attrs.title)) {
      issues.push(finding('FRAME_TITLE', file, 'Iframe has no accessible title'));
    }
    if (tag.name === 'input' && tag.attrs.type?.toLowerCase() === 'image' &&
        !hasText(tag.attrs.alt)) {
      issues.push(finding('IMAGE_INPUT_ALT', file, 'Image input has no alt'));
    }
    if (tag.name === 'html' && Object.hasOwn(tag.attrs, 'aria-hidden') &&
        tag.attrs['aria-hidden'] === 'true') {
      issues.push(finding('HIDDEN_ROOT', file, 'Document root is hidden'));
    }
    if (tag.name === 'meta' && tag.attrs['http-equiv']?.toLowerCase() === 'refresh') {
      issues.push(finding('META_REFRESH', file, 'Automatic refresh requires review'));
    }
  }
  // Check explicit target declarations; dynamic component dimensions require
  // browser-based checks and are intentionally not guessed from CSS.
  return issues;
}

export function assetReferences(html) {
  const refs = [];
  for (const tag of tokenizeHtml(html)) {
    const value = tag.name === 'script' ? tag.attrs.src :
      tag.name === 'link' ? tag.attrs.href :
      tag.name === 'img' ? tag.attrs.src :
      tag.name === 'source' ? tag.attrs.src : undefined;
    if (typeof value === 'string' && value.trim()) {
      refs.push({ tag: tag.name, value });
    }
  }
  return refs;
}

export function resolveAssetReference(page, value) {
  if (/^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(value)) {
    return null;
  }
  let decoded;
  try { decoded = decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch {
    return { error: 'Invalid URL encoding' };
  }
  if (!decoded || decoded.includes('\\') || decoded.includes('\0')) {
    return decoded ? { error: 'Unsafe asset path' } : null;
  }
  const requested = decoded.startsWith('/') ? decoded.slice(1) :
    posix.join(posix.dirname(page), decoded);
  const normalized = posix.normalize(requested);
  if (normalized === '..' || normalized.startsWith('../')) {
    return { error: 'Asset escapes release directory' };
  }
  return { path: normalized };
}

export function checkAssetRefs(html, file, entries) {
  const issues = [];
  for (const ref of assetReferences(html)) {
    const resolved = resolveAssetReference(file, ref.value);
    if (!resolved) continue;
    if (resolved.error) {
      issues.push(finding('ASSET_PATH', file, `${ref.value}: ${resolved.error}`));
    } else if (!entries.has(resolved.path)) {
      issues.push(finding('MISSING_ASSET', file, `${ref.value}: local asset missing`));
    }
  }
  return issues;
}

export async function collectFiles(root, { maxFiles = 100_000 } = {}) {
  const base = resolve(root);
  const files = new Map();
  async function walk(folder) {
    const children = (await readdir(folder, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const child of children) {
      const absolute = join(folder, child.name);
      const status = await lstat(absolute);
      if (status.isSymbolicLink()) {
        throw new Error(`Symbolic link rejected: ${relative(base, absolute)}`);
      }
      if (status.isDirectory()) {
        await walk(absolute);
      } else if (status.isFile()) {
        const name = relative(base, absolute).split(sep).join('/');
        if (files.has(name)) throw new Error(`Duplicate file: ${name}`);
        files.set(name, { absolute, bytes: status.size });
        if (files.size > maxFiles) throw new Error('Too many release files');
      } else {
        throw new Error(`Unsupported file: ${relative(base, absolute)}`);
      }
    }
  }
  const rootStat = await lstat(base);
  if (!rootStat.isDirectory()) throw new Error('Release root is not a directory');
  await walk(base);
  return files;
}

/** A deterministic report suitable for use by the scoped npm verify job. */
export async function auditSite(root, options = {}) {
  const files = await collectFiles(root, options);
  const issues = [];
  const fileNames = new Set(files.keys());
  const htmlFiles = [...fileNames].filter((name) => extname(name) === '.html');
  if (!fileNames.has('index.html')) {
    issues.push(finding('ENTRY_POINT', '.', 'Missing index.html'));
  }
  if (files.size === 0) issues.push(finding('EMPTY_RELEASE', '.', 'No files'));
  let inspected = 0;
  for (const [name, entry] of files) {
    const extension = extname(name).toLowerCase();
    if (!SITE_TEXT_EXTENSIONS.has(extension)) continue;
    const { text, issues: decodingIssues } = decodeUtf8(await readFile(entry.absolute), name);
    issues.push(...decodingIssues);
    if (text === null) continue;
    inspected += 1;
    issues.push(...findTileHosts(text, name));
    if (extension === '.html') {
      issues.push(...checkHtml(text, name));
      issues.push(...checkAssetRefs(text, name, fileNames));
    }
    if (extension === '.json' || extension === '.webmanifest') {
      let json;
      try { json = JSON.parse(text); } catch {
        issues.push(finding('INVALID_JSON', name, 'Invalid JSON document'));
        continue;
      }
      issues.push(...inspectClaims(json, name));
    }
  }
  return {
    files: files.size, htmlFiles: htmlFiles.length, inspected,
    issues: issues.sort((a, b) =>
      a.file.localeCompare(b.file, 'en') ||
      a.code.localeCompare(b.code, 'en') ||
      a.detail.localeCompare(b.detail, 'en')),
  };
}
