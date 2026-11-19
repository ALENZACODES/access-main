import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ACCESS_STATES, OPEN_LICENCES, accessibilityClaims, assetReferences,
  auditSite, checkAssetRefs, checkHtml, collectFiles, decodeUtf8,
  findTileHosts, hasText, inspectClaims, isOpenLicence, isValidDate,
  provenanceOf, resolveAssetReference, tokenizeHtml,
} from './site-audit.mjs';
import { auditMain, formatFinding, parseAuditArgs } from './audit.mjs';

const DOCTYPE = '<!doctype html>';
const HEAD = '<head><meta name="viewport" content="width=device-width"><title>the App</title></head>';
const GOOD_PAGE = `${DOCTYPE}<html lang="en">${HEAD}<body><main>UNKNOWN</main></body></html>`;
const FR_PAGE = `${DOCTYPE}<html lang="fr-CA"><head><meta name="viewport" content="width=device-width"><title>l’App</title></head><body><main>UNKNOWN</main></body></html>`;
const PROVENANCE = {
  source: 'Synthetic fixture',
  licence: 'CC0-1.0',
  observedOn: '2026-11-15',
};

async function fixture(entries, callback) {
  const root = await mkdtemp(join(tmpdir(), 'p19c-release-'));
  try {
    for (const [name, content] of Object.entries(entries)) {
      const file = join(root, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function codes(issues) {
  return issues.map((issue) => issue.code);
}

function exampleJson(value) {
  return JSON.stringify({ entries: [value] });
}

function sourceClaim(state, provenance = PROVENANCE) {
  return { state, ...provenance };
}

test('valid date handles leap day correctly', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(isValidDate('2026-11-15'), true);
  assert.equal(isValidDate('2026-11-31'), false);
});

test('valid date rejects unsafe date coercion and invalid year', () => {
  for (const value of [null, 42, '', '2026-1-05', '2026-01-5',
    '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01',
    '2026-02-30', '2026-04-31', '2026-11-15T00:00:00Z']) {
    assert.equal(isValidDate(value), false, String(value));
  }
});

test('licence allowlist is explicit and does not guess compatibility', () => {
  assert.equal(OPEN_LICENCES.has('CC0-1.0'), true);
  assert.equal(isOpenLicence('CC-BY-4.0'), true);
  assert.equal(isOpenLicence('ODbL-1.0'), true);
  assert.equal(isOpenLicence('OGL-Ontario-1.0'), true);
  assert.equal(isOpenLicence('proprietary'), false);
  assert.equal(isOpenLicence('unknown'), false);
  assert.equal(isOpenLicence(undefined), false);
});

test('nonempty source requires a real string', () => {
  assert.equal(hasText(' fixture '), true);
  assert.equal(hasText(' \n  '), false);
  assert.equal(hasText(123), false);
  assert.equal(hasText(null), false);
});

test('provenance accepts snake_case aliases for external records', () => {
  assert.deepEqual(provenanceOf({
    source_url: 'https://example.invalid/source',
    license: 'CC-BY-4.0',
    updated_at: '2024-02-29',
  }), { valid: true, missing: [] });
});

test('provenance refuses absent source, licence or date', () => {
  assert.deepEqual(provenanceOf(null).missing, ['source', 'licence', 'date']);
  const broken = provenanceOf({
    source: '', licence: 'no licence', observedOn: 'today',
  });
  assert.equal(broken.valid, false);
  assert.deepEqual(broken.missing, ['source', 'licence', 'date']);
});

test('provenance requires an object rather than an array', () => {
  assert.equal(provenanceOf([]).valid, false);
  assert.equal(provenanceOf('source').valid, false);
});

test('access states are tightly enumerated', () => {
  assert.deepEqual([...ACCESS_STATES], ['YES', 'NO', 'UNKNOWN']);
  assert.equal(ACCESS_STATES.has('true'), false);
  assert.equal(ACCESS_STATES.has('accessible'), false);
});

test('claim search visits nested arrays and reports JSON pointers', () => {
  const document = {
    features: [{ stepFreeEntrance: sourceClaim('YES') }],
  };
  const found = accessibilityClaims(document);
  assert.equal(found.length, 1);
  assert.equal(found[0].pointer, '/features/0/stepFreeEntrance');
});

test('claim search does not classify arbitrary prose as a claim', () => {
  const document = {
    title: 'YES', label: 'accessible', story: 'Step-free',
    fields: { unknownAttribute: 'NO' },
  };
  assert.deepEqual(accessibilityClaims(document), []);
});

test('claim search refuses unproven positive evidence', () => {
  const data = { stepFreeEntrance: { state: 'YES' } };
  assert.deepEqual(codes(inspectClaims(data, 'data.json')), ['CLAIM_PROVENANCE']);
});

test('claim search refuses unproven negative evidence', () => {
  const data = { accessibleParking: { state: 'NO' } };
  assert.deepEqual(codes(inspectClaims(data, 'data.json')), ['CLAIM_PROVENANCE']);
});

test('UNKNOWN claims stay UNKNOWN even without evidence', () => {
  const data = { accessibleWashroom: { state: 'UNKNOWN' } };
  assert.deepEqual(inspectClaims(data, 'data.json'), []);
  assert.equal(data.accessibleWashroom.state, 'UNKNOWN');
});

test('primitive explicit states may inherit owning record provenance', () => {
  const data = { ...PROVENANCE, liftAvailable: 'NO' };
  assert.deepEqual(inspectClaims(data, 'data.json'), []);
});

test('field-level evidence is accepted with its own source', () => {
  const data = { liftAvailable: sourceClaim('YES') };
  assert.deepEqual(inspectClaims(data, 'data.json'), []);
});

test('parent record does not excuse an invalid claim state', () => {
  const data = { ...PROVENANCE, stepFreeEntrance: { state: 'MAYBE' } };
  assert.deepEqual(codes(inspectClaims(data, 'data.json')), ['CLAIM_STATE']);
});

test('unrecognised access fields do not assert accessibility', () => {
  assert.deepEqual(inspectClaims({ prettyPlace: 'YES' }, 'x.json'), []);
});

test('numerical measurements are not treated as YES or NO', () => {
  assert.deepEqual(inspectClaims({ doorWidth: 95 }, 'x.json'), []);
});

test('claim pointers escape special JSON path characters', () => {
  const data = { 'a/b': { 'x~y': { ramp: 'YES' } } };
  const found = accessibilityClaims(data);
  assert.equal(found[0].pointer, '/a~1b/x~0y/ramp');
});

test('claim search is cycle-safe for in-memory fixtures', () => {
  const data = { liftAvailable: 'UNKNOWN' };
  data.self = data;
  assert.equal(accessibilityClaims(data).length, 1);
});

test('UTF-8 decoder retains legitimate bilingual accents', () => {
  const result = decodeUtf8(Buffer.from('Entrée sans marche / Step-free entrance'), 'x.txt');
  assert.equal(result.text, 'Entrée sans marche / Step-free entrance');
  assert.deepEqual(result.issues, []);
});

test('UTF-8 decoder refuses malformed byte sequences', () => {
  const result = decodeUtf8(Buffer.from([0xc3, 0x28]), 'x.json');
  assert.equal(result.text, null);
  assert.deepEqual(codes(result.issues), ['INVALID_UTF8']);
});

test('UTF-8 decoder reports replacement character', () => {
  const result = decodeUtf8(Buffer.from('X\uFFFDY'), 'x.html');
  assert.equal(result.text, 'X\uFFFDY');
  assert.deepEqual(codes(result.issues), ['REPLACEMENT']);
});

test('remote map tile hosts are rejected', () => {
  const text = 'background:url(https://tile.openstreetmap.org/1/2/3.png)';
  assert.deepEqual(codes(findTileHosts(text, 'style.css')), ['REMOTE_MAP_TILES']);
});

test('remote map checks include multiple commonly used hosts', () => {
  for (const host of [
    'tiles.mapbox.com', 'api.mapbox.com', 'basemaps.cartocdn.com',
    'tile.thunderforest.com', 'tiles.stadiamaps.com',
    'maps.googleapis.com', 'server.arcgisonline.com',
  ]) {
    assert.deepEqual(codes(findTileHosts(`https://${host}/x`, 'x.js')),
      ['REMOTE_MAP_TILES'], host);
  }
});

test('non-tile links and fictional local paths are not blocked', () => {
  const text = 'https://example.invalid/report /tiles/2/3/4.webp';
  assert.deepEqual(findTileHosts(text, 'x.js'), []);
});

test('tile host findings are deduplicated within each file', () => {
  const text = 'https://tile.openstreetmap.org/1 https://tile.openstreetmap.org/2';
  assert.equal(findTileHosts(text, 'x.js').length, 1);
});

test('HTML tokenizer reads attributes in single and double quotes', () => {
  const tags = tokenizeHtml('<html lang="fr"><img alt=\'Carte > plan\' src="a.png">');
  assert.equal(tags[0].attrs.lang, 'fr');
  assert.equal(tags[1].attrs.alt, 'Carte > plan');
  assert.equal(tags[1].attrs.src, 'a.png');
});

test('HTML metadata passes for both supported languages', () => {
  assert.deepEqual(checkHtml(GOOD_PAGE, 'index.html'), []);
  assert.deepEqual(checkHtml(FR_PAGE, 'fr/index.html'), []);
});

test('HTML requires a document language', () => {
  const page = GOOD_PAGE.replace('lang="en"', '');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('HTML_LANG'));
});

test('HTML rejects unsupported document language', () => {
  const page = GOOD_PAGE.replace('lang="en"', 'lang="xx"');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('HTML_LANG'));
});

test('HTML requires a viewport meta tag', () => {
  const page = GOOD_PAGE.replace(/<meta name="viewport"[^>]*>/, '');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('VIEWPORT'));
});

