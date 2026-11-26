/** Optional on-disk SHA-256 comparison for a manually chosen release assets directory. */
import { lstat, open, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { checkManifest } from './release-impact-contract.mjs';
export const MAX_BYTES_PER_ASSET = 50 * 1024 * 1024;
const issue = (id, code, path = '') => ({ id, code, path });
export function insideRoot(root, relative) {
  const candidate = resolve(root, relative);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate.startsWith(prefix) && candidate !== root;
}
export async function inspectFile(root, asset) {
  const path = resolve(root, asset.path);
  if (!insideRoot(root, asset.path)) return { ok: false, issue: issue(asset.id, 'PATH_OUTSIDE_ROOT', asset.path) };
  try {
    const parts = asset.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = join(current, parts[i]);
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) return { ok: false, issue: issue(asset.id, 'UNSAFE_DIRECTORY', asset.path) };
    }
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink()) return { ok: false, issue: issue(asset.id, 'UNSAFE_FILE', asset.path) };
    if (before.size > MAX_BYTES_PER_ASSET || before.size !== asset.bytes) return { ok: false, issue: issue(asset.id, 'SIZE_MISMATCH', asset.path) };
    if (await realpath(path) !== path) return { ok: false, issue: issue(asset.id, 'UNSAFE_REALPATH', asset.path) };
    const handle = await open(path, 'r');
    try {
      const during = await handle.stat();
      if (!during.isFile() || during.dev !== before.dev || during.ino !== before.ino || during.size !== before.size) {
        return { ok: false, issue: issue(asset.id, 'CHANGED_DURING_READ', asset.path) };
      }
      const hash = createHash('sha256');
      for await (const buffer of handle.createReadStream({ autoClose: false })) hash.update(buffer);
      const digest = hash.digest('hex');
      if (digest !== asset.sha256) return { ok: false, issue: issue(asset.id, 'HASH_MISMATCH', asset.path) };
      return { ok: true, id: asset.id, bytes: before.size, sha256: digest };
    } finally { await handle.close(); }
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, issue: issue(asset.id, 'FILE_MISSING', asset.path) };
    return { ok: false, issue: issue(asset.id, 'FILE_READ_ERROR', asset.path) };
  }
}
export async function checkAssets(directory, manifest, { today = '9999-12-31' } = {}) {
  const checked = checkManifest(manifest, { today });
  if (!checked.ok) return checked;
  if (typeof directory !== 'string' || directory.trim() !== directory || directory.length === 0) {
    return { ok: false, issues: [{ code: 'ROOT_INVALID', path: '$' }] };
  }
  const root = resolve(directory);
  try {
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== root) {
      return { ok: false, issues: [{ code: 'ROOT_UNSAFE', path: root }] };
    }
  } catch { return { ok: false, issues: [{ code: 'ROOT_MISSING', path: root }] }; }
  const outcomes = [];
  for (const asset of checked.value.assets) outcomes.push(await inspectFile(root, asset));
  return { ok: true, value: {
    checked: outcomes.length,
    passed: outcomes.filter(outcome => outcome.ok).length,
    failed: outcomes.filter(outcome => !outcome.ok).length,
    findings: outcomes.filter(outcome => !outcome.ok).map(outcome => outcome.issue),
    receipts: outcomes.filter(outcome => outcome.ok).map(outcome => ({ id: outcome.id, bytes: outcome.bytes, sha256: outcome.sha256 })),
    caution: 'A matching SHA-256 confirms bytes, not accessibility, runtime behaviour, or source truth.',
  }, issues: [] };
}
