/** Explicitly invoked offline byte audit. Reports file integrity, never accessibility truth. */
import { lstat, realpath, readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { MAX_ASSET_BYTES, safeRelativePath, parseDossier } from './offline-dossier-contract.mjs';
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function equalDigests(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{64}$/u.test(a) || !/^[a-f0-9]{64}$/u.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export async function checkedRoot(root) {
  if (typeof root !== 'string' || !root) throw Error('INVALID_ROOT');
  const absolute = resolve(root), stat = await lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(absolute) !== absolute) throw Error('INVALID_ROOT');
  return absolute;
}
export async function readSafeFile(root, relative, maximum = MAX_ASSET_BYTES) {
  if (!safeRelativePath(relative)) throw Error('UNSAFE_PATH');
  const base = await checkedRoot(root), destination = resolve(base, relative);
  if (!destination.startsWith(`${base}${sep}`)) throw Error('UNSAFE_PATH');
  let walk = base;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    walk = join(walk, parts[i]);
    const stat = await lstat(walk);
    if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory()) ||
      (i === parts.length - 1 && (!stat.isFile() || stat.size > maximum))) throw Error('UNSAFE_FILE');
  }
  if (await realpath(destination) !== destination) throw Error('UNSAFE_FILE');
  const data = await readFile(destination);
  if (data.byteLength > maximum) throw Error('UNSAFE_FILE');
  return data;
}
export function statusFor(error) {
  if (error?.code === 'ENOENT') return 'MISSING';
  if (['UNSAFE_PATH', 'UNSAFE_FILE', 'INVALID_ROOT'].includes(error?.message)) return 'UNSAFE';
  return 'READ_ERROR';
}
export async function inspectItem(root, item) {
  try {
    const bytes = await readSafeFile(root, item.path);
    const actualHash = sha256(bytes), actualBytes = bytes.byteLength;
    const status = actualBytes !== item.bytes ? 'SIZE_MISMATCH' :
      equalDigests(actualHash, item.sha256) ? 'MATCH' : 'HASH_MISMATCH';
    return { id: item.id, status, expectedBytes: item.bytes, actualBytes,
      expectedSha256: item.sha256, actualSha256: actualHash, item };
  } catch (error) {
    return { id: item.id, status: statusFor(error), expectedBytes: item.bytes,
      actualBytes: null, expectedSha256: item.sha256, actualSha256: null, item };
  }
}
export function summarizeResults(results) {
  const counts = { total: 0, MATCH: 0, MISSING: 0, UNSAFE: 0, READ_ERROR: 0, SIZE_MISMATCH: 0, HASH_MISMATCH: 0, unknownEvidence: 0 };
  const groups = {};
  for (const entry of results) {
    counts.total++;
    counts[entry.status]++;
    if (entry.item.status === 'unknown') counts.unknownEvidence++;
    const key = entry.item.category;
    if (!groups[key]) groups[key] = { total: 0, match: 0, unknownEvidence: 0 };
    groups[key].total++;
    if (entry.status === 'MATCH') groups[key].match++;
    if (entry.item.status === 'unknown') groups[key].unknownEvidence++;
  }
  return { counts, groups };
}
export async function auditDossier(dossier, root, { concurrency = 4 } = {}) {
  if (!dossier || !Array.isArray(dossier.items)) throw Error('INVALID_DOSSIER');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) throw Error('INVALID_CONCURRENCY');
  const base = await checkedRoot(root);
  const results = Array(dossier.items.length);
  let next = 0;
  async function worker() {
    while (next < dossier.items.length) {
      const index = next++;
      results[index] = await inspectItem(base, dossier.items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, dossier.items.length) }, () => worker()));
  const summary = summarizeResults(results);
  return { schemaVersion: 1, results, ...summary, complete: summary.counts.total === summary.counts.MATCH };
}
export function compareAudits(before, after) {
  const previous = new Map(before.results.map(x => [x.id, x]));
  const current = new Map(after.results.map(x => [x.id, x]));
  const ids = [...new Set([...previous.keys(), ...current.keys()])].sort();
  const changes = [];
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const id of ids) {
    const old = previous.get(id), now = current.get(id);
    const kind = !old ? 'added' : !now ? 'removed' :
      (old.status === now.status && old.expectedSha256 === now.expectedSha256 &&
        old.actualSha256 === now.actualSha256 && old.expectedBytes === now.expectedBytes &&
        old.actualBytes === now.actualBytes) ? 'unchanged' : 'changed';
    counts[kind]++;
    changes.push({ id, kind, before: old?.status ?? null, after: now?.status ?? null });
  }
  return { counts, changes };
}
export async function readDossierManifest(path, { today } = {}) {
  const absolute = resolve(path), stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000 || await realpath(absolute) !== absolute) throw Error('UNSAFE_MANIFEST');
  const contents = await readFile(absolute, 'utf8');
  return parseDossier(contents, { today });
}
