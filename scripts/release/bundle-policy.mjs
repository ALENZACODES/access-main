/** Byte-exact, deterministic artifact policy inspection. No network or build. */
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

export const BUNDLE_LIMITS = Object.freeze({
  totalBytes: 5_242_880,
  maxFiles: 2500,
  maxDepth: 20,
  singleAssetBytes: 2_097_152,
  javascriptBytes: 2_097_152,
  stylesheetBytes: 786_432,
  htmlBytes: 262_144,
  sourceMapBytes: 0,
  maxPathBytes: 240,
  maxTextBytes: 2_097_152,
});

const TEXT_FILE_NAMES = new Set(['robots.txt', 'manifest.webmanifest']);
const TEXT_TYPES = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.svg', '.json', '.txt', '.webmanifest', '.xml', '.csv', '.geojson', '.vtt', '.map']);
const ENCODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const CACHE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const SECRET_NAME = /(?:^|[._-])(?:private[-_]?key|credentials?|secrets?|passwords?|auth[-_]?token)(?:[._-]|$)/i;
const SECRET_SUFFIX = /\.(?:pem|p12|pfx|key|env|sqlite|db|bak|orig|swp|tmp)$/i;
const DISALLOWED_DIRS = new Set(['node_modules', '.git', '.github', '__tests__', 'coverage']);
const MAX_FILES_HARD = 10_000;
const MAX_SCAN_BYTES = 100_000_000;

export function bundleIssue(file, rule, detail) { return { file, rule, detail }; }

export function normalizedPath(value) { return value.split(sep).join('/'); }

export function sortBundleIssues(issues) {
  const result = new Map();
  for (const issue of issues) result.set(JSON.stringify([issue.file, issue.rule, issue.detail]), issue);
  return [...result.values()].sort((a, b) =>
    a.file.localeCompare(b.file, 'en') || a.rule.localeCompare(b.rule, 'en') || a.detail.localeCompare(b.detail, 'en'));
}

export function bundleClassification(path) {
  const extension = extname(path).toLowerCase();
  if (path.toLowerCase().endsWith('.map')) return 'sourceMap';
  if (['.js', '.mjs', '.cjs'].includes(extension)) return 'javascript';
  if (extension === '.css') return 'stylesheet';
  if (['.html', '.htm'].includes(extension)) return 'html';
  if (['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico'].includes(extension)) return 'image';
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(extension)) return 'font';
  if (['.mp3', '.m4a', '.wav', '.ogg', '.mp4', '.webm'].includes(extension)) return 'media';
  if (TEXT_TYPES.has(extension) || TEXT_FILE_NAMES.has(basename(path).toLowerCase())) return 'text';
  return 'other';
}

export function validateLimits(limits) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new TypeError('Limits must be an object');
  for (const [key, value] of Object.entries(BUNDLE_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 0) throw new TypeError(`Invalid limit ${key}`);
    if (typeof value !== 'number') throw new TypeError(`Invalid default ${key}`);
  }
  return Object.freeze({ ...limits });
}

export function relativeSafe(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.includes('\u0000')) return false;
  const pieces = path.split('/');
  return pieces.every((part) => part !== '' && part !== '.' && part !== '..');
}