test('HTML requires a title element', () => {
  const page = GOOD_PAGE.replace('<title>the App</title>', '');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('PAGE_TITLE'));
});

test('HTML requires an alt attribute, including for decorative images', () => {
  const page = GOOD_PAGE.replace('</main>', '<img src="a.png"></main>');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('IMAGE_ALT'));
  const decorative = page.replace('<img src="a.png">', '<img src="a.png" alt="">');
  assert.ok(!codes(checkHtml(decorative, 'index.html')).includes('IMAGE_ALT'));
});

test('HTML image inputs must have alt text', () => {
  const page = GOOD_PAGE.replace('</main>', '<input type="image" src="go.svg"></main>');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('IMAGE_INPUT_ALT'));
});

test('HTML frames need a descriptive title', () => {
  const page = GOOD_PAGE.replace('</main>', '<iframe src="help.html"></iframe></main>');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('FRAME_TITLE'));
});

test('HTML root cannot be aria-hidden', () => {
  const page = GOOD_PAGE.replace('lang="en"', 'lang="en" aria-hidden="true"');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('HIDDEN_ROOT'));
});

test('HTML meta refresh is flagged without claiming runtime failure', () => {
  const page = GOOD_PAGE.replace('</head>', '<meta http-equiv="refresh" content="2"></head>');
  assert.ok(codes(checkHtml(page, 'index.html')).includes('META_REFRESH'));
});

