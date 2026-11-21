import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FILE_SCAN_VERSION, FILE_SCAN_CONCURRENCY, fileStatus, scanTotals,
  inspectFile, auditFiles, loadManifest,
} from './precache-files.mjs';
import { PRECACHE_CHUNK_LIMIT } from './precache-contract.mjs';

const DAY = '2026-11-19';
const digest = value => createHash('sha256').update(value).digest('hex');
const asset = (id = 'one', path = 'assets/test.txt', bytes = Buffer.from('example')) => ({
  id, path, kind: 'data', group: 'offline-pack', locale: 'neutral',
  state: 'UNKNOWN', bytes: bytes.length, sha256: digest(bytes),
  source: 'https://example.org/open', licence: 'CC0-1.0', retrievedOn: DAY,
  tier: 0, dependsOn: [], label: { en: 'Synthetic item', fr: 'Élément fictif' },
});
const manifest = (...items) => ({ version: 1, releaseId: 'release-a', retrievedOn: DAY, assets: items });
const codes = result => result.problems.map(item => item.code);
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'precache-fixture-'));
  try {
    await mkdir(join(dir, 'assets'), { recursive: true });
    return await fn(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// Pure result helpers do not access the disk.
test('scanner version is fixed', () => assert.equal(FILE_SCAN_VERSION, 1));
test('scanner concurrency is bounded', () => assert.equal(FILE_SCAN_CONCURRENCY, 1));
test('file matches when byte count and hash match', () => {
  const expected = { bytes: 4, sha256: 'a'.repeat(64) };
  assert.equal(fileStatus(expected, { ...expected }), 'MATCH');
});
test('file changed when hash changes', () => {
  assert.equal(fileStatus({ bytes: 4, sha256: 'a' }, { bytes: 4, sha256: 'b' }), 'CHANGED');
});
test('file changed when size changes', () => {
  assert.equal(fileStatus({ bytes: 4, sha256: 'a' }, { bytes: 5, sha256: 'a' }), 'CHANGED');
});
test('missing file is reported as missing', () => {
  assert.equal(fileStatus({ bytes: 4, sha256: 'a' }, null), 'MISSING');
});
test('missing expectation is UNKNOWN', () => {
  assert.equal(fileStatus(null, { bytes: 4, sha256: 'a' }), 'UNKNOWN');
});
test('empty file summaries are zero', () => {
  assert.deepEqual(scanTotals([]), {
    count: 0, present: 0, missing: 0, changed: 0, unknown: 0,
    bytes: 0, offlinePackBytes: 0,
  });
});
test('summary tracks all four statuses separately', () => {
  const result = scanTotals([
    { status: 'MATCH', actual: { bytes: 2 }, group: 'shell' },
    { status: 'CHANGED', actual: { bytes: 3 }, group: 'offline-pack' },
    { status: 'MISSING', actual: null, group: 'route' },
    { status: 'UNKNOWN', actual: null, group: 'optional' },
  ]);
  assert.equal(result.count, 4);
  assert.equal(result.present, 1);
  assert.equal(result.changed, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.unknown, 1);
  assert.equal(result.bytes, 5);
  assert.equal(result.offlinePackBytes, 3);
});

test('matching local asset passes checksum and length', () => fixture(async root => {
  const bytes = Buffer.from('example');
  await writeFile(join(root, 'assets/test.txt'), bytes);
  const result = await inspectFile(root, asset('one', 'assets/test.txt', bytes));
  assert.equal(result.status, 'MATCH');
  assert.deepEqual(result.problems, []);
  assert.equal(result.actual.bytes, bytes.length);
  assert.equal(result.actual.sha256, digest(bytes));
}));
test('different bytes with same byte count are changed', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'sample!');
  const result = await inspectFile(root, asset());
  assert.equal(result.status, 'CHANGED');
  assert.ok(codes(result).includes('FILE_CHANGED'));
}));
test('different byte count is changed', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'much longer');
  const result = await inspectFile(root, asset());
  assert.equal(result.status, 'CHANGED');
  assert.ok(codes(result).includes('FILE_CHANGED'));
}));
test('missing file is not passed', () => fixture(async root => {
  const result = await inspectFile(root, asset());
  assert.equal(result.status, 'MISSING');
  assert.equal(result.actual, null);
  assert.ok(codes(result).includes('FILE_MISSING'));
}));
test('missing intermediate directory is not passed', () => fixture(async root => {
  const result = await inspectFile(root, asset('a', 'unknown/a.txt'));
  assert.equal(result.status, 'MISSING');
  assert.ok(codes(result).includes('PARENT_MISSING'));
}));
test('missing root is not passed', () => fixture(async root => {
  const result = await inspectFile(join(root, 'absent'), asset());
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('ROOT_MISSING'));
}));
test('root that is a file is rejected', () => fixture(async root => {
  await writeFile(join(root, 'base.txt'), 'root');
  const result = await inspectFile(join(root, 'base.txt'), asset());
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('ROOT_TYPE'));
}));
test('asset folder replaced by file is rejected', () => fixture(async root => {
  await writeFile(join(root, 'assets', 'child'), 'not folder');
  const result = await inspectFile(root, asset('a', 'assets/child/a.txt'));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('UNSAFE_PARENT'));
}));
test('target directory is never treated as a file', () => fixture(async root => {
  await mkdir(join(root, 'assets', 'directory'));
  const result = await inspectFile(root, asset('a', 'assets/directory'));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('UNSAFE_FILE_TYPE'));
}));
test('symbolic link to a file is rejected', () => fixture(async root => {
  await writeFile(join(root, 'assets', 'actual.txt'), 'example');
  await symlink('actual.txt', join(root, 'assets', 'test.txt'));
  const result = await inspectFile(root, asset());
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('UNSAFE_FILE_TYPE'));
}));
test('symbolic link to a folder is rejected', () => fixture(async root => {
  await mkdir(join(root, 'other'));
  await symlink('../other', join(root, 'assets', 'shortcut'));
  const result = await inspectFile(root, asset('a', 'assets/shortcut/a.txt'));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('UNSAFE_PARENT'));
}));
test('symbolic link root is rejected', () => fixture(async root => {
  await symlink('assets', join(root, 'linked'));
  const result = await inspectFile(join(root, 'linked'), asset('a', 'test.txt'));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('ROOT_TYPE'));
}));
test('oversized file is not read', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), Buffer.alloc(100));
  const result = await inspectFile(root, asset(), { maxFileBytes: 10 });
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(codes(result).includes('FILE_LIMIT'));
}));
test('offline file over chunk cap is reported', () => fixture(async root => {
  const bytes = Buffer.alloc(PRECACHE_CHUNK_LIMIT + 1);
  await writeFile(join(root, 'assets/test.txt'), bytes);
  const expected = asset('a', 'assets/test.txt', bytes);
  const result = await inspectFile(root, expected);
  assert.equal(result.status, 'MATCH');
  assert.ok(codes(result).includes('OFFLINE_CHUNK_LIMIT'));
}));
test('file exactly at chunk cap is not a scan issue', () => fixture(async root => {
  const bytes = Buffer.alloc(PRECACHE_CHUNK_LIMIT);
  await writeFile(join(root, 'assets/test.txt'), bytes);
  const result = await inspectFile(root, asset('a', 'assets/test.txt', bytes));
  assert.equal(result.status, 'MATCH');
  assert.deepEqual(result.problems, []);
}));
test('non-offline group does not use offline chunk ceiling', () => fixture(async root => {
  const bytes = Buffer.alloc(PRECACHE_CHUNK_LIMIT + 1);
  await writeFile(join(root, 'assets/test.txt'), bytes);
  const result = await inspectFile(root, { ...asset('a', 'assets/test.txt', bytes), group: 'route' });
  assert.equal(result.status, 'MATCH');
  assert.deepEqual(result.problems, []);
}));
test('a nested folder asset is read safely', () => fixture(async root => {
  await mkdir(join(root, 'assets', 'nested'));
  await writeFile(join(root, 'assets', 'nested', 'value.json'), '{}');
  const result = await inspectFile(root, asset('a', 'assets/nested/value.json', Buffer.from('{}')));
  assert.equal(result.status, 'MATCH');
}));

