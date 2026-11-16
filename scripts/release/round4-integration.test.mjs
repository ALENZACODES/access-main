import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deepAudit, deepMain } from './deep-audit.mjs';

const base = `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fixture</title></head><body><main id="main">Content</main></body></html>`;

async function site(files, check) {
  const dir = await mkdtemp(join(tmpdir(), 'access-round4-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    return await check(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const codes = (report) => report.issues.map((item) => item.code);

test('new audits permit a minimal English document', async () => {
  await site({ 'index.html': base }, async (dir) => {
    const report = await deepAudit(dir);
    assert.deepEqual(report.issues, []);
  });
});

test('new audits fail on remote script injection', async () => {
  await site({ 'index.html': base.replace('</body>',
    '<script src="https://example.org/script.js"></script></body>') },
  async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('PRIVACY_REMOTE_SCRIPT'));
  });
});

test('new audits fail on a missing local fragment', async () => {
  await site({ 'index.html': base.replace('</main>',
    '<a href="#missing">Skip</a></main>') }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('NAV_MISSING_FRAGMENT'));
  });
});

test('new audits accept a local fragment', async () => {
  await site({ 'index.html': base.replace('</main>',
    '<a href="#main">Skip</a></main>') }, async (dir) => {
    assert.ok(!codes(await deepAudit(dir)).includes('NAV_MISSING_FRAGMENT'));
  });
});

test('new audits fail on a dialog without a name', async () => {
  await site({ 'index.html': base.replace('</main>',
    '<div role="dialog"></div></main>') }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('SEM_DIALOG_NAME'));
  });
});

test('new audits fail on invalid source state', async () => {
  await site({ 'index.html': base, 'places.json': JSON.stringify({ places: [{
    id: 'one', name: 'One', fields: { stepFreeEntrance: true },
  }] }) }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('CONTENT_ACCESS_STATE'));
  });
});

test('new audits fail on contradictory unknown state', async () => {
  await site({ 'index.html': base, 'places.json': JSON.stringify({ places: [{
    id: 'one', name: 'One', fields: { stepFreeEntrance: {
      state: 'UNKNOWN', accessible: true,
    } },
  }] }) }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('CONTENT_UNKNOWN_CONFLICT'));
  });
});

test('new audits accept unknown without provenance', async () => {
  await site({ 'index.html': base, 'places.json': JSON.stringify({ places: [{
    id: 'one', name: 'One', fields: { stepFreeEntrance: 'UNKNOWN' },
  }] }) }, async (dir) => {
    assert.ok(!codes(await deepAudit(dir)).some((code) =>
      code.startsWith('CONTENT_')));
  });
});

test('new audits fail on tracking endpoint in shipped script', async () => {
  await site({ 'index.html': base, 'main.js':
    'const endpoint = "https://www.clarity.ms/api";' }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('PRIVACY_TRACKING_HOST'));
  });
});

test('new audits fail on broad geolocation permission', async () => {
  await site({ 'index.html': base,
    '_headers': 'Permissions-Policy: geolocation=*' }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('PRIVACY_PERMISSIONS'));
  });
});

test('new audits fail on malformed table markup', async () => {
  await site({ 'index.html': base.replace('</main>',
    '<table><tr><td>A</td></tr></table></main>') }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('SEM_TABLE_HEADERS'));
  });
});

test('new audits fail on repeated place identifiers', async () => {
  await site({ 'index.html': base,
    'places.json': JSON.stringify([{
      id: 'same', name: 'First', fields: { ramp: 'UNKNOWN' },
    }, {
      id: 'same', name: 'Second', fields: { ramp: 'UNKNOWN' },
    }]) }, async (dir) => {
    assert.ok(codes(await deepAudit(dir)).includes('CONTENT_DUPLICATE_PLACE'));
  });
});

test('new audits accept valid separate identifiers', async () => {
  await site({ 'index.html': base,
    'places.json': JSON.stringify([{
      id: 'one', name: 'First', fields: { ramp: 'UNKNOWN' },
    }, {
      id: 'two', name: 'Second', fields: { ramp: 'UNKNOWN' },
    }]) }, async (dir) => {
    assert.ok(!codes(await deepAudit(dir)).includes('CONTENT_DUPLICATE_PLACE'));
  });
});

test('new audits return nonzero on HTML security errors', async () => {
  await site({ 'index.html': base.replace('</main>',
    '<svg role="img"></svg></main>') }, async (dir) => {
    const logs = [];
    const result = await deepMain(['--dir', dir], {
      log: (text) => logs.push(text),
      error: (text) => logs.push(text),
    });
    assert.equal(result, 1);
    assert.ok(logs.some((line) => line.includes('SEM_SVG_NAME')));
  });
});
