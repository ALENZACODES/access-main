import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeHtml } from './site-audit.mjs';
import {
  extractIds, associatedLabels, hasAccessibleName,
  inspectHtmlInteractions, stripCssComments, cssDeclarations,
  cssPixelTargets, inspectCssInteractions, findInputNames,
  documentInteractionSummary,
} from './interaction-audit.mjs';

const codes = (issues) => issues.map(({ code }) => code);
const scan = (html) => inspectHtmlInteractions(html, 'index.html');
const cssScan = (css) => inspectCssInteractions(css, 'main.css');

test('extractIds records duplicate IDs', () => {
  const ids = extractIds(tokenizeHtml('<div id="a"></div><span id="a"></span>'));
  assert.equal(ids.get('a').length, 2);
});

test('associatedLabels recognizes label for attributes', () => {
  const labels = associatedLabels(tokenizeHtml('<label for="search">Search</label>'));
  assert.equal(labels.has('search'), true);
});

test('aria-label gives a control an accessible name', () => {
  const tags = tokenizeHtml('<input aria-label="Search">');
  assert.equal(hasAccessibleName(tags[0], new Set(), new Map()), true);
});

test('aria-labelledby resolves an existing element', () => {
  const tags = tokenizeHtml('<div id="help">Help</div><input aria-labelledby="help">');
  assert.equal(hasAccessibleName(tags[1], new Set(), extractIds(tags)), true);
});

test('missing aria-labelledby fails the name check', () => {
  const tags = tokenizeHtml('<input aria-labelledby="missing">');
  assert.equal(hasAccessibleName(tags[0], new Set(), extractIds(tags)), false);
});

test('valid input label passes', () => {
  assert.deepEqual(scan('<label for="name">Name</label><input id="name">'), []);
});

test('aria-labelled input passes', () => {
  assert.deepEqual(scan('<input aria-label="Search">'), []);
});

test('input lacking a programmatic label fails', () => {
  assert.ok(codes(scan('<input type="search" id="q">')).includes('INPUT_LABEL'));
});

test('unlabelled select fails', () => {
  assert.ok(codes(scan('<select id="province"></select>')).includes('CONTROL_LABEL'));
});

test('unlabelled textarea fails', () => {
  assert.ok(codes(scan('<textarea id="comment"></textarea>'))
    .includes('CONTROL_LABEL'));
});

test('hidden and submit inputs do not need text labels', () => {
  assert.deepEqual(scan('<input type="hidden"><input type="submit" value="Go">'), []);
});

test('input image requires alternative text', () => {
  assert.ok(codes(scan('<input type="image" src="go.png">'))
    .includes('INPUT_IMAGE_NAME'));
});

test('duplicate IDs are blocking', () => {
  assert.ok(codes(scan('<div id="x"></div><p id="x"></p>'))
    .includes('DUPLICATE_ID'));
});

test('missing label targets are blocking', () => {
  assert.ok(codes(scan('<label for="absent">Missing</label>'))
    .includes('LABEL_TARGET'));
});

test('missing ARIA references are blocking', () => {
  assert.ok(codes(scan('<button aria-controls="not-here"></button>'))
    .includes('ARIA_REFERENCE'));
});

test('matching ARIA references pass', () => {
  assert.deepEqual(scan('<button aria-controls="pane"></button><div id="pane"></div>'), []);
});

test('invalid ARIA boolean state fails', () => {
  assert.ok(codes(scan('<button aria-expanded="yes"></button>'))
    .includes('ARIA_VALUE'));
});

test('valid ARIA mixed check state passes', () => {
  assert.deepEqual(scan('<input type="checkbox" aria-label="All" aria-checked="mixed">'), []);
});

test('positive tabindex fails', () => {
  assert.ok(codes(scan('<button tabindex="2"></button>')).includes('TABINDEX_POSITIVE'));
});

test('tabindex zero passes', () => {
  assert.deepEqual(scan('<button tabindex="0"></button>'), []);
});

test('invalid tabindex fails', () => {
  assert.ok(codes(scan('<button tabindex="two"></button>')).includes('TABINDEX_INVALID'));
});

test('focus on an aria-hidden item fails', () => {
  assert.ok(codes(scan('<button autofocus aria-hidden="true"></button>'))
    .includes('FOCUS_HIDDEN'));
});

test('focus on inert item fails', () => {
  assert.ok(codes(scan('<button autofocus inert></button>'))
    .includes('FOCUS_INERT'));
});

