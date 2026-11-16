import { describe, expect, it } from 'vitest';
import { auditHtml, describeProblems, type HtmlProblemCode } from './index';

const codes = (html: string, document?: boolean) => auditHtml(html, { document }).map((p) => p.code);

const DOC = (body: string, head = '', htmlAttrs = ' lang="en"') =>
  `<!doctype html><html${htmlAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title>${head}</head>` +
  `<body><a class="ds-skip" href="#main">Skip</a><main id="main"><h1>H</h1>${body}</main></body></html>`;

describe('auditHtml: a clean document', () => {
  it('has no problems', () => {
    expect(auditHtml(DOC('<h2>A</h2><p>x</p>'))).toEqual([]);
  });
});

describe('auditHtml: every rule fails on a violation', () => {
  const cases: [HtmlProblemCode, string][] = [
    ['missing-lang', DOC('', '', '')],
    ['bad-lang', DOC('', '', ' lang="english!"')],
    ['missing-title', DOC('').replace('<title>T</title>', '<title> </title>')],
    ['missing-viewport', DOC('').replace(/<meta name="viewport"[^>]*>/, '')],
    ['missing-main', DOC('').replace(/<\/?main[^>]*>/g, '')],
    ['missing-skip-link', DOC('').replace('<a class="ds-skip" href="#main">Skip</a>', '<a href="/x" style="min-height:44px">x</a>')],
    ['missing-h1', DOC('').replace('<h1>H</h1>', '')],
    ['multiple-h1', DOC('<h1>Again</h1>')],
    ['heading-skip', DOC('<h3>Skipped</h3>')],
    ['duplicate-id', DOC('<p id="a">1</p><p id="a">2</p>')],
    ['unlabelled-control', DOC('<input id="q" type="search" style="min-height:44px">')],
    ['table-without-caption', DOC('<table><thead><tr><th scope="col">A</th></tr></thead></table>')],
    ['th-without-scope', DOC('<table><caption>C</caption><tr><th>A</th></tr></table>')],
    ['scroll-region-not-operable', DOC('<div class="ds-scroll" role="region">x</div>')],
    ['bad-time', DOC('<time datetime="soon">soon</time>')],
    ['small-target', DOC('<button type="button">Go</button>')],
    ['positive-tabindex', DOC('<p tabindex="3">x</p>')],
    ['outline-removed', DOC('<p>x</p>', '<style>a:focus{outline:none}</style>')],
    ['vague-link-text', DOC('<a href="/x" style="min-height:44px">click here</a>')],
    ['img-without-alt', DOC('<img src="/a.png">')],
    ['target-blank-without-noopener', DOC('<a href="/x" target="_blank" style="min-height:44px">Docs</a>')],
    ['inline-event-handler', DOC('<p onclick="go()">x</p>')],
    ['javascript-url', DOC('<a href="javascript:go()" style="min-height:44px">Go</a>')],
    ['empty-button', DOC('<button type="button" style="min-height:44px"> </button>')],
  ];

  it.each(cases)('%s', (code, html) => {
    expect(codes(html)).toContain(code);
  });

  it('every rule code has a case (no untested rule)', () => {
    const tested = new Set(cases.map(([c]) => c));
    const all: HtmlProblemCode[] = [
      'missing-lang', 'bad-lang', 'missing-title', 'missing-viewport', 'missing-main', 'missing-skip-link', 'missing-h1', 'multiple-h1', 'heading-skip', 'duplicate-id',
      'unlabelled-control', 'table-without-caption', 'th-without-scope', 'scroll-region-not-operable', 'bad-time', 'small-target', 'positive-tabindex', 'outline-removed',
      'vague-link-text', 'img-without-alt', 'target-blank-without-noopener', 'inline-event-handler', 'javascript-url', 'empty-button',
    ];
    for (const c of all) expect(tested.has(c), c).toBe(true);
  });
});

describe('auditHtml: things that are fine', () => {
  it('accepts labelled controls (for=, wrapping label, aria-label) and exempts hidden and checkbox inputs', () => {
    const html =
      '<label for="a">A</label><select id="a" style="min-height:44px"></select>' +
      '<label style="min-height:44px"><input type="checkbox" id="c">C</label>' +
      '<input id="s" aria-label="Search" style="min-height:44px"><input type="hidden" name="x" value="1">';
    expect(auditHtml(html)).toEqual([]);
  });

  it('accepts a noopener link and a descriptive link', () => {
    expect(auditHtml('<a href="/x" target="_blank" rel="noopener noreferrer" style="min-height:44px">Open the licence</a>')).toEqual([]);
  });

  it('only runs document rules on documents (fragments may start at h2 and have no lang)', () => {
    expect(auditHtml('<h2>Part</h2><p>x</p>')).toEqual([]);
    expect(codes('<h2>Part</h2>', true)).toContain('missing-lang');
  });

  it('an operable scroll region passes', () => {
    expect(auditHtml('<div class="ds-scroll" role="region" tabindex="0" aria-label="Sources">x</div>')).toEqual([]);
  });
});

describe('describeProblems', () => {
  it('formats one line per problem', () => {
    expect(describeProblems(auditHtml('<p tabindex="2">x</p><time datetime="x">x</time>'))).toEqual(['bad-time: <time datetime="x">', 'positive-tabindex: tabindex="2"']);
  });
});