test('auditing accepted manifest succeeds on matching file', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'example');
  const result = await auditFiles(root, manifest(asset()));
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.summary.present, 1);
}));
test('auditing empty manifest does not invent assets', () => fixture(async root => {
  const result = await auditFiles(root, manifest());
  assert.equal(result.ok, true);
  assert.equal(result.summary.count, 0);
  assert.deepEqual(result.entries, []);
}));
test('invalid manifest fails before disk inspection', () => fixture(async root => {
  const result = await auditFiles(root, manifest({ ...asset(), source: '' }));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.deepEqual(result.entries, []);
}));
test('manifest missing offline file yields nonpassing result', () => fixture(async root => {
  const result = await auditFiles(root, manifest(asset()));
  assert.equal(result.ok, false);
  assert.equal(result.summary.missing, 1);
  assert.ok(result.problems.some(item => item.code === 'FILE_MISSING'));
}));
test('manifest changed byte yields nonpassing result', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'different');
  const result = await auditFiles(root, manifest(asset()));
  assert.equal(result.ok, false);
  assert.equal(result.summary.changed, 1);
}));
test('audit output keeps source, licence, date and tier', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'example');
  const result = await auditFiles(root, manifest(asset()));
  const entry = result.entries[0];
  assert.equal(entry.source, 'https://example.org/open');
  assert.equal(entry.licence, 'CC0-1.0');
  assert.equal(entry.retrievedOn, DAY);
  assert.equal(entry.tier, 0);
}));
test('audit output preserves UNKNOWN claim token', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'example');
  const result = await auditFiles(root, manifest(asset()));
  assert.equal(result.entries[0].state, 'UNKNOWN');
}));
test('audit output does not mutate manifest', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'example');
  const original = manifest(asset());
  const before = JSON.stringify(original);
  await auditFiles(root, original);
  assert.equal(JSON.stringify(original), before);
}));
test('audit sorts files by stable ID', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'example');
  await writeFile(join(root, 'assets/b.txt'), 'two');
  const a = asset();
  const b = asset('bee', 'assets/b.txt', Buffer.from('two'));
  const result = await auditFiles(root, manifest(b, a));
  assert.deepEqual(result.entries.map(item => item.id), ['bee', 'one']);
}));
test('manifest loader returns accepted JSON', () => fixture(async root => {
  const file = join(root, 'manifest.json');
  await writeFile(file, JSON.stringify(manifest(asset())));
  const result = await loadManifest(file);
  assert.equal(result.ok, true);
  assert.equal(result.manifest.assets.length, 1);
}));
test('manifest loader refuses malformed JSON', () => fixture(async root => {
  const file = join(root, 'manifest.json');
  await writeFile(file, '{');
  const result = await loadManifest(file);
  assert.equal(result.ok, false);
  assert.equal(result.manifest, null);
}));
test('manifest loader refuses missing file', () => fixture(async root => {
  const result = await loadManifest(join(root, 'does-not-exist.json'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.code === 'MANIFEST_READ'));
}));
test('manifest loader refuses directory', () => fixture(async root => {
  const result = await loadManifest(join(root, 'assets'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.code === 'MANIFEST_FILE'));
}));
test('manifest loader refuses symbolic link', () => fixture(async root => {
  await writeFile(join(root, 'real.json'), JSON.stringify(manifest(asset())));
  await symlink('real.json', join(root, 'linked.json'));
  const result = await loadManifest(join(root, 'linked.json'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.code === 'MANIFEST_FILE'));
}));
test('manifest loader refuses missing provenance', () => fixture(async root => {
  const file = join(root, 'manifest.json');
  await writeFile(file, JSON.stringify(manifest({ ...asset(), licence: null })));
  const result = await loadManifest(file);
  assert.equal(result.ok, false);
  assert.equal(result.manifest, null);
}));
test('manifest loader honors caller reference date', () => fixture(async root => {
  const file = join(root, 'manifest.json');
  await writeFile(file, JSON.stringify(manifest(asset())));
  const result = await loadManifest(file, { today: '2026-11-18' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.code === 'ASSET_DATE'));
}));
test('read bytes remain unchanged after a successful scan', () => fixture(async root => {
  await writeFile(join(root, 'assets/test.txt'), 'example');
  await inspectFile(root, asset());
  assert.equal(await readFile(join(root, 'assets/test.txt'), 'utf8'), 'example');
}));
test('scanner does not create files when scanning missing asset', () => fixture(async root => {
  await inspectFile(root, asset());
  const files = await readFile(join(root, 'missing-marker.txt')).catch(() => null);
  assert.equal(files, null);
}));
