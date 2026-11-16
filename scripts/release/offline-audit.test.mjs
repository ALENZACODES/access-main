import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRemoteReference, stripUrlFragment, localPath, parseSrcset,
  htmlOfflineReferences, cssReferences, inspectOfflineHtml,
  inspectOfflineCss, inspectManifest, precacheEntries,
  inspectPrecache, inspectServiceWorker, isServiceWorkerName,
  referenceType, offlineGraph, reachableAssets,
  classifyOfflineDependencies,
} from './offline-audit.mjs';

const names = new Set([
  'index.html', 'app.css', 'app.js', 'icons/logo.svg',
  'images/large.png', 'images/small.png', 'offline.html',
  'fonts/body.woff2', 'manifest.webmanifest',
]);
const codes = (items) => items.map((item) => item.code);

test('remote reference recognition includes protocol-relative hosts', () => {
  assert.equal(isRemoteReference('https://example.org/x'), true);
  assert.equal(isRemoteReference('//example.org/x'), true);
  assert.equal(isRemoteReference('images/local.png'), false);
});

test('fragments and queries do not change the local asset name', () => {
  assert.equal(stripUrlFragment('app.js?v=4#anchor'), 'app.js');
  assert.equal(stripUrlFragment('image.svg#symbol'), 'image.svg');
});

test('local paths resolve from the referring document', () => {
  assert.deepEqual(localPath('pages/index.html', '../app.css'), { path: 'app.css' });
  assert.deepEqual(localPath('index.html', '/icons/logo.svg'), { path: 'icons/logo.svg' });
  assert.deepEqual(localPath('index.html', './app.js?rev=2'), { path: 'app.js' });
});

test('local paths reject root escape', () => {
  assert.match(localPath('index.html', '../secret').error, /escapes/);
  assert.match(localPath('pages/index.html', '%2e%2e/%2e%2e/x').error, /escapes/);
});

test('local paths reject encoded slashes to platform-specific paths', () => {
  assert.match(localPath('index.html', 'C:%5cprivate').error, /Unsafe|scheme/);
  assert.match(localPath('index.html', '%00').error, /Unsafe|scheme/);
});

test('malformed encoding cannot silently pass', () => {
  assert.match(localPath('index.html', '%gg').error, /encoding/);
});

test('external references are deliberately not resolved to local paths', () => {
  for (const url of ['https://example.org/a', '//example.org/a',
    'data:image/png;base64,AAAA', 'blob:123', 'mailto:user@example.org']) {
    assert.deepEqual(localPath('index.html', url), { external: true });
  }
});

test('empty and fragment-only references are ignored', () => {
  assert.deepEqual(localPath('index.html', ''), { ignored: true });
  assert.deepEqual(localPath('index.html', '#fragment'), { ignored: true });
});

test('srcset produces independent image candidates', () => {
  assert.deepEqual(parseSrcset('images/small.png 1x, images/large.png 2x'),
    ['images/small.png', 'images/large.png']);
});

test('HTML scanner enumerates packaged assets and relevant link tags', () => {
  const html = `<script src="app.js"></script>
    <link rel="stylesheet" href="app.css">
    <link rel="canonical" href="https://example.org/">
    <img src="icons/logo.svg" srcset="images/small.png 1x, images/large.png 2x">`;
  const refs = htmlOfflineReferences(html).map((item) => item.value);
  assert.deepEqual(refs, ['app.js', 'app.css', 'icons/logo.svg',
    'images/small.png', 'images/large.png']);
});

test('HTML scanner rejects broken image assets', () => {
  assert.ok(codes(inspectOfflineHtml('<img src="missing.png">', 'index.html', names))
    .includes('OFFLINE_MISSING_ASSET'));
});

test('HTML scanner rejects remote script dependencies', () => {
  assert.ok(codes(inspectOfflineHtml(
    '<script src="https://example.org/runtime.js"></script>', 'index.html', names))
    .includes('OFFLINE_EXTERNAL_ASSET'));
});

test('HTML scanner does not classify normal hyperlinks as assets', () => {
  assert.deepEqual(inspectOfflineHtml(
    '<a href="https://example.org/">External</a>', 'index.html', names), []);
});

test('HTML scanner accepts local preloads and SVG references', () => {
  assert.deepEqual(inspectOfflineHtml(
    '<link rel="preload" href="fonts/body.woff2"><svg><use href="icons/logo.svg"></use></svg>',
    'index.html', names), []);
});

test('CSS reference scanner extracts url and import', () => {
  const refs = cssReferences('@import "app.css"; .a{background:url("icons/logo.svg")}');
  assert.ok(refs.some((value) => value.value === 'app.css'));
  assert.ok(refs.some((value) => value.value === 'icons/logo.svg'));
});

test('CSS scanner ignores comments and checks referenced files', () => {
  const css = '/* url(missing.png) */ .a { background: url(icons/logo.svg) }';
  assert.deepEqual(inspectOfflineCss(css, 'index.css', names), []);
});

test('CSS scanner flags external fonts', () => {
  assert.ok(codes(inspectOfflineCss(
    '@font-face {src: url(https://example.org/font.woff2)}', 'app.css', names))
    .includes('CSS_EXTERNAL_ASSET'));
});

