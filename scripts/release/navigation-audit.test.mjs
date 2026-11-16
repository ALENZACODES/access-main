import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeFragment, splitReference, pageIds, pageLanguage, pageLinks,
  resolveHtmlRoute, inspectNavigationGraph, inspectNavigationHtml,
} from './navigation-audit.mjs';

const html = (language, body = '', head = '') => `<!doctype html>
<html lang="${language}"><head><title>Fixture</title>${head}</head>
<body><main id="main">${body}</main></body></html>`;
const codes = (items) => items.map((item) => item.code);
const pages = (pairs) => new Map(pairs);

test('fragment decoding supports composed accented identifiers', () => {
  assert.equal(decodeFragment('entr%C3%A9e'), 'entrée');
});

test('fragment decoding rejects malformed sequences', () => {
  assert.equal(decodeFragment('%GG'), null);
});

test('reference parser classifies empty and local values', () => {
  assert.equal(splitReference('').kind, 'empty');
  assert.deepEqual(splitReference('#main'), {
    kind: 'local', path: '', fragment: 'main', value: '#main',
  });
});

test('reference parser permits mail and phone actions', () => {
  assert.equal(splitReference('mailto:test@example.org').kind, 'external');
  assert.equal(splitReference('tel:123').kind, 'external');
});

test('reference parser catches dangerous schemes', () => {
  assert.equal(splitReference('javascript:alert(1)').kind, 'unsafe');
  assert.equal(splitReference('data:text/html,foo').kind, 'unsafe');
  assert.equal(splitReference('vbscript:evil').kind, 'unsafe');
});

test('reference parser rejects unsupported custom schemes', () => {
  assert.equal(splitReference('custom:thing').kind, 'unknown-scheme');
});

test('reference parser classifies external and scheme-relative URLs', () => {
  assert.equal(splitReference('https://example.org').kind, 'external');
  assert.equal(splitReference('//example.org').kind, 'external');
});

test('reference parser catches malformed fragment escapes', () => {
  assert.equal(splitReference('#%XX').kind, 'malformed-fragment');
});

test('page identifiers include legacy named anchors', () => {
  assert.deepEqual([...pageIds(html('en', '<a name="old"></a><h1 id="new">A</h1>'))],
    ['main', 'old', 'new']);
});

test('page language accepts English and French region tags', () => {
  assert.equal(pageLanguage(html('en-CA')), 'en');
  assert.equal(pageLanguage(html('fr-CA')), 'fr');
});

test('page language returns null for unsupported language', () => {
  assert.equal(pageLanguage(html('es')), null);
});

test('links include anchors, forms and alternate language resources', () => {
  const document = html('en', '<a href="#main">Go</a><form action="/"></form>',
    '<link rel="alternate" hreflang="fr" href="/fr.html">');
  assert.deepEqual(pageLinks(document, 'index.html').map((item) => item.tag),
    ['alternate', 'a', 'form']);
});

test('local documents resolve by explicit filename', () => {
  assert.deepEqual(resolveHtmlRoute('index.html', 'fr.html', new Set(['fr.html'])),
    { kind: 'resolved', path: 'fr.html', fragment: null });
});

test('directory routes resolve index.html', () => {
  assert.equal(resolveHtmlRoute('index.html', '/fr/',
    new Set(['fr/index.html'])).path, 'fr/index.html');
});

test('extensionless routes resolve a shipped HTML file', () => {
  assert.equal(resolveHtmlRoute('index.html', '/guide',
    new Set(['guide.html'])).path, 'guide.html');
});

test('relative document links stay within their directory', () => {
  assert.equal(resolveHtmlRoute('guide/index.html', './next.html',
    new Set(['guide/next.html'])).path, 'guide/next.html');
});

test('unsafe traversal is not a local route', () => {
  assert.equal(resolveHtmlRoute('index.html', '../../outside.html',
    new Set()).kind, 'bad-path');
});

test('fragment-only links resolve to current page', () => {
  assert.equal(resolveHtmlRoute('guide.html', '#details',
    new Set(['guide.html'])).path, 'guide.html');
});

