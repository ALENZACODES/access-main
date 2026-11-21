/** Read-only, local-only audit of a declared release artifact tree. */
import { Buffer } from 'node:buffer';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inspectPrecache, PRECACHE_CHUNK_LIMIT, PRECACHE_MAX_ASSET_BYTES } from './precache-contract.mjs';

export const FILE_SCAN_VERSION = 1;
export const FILE_SCAN_CONCURRENCY = 1;
const MAX_READ = PRECACHE_MAX_ASSET_BYTES;
function problem(code, path) { return Object.freeze({ code, path }); }
function inside(root, target) {
  const diff = relative(root, target);
  return diff !== '..' && !diff.startsWith(`..${sep}`) && !isAbsolute(diff);
}
export function fileStatus(expected, actual) {
  if (actual === null) return 'MISSING';
  if (!expected || !actual) return 'UNKNOWN';
  if (expected.bytes !== actual.bytes || expected.sha256 !== actual.sha256) return 'CHANGED';
  return 'MATCH';
}
export function scanTotals(entries) {
  const total = { count: entries.length, present: 0, missing: 0, changed: 0, unknown: 0, bytes: 0, offlinePackBytes: 0 };
  for (const entry of entries) {
    const status = entry.status;
    if (status === 'MATCH') total.present++;
    else if (status === 'MISSING') total.missing++;
    else if (status === 'CHANGED') total.changed++;
    else total.unknown++;
    if (entry.actual && Number.isSafeInteger(entry.actual.bytes)) {
      total.bytes += entry.actual.bytes;
      if (entry.group === 'offline-pack') total.offlinePackBytes += entry.actual.bytes;
    }
  }
  return total;
}
export async function inspectFile(root, asset, options = {}) {
  const problems = [];
  const base = resolve(root);
  const target = resolve(base, asset.path);
  if (!inside(base, target) || target === base) {
    return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('PATH_OUTSIDE', asset.path)] };
  }
  let rootStat;
  try { rootStat = await lstat(base); }
  catch { return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('ROOT_MISSING', '/')] }; }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('ROOT_TYPE', '/')] };
  }
  let realRoot;
  try { realRoot = await realpath(base); }
  catch { return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('ROOT_UNREADABLE', '/')] }; }
  let ancestor = base;
  for (const section of asset.path.split('/').slice(0, -1)) {
    ancestor = join(ancestor, section);
    try {
      const stat = await lstat(ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('UNSAFE_PARENT', asset.path)] };
      }
    } catch (error) {
      return { id: asset.id, group: asset.group, status: error?.code === 'ENOENT' ? 'MISSING' : 'UNKNOWN',
        actual: null, problems: [problem(error?.code === 'ENOENT' ? 'PARENT_MISSING' : 'PARENT_UNREADABLE', asset.path)] };
    }
  }
  let stat;
  try { stat = await lstat(target); }
  catch (error) {
    return { id: asset.id, group: asset.group, status: error?.code === 'ENOENT' ? 'MISSING' : 'UNKNOWN',
      actual: null, problems: [problem(error?.code === 'ENOENT' ? 'FILE_MISSING' : 'FILE_UNREADABLE', asset.path)] };
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('UNSAFE_FILE_TYPE', asset.path)] };
  }
  if (stat.size > MAX_READ || stat.size > (options.maxFileBytes ?? MAX_READ)) {
    return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('FILE_LIMIT', asset.path)] };
  }
  if (asset.group === 'offline-pack' && stat.size > PRECACHE_CHUNK_LIMIT) problems.push(problem('OFFLINE_CHUNK_LIMIT', asset.path));
  let realTarget;
  try { realTarget = await realpath(target); }
  catch { return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('FILE_UNREADABLE', asset.path)] }; }
  if (!inside(realRoot, realTarget)) {
    return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('FILE_OUTSIDE', asset.path)] };
  }
  let handle;
  try {
    if (typeof constants.O_NOFOLLOW !== 'number') throw new Error('unsafe platform');
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openStat = await handle.stat();
    if (!openStat.isFile() || openStat.size > MAX_READ) throw new Error('unsafe file');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < openStat.size) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, openStat.size - position), position);
      if (bytesRead === 0) throw new Error('unexpected end of file');
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const secondStat = await handle.stat();
    if (secondStat.size !== openStat.size || secondStat.mtimeMs !== openStat.mtimeMs) {
      throw new Error('file changed during inspection');
    }
    const actual = { bytes: position, sha256: hash.digest('hex') };
    const status = fileStatus(asset, actual);
    if (status === 'CHANGED') problems.push(problem('FILE_CHANGED', asset.path));
    return { id: asset.id, group: asset.group, status, actual, problems };
  } catch {
    return { id: asset.id, group: asset.group, status: 'UNKNOWN', actual: null, problems: [problem('FILE_READ_FAILED', asset.path)] };
  } finally {
    await handle?.close();
  }
}
export async function auditFiles(root, manifest, options = {}) {
  const contract = inspectPrecache(manifest, options);
  if (!contract.ok) return { ok: false, problems: contract.errors, entries: [], summary: null, releaseId: null };
  const entries = [];
  const sorted = [...manifest.assets].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  for (const item of sorted) {
    const result = await inspectFile(root, item, options);
    entries.push({ ...result, expected: { bytes: item.bytes, sha256: item.sha256 }, path: item.path,
      source: item.source, licence: item.licence, retrievedOn: item.retrievedOn, tier: item.tier,
      state: item.state, kind: item.kind, locale: item.locale, label: item.label });
  }
  const problems = entries.flatMap(item => item.problems);
  const summary = scanTotals(entries);
  return { ok: problems.length === 0, problems, entries, summary, releaseId: manifest.releaseId };
}
export async function loadManifest(path, options = {}) {
  let text;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000) {
      return { ok: false, errors: [problem('MANIFEST_FILE', '/')], manifest: null };
    }
    text = await readFile(path, 'utf8');
  } catch { return { ok: false, errors: [problem('MANIFEST_READ', '/')], manifest: null }; }
  try {
    const manifest = JSON.parse(text);
    const result = inspectPrecache(manifest, options);
    return { ok: result.ok, errors: result.errors, manifest: result.ok ? manifest : null };
  } catch { return { ok: false, errors: [problem('MANIFEST_JSON', '/')], manifest: null }; }
}