test('CSS scanner flags missing local imports', () => {
  assert.ok(codes(inspectOfflineCss('@import "gone.css";', 'app.css', names))
    .includes('CSS_MISSING_ASSET'));
});

test('manifest accepts packaged local icons and start page', () => {
  assert.deepEqual(inspectManifest({
    name: 'Sample / Exemple', short_name: 'Sample', display: 'standalone',
    start_url: '/index.html', icons: [{ src: '/icons/logo.svg', sizes: 'any' }],
  }, 'manifest.webmanifest', names), []);
});

test('manifest rejects missing names', () => {
  assert.ok(codes(inspectManifest({}, 'manifest.webmanifest', names))
    .includes('MANIFEST_NAME'));
  assert.ok(codes(inspectManifest({}, 'manifest.webmanifest', names))
    .includes('MANIFEST_SHORT_NAME'));
});

test('manifest rejects external start URLs and scope', () => {
  const issues = inspectManifest({ name: 'X', short_name: 'X',
    start_url: 'https://example.org', scope: '//example.org/' },
    'manifest.webmanifest', names);
  assert.equal(codes(issues).filter((code) => code === 'MANIFEST_URL').length, 2);
});

test('manifest rejects missing icons', () => {
  const issues = inspectManifest({ name: 'X', short_name: 'X',
    icons: [{ src: 'missing.png' }] }, 'manifest.webmanifest', names);
  assert.ok(codes(issues).includes('MANIFEST_ICON'));
});

test('manifest validates icon dimensions', () => {
  const issues = inspectManifest({ name: 'X', short_name: 'X',
    icons: [{ src: '/icons/logo.svg', sizes: 'several' }] },
    'manifest.webmanifest', names);
  assert.ok(codes(issues).includes('MANIFEST_ICON_SIZE'));
});

test('manifest permits local shortcut routes', () => {
  assert.deepEqual(inspectManifest({ name: 'X', short_name: 'X',
    shortcuts: [{ name: 'Browse', url: '/browse' }] },
    'manifest.webmanifest', names), []);
});

test('manifest rejects malformed shortcut objects', () => {
  const issues = inspectManifest({ name: 'X', short_name: 'X',
    shortcuts: [{ name: '', url: '/browse' }, null] },
    'manifest.webmanifest', names);
  assert.equal(codes(issues).filter((code) => code === 'MANIFEST_SHORTCUT').length, 2);
});

test('precache scanner reads explicit list calls', () => {
  assert.deepEqual(precacheEntries(
    "cache.addAll(['/index.html', '/app.js']);"), ['/index.html', '/app.js']);
});

test('precache scanner detects missing files', () => {
  const issues = inspectPrecache("cache.addAll(['/index.html', '/lost.js'])",
    'sw.js', names);
  assert.ok(codes(issues).includes('PRECACHE_MISSING'));
});

test('precache scanner accepts packaged files', () => {
  assert.deepEqual(inspectPrecache("cache.addAll(['/index.html', '/app.js'])",
    'sw.js', names), []);
});

test('precache scanner flags remote dependencies', () => {
  assert.ok(codes(inspectPrecache(
    "cache.addAll(['https://example.org/app.js'])", 'sw.js', names))
    .includes('PRECACHE_URL'));
});

test('service worker scanner catches forced page reloads', () => {
  assert.ok(codes(inspectServiceWorker('location.reload()', 'sw.js'))
    .includes('SW_FORCED_RELOAD'));
});

test('service worker scanner catches remote imports', () => {
  assert.ok(codes(inspectServiceWorker(
    "importScripts('https://example.org/sw.js')", 'sw.js'))
    .includes('SW_REMOTE_IMPORT'));
});

test('service worker identification is limited to known filenames', () => {
  assert.equal(isServiceWorkerName('sw.js'), true);
  assert.equal(isServiceWorkerName('assets/service-worker.js'), true);
  assert.equal(isServiceWorkerName('assets/main.js'), false);
});

test('reference classification covers local asset types', () => {
  assert.equal(referenceType('app.js?v=3'), 'script');
  assert.equal(referenceType('app.css'), 'style');
  assert.equal(referenceType('fonts/body.woff2'), 'font');
  assert.equal(referenceType('logo.svg'), 'image');
  assert.equal(referenceType('misc.bin'), 'fetch');
});

test('offline graph traces references through nested CSS', () => {
  const graph = offlineGraph([
    { kind: 'html', file: 'index.html', text: '<link rel="stylesheet" href="app.css">' },
    { kind: 'css', file: 'app.css', text: '@font-face{src:url(fonts/body.woff2)}' },
  ]);
  assert.deepEqual([...reachableAssets(graph)].sort(),
    ['app.css', 'fonts/body.woff2', 'index.html']);
});

test('offline summary counts referenced asset kinds', () => {
  const report = classifyOfflineDependencies([
    { kind: 'html', file: 'index.html',
      text: '<script src="app.js"></script><img src="icons/logo.svg">' },
  ]);
  assert.equal(report.counts.script, 1);
  assert.equal(report.counts.image, 1);
  assert.ok(report.reachable.has('index.html'));
});