test('presentation role on button fails', () => {
  assert.ok(codes(scan('<button role="presentation"></button>'))
    .includes('PRESENTATIONAL_CONTROL'));
});

test('script URL in a link fails', () => {
  assert.ok(codes(scan('<a href="javascript:void(0)">Open</a>'))
    .includes('JAVASCRIPT_LINK'));
});

test('new-window link needs noopener', () => {
  assert.ok(codes(scan('<a target="_blank" href="https://example.org">External</a>'))
    .includes('OPENER_LINK'));
});

test('safe new-window link passes', () => {
  assert.deepEqual(scan('<a target="_blank" rel="noopener" href="https://example.org">External</a>'), []);
});

test('multiple main landmarks fail', () => {
  assert.ok(codes(scan('<main></main><div role="main"></div>'))
    .includes('MULTIPLE_MAIN'));
});

test('single main landmark passes', () => {
  assert.deepEqual(scan('<main></main>'), []);
});

test('document direction must be recognised', () => {
  assert.ok(codes(scan('<html dir="sideways"></html>'))
    .includes('INVALID_DIRECTION'));
});

test('zoom cannot be disabled', () => {
  assert.ok(codes(scan('<meta name="viewport" content="width=device-width, user-scalable=no">'))
    .includes('ZOOM_BLOCKED'));
});

test('maximum-scale equal to one is rejected', () => {
  assert.ok(codes(scan('<meta name="viewport" content="maximum-scale=1.0">'))
    .includes('ZOOM_BLOCKED'));
});

test('permissive viewport is accepted', () => {
  assert.deepEqual(scan('<meta name="viewport" content="width=device-width, initial-scale=1">'), []);
});

test('empty named-role aria-label fails', () => {
  assert.ok(codes(scan('<div role="button" aria-label=" "></div>'))
    .includes('EMPTY_ARIA_NAME'));
});

test('stripCssComments discards misleading comments', () => {
  assert.equal(stripCssComments('a{} /* banned */ b{}'), 'a{}  b{}');
});

test('cssDeclarations reads simple properties', () => {
  const declarations = cssDeclarations('width: 36px; height: 40px;');
  assert.deepEqual(declarations.map(({ name }) => name), ['width', 'height']);
});

test('CSS target analysis extracts interactive dimensions', () => {
  const result = cssPixelTargets('button { min-width: 48px; min-height: 48px; }');
  assert.equal(result[0].sizes.get('min-height'), 48);
});

test('small explicit target fails', () => {
  assert.ok(codes(cssScan('button { width: 24px; height: 24px; }'))
    .includes('EXPLICIT_SMALL_TARGET'));
});

test('44px target passes', () => {
  assert.deepEqual(cssScan('button { min-width: 44px; min-height: 44px; }'), []);
});

test('one-dimensional target does not imply a small tap area', () => {
  assert.deepEqual(cssScan('button { width: 22px; padding: 20px; }'), []);
});

test('commented-out small target is ignored', () => {
  assert.deepEqual(cssScan('/* button { width: 12px; height: 12px; } */'), []);
});

test('global focus outline removal fails', () => {
  assert.ok(codes(cssScan('*:focus { outline: none; }'))
    .includes('GLOBAL_FOCUS_REMOVED'));
});

test('document-level text selection suppression fails', () => {
  assert.ok(codes(cssScan('body { user-select: none; }'))
    .includes('TEXT_SELECTION_BLOCKED'));
});

test('unguarded smooth scrolling fails', () => {
  assert.ok(codes(cssScan('html { scroll-behavior: smooth; }'))
    .includes('UNGUARDED_SMOOTH_SCROLL'));
});

test('reduced-motion override enables smooth scrolling', () => {
  const css = 'html {scroll-behavior: smooth}' +
    '@media (prefers-reduced-motion: reduce) {html {scroll-behavior: auto}}';
  assert.deepEqual(cssScan(css), []);
});

test('findInputNames reports labels', () => {
  const names = findInputNames('<label for="x">Name</label><input id="x" name="name">');
  assert.deepEqual(names, [{ name: 'name', id: 'x', labelled: true }]);
});

test('document summary counts controls and landmarks', () => {
  const summary = documentInteractionSummary(
    '<main><button>Go</button><input aria-label="Find"><a href="/">Home</a></main>');
  assert.equal(summary.controls, 2);
  assert.equal(summary.links, 1);
  assert.equal(summary.landmarks, 1);
  assert.equal(summary.labelledInputs, 1);
});