export function inspectArtifactPath(path, limits = BUNDLE_LIMITS) {
  const issues = [];
  if (!relativeSafe(path)) {
    return [bundleIssue(path, 'UNSAFE_PATH', 'Artifact path is not portable')];
  }
  const parts = path.split('/');
  if (parts.length > limits.maxDepth) issues.push(bundleIssue(path, 'DEPTH_EXCEEDED', 'Artifact nesting is too deep'));
  if (Buffer.byteLength(path, 'utf8') > limits.maxPathBytes) issues.push(bundleIssue(path, 'PATH_TOO_LONG', 'Artifact filename exceeds portable path limit'));
  for (const part of parts) {
    if (DISALLOWED_DIRS.has(part)) issues.push(bundleIssue(path, 'DEVELOPMENT_DIR', 'Development-only directory is included in the build'));
    if (part.startsWith('.') && part !== '.well-known') issues.push(bundleIssue(path, 'HIDDEN_ASSET', 'Hidden file or folder is included'));
  }
  const name = basename(path);
  if (CACHE_NAMES.has(name)) issues.push(bundleIssue(path, 'OPERATING_SYSTEM_FILE', 'Operating-system metadata is included'));
  if (SECRET_SUFFIX.test(name) || SECRET_NAME.test(name)) issues.push(bundleIssue(path, 'SENSITIVE_FILENAME', 'Sensitive filename pattern must not ship'));
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(name)) issues.push(bundleIssue(path, 'TEST_SOURCE', 'Test source should not be shipped'));
  if (/\.(?:ts|tsx|jsx)$/i.test(name)) issues.push(bundleIssue(path, 'SOURCE_FILE', 'Uncompiled source appears in the distribution'));
  if (/\.map$/i.test(name)) issues.push(bundleIssue(path, 'SOURCE_MAP', 'Source maps are outside the production artifact budget'));
  return issues;
}