test('graph reports a missing referenced fragment', () => {
  const graph = pages([['index.html', html('en', '<a href="#missing">Go</a>')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_MISSING_FRAGMENT'));
});

test('graph accepts a present fragment', () => {
  const graph = pages([['index.html', html('en', '<a href="#main">Go</a>')]]);
  assert.deepEqual(inspectNavigationGraph(graph), []);
});

test('graph reports missing explicit HTML destination', () => {
  const graph = pages([['index.html', html('en', '<a href="absent.html">Go</a>')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_MISSING_DOCUMENT'));
});

test('graph does not infer missing SPA route from extensionless URL', () => {
  const graph = pages([['index.html', html('en', '<a href="/search">Search</a>')]]);
  assert.deepEqual(inspectNavigationGraph(graph), []);
});

test('graph checks both language links when alternates declared', () => {
  const graph = pages([['index.html', html('en', '',
    '<link rel="alternate" hreflang="en" href="index.html">')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_ALT_MISSING'));
});

test('graph rejects alternate language mismatch', () => {
  const graph = pages([
    ['index.html', html('en', '',
      '<link rel="alternate" hreflang="en" href="index.html">' +
      '<link rel="alternate" hreflang="fr" href="other.html">')],
    ['other.html', html('en')],
  ]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_ALT_MISMATCH'));
});

test('graph rejects an unsupported alternate tag', () => {
  const graph = pages([['index.html', html('en', '',
    '<link rel="alternate" hreflang="de" href="index.html">')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_ALT_LANGUAGE'));
});

test('graph catches duplicate alternate locale declarations', () => {
  const graph = pages([['index.html', html('en', '',
    '<link rel="alternate" hreflang="en" href="index.html">' +
    '<link rel="alternate" hreflang="en" href="index.html">')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_ALT_DUPLICATE'));
});

test('graph accepts mutually linked bilingual pages', () => {
  const header = '<link rel="alternate" hreflang="en" href="/en.html">' +
    '<link rel="alternate" hreflang="fr" href="/fr.html">';
  const graph = pages([
    ['en.html', html('en', '', header)],
    ['fr.html', html('fr', '', header)],
  ]);
  assert.deepEqual(inspectNavigationGraph(graph), []);
});

test('graph catches missing reciprocal alternate links', () => {
  const graph = pages([
    ['en.html', html('en', '', '<link rel="alternate" hreflang="en" href="en.html">' +
      '<link rel="alternate" hreflang="fr" href="fr.html">')],
    ['fr.html', html('fr')],
  ]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_ALT_RECIPROCAL'));
});

test('graph catches a remote GET form', () => {
  const graph = pages([['index.html', html('en',
    '<form method="get" action="https://example.org/submit"></form>')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_REMOTE_GET_FORM'));
});

test('markup rejects remote base URL', () => {
  assert.ok(codes(inspectNavigationHtml('<base href="https://example.org/">',
    'index.html')).includes('NAV_REMOTE_BASE'));
});

test('markup rejects invalid form method', () => {
  assert.ok(codes(inspectNavigationHtml('<form method="delete"></form>',
    'index.html')).includes('NAV_FORM_METHOD'));
});

test('markup rejects forms opening another window', () => {
  assert.ok(codes(inspectNavigationHtml('<form target="_blank"></form>',
    'index.html')).includes('NAV_NEW_WINDOW_FORM'));
});

test('markup rejects remote download hint', () => {
  assert.ok(codes(inspectNavigationHtml('<a download href="https://example.org/file">A</a>',
    'index.html')).includes('NAV_REMOTE_DOWNLOAD'));
});

test('markup rejects placeholder action link', () => {
  assert.ok(codes(inspectNavigationHtml('<a href="#">A</a>',
    'index.html')).includes('NAV_EMPTY_FRAGMENT_ACTION'));
});

test('markup accepts a meaningful fragment link', () => {
  assert.deepEqual(inspectNavigationHtml('<a href="#main">Skip</a>',
    'index.html'), []);
});

test('markup rejects whitespace inside fragment identifiers', () => {
  assert.ok(codes(inspectNavigationHtml('<h1 id="bad id">Hi</h1>',
    'index.html')).includes('NAV_INVALID_FRAGMENT_ID'));
});

test('local anchor with malformed destination fails graph', () => {
  const graph = pages([['index.html', html('en', '<a href="#%X">Go</a>')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_MALFORMED_URL'));
});

test('empty local anchor reports missing destination', () => {
  const graph = pages([['index.html', html('en', '<a href="">Go</a>')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_EMPTY_HREF'));
});

test('unsafe anchor reports a blocking error', () => {
  const graph = pages([['index.html', html('en', '<a href="javascript:void(0)">Go</a>')]]);
  assert.ok(codes(inspectNavigationGraph(graph)).includes('NAV_UNSAFE_SCHEME'));
});

test('form POST is exempt from static target resolution', () => {
  const graph = pages([['index.html', html('en',
    '<form method="post" action="send.html"></form>')]]);
  assert.deepEqual(inspectNavigationGraph(graph), []);
});

test('form dialog action is exempt from static target resolution', () => {
  const graph = pages([['index.html', html('en',
    '<form method="dialog" action="close.html"></form>')]]);
  assert.deepEqual(inspectNavigationGraph(graph), []);
});