test('asset references include scripts, stylesheets and images', () => {
  const html = '<script src="/a.js"></script><link href="b.css"><img src="c.png">';
  assert.deepEqual(assetReferences(html), [
    { tag: 'script', value: '/a.js' },
    { tag: 'link', value: 'b.css' },
    { tag: 'img', value: 'c.png' },
  ]);
});

test('relative asset links resolve from nested HTML page', () => {
  assert.deepEqual(resolveAssetReference('fr/index.html', '../assets/a.js'),
    { path: 'assets/a.js' });
});

test('root-relative links resolve from release root', () => {
  assert.deepEqual(resolveAssetReference('fr/index.html', '/assets/a.css'),
    { path: 'assets/a.css' });
});

test('URL query and fragment are discarded for local path matching', () => {
  assert.deepEqual(resolveAssetReference('index.html', '/app.js?v=1#hash'),
    { path: 'app.js' });
});

test('remote, data and fragment references are ignored by local asset check', () => {
  for (const value of [
    'https://example.invalid/script.js', '//cdn.example.invalid/a.js',
    'data:image/svg+xml,x', 'blob:abc', '#section',
  ]) {
    assert.equal(resolveAssetReference('index.html', value), null);
  }
});

test('unsafe traversals and invalid encoding are rejected', () => {
  assert.equal(resolveAssetReference('index.html', '../../secrets').error,
    'Asset escapes release directory');
  assert.equal(resolveAssetReference('index.html', '%ZZ').error,
    'Invalid URL encoding');
  assert.equal(resolveAssetReference('index.html', '..\\secret').error,
    'Unsafe asset path');
});

test('local asset reference errors name the originating HTML file', () => {
  const issues = checkAssetRefs('<script src="/not-here.js"></script>',
    'index.html', new Set(['index.html']));
  assert.deepEqual(codes(issues), ['MISSING_ASSET']);
  assert.equal(issues[0].file, 'index.html');
});

test('existing local asset references pass', () => {
  const html = '<link href="/assets/app.css"><script src="/assets/app.js"></script>';
  assert.deepEqual(checkAssetRefs(html, 'index.html',
    new Set(['index.html', 'assets/app.css', 'assets/app.js'])), []);
});

test('collector returns deterministic relative paths and byte lengths', async () => {
  await fixture({ 'z.txt': 'ab', 'a/b.txt': '123' }, async (dir) => {
    const files = await collectFiles(dir);
    assert.deepEqual([...files.keys()], ['a/b.txt', 'z.txt']);
    assert.equal(files.get('a/b.txt').bytes, 3);
  });
});

test('collector refuses symlink escapes', async () => {
  await fixture({ 'index.html': GOOD_PAGE }, async (dir) => {
    await symlink('/tmp', join(dir, 'out'));
    await assert.rejects(collectFiles(dir), /Symbolic link rejected/);
  });
});