export function byteSignature(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function textDecode(bytes) {
  return ENCODER.decode(bytes);
}

export function assessText(path, bytes, limits = BUNDLE_LIMITS) {
  const issues = [];
  if (!TEXT_TYPES.has(extname(path).toLowerCase()) && !TEXT_FILE_NAMES.has(basename(path).toLowerCase())) return issues;
  if (bytes.length > limits.maxTextBytes) {
    issues.push(bundleIssue(path, 'TEXT_LIMIT', 'Text asset exceeds inspection size limit'));
    return issues;
  }
  let value;
  try { value = textDecode(bytes); }
  catch { return [bundleIssue(path, 'INVALID_UTF8', 'Text asset is not UTF-8')]; }
  if (value.includes('\uFFFD')) issues.push(bundleIssue(path, 'REPLACEMENT_CHARACTER', 'Text asset contains replacement characters'));
  if (value.includes('\u0000')) issues.push(bundleIssue(path, 'TEXT_NUL', 'Text file contains a NUL character'));
  if (value.charCodeAt(0) === 0xfeff) issues.push(bundleIssue(path, 'UTF8_BOM', 'Unexpected byte order mark'));
  // Reference detection is limited to the bytes shipped, not source modules.
  if (/\b(?:file:\/\/|chrome-extension:\/\/|moz-extension:\/\/)/i.test(value)) {
    issues.push(bundleIssue(path, 'LOCAL_PROTOCOL', 'Packaged text refers to a local-only protocol'));
  }
  return issues;
}

export function aggregateAssets(assets, limits = BUNDLE_LIMITS) {
  const counts = { totalBytes: 0, files: 0, javascriptBytes: 0, stylesheetBytes: 0, htmlBytes: 0, sourceMapBytes: 0 };
  const issues = [];
  const seenCasefold = new Map();
  const seenHashes = new Map();
  for (const asset of assets) {
    counts.files++;
    counts.totalBytes += asset.size;
    const bucket = `${bundleClassification(asset.path)}Bytes`;
    if (Object.hasOwn(counts, bucket)) counts[bucket] += asset.size;
    if (asset.size > limits.singleAssetBytes) issues.push(bundleIssue(asset.path, 'ASSET_LIMIT', 'Single asset exceeds size limit'));
    const folded = asset.path.normalize('NFC').toLocaleLowerCase('en-CA');
    if (seenCasefold.has(folded) && seenCasefold.get(folded) !== asset.path) {
      issues.push(bundleIssue(asset.path, 'PATH_COLLISION', `Conflicts with ${seenCasefold.get(folded)}`));
    } else seenCasefold.set(folded, asset.path);
    if (asset.sha256) {
      const previous = seenHashes.get(asset.sha256);
      if (previous && previous !== asset.path && asset.size > 1024) {
        issues.push(bundleIssue(asset.path, 'DUPLICATE_BYTES', `Same bytes as ${previous}`));
      } else seenHashes.set(asset.sha256, asset.path);
    }
  }
  for (const [key, limitKey] of [
    ['totalBytes', 'totalBytes'], ['javascriptBytes', 'javascriptBytes'],
    ['stylesheetBytes', 'stylesheetBytes'], ['htmlBytes', 'htmlBytes'],
    ['sourceMapBytes', 'sourceMapBytes'],
  ]) {
    if (counts[key] > limits[limitKey]) issues.push(bundleIssue('.', `BUDGET_${key.toUpperCase()}`, `${counts[key]} exceeds ${limits[limitKey]}`));
  }
  if (counts.files > limits.maxFiles) issues.push(bundleIssue('.', 'FILE_COUNT', 'Too many packaged assets'));
  if (counts.files === 0) issues.push(bundleIssue('.', 'EMPTY_BUILD', 'No packaged assets found'));
  return { counts, issues: sortBundleIssues(issues) };
}

/**
 * Directory traversal follows no symlinks. Guardrails prevent arbitrary-size
 * input from consuming unbounded memory before the budget is assessed.
 */
export async function collectBundle(rootDirectory, options = {}) {
  const root = resolve(rootDirectory);
  const limits = validateLimits({ ...BUNDLE_LIMITS, ...(options.limits ?? {}) });
  const entries = [];
  const issues = [];
  let scanned = 0;
  let count = 0;
  async function walk(folder) {
    const children = (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of children) {
      const absolute = join(folder, entry.name);
      const relativePath = normalizedPath(relative(root, absolute));
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        issues.push(bundleIssue(relativePath, 'SYMLINK', 'Symlinks are prohibited in packaged assets'));
        continue;
      }
      if (stat.isDirectory()) {
        issues.push(...inspectArtifactPath(relativePath, limits));
        if (relativePath.split('/').length > limits.maxDepth) continue;
        await walk(absolute);
        continue;
      }
      if (!stat.isFile()) {
        issues.push(bundleIssue(relativePath, 'UNSUPPORTED_ENTRY', 'Unsupported filesystem entry'));
        continue;
      }
      count++;
      if (count > MAX_FILES_HARD) throw new Error('Hard file-count scan limit exceeded');
      scanned += stat.size;
      if (scanned > MAX_SCAN_BYTES) throw new Error('Hard byte-count scan limit exceeded');
      issues.push(...inspectArtifactPath(relativePath, limits));
      const bytes = await readFile(absolute);
      if (bytes.length !== stat.size) {
        issues.push(bundleIssue(relativePath, 'ASSET_CHANGED', 'File size changed during inspection'));
      }
      issues.push(...assessText(relativePath, bytes, limits));
      entries.push({ path: relativePath, size: bytes.length, sha256: byteSignature(bytes), kind: bundleClassification(relativePath) });
    }
  }
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Release root must be a real directory');
  await walk(root);
  const aggregate = aggregateAssets(entries, limits);
  return { entries, limits, counts: aggregate.counts, issues: sortBundleIssues([...issues, ...aggregate.issues]) };
}

export function releaseFingerprint(entries) {
  const lines = entries
    .map(({ path, size, sha256 }) => `${path}\t${size}\t${sha256}`)
    .sort((a, b) => a.localeCompare(b, 'en'));
  return byteSignature(Buffer.from(lines.join('\n'), 'utf8'));
}

export function formatBundleSummary(result) {
  return `${result.counts.files} files; ${result.counts.totalBytes} bytes; fingerprint ${releaseFingerprint(result.entries)}`;
}

export function inspectFileNameSemantics(name) {
  const extension = extname(name).toLowerCase();
  if (!extension) return 'no-extension';
  if (TEXT_TYPES.has(extension)) return 'text';
  if (bundleClassification(name) === 'other') return 'binary-or-unknown';
  return bundleClassification(name);
}

export function contentSizeProjection(records) {
  let sum = 0;
  for (const value of records) {
    if (!Number.isSafeInteger(value.size) || value.size < 0) throw new TypeError('Invalid asset byte size');
    sum += value.size;
    if (!Number.isSafeInteger(sum)) throw new RangeError('Budget arithmetic overflow');
  }
  return sum;
}
