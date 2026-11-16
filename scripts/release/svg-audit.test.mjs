import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractSvgReferences, svgTitleDescription, inspectSvgDocument, inspectInlineSvg } from './svg-audit.mjs';

const icon = (body = '<path d="M0 0L10 10"/>', attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><title>Local map icon</title>${body}</svg>`;
const codes = (issues) => issues.map((issue) => issue.code);
const has = (issues, code) => assert.ok(codes(issues).includes(code),
  `Expected ${code}, got ${codes(issues).join(', ')}`);
const clean = (document) => assert.deepEqual(inspectSvgDocument(document), []);

describe('SVG document root and names', () => {
  it('requires SVG root', () => has(inspectSvgDocument('<div>none</div>'), 'SVG_ROOT'));
  it('accepts a titled icon', () => clean(icon()));
  it('accepts an aria-label', () => clean('<svg aria-label="Map"><path/></svg>'));
  it('accepts labelledby target', () => clean('<svg aria-labelledby="title"><title id="title">Map</title></svg>'));
  it('accepts decorative icons', () => clean('<svg aria-hidden="true"><path/></svg>'));
  it('accepts role none', () => clean('<svg role="none"><path/></svg>'));
  it('accepts presentation role', () => clean('<svg role="presentation"><path/></svg>'));
  it('rejects unnamed informative icons', () => has(inspectSvgDocument('<svg><path/></svg>'), 'SVG_ACCESSIBLE_NAME'));
  it('rejects empty title', () => has(inspectSvgDocument('<svg><title> </title></svg>'), 'SVG_ACCESSIBLE_NAME'));
  it('rejects missing labelledby ids', () => has(inspectSvgDocument('<svg aria-labelledby="absent"/>'), 'SVG_LABEL_TARGET'));
  it('rejects invalid aria-hidden', () => has(inspectSvgDocument(icon('', 'aria-hidden="maybe"')), 'SVG_ARIA_HIDDEN'));
  it('rejects focusable decorative icons', () => has(inspectSvgDocument('<svg aria-hidden="true" focusable="true"/>'), 'SVG_DECORATIVE_FOCUS'));
  it('accepts not focusable decoration', () => clean('<svg aria-hidden="true" focusable="false"/>'));
  it('returns extracted title and description', () => assert.deepEqual(svgTitleDescription('<svg><title>A</title><desc>B</desc></svg>'), { title: 'A', description: 'B' }));
  it('returns empty fields when absent', () => assert.deepEqual(svgTitleDescription('<svg/>'), { title: '', description: '' }));
  it('strips inline markup from title', () => assert.equal(svgTitleDescription('<svg><title>Local <tspan>map</tspan></title></svg>').title, 'Local map'));
});

describe('SVG active content', () => {
  for (const element of ['script', 'foreignObject', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'animateMotion', 'animateTransform', 'set']) {
    it(`rejects ${element}`, () => has(inspectSvgDocument(icon(`<${element}/>`)), 'SVG_ACTIVE_ELEMENT'));
  }
  for (const event of ['onclick', 'onload', 'onmouseover', 'onfocus', 'onerror']) {
    it(`rejects ${event}`, () => has(inspectSvgDocument(icon(`<path ${event}="run()"/>`)), 'SVG_EVENT_HANDLER'));
  }
  it('rejects an inline import', () => has(inspectSvgDocument(icon('<path style="@import url(x)"/>')), 'SVG_UNSAFE_STYLE'));
  it('rejects CSS expression', () => has(inspectSvgDocument(icon('<path style="width:expression(x)"/>')), 'SVG_UNSAFE_STYLE'));
  it('rejects external entity', () => has(inspectSvgDocument('<!ENTITY x SYSTEM "file:///tmp/a"><svg><title>Map</title></svg>'), 'SVG_EXTERNAL_ENTITY'));
  it('rejects public doctype', () => has(inspectSvgDocument('<!DOCTYPE svg PUBLIC "test" "url"><svg><title>Map</title></svg>'), 'SVG_EXTERNAL_ENTITY'));
  it('rejects xml stylesheet PI', () => has(inspectSvgDocument('<?xml-stylesheet href="remote.css"?><svg><title>Map</title></svg>'), 'SVG_STYLESHEET'));
});

describe('SVG local references', () => {
  it('accepts local gradient', () => clean(icon('<defs><linearGradient id="shade"/></defs><path fill="url(#shade)"/>')));
  it('accepts local filter', () => clean(icon('<defs><filter id="blur"/></defs><path filter="url(#blur)"/>')));
  it('accepts local clip', () => clean(icon('<defs><clipPath id="clip"/></defs><path clip-path="url(#clip)"/>')));
  it('accepts local use', () => clean(icon('<defs><path id="shape"/></defs><use href="#shape"/>')));
  it('rejects missing gradient', () => has(inspectSvgDocument(icon('<path fill="url(#missing)"/>')), 'SVG_MISSING_FRAGMENT'));
  it('rejects missing use', () => has(inspectSvgDocument(icon('<use href="#missing"/>')), 'SVG_MISSING_FRAGMENT'));
  it('rejects external image', () => has(inspectSvgDocument(icon('<image href="https://example.org/photo.png"/>')), 'SVG_EXTERNAL_REFERENCE'));
  it('rejects external use', () => has(inspectSvgDocument(icon('<use href="other.svg#shape"/>')), 'SVG_EXTERNAL_REFERENCE'));
  it('rejects data reference', () => has(inspectSvgDocument(icon('<image href="data:image/png;base64,x"/>')), 'SVG_EXTERNAL_REFERENCE'));
  it('rejects remote paint', () => has(inspectSvgDocument(icon('<path fill="url(https://example.org/a.svg#x)"/>')), 'SVG_EXTERNAL_PAINT'));
  it('rejects malformed fragment', () => has(inspectSvgDocument(icon('<use href="#not an id"/>')), 'SVG_FRAGMENT_FORMAT'));
  it('rejects duplicate ids', () => has(inspectSvgDocument(icon('<path id="a"/><path id="a"/>')), 'SVG_DUPLICATE_ID'));
  it('rejects invalid ids', () => has(inspectSvgDocument(icon('<path id="not an id"/>')), 'SVG_INVALID_ID'));
  it('extracts multiple URL references', () => assert.deepEqual(extractSvgReferences('url(#a) url("#b")'), ['#a', '#b']));
  it('returns no references for non-string input', () => assert.deepEqual(extractSvgReferences(null), []));
});

describe('inline SVG release scan', () => {
  it('accepts a complete named SVG', () => assert.deepEqual(inspectInlineSvg('<main>' + icon() + '</main>'), []));
  it('rejects an unnamed inline icon', () => has(inspectInlineSvg('<main><svg><path/></svg></main>'), 'SVG_ACCESSIBLE_NAME'));
  it('reports inline icon index', () => assert.match(inspectInlineSvg(icon() + '<svg><path/></svg>')[0].detail, /Inline SVG 2/));
  it('rejects unclosed markup', () => has(inspectInlineSvg('<svg><title>Map</title>'), 'SVG_UNCLOSED_INLINE'));
  it('accepts no SVG in a page', () => assert.deepEqual(inspectInlineSvg('<main>Text</main>'), []));
  it('preserves file references', () => assert.equal(inspectInlineSvg('<svg><path/></svg>', 'en/page.html')[0].file, 'en/page.html'));
});
