import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attributeTokens, hasReferenceNames, hasAttributeName,
  fieldNameCandidates, inspectFieldSemantics, inspectLandmarkSemantics,
  inspectTableSemantics, inspectSvgSemantics, inspectSemanticHtml,
} from './semantics-audit.mjs';
import { tokenizeHtml } from './site-audit.mjs';

const codes = (items) => items.map((item) => item.code);
const tags = (html) => tokenizeHtml(html);

test('ARIA reference splitter filters whitespace', () => {
  assert.deepEqual(attributeTokens({ 'aria-labelledby': ' a   b ' },
    'aria-labelledby'), ['a', 'b']);
});

test('ARIA reference splitter handles missing attribute', () => {
  assert.deepEqual(attributeTokens({}, 'aria-labelledby'), []);
});

test('reference name resolver requires all targets', () => {
  assert.equal(hasReferenceNames({ 'aria-labelledby': 'one two' },
    new Set(['one', 'two'])), true);
});

test('reference name resolver rejects incomplete targets', () => {
  assert.equal(hasReferenceNames({ 'aria-labelledby': 'one two' },
    new Set(['one'])), false);
});

test('reference name resolver rejects empty references', () => {
  assert.equal(hasReferenceNames({ 'aria-labelledby': ' ' }, new Set()), false);
});

test('name resolver accepts explicit ARIA label', () => {
  assert.equal(hasAttributeName({ 'aria-label': 'Close' }, new Set()), true);
});

test('name resolver rejects whitespace-only label', () => {
  assert.equal(hasAttributeName({ 'aria-label': ' ' }, new Set()), false);
});

test('name resolver accepts meaningful title', () => {
  assert.equal(hasAttributeName({ title: 'Options' }, new Set()), true);
});

test('field candidates collect label targets', () => {
  const result = fieldNameCandidates(tags('<label for="name">Name</label><input id="name">'));
  assert.equal(result.labels.has('name'), true);
});

test('field candidates collect description references', () => {
  const result = fieldNameCandidates(tags('<input aria-describedby="hint">'));
  assert.equal(result.described.has('hint'), true);
});

test('field check rejects missing description reference', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<input aria-label="Name" aria-describedby="missing">', 'x.html'))
    .includes('SEM_DESCRIPTION_REFERENCE'));
});

test('field check accepts existing description reference', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<p id="hint">A hint</p><input aria-label="Name" aria-describedby="hint">',
    'x.html'), []);
});

test('field check rejects native/ARIA required conflict', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<input required aria-required="false" aria-label="Name">', 'x.html'))
    .includes('SEM_REQUIRED_CONFLICT'));
});

test('field check accepts matching required declaration', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<input required aria-required="true" aria-label="Name">', 'x.html'), []);
});

test('field check rejects disabled conflict', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<button disabled aria-disabled="false">Save</button>', 'x.html'))
    .includes('SEM_DISABLED_CONFLICT'));
});

test('field check accepts matching disabled declaration', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<button disabled aria-disabled="true">Save</button>', 'x.html'), []);
});

test('field check rejects numeric range reversal', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<input type="number" min="30" max="20" aria-label="Count">', 'x.html'))
    .includes('SEM_NUMBER_RANGE'));
});

test('field check accepts numeric range with equal boundaries', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<input type="number" min="20" max="20" aria-label="Count">',
    'x.html'), []);
});

test('field check rejects mixed radio state', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<input type="radio" aria-checked="mixed" aria-label="Option">', 'x.html'))
    .includes('SEM_RADIO_MIXED'));
});

test('field check allows mixed checkbox state', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<input type="checkbox" aria-checked="mixed" aria-label="Option">',
    'x.html'), []);
});

test('field check rejects image button without alternative', () => {
  assert.ok(codes(inspectSemanticHtml('<input type="image" src="save.png">',
    'x.html')).includes('SEM_IMAGE_SUBMIT_NAME'));
});

test('field check accepts named image button', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<input type="image" src="save.png" alt="Save">', 'x.html'), []);
});

test('field check rejects unsupported button type', () => {
  assert.ok(codes(inspectSemanticHtml('<button type="cancel">Cancel</button>',
    'x.html')).includes('SEM_BUTTON_TYPE'));
});

test('field check accepts an explicit non-submit type', () => {
  assert.deepEqual(inspectSemanticHtml('<button type="button">Cancel</button>',
    'x.html'), []);
});

test('dialog role needs an accessible name', () => {
  assert.ok(codes(inspectSemanticHtml('<div role="dialog"></div>',
    'x.html')).includes('SEM_DIALOG_NAME'));
});

test('dialog role accepts labelled-by reference', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<h2 id="dialog-title">Title</h2><div role="dialog" ' +
    'aria-labelledby="dialog-title"></div>', 'x.html'), []);
});

test('dialog modal state only accepts boolean text', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<div role="dialog" aria-label="Window" aria-modal="maybe"></div>',
    'x.html')).includes('SEM_DIALOG_MODAL'));
});

test('dialog nonmodal state is supported', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<div role="dialog" aria-label="Window" aria-modal="false"></div>',
    'x.html'), []);
});

test('progress indicator rejects value outside range', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<div role="progressbar" aria-valuemin="0" aria-valuemax="10" ' +
    'aria-valuenow="11"></div>', 'x.html')).includes('SEM_PROGRESS_RANGE'));
});

test('progress indicator accepts value within range', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<div role="progressbar" aria-valuemin="0" aria-valuemax="10" ' +
    'aria-valuenow="5"></div>', 'x.html'), []);
});

