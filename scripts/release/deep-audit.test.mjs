import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deepAudit, parseDeepArgs, stableIssues, deepMain } from './deep-audit.mjs';

const minimal = `<!doctype html><html lang="en"><head>
<title>Sample</title><meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><main><p>Unknown status</p></main></body></html>`;

async function withSite(files, callback) {
  const folder = await mkdtemp(join(tmpdir(), 'access-p19d-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const path = join(folder, name);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, contents);
    }
    return await callback(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
const codes = (report) => report.issues.map((issue) => issue.code);

test('argument parser requires a directory', () => {
  assert.throws(() => parseDeepArgs([]), /Required --dir/);
});

test('argument parser accepts a file bound', () => {
  assert.deepEqual(parseDeepArgs(['--dir', 'dist', '--max-files', '20']),
    { dir: 'dist', maxFiles: 20 });
});

test('argument parser rejects zero file limit', () => {
  assert.throws(() => parseDeepArgs(['--dir', 'dist', '--max-files', '0']),
    /Invalid --max-files/);
});

test('argument parser rejects unexpected options', () => {
  assert.throws(() => parseDeepArgs(['--dir', 'dist', '--anything']),
    /Unexpected option/);
});

test('issue reports are ordered deterministically', () => {
  const items = [
    { file: 'z', code: 'B', detail: 'x' },
    { file: 'a', code: 'C', detail: 'x' },
    { file: 'a', code: 'A', detail: 'x' },
  ];
  assert.deepEqual(stableIssues(items).map((item) => item.code), ['A', 'C', 'B']);
});

test('minimal valid HTML release passes the deep audit', async () => {
  await withSite({ 'index.html': minimal }, async (folder) => {
    const report = await deepAudit(folder);
    assert.deepEqual(report.issues, []);
    assert.equal(report.totals.html, 1);
    assert.equal(report.reachable, 1);
  });
});

test('release rejects missing local script', async () => {
  await withSite({ 'index.html': minimal + '<script src="missing.js"></script>' },
    async (folder) => {
      assert.ok(codes(await deepAudit(folder)).includes('OFFLINE_MISSING_ASSET'));
    });
});

test('release rejects remote stylesheet', async () => {
  await withSite({ 'index.html': minimal +
    '<link rel="stylesheet" href="https://example.org/app.css">' },
  async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('OFFLINE_EXTERNAL_ASSET'));
  });
});

test('release rejects HTML input without name', async () => {
  await withSite({ 'index.html': minimal + '<input type="search">' },
    async (folder) => {
      assert.ok(codes(await deepAudit(folder)).includes('INPUT_LABEL'));
    });
});

test('release rejects CSS with small explicit target', async () => {
  await withSite({ 'index.html': minimal, 'app.css':
    'button {width: 20px; height: 20px;}' }, async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('EXPLICIT_SMALL_TARGET'));
  });
});

test('release rejects invalid manifest icon', async () => {
  await withSite({ 'index.html': minimal, 'manifest.webmanifest':
    JSON.stringify({ name: 'Sample', short_name: 'Sample',
      icons: [{ src: '/missing.png' }] }) }, async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('MANIFEST_ICON'));
  });
});

test('release rejects broken service worker precache URL', async () => {
  await withSite({ 'index.html': minimal, 'sw.js':
    "cache.addAll(['/not-packaged.js'])" }, async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('PRECACHE_MISSING'));
  });
});

test('release rejects incomplete bilingual catalogue', async () => {
  await withSite({ 'index.html': minimal, 'messages.json':
    JSON.stringify({ en: { open: 'Open' }, fr: {} }) }, async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('CATALOGUE_KEY'));
  });
});

test('release rejects unsupported claims in explicit translation pairs', async () => {
  await withSite({ 'index.html': minimal, 'labels.json':
    JSON.stringify({ heading: { en: 'Guaranteed access', fr: 'Accès' } }) },
  async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('COPY_OVERCLAIM'));
  });
});

test('release rejects unsourced positive accessibility status', async () => {
  await withSite({ 'index.html': minimal, 'places.json':
    JSON.stringify({ places: [{ stepFreeEntrance: 'YES' }] }) },
  async (folder) => {
    assert.ok(codes(await deepAudit(folder)).includes('EVIDENCE_SOURCE'));
  });
});

test('release preserves UNKNOWN status without inventing metadata', async () => {
  await withSite({ 'index.html': minimal, 'places.json':
    JSON.stringify({ places: [{ stepFreeEntrance: 'UNKNOWN' }] }) },
  async (folder) => {
    const report = await deepAudit(folder);
    assert.deepEqual(report.issues, []);
    assert.equal(report.totals.unknown, 1);
  });
});

test('release accepts open-licensed sourced claims', async () => {
  await withSite({ 'index.html': minimal, 'places.json':
    JSON.stringify({ places: [{ stepFreeEntrance: 'NO',
      source: 'Synthetic fixture', licence: 'CC0-1.0',
      observedOn: '2026-11-15' }] }) },
  async (folder) => {
    assert.deepEqual((await deepAudit(folder)).issues, []);
  });
});

test('release skips binary image decoding', async () => {
  await withSite({ 'index.html': minimal, 'logo.png': Buffer.from([0xff, 0xfe]) },
    async (folder) => {
      assert.deepEqual((await deepAudit(folder)).issues, []);
    });
});

test('release rejects invalid UTF-8 in scanned script', async () => {
  await withSite({ 'index.html': minimal, 'app.js': Buffer.from([0xff]) },
    async (folder) => {
      assert.ok(codes(await deepAudit(folder)).includes('INVALID_UTF8'));
    });
});

test('release rejects symlinked assets', async () => {
  const { symlink } = await import('node:fs/promises');
  await withSite({ 'index.html': minimal }, async (folder) => {
    await symlink('index.html', join(folder, 'alias.html'));
    await assert.rejects(deepAudit(folder), /Symbolic link rejected/);
  });
});

test('CLI returns zero for a passing release', async () => {
  await withSite({ 'index.html': minimal }, async (folder) => {
    const logs = [];
    assert.equal(await deepMain(['--dir', folder], {
      log: (value) => logs.push(value),
      error: (value) => logs.push(value),
    }), 0);
    assert.ok(logs.some((entry) => entry.includes('passed')));
  });
});

test('CLI returns nonzero for a violating release', async () => {
  await withSite({ 'index.html': minimal + '<input>' }, async (folder) => {
    const logs = [];
    assert.equal(await deepMain(['--dir', folder], {
      log: (value) => logs.push(value),
      error: (value) => logs.push(value),
    }), 1);
    assert.ok(logs.some((entry) => entry.includes('INPUT_LABEL')));
  });
});

test('CLI returns nonzero on inaccessible release directory', async () => {
  const logs = [];
  const result = await deepMain(['--dir', '/missing-p19d-folder'], {
    log: (entry) => logs.push(entry),
    error: (entry) => logs.push(entry),
  });
  assert.equal(result, 1);
  assert.ok(logs.length > 0);
});
