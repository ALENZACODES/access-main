import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAbsoluteUrl, trackerHost, inspectRemoteUrls, inspectPrivacyHtml,
  cspDirectives, inspectCsp, inspectPrivacyScript, scriptPrivacyObservations,
  inspectHttpHeaders,
} from './privacy-audit.mjs';

const codes = (items) => items.map((item) => item.code);

test('URL parser accepts https absolute addresses', () => {
  assert.equal(parseAbsoluteUrl('https://example.org/a')?.hostname, 'example.org');
});

test('URL parser accepts protocol-relative hosts', () => {
  assert.equal(parseAbsoluteUrl('//example.org/a')?.hostname, 'example.org');
});

test('URL parser rejects a relative path', () => {
  assert.equal(parseAbsoluteUrl('/asset.js'), null);
});

test('URL parser rejects malformed addresses', () => {
  assert.equal(parseAbsoluteUrl('https://'), null);
});

test('tracker matcher recognises a nested analytics hostname', () => {
  assert.equal(trackerHost('analytics.google-analytics.com'), true);
});

test('tracker matcher rejects a similar unrelated hostname', () => {
  assert.equal(trackerHost('not-google-analytics.com'), false);
});

test('tracker matcher handles other known trackers', () => {
  for (const host of ['www.facebook.net', 'cdn.segment.io',
    'api.mixpanel.com', 'cdn.fullstory.com', 'www.clarity.ms']) {
    assert.equal(trackerHost(host), true, host);
  }
});

test('remote URL scan rejects trackers', () => {
  assert.ok(codes(inspectRemoteUrls(
    'https://www.google-analytics.com/collect', 'main.js'))
    .includes('PRIVACY_TRACKING_HOST'));
});

test('remote URL scan permits unrelated documentation URL', () => {
  assert.deepEqual(inspectRemoteUrls('https://example.org/docs', 'main.js'), []);
});

test('remote URL scan does not duplicate identical tracker hosts', () => {
  assert.equal(inspectRemoteUrls(
    'https://www.clarity.ms/one https://www.clarity.ms/two', 'main.js').length, 1);
});

test('HTML scan rejects externally loaded scripts', () => {
  assert.ok(codes(inspectPrivacyHtml(
    '<script src="https://example.org/app.js"></script>', 'index.html'))
    .includes('PRIVACY_REMOTE_SCRIPT'));
});

test('HTML scan permits bundled local scripts', () => {
  assert.deepEqual(inspectPrivacyHtml(
    '<script src="./assets/app.js"></script>', 'index.html'), []);
});

test('HTML scan rejects remote embedded frames', () => {
  assert.ok(codes(inspectPrivacyHtml(
    '<iframe src="https://example.org/embed" title="Map"></iframe>',
    'index.html')).includes('PRIVACY_REMOTE_FRAME'));
});

test('HTML scan permits a local frame', () => {
  assert.deepEqual(inspectPrivacyHtml(
    '<iframe src="/help.html" title="Help"></iframe>', 'index.html'), []);
});

test('HTML scan rejects external form action', () => {
  assert.ok(codes(inspectPrivacyHtml(
    '<form action="https://example.org/data"></form>', 'index.html'))
    .includes('PRIVACY_REMOTE_FORM'));
});

test('HTML scan permits same-site form action', () => {
  assert.deepEqual(inspectPrivacyHtml('<form action="/search"></form>',
    'index.html'), []);
});

test('HTML scan rejects remote preconnect', () => {
  assert.ok(codes(inspectPrivacyHtml(
    '<link rel="preconnect" href="https://example.org">', 'index.html'))
    .includes('PRIVACY_REMOTE_HINT'));
});

test('HTML scan rejects remote DNS prefetch', () => {
  assert.ok(codes(inspectPrivacyHtml(
    '<link rel="dns-prefetch" href="//example.org">', 'index.html'))
    .includes('PRIVACY_REMOTE_HINT'));
});

test('HTML scan permits preload of local styles', () => {
  assert.deepEqual(inspectPrivacyHtml(
    '<link rel="preload" href="/app.css" as="style">', 'index.html'), []);
});

test('HTML scan rejects meta cookie setter', () => {
  assert.ok(codes(inspectPrivacyHtml(
    '<meta http-equiv="set-cookie" content="x=1">', 'index.html'))
    .includes('PRIVACY_META_COOKIE'));
});

test('HTML scan rejects policy with dynamic evaluation permission', () => {
  const markup = '<meta http-equiv="Content-Security-Policy" ' +
    'content="default-src \'self\'; script-src \'self\' \'unsafe-eval\'">';
  assert.ok(codes(inspectPrivacyHtml(markup, 'index.html'))
    .includes('PRIVACY_UNSAFE_EVAL'));
});

test('policy parser separates directives', () => {
  const directives = cspDirectives("default-src 'self'; object-src 'none'");
  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
});