test('collector enforces file count limit', async () => {
  await fixture({ 'one.txt': '', 'two.txt': '' }, async (dir) => {
    await assert.rejects(collectFiles(dir, { maxFiles: 1 }), /Too many/);
  });
});

test('site audit passes a complete tiny offline release', async () => {
  await fixture({
    'index.html': GOOD_PAGE.replace('</main>',
      '<script src="/assets/app.js"></script><img src="/assets/plan.svg" alt=""></main>'),
    'fr/index.html': FR_PAGE,
    'assets/app.js': 'const access = "UNKNOWN";',
    'assets/plan.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'data/places.json': exampleJson({ ...PROVENANCE, stepFreeEntrance: 'YES' }),
  }, async (dir) => {
    const report = await auditSite(dir);
    assert.equal(report.files, 5);
    assert.equal(report.htmlFiles, 2);
    assert.deepEqual(report.issues, []);
  });
});

test('site audit reports missing entry point', async () => {
  await fixture({ 'other.html': GOOD_PAGE }, async (dir) => {
    assert.ok(codes((await auditSite(dir)).issues).includes('ENTRY_POINT'));
  });
});

test('site audit catches malformed data JSON', async () => {
  await fixture({ 'index.html': GOOD_PAGE, 'data.json': '{bad' }, async (dir) => {
    assert.ok(codes((await auditSite(dir)).issues).includes('INVALID_JSON'));
  });
});

test('site audit catches incomplete provenance inside JSON', async () => {
  await fixture({
    'index.html': GOOD_PAGE,
    'data.json': exampleJson({ accessibleParking: 'YES' }),
  }, async (dir) => {
    assert.ok(codes((await auditSite(dir)).issues).includes('CLAIM_PROVENANCE'));
  });
});

test('site audit does not treat unknown as a positive accessibility claim', async () => {
  await fixture({
    'index.html': GOOD_PAGE,
    'data.json': exampleJson({ accessibleParking: 'UNKNOWN' }),
  }, async (dir) => {
    assert.deepEqual((await auditSite(dir)).issues, []);
  });
});

test('site audit detects remote map tiles inside bundled JS', async () => {
  await fixture({
    'index.html': GOOD_PAGE,
    'app.js': 'const tiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";',
  }, async (dir) => {
    assert.ok(codes((await auditSite(dir)).issues).includes('REMOTE_MAP_TILES'));
  });
});

test('site audit preserves deterministic finding order', async () => {
  await fixture({
    'index.html': '<html><head></head><body><img src="missing.png"></body></html>',
    'data.json': '{oops',
  }, async (dir) => {
    const first = await auditSite(dir);
    const second = await auditSite(dir);
    assert.deepEqual(first, second);
  });
});

test('argument parser requires a release directory', () => {
  assert.throws(() => parseAuditArgs([]), /Required --dir/);
  assert.deepEqual(parseAuditArgs(['--dir', 'dist']),
    { dir: 'dist', maxFiles: 100_000 });
});

test('argument parser enforces a safe positive file limit', () => {
  for (const value of ['0', '-1', '1.5', 'no', '999999999999999999999']) {
    assert.throws(() => parseAuditArgs(['--dir', 'dist', '--max-files', value]));
  }
  assert.equal(parseAuditArgs(['--dir', 'dist', '--max-files', '25']).maxFiles, 25);
});

test('argument parser rejects unknown flags', () => {
  assert.throws(() => parseAuditArgs(['--dir', 'dist', '--unknown']), /Unexpected/);
});

test('finding formatter includes code and file', () => {
  assert.equal(formatFinding({
    level: 'error', code: 'HTML_LANG', file: 'index.html', detail: 'missing',
  }), 'ERROR HTML_LANG index.html: missing');
});

test('CLI returns success for a passing site', async () => {
  await fixture({ 'index.html': GOOD_PAGE }, async (dir) => {
    const logs = [];
    const code = await auditMain(['--dir', dir], {
      log: (s) => logs.push(s), error: (s) => logs.push(s),
    });
    assert.equal(code, 0);
    assert.ok(logs.some((line) => line.includes('passed')));
  });
});

test('CLI returns failure and emits issues', async () => {
  await fixture({ 'index.html': '<html></html>' }, async (dir) => {
    const logs = [];
    const code = await auditMain(['--dir', dir], {
      log: (s) => logs.push(s), error: (s) => logs.push(s),
    });
    assert.equal(code, 1);
    assert.ok(logs.some((line) => line.includes('HTML_LANG')));
  });
});

test('CLI returns failure for missing folder', async () => {
  const logs = [];
  const code = await auditMain(['--dir', '/no-such-p19c-folder'], {
    log: (s) => logs.push(s), error: (s) => logs.push(s),
  });
  assert.equal(code, 1);
  assert.ok(logs.length > 0);
});