test('progress indicator rejects inverted bounds', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<progress aria-valuemin="9" aria-valuemax="1"></progress>',
    'x.html')).includes('SEM_PROGRESS_RANGE'));
});

test('status role cannot silence announcements', () => {
  assert.ok(codes(inspectSemanticHtml('<div role="status" aria-live="off"></div>',
    'x.html')).includes('SEM_STATUS_SILENCED'));
});

test('alert role cannot silence announcements', () => {
  assert.ok(codes(inspectSemanticHtml('<div role="alert" aria-live="off"></div>',
    'x.html')).includes('SEM_ALERT_SILENCED'));
});

test('polite status message is accepted', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<div role="status" aria-live="polite"></div>', 'x.html'), []);
});

test('current item rejects invented state', () => {
  assert.ok(codes(inspectSemanticHtml('<a aria-current="yes">Current</a>',
    'x.html')).includes('SEM_CURRENT_VALUE'));
});

test('current page state is accepted', () => {
  assert.deepEqual(inspectSemanticHtml('<a aria-current="page">Current</a>',
    'x.html'), []);
});

test('invalid live region priority fails', () => {
  assert.ok(codes(inspectSemanticHtml('<div aria-live="urgent"></div>',
    'x.html')).includes('SEM_LIVE_VALUE'));
});

test('boolean details open false still opens the panel', () => {
  assert.ok(codes(inspectSemanticHtml('<details open="false"></details>',
    'x.html')).includes('SEM_DETAILS_BOOLEAN'));
});

test('boolean dialog open false still opens the dialog', () => {
  assert.ok(codes(inspectSemanticHtml('<dialog open="false"></dialog>',
    'x.html')).includes('SEM_DIALOG_BOOLEAN'));
});

test('hidden interactive role fails', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<div role="button" aria-hidden="true"></div>', 'x.html'))
    .includes('SEM_HIDDEN_CONTROL'));
});

test('unsupported root language fails', () => {
  assert.ok(codes(inspectSemanticHtml('<html lang="de"></html>',
    'x.html')).includes('SEM_HTML_LANGUAGE'));
});

test('supported language tags are accepted', () => {
  assert.deepEqual(inspectSemanticHtml('<html lang="fr-CA"></html>',
    'x.html'), []);
});

test('data table without headers fails', () => {
  assert.ok(codes(inspectSemanticHtml('<table><tr><td>1</td></tr></table>',
    'x.html')).includes('SEM_TABLE_HEADERS'));
});

test('data table with a header succeeds', () => {
  assert.deepEqual(inspectSemanticHtml(
    '<table><tr><th scope="col">Item</th><td>1</td></tr></table>',
    'x.html'), []);
});

test('invalid table header scope fails', () => {
  assert.ok(codes(inspectSemanticHtml('<table><th scope="all">Name</th></table>',
    'x.html')).includes('SEM_TABLE_SCOPE'));
});

test('invalid row span fails', () => {
  assert.ok(codes(inspectSemanticHtml('<table><th rowspan="0">Name</th></table>',
    'x.html')).includes('SEM_TABLE_SPAN'));
});

test('invalid column span fails', () => {
  assert.ok(codes(inspectSemanticHtml('<table><th colspan="no">Name</th></table>',
    'x.html')).includes('SEM_TABLE_SPAN'));
});

test('valid column span succeeds', () => {
  assert.deepEqual(inspectSemanticHtml('<table><th colspan="2">Name</th></table>',
    'x.html'), []);
});

test('unnamed graphic image role fails', () => {
  assert.ok(codes(inspectSemanticHtml('<svg role="img"></svg>',
    'x.html')).includes('SEM_SVG_NAME'));
});

test('named graphic image role passes', () => {
  assert.deepEqual(inspectSemanticHtml('<svg role="img" aria-label="Map"></svg>',
    'x.html'), []);
});

test('focusable graphic hidden from accessibility tree fails', () => {
  assert.ok(codes(inspectSemanticHtml(
    '<svg aria-hidden="true" tabindex="0"></svg>', 'x.html'))
    .includes('SEM_HIDDEN_SVG_FOCUS'));
});

test('decorative graphic hidden and not focusable passes', () => {
  assert.deepEqual(inspectSemanticHtml('<svg aria-hidden="true"></svg>',
    'x.html'), []);
});

test('named graphical references work through an ID', () => {
  assert.deepEqual(inspectSvgSemantics(tags(
    '<span id="chart-title">Chart</span><svg role="img" aria-labelledby="chart-title"></svg>'),
    'x.html'), []);
});

test('composed inspectors return distinct categories', () => {
  const issues = inspectSemanticHtml(
    '<html lang="de"><table><tr><td>A</td></tr></table>' +
    '<div role="dialog"></div><svg role="img"></svg></html>', 'x.html');
  assert.ok(codes(issues).includes('SEM_HTML_LANGUAGE'));
  assert.ok(codes(issues).includes('SEM_TABLE_HEADERS'));
  assert.ok(codes(issues).includes('SEM_DIALOG_NAME'));
  assert.ok(codes(issues).includes('SEM_SVG_NAME'));
});

test('component inspectors accept plain content', () => {
  const tokens = tags('<main><h1>Heading</h1><p>Text</p></main>');
  assert.deepEqual(inspectFieldSemantics(tokens, 'x.html'), []);
  assert.deepEqual(inspectLandmarkSemantics(tokens, 'x.html'), []);
  assert.deepEqual(inspectTableSemantics(tokens, 'x.html'), []);
  assert.deepEqual(inspectSvgSemantics(tokens, 'x.html'), []);
});