test('policy parser tolerates extra separators', () => {
  assert.equal(cspDirectives(' ; ; object-src  \'none\' ; ').size, 1);
});

test('policy rejects object wildcard source', () => {
  assert.ok(codes(inspectCsp('object-src *', 'index.html'))
    .includes('PRIVACY_OBJECT_SOURCE'));
});

test('policy rejects object http URL source', () => {
  assert.ok(codes(inspectCsp('object-src https:', 'index.html'))
    .includes('PRIVACY_OBJECT_SOURCE'));
});

test('policy rejects non-none object source', () => {
  assert.ok(codes(inspectCsp("object-src 'self'", 'index.html'))
    .includes('PRIVACY_OBJECT_POLICY'));
});

test('policy accepts none object source', () => {
  assert.deepEqual(inspectCsp("object-src 'none'", 'index.html'), []);
});

test('policy rejects wildcard base-uri', () => {
  assert.ok(codes(inspectCsp('base-uri *', 'index.html'))
    .includes('PRIVACY_WILDCARD_BASE'));
});

test('policy rejects wildcard frame ancestors', () => {
  assert.ok(codes(inspectCsp('frame-ancestors *', 'index.html'))
    .includes('PRIVACY_FRAME_POLICY'));
});

test('policy accepts restricted frame ancestors', () => {
  assert.deepEqual(inspectCsp("frame-ancestors 'none'", 'index.html'), []);
});

test('script rejects dynamic eval', () => {
  assert.ok(codes(inspectPrivacyScript('eval(code)', 'app.js'))
    .includes('PRIVACY_DYNAMIC_EVAL'));
});

test('script rejects constructor Function invocation', () => {
  assert.ok(codes(inspectPrivacyScript('new Function(source)', 'app.js'))
    .includes('PRIVACY_DYNAMIC_EVAL'));
});

test('script rejects document.write', () => {
  assert.ok(codes(inspectPrivacyScript('document.write(text)', 'app.js'))
    .includes('PRIVACY_DOCUMENT_WRITE'));
});

test('script rejects cookie assignment', () => {
  assert.ok(codes(inspectPrivacyScript('document.cookie = value', 'app.js'))
    .includes('PRIVACY_SCRIPT_COOKIE'));
});

test('script permits ordinary module imports', () => {
  assert.deepEqual(inspectPrivacyScript('import x from "./x.js";', 'app.js'), []);
});

test('script observations count storage writes without blocking', () => {
  const result = scriptPrivacyObservations('localStorage.setItem("x", "y")');
  assert.equal(result.storage, 1);
  assert.equal(result.generatedMarkup, 0);
});

test('script observations include credentialed requests', () => {
  const result = scriptPrivacyObservations(
    "fetch('/a', { credentials: 'include' })");
  assert.equal(result.credentialedRequests, 1);
});

test('script observations include dynamic HTML mutation', () => {
  const result = scriptPrivacyObservations('node.innerHTML = text');
  assert.equal(result.generatedMarkup, 1);
});

test('script observations include location navigation', () => {
  const result = scriptPrivacyObservations('window.location.assign("/help")');
  assert.equal(result.navigation, 1);
});

test('header inspector accepts restrictive security headers', () => {
  assert.deepEqual(inspectHttpHeaders(
    "Content-Security-Policy: object-src 'none'\n" +
    'Referrer-Policy: no-referrer\n' +
    'Permissions-Policy: geolocation=()', '_headers'), []);
});

test('header inspector rejects repeated names', () => {
  assert.ok(codes(inspectHttpHeaders(
    'Referrer-Policy: no-referrer\nReferrer-Policy: unsafe-url', '_headers'))
    .includes('PRIVACY_DUPLICATE_HEADER'));
});

test('header inspector rejects unsafe referrer policy', () => {
  assert.ok(codes(inspectHttpHeaders(
    'Referrer-Policy: unsafe-url', '_headers')).includes('PRIVACY_REFERRER'));
});

test('header inspector accepts same-origin referrer policy', () => {
  assert.deepEqual(inspectHttpHeaders(
    'Referrer-Policy: same-origin', '_headers'), []);
});

test('header inspector rejects broad camera permission', () => {
  assert.ok(codes(inspectHttpHeaders(
    'Permissions-Policy: camera=*', '_headers'))
    .includes('PRIVACY_PERMISSIONS'));
});

test('header inspector rejects broad microphone permission', () => {
  assert.ok(codes(inspectHttpHeaders(
    'Permissions-Policy: microphone=*', '_headers'))
    .includes('PRIVACY_PERMISSIONS'));
});

test('header inspector accepts disabled permissions', () => {
  assert.deepEqual(inspectHttpHeaders(
    'Permissions-Policy: microphone=(), camera=()', '_headers'), []);
});

test('header inspector rejects policy with unsafe object source', () => {
  assert.ok(codes(inspectHttpHeaders(
    'Content-Security-Policy: object-src https:', '_headers'))
    .includes('PRIVACY_OBJECT_SOURCE'));
});
