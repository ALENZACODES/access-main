import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectRelease, parseArgs, DEFAULT_BUDGET_BYTES } from './check.mjs';

async function withRelease(entries, run) {
  const root = await mkdtemp(join(tmpdir(), 'release-check-'));
  try {
    for (const [name, value] of Object.entries(entries)) {
      const file = join(root, name);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, value);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('clean bilingual release passes and counts nested bytes', async () => {
  await withRelease({ 'index.html': 'Welcome / Bienvenue', 'assets/app.js': 'const x = "UNKNOWN";' }, async (dir) => {
    const result = await inspectRelease(dir);
    assert.equal(result.files, 2);
    assert.equal(result.totalBytes, Buffer.byteLength('Welcome / Bienvenue') + Buffer.byteLength('const x = "UNKNOWN";'));
    assert.deepEqual(result.issues, []);
    assert.equal(result.budgetBytes, DEFAULT_BUDGET_BYTES);
  });
});

test('rejects a size over the configured budget', async () => {
  await withRelease({ 'index.html': '12345' }, async (dir) => {
    assert.match((await inspectRelease(dir, { budgetBytes: 4 })).issues.join(' '), /Size 5 exceeds 4/);
  });
});

test('detects replacement character and forbidden branding without normalising unknown', async () => {
  await withRelease({ 'index.html': '\uFFFD ' + ['sci', 'ontario'].join('') + ' UNKNOWN' }, async (dir) => {
    const issues = (await inspectRelease(dir)).issues;
    assert.ok(issues.some((issue) => issue.includes('U+FFFD')));
    assert.ok(issues.some((issue) => issue.includes('prohibited release text')));
  });
});

test('rejects malformed UTF-8 instead of silently replacing bytes', async () => {
  await withRelease({ 'bad.json': Buffer.from([0xc3, 0x28]) }, async (dir) => {
    assert.match((await inspectRelease(dir)).issues.join(' '), /invalid UTF-8/);
  });
});

test('rejects an empty release directory and invalid arguments', async () => {
  await withRelease({}, async (dir) => {
    await assert.rejects(inspectRelease(dir), /empty/);
  });
  assert.throws(() => parseArgs(['--budget', '-1', '--dir', 'dist']), /Invalid budget/);
  assert.throws(() => parseArgs([]), /--dir requis/);
});


test('rejects every user-facing form of verified and vérifier, including denials', async () => {
  const samples = {
    'en-verified.html': 'This place is verified.',
    'en-not.html': 'This source is not verified.',
    'en-source.html': 'verified source',
    'en-unverified.html': 'Records are unverified.',
    'en-verify.html': 'Click Verify to continue.',
    'fr-verifie.html': 'Ce lieu est vérifié.',
    'fr-verifiee.html': 'Source vérifiée.',
    'fr-verifier.html': 'Veuillez vérifier la fiche.',
  };
  await withRelease(samples, async (dir) => {
    const issues = (await inspectRelease(dir)).issues.join('\n');
    for (const name of Object.keys(samples)) {
      assert.match(issues, new RegExp(name + ': prohibited user-facing'));
    }
  });
});

test('allows only the exact PROTOTYPE-UNVERIFIED label, not other tokens or copy', async () => {
  await withRelease({
    'allowed.js': 'const label = "PROTOTYPE-UNVERIFIED";',
    'verified-token.js': 'const label = "VERIFIED";',
    'claims.js': 'const n = { verifiedClaims: 1 };',
    'about.html': 'Stored records that still say verified: 0. This prototype refuses that label.',
    'banner.html': 'How this shell handles unverified records.',
  }, async (dir) => {
    const issues = (await inspectRelease(dir)).issues.join('\n');
    assert.ok(!issues.includes('allowed.js'), issues);
    assert.match(issues, /verified-token\.js: prohibited user-facing/);
    assert.match(issues, /claims\.js: prohibited user-facing/);
    assert.match(issues, /about\.html: prohibited user-facing/);
    assert.match(issues, /banner\.html: prohibited user-facing/);
  });
});
