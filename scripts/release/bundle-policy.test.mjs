import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BUNDLE_LIMITS, bundleIssue, normalizedPath, sortBundleIssues,
  bundleClassification, validateLimits, relativeSafe, inspectArtifactPath,
  byteSignature, textDecode, assessText, aggregateAssets, collectBundle,
  releaseFingerprint, formatBundleSummary, inspectFileNameSemantics,
  contentSizeProjection,
} from './bundle-policy.mjs';

const rules = (issues) => issues.map((issue) => issue.rule);
const entry = (path, size, sha256 = '') => ({ path, size, sha256 });

async function temporaryBuild(files, action) {
  const root = await mkdtemp(join(tmpdir(), 'artifact-gate-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      const path = join(root, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, value);
    }
    return await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('bundleIssue preserves file, rule and details', () => {
  assert.deepEqual(bundleIssue('index.html', 'TEST', 'example'), {
    file: 'index.html', rule: 'TEST', detail: 'example',
  });
});

test('normalizedPath preserves forward-slash paths', () => {
  assert.equal(normalizedPath('assets/main.js'), 'assets/main.js');
});

test('sortBundleIssues puts files and rules in a stable order', () => {
  const a = bundleIssue('b', 'B', 'b');
  const b = bundleIssue('a', 'A', 'a');
  assert.deepEqual(sortBundleIssues([a, b]), [b, a]);
});

test('sortBundleIssues removes duplicate findings', () => {
  const item = bundleIssue('a', 'A', 'a');
  assert.deepEqual(sortBundleIssues([item, item]), [item]);
});

test('bundle classification recognises JavaScript', () => {
  assert.equal(bundleClassification('assets/main.js'), 'javascript');
  assert.equal(bundleClassification('main.mjs'), 'javascript');
});

test('bundle classification recognises CSS', () => {
  assert.equal(bundleClassification('assets/main.css'), 'stylesheet');
});

test('bundle classification recognises HTML', () => {
  assert.equal(bundleClassification('index.html'), 'html');
  assert.equal(bundleClassification('about.htm'), 'html');
});

test('bundle classification recognises source maps', () => {
  assert.equal(bundleClassification('assets/index.js.map'), 'sourceMap');
});

test('bundle classification recognises images', () => {
  for (const extension of ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'ico']) {
    assert.equal(bundleClassification(`icon.${extension}`), 'image');
  }
});

test('bundle classification recognises web fonts', () => {
  for (const extension of ['woff', 'woff2', 'ttf', 'otf']) {
    assert.equal(bundleClassification(`font.${extension}`), 'font');
  }
});

test('bundle classification recognises media', () => {
  for (const extension of ['mp3', 'm4a', 'wav', 'ogg', 'mp4', 'webm']) {
    assert.equal(bundleClassification(`clip.${extension}`), 'media');
  }
});

test('bundle classification recognises plain text and JSON', () => {
  assert.equal(bundleClassification('data.json'), 'text');
  assert.equal(bundleClassification('robots.txt'), 'text');
});

test('unknown binary extension is classified as other', () => {
  assert.equal(bundleClassification('asset.bin'), 'other');
});

test('default budget values are integers', () => {
  for (const value of Object.values(BUNDLE_LIMITS)) {
    assert.equal(Number.isSafeInteger(value), true);
    assert.ok(value >= 0);
  }
});

test('budget input is frozen and copied', () => {
  const result = validateLimits({ ...BUNDLE_LIMITS });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(result, BUNDLE_LIMITS);
});

test('limits reject negative budgets', () => {
  assert.throws(() => validateLimits({ ...BUNDLE_LIMITS, totalBytes: -1 }), /Invalid limit/);
});

test('limits reject fractional budgets', () => {
  assert.throws(() => validateLimits({ ...BUNDLE_LIMITS, totalBytes: 1.5 }), /Invalid limit/);
});

test('limits reject unsafe integers', () => {
  assert.throws(() => validateLimits({ ...BUNDLE_LIMITS, totalBytes: Number.MAX_SAFE_INTEGER + 1 }), /Invalid limit/);
});

test('limits reject absent keys', () => {
  const value = { ...BUNDLE_LIMITS };
  delete value.maxFiles;
  assert.throws(() => validateLimits(value), /Invalid limit/);
});

test('limits reject null configuration', () => {
  assert.throws(() => validateLimits(null), /Limits must be an object/);
});

test('relativeSafe accepts a nested artifact', () => {
  assert.equal(relativeSafe('assets/one/two.css'), true);
});

test('relativeSafe rejects traversal', () => {
  assert.equal(relativeSafe('assets/../secrets'), false);
});

test('relativeSafe rejects absolute paths', () => {
  assert.equal(relativeSafe('/etc/passwd'), false);
});

test('relativeSafe rejects Windows separators', () => {
  assert.equal(relativeSafe('assets\\app.js'), false);
});

test('relativeSafe rejects duplicate separators', () => {
  assert.equal(relativeSafe('assets//app.js'), false);
});

test('relativeSafe rejects current-directory components', () => {
  assert.equal(relativeSafe('assets/./app.js'), false);
});

test('relativeSafe rejects a null character', () => {
  assert.equal(relativeSafe('assets/\u0000.js'), false);
});

test('relativeSafe rejects an empty name', () => {
  assert.equal(relativeSafe(''), false);
});

test('ordinary artifact path passes structural checks', () => {
  assert.deepEqual(inspectArtifactPath('assets/app.js'), []);
});

test('a sensitive env file is rejected', () => {
  assert.ok(rules(inspectArtifactPath('.env')).includes('SENSITIVE_FILENAME'));
});

test('private key assets are rejected', () => {
  assert.ok(rules(inspectArtifactPath('assets/private-key.pem')).includes('SENSITIVE_FILENAME'));
});

test('database files are rejected', () => {
  assert.ok(rules(inspectArtifactPath('cache/local.sqlite')).includes('SENSITIVE_FILENAME'));
});

test('backup files are rejected', () => {
  assert.ok(rules(inspectArtifactPath('assets/config.bak')).includes('SENSITIVE_FILENAME'));
});

test('a shipped git directory is rejected', () => {
  assert.ok(rules(inspectArtifactPath('.git/config')).includes('DEVELOPMENT_DIR'));
});

test('node_modules is rejected as a packaged asset', () => {
  assert.ok(rules(inspectArtifactPath('node_modules/x/index.js')).includes('DEVELOPMENT_DIR'));
});

test('test source files cannot be shipped', () => {
  assert.ok(rules(inspectArtifactPath('assets/home.test.ts')).includes('TEST_SOURCE'));
});

test('TypeScript source cannot be shipped', () => {
  assert.ok(rules(inspectArtifactPath('assets/main.tsx')).includes('SOURCE_FILE'));
});

test('source map is rejected independently of its byte size', () => {
  assert.ok(rules(inspectArtifactPath('assets/main.js.map')).includes('SOURCE_MAP'));
});

test('operating-system metadata is rejected', () => {
  assert.ok(rules(inspectArtifactPath('Thumbs.db')).includes('OPERATING_SYSTEM_FILE'));
});

test('a well-known directory is permitted', () => {
  assert.equal(rules(inspectArtifactPath('.well-known/security.txt')).includes('HIDDEN_ASSET'), false);
});

test('other hidden directories are rejected', () => {
  assert.ok(rules(inspectArtifactPath('.private/file.js')).includes('HIDDEN_ASSET'));
});

test('deeply nested assets exceed the depth gate', () => {
  const path = Array.from({ length: 23 }, () => 'a').join('/');
  assert.ok(rules(inspectArtifactPath(path)).includes('DEPTH_EXCEEDED'));
});

test('long portable paths exceed the byte limit', () => {
  assert.ok(rules(inspectArtifactPath(`${'a'.repeat(250)}.js`)).includes('PATH_TOO_LONG'));
});

test('UTF-8 byte length is used for portable paths', () => {
  const path = `${'é'.repeat(125)}.js`;
  assert.ok(rules(inspectArtifactPath(path)).includes('PATH_TOO_LONG'));
});

test('SHA-256 byte signatures are deterministic', () => {
  const bytes = Buffer.from('content');
  assert.equal(byteSignature(bytes), byteSignature(bytes));
  assert.equal(byteSignature(bytes).length, 64);
});

test('different bytes create different signatures', () => {
  assert.notEqual(byteSignature(Buffer.from('A')), byteSignature(Buffer.from('B')));
});

test('text decoder accepts French typography', () => {
  assert.equal(textDecode(Buffer.from('l’App')), 'l’App');
});

test('text decoder rejects invalid UTF-8 sequences', () => {
  assert.throws(() => textDecode(Buffer.from([0xff])), /encoded/i);
});

test('valid HTML has no text findings', () => {
  assert.deepEqual(assessText('index.html', Buffer.from('<main>Unknown</main>')), []);
});

test('invalid UTF-8 fails on a text asset', () => {
  assert.ok(rules(assessText('index.html', Buffer.from([0xff]))).includes('INVALID_UTF8'));
});

test('binary files are not decoded as text', () => {
  assert.deepEqual(assessText('image.png', Buffer.from([0xff])), []);
});

test('replacement Unicode code points fail in HTML', () => {
  assert.ok(rules(assessText('index.html', Buffer.from('bad\uFFFD'))).includes('REPLACEMENT_CHARACTER'));
});

test('replacement Unicode code points fail in JSON', () => {
  assert.ok(rules(assessText('data.json', Buffer.from('"bad\uFFFD"'))).includes('REPLACEMENT_CHARACTER'));
});

test('NUL characters fail in text files', () => {
  assert.ok(rules(assessText('main.css', Buffer.from('a\u0000b'))).includes('TEXT_NUL'));
});

test('BOM is rejected in packaged text', () => {
  assert.ok(rules(assessText('app.js', Buffer.from('\ufeffconsole.log(1)'))).includes('UTF8_BOM'));
});

test('local file URLs fail inside shipped HTML', () => {
  assert.ok(rules(assessText('index.html', Buffer.from('<img src="file:///tmp/image.png">'))).includes('LOCAL_PROTOCOL'));
});

test('browser extension URLs fail inside shipped HTML', () => {
  assert.ok(rules(assessText('index.html', Buffer.from('chrome-extension://abc'))).includes('LOCAL_PROTOCOL'));
});

test('oversized text cannot evade inspection', () => {
  assert.ok(rules(assessText('app.js', Buffer.from('abcd'), { ...BUNDLE_LIMITS, maxTextBytes: 2 })).includes('TEXT_LIMIT'));
});

test('aggregateAssets computes total bytes', () => {
  const result = aggregateAssets([entry('index.html', 10), entry('app.js', 20)]);
  assert.equal(result.counts.totalBytes, 30);
  assert.equal(result.counts.files, 2);
});

test('aggregateAssets computes script and CSS budgets independently', () => {
  const result = aggregateAssets([entry('app.js', 20), entry('app.css', 10)]);
  assert.equal(result.counts.javascriptBytes, 20);
  assert.equal(result.counts.stylesheetBytes, 10);
});

test('aggregateAssets rejects a total budget overflow', () => {
  const result = aggregateAssets([entry('app.js', 10)], { ...BUNDLE_LIMITS, totalBytes: 9 });
  assert.ok(rules(result.issues).includes('BUDGET_TOTALBYTES'));
});

test('aggregateAssets rejects a JavaScript budget overflow', () => {
  const result = aggregateAssets([entry('app.js', 11)], { ...BUNDLE_LIMITS, javascriptBytes: 10 });
  assert.ok(rules(result.issues).includes('BUDGET_JAVASCRIPTBYTES'));
});

test('aggregateAssets rejects a CSS budget overflow', () => {
  const result = aggregateAssets([entry('app.css', 11)], { ...BUNDLE_LIMITS, stylesheetBytes: 10 });
  assert.ok(rules(result.issues).includes('BUDGET_STYLESHEETBYTES'));
});

test('aggregateAssets rejects an HTML budget overflow', () => {
  const result = aggregateAssets([entry('index.html', 11)], { ...BUNDLE_LIMITS, htmlBytes: 10 });
  assert.ok(rules(result.issues).includes('BUDGET_HTMLBYTES'));
});

test('aggregateAssets rejects too many files', () => {
  const result = aggregateAssets([entry('a.txt', 1), entry('b.txt', 1)], { ...BUNDLE_LIMITS, maxFiles: 1 });
  assert.ok(rules(result.issues).includes('FILE_COUNT'));
});

test('aggregateAssets rejects empty builds', () => {
  assert.ok(rules(aggregateAssets([]).issues).includes('EMPTY_BUILD'));
});

test('aggregateAssets rejects oversized individual files', () => {
  const result = aggregateAssets([entry('big.png', 11)], { ...BUNDLE_LIMITS, singleAssetBytes: 10 });
  assert.ok(rules(result.issues).includes('ASSET_LIMIT'));
});

test('aggregateAssets rejects case-insensitive path collisions', () => {
  const result = aggregateAssets([entry('A.js', 1), entry('a.js', 2)]);
  assert.ok(rules(result.issues).includes('PATH_COLLISION'));
});

test('aggregateAssets rejects NFC/NFD path collisions', () => {
  const result = aggregateAssets([entry('é.js', 1), entry('e\u0301.js', 2)]);
  assert.ok(rules(result.issues).includes('PATH_COLLISION'));
});

test('aggregateAssets flags duplicate substantial assets', () => {
  const digest = byteSignature(Buffer.from('A'));
  const result = aggregateAssets([entry('a.js', 2048, digest), entry('b.js', 2048, digest)]);
  assert.ok(rules(result.issues).includes('DUPLICATE_BYTES'));
});

test('aggregateAssets ignores duplicate tiny assets', () => {
  const digest = byteSignature(Buffer.from('A'));
  const result = aggregateAssets([entry('a.js', 1, digest), entry('b.js', 1, digest)]);
  assert.equal(rules(result.issues).includes('DUPLICATE_BYTES'), false);
});

test('collectBundle returns sorted stable file paths', async () => {
  await temporaryBuild({ 'b.txt': 'B', 'a.txt': 'A' }, async (root) => {
    const result = await collectBundle(root);
    assert.deepEqual(result.entries.map((item) => item.path), ['a.txt', 'b.txt']);
  });
});

test('collectBundle keeps SHA-256 for each packaged asset', async () => {
  await temporaryBuild({ 'index.html': '<main>Unknown</main>' }, async (root) => {
    const result = await collectBundle(root);
    assert.equal(result.entries[0].sha256, byteSignature(Buffer.from('<main>Unknown</main>')));
  });
});

test('collectBundle never follows symlink files', async () => {
  await temporaryBuild({ 'index.html': '<main>Unknown</main>' }, async (root) => {
    await symlink(join(root, 'index.html'), join(root, 'alias.html'));
    const result = await collectBundle(root);
    assert.ok(rules(result.issues).includes('SYMLINK'));
  });
});

test('collectBundle rejects symlink root', async () => {
  await temporaryBuild({ 'index.html': '<main>Unknown</main>' }, async (root) => {
    const link = `${root}-link`;
    await symlink(root, link);
    try { await assert.rejects(() => collectBundle(link), /real directory/); }
    finally { await rm(link, { force: true }); }
  });
});

test('collectBundle rejects an empty directory', async () => {
  await temporaryBuild({}, async (root) => {
    assert.ok(rules((await collectBundle(root)).issues).includes('EMPTY_BUILD'));
  });
});

test('collectBundle rejects a shipped source map', async () => {
  await temporaryBuild({ 'index.html': '<main>Unknown</main>', 'app.js.map': '{}' }, async (root) => {
    assert.ok(rules((await collectBundle(root)).issues).includes('SOURCE_MAP'));
  });
});

test('collectBundle rejects unsupported UTF-8 in shipped text', async () => {
  await temporaryBuild({ 'bad.txt': Buffer.from([0xff]) }, async (root) => {
    assert.ok(rules((await collectBundle(root)).issues).includes('INVALID_UTF8'));
  });
});

test('collectBundle rejects an asset exceeding its configured budget', async () => {
  await temporaryBuild({ 'index.html': '1234567890' }, async (root) => {
    const result = await collectBundle(root, { limits: { singleAssetBytes: 9 } });
    assert.ok(rules(result.issues).includes('ASSET_LIMIT'));
  });
});

test('collectBundle rejects an over-budget JavaScript asset', async () => {
  await temporaryBuild({ 'index.html': 'a', 'main.js': 'abcde' }, async (root) => {
    const result = await collectBundle(root, { limits: { javascriptBytes: 4 } });
    assert.ok(rules(result.issues).includes('BUDGET_JAVASCRIPTBYTES'));
  });
});

test('collectBundle rejects a forbidden hidden directory', async () => {
  await temporaryBuild({ '.secret/config.json': '{}' }, async (root) => {
    assert.ok(rules((await collectBundle(root)).issues).includes('HIDDEN_ASSET'));
  });
});

test('collectBundle reports the same result twice', async () => {
  await temporaryBuild({ 'index.html': '<main>Unknown</main>', 'app.js': 'const state="UNKNOWN";' }, async (root) => {
    assert.deepEqual(await collectBundle(root), await collectBundle(root));
  });
});

test('fingerprint is independent of input entry ordering', () => {
  const a = entry('a', 2, byteSignature(Buffer.from('aa')));
  const b = entry('b', 3, byteSignature(Buffer.from('bbb')));
  assert.equal(releaseFingerprint([a, b]), releaseFingerprint([b, a]));
});

test('fingerprint changes when an asset changes', () => {
  const a = entry('a', 2, byteSignature(Buffer.from('aa')));
  const b = entry('a', 2, byteSignature(Buffer.from('ab')));
  assert.notEqual(releaseFingerprint([a]), releaseFingerprint([b]));
});

test('fingerprint changes when a filename changes', () => {
  const digest = byteSignature(Buffer.from('a'));
  assert.notEqual(releaseFingerprint([entry('a', 1, digest)]), releaseFingerprint([entry('b', 1, digest)]));
});

test('summary contains count, byte size and fingerprint', () => {
  const entries = [entry('a', 1, byteSignature(Buffer.from('a')))];
  const result = { entries, counts: { files: 1, totalBytes: 1 } };
  assert.match(formatBundleSummary(result), /1 files; 1 bytes; fingerprint [0-9a-f]{64}/);
});

test('filename semantics return no-extension for extensionless files', () => {
  assert.equal(inspectFileNameSemantics('LICENSE'), 'no-extension');
});

test('filename semantics recognise JSON as text', () => {
  assert.equal(inspectFileNameSemantics('file.json'), 'text');
});

test('filename semantics recognise JavaScript as JavaScript', () => {
  assert.equal(inspectFileNameSemantics('file.js'), 'text');
});

test('filename semantics identify unknown binaries', () => {
  assert.equal(inspectFileNameSemantics('file.bin'), 'binary-or-unknown');
});

test('contentSizeProjection sums integer sizes', () => {
  assert.equal(contentSizeProjection([{ size: 10 }, { size: 20 }, { size: 30 }]), 60);
});

test('contentSizeProjection accepts zero-byte assets', () => {
  assert.equal(contentSizeProjection([{ size: 0 }]), 0);
});

test('contentSizeProjection rejects negative sizes', () => {
  assert.throws(() => contentSizeProjection([{ size: -1 }]), /Invalid/);
});

test('contentSizeProjection rejects NaN sizes', () => {
  assert.throws(() => contentSizeProjection([{ size: NaN }]), /Invalid/);
});

test('contentSizeProjection rejects fractional sizes', () => {
  assert.throws(() => contentSizeProjection([{ size: 1.2 }]), /Invalid/);
});

test('contentSizeProjection rejects arithmetic overflow', () => {
  assert.throws(() => contentSizeProjection([{ size: Number.MAX_SAFE_INTEGER }, { size: 1 }]), /overflow/);
});
