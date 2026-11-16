import { describe, expect, it } from 'vitest';
import { HTML_RULES, htmlTextItems, lintHtml, parseHtml, type HtmlRule } from './htmllint.js';

const HEAD =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page</title>';
const doc = (body: string, opts: { head?: string; lang?: string; doctype?: boolean; main?: boolean } = {}): string =>
  `${opts.doctype === false ? '' : '<!doctype html>'}<html${opts.lang === '' ? '' : ` lang="${opts.lang ?? 'en'}"`}><head>${opts.head ?? HEAD}</head>` +
  `<body>${opts.main === false ? body : `<main><h1>Title</h1>${body}</main>`}</body></html>`;

const rules = (html: string, fragment = false): HtmlRule[] =>
  lintHtml(html, { fragment }).entries.flatMap((e) => (e.rule ? [e.rule as HtmlRule] : []));

/** Each rule has a page that breaks it and a page that is fine. A broken page must be reported. */
const FIXTURES: ReadonlyArray<readonly [HtmlRule, string, string]> = [
  ['doctype', doc('', { doctype: false }), doc('')],
  ['lang', doc('', { lang: '' }), doc('', { lang: 'fr-CA' })],
  ['title', doc('', { head: '<meta name="viewport" content="width=device-width">' }), doc('')],
  ['viewport', doc('', { head: `<title>t</title><meta name="viewport" content="width=device-width, user-scalable=no">` }), doc('')],
  ['headings', doc('<h3>Skipped</h3>'), doc('<h2>Next</h2><h3>Deeper</h3>')],
  ['img-alt', doc('<img src="a.png">'), doc('<img src="a.png" alt=""><img src="b.png" alt="Ramp">')],
  ['name', doc('<button></button>'), doc('<button aria-label="Go"></button><a href="/x"><img src="a" alt="Home"></a>')],
  ['label', doc('<input type="text" name="q">'), doc('<label for="q">Search</label><input id="q"><label>Name <input name="n" autocomplete="name"></label>')],
  ['dup-id', doc('<p id="a"></p><p id="a"></p>'), doc('<p id="a"></p><p id="b"></p>')],
  ['aria-ref', doc('<button aria-labelledby="nope">x</button>'), doc('<span id="l">Go</span><button aria-labelledby="l"></button>')],
  ['tabindex', doc('<div tabindex="2">x</div>'), doc('<div tabindex="0">x</div><div tabindex="-1">y</div>')],
  ['autocomplete', doc('<label>Mail <input type="email"></label>'), doc('<label>Mail <input type="email" autocomplete="email"></label>')],
  ['main', doc('<main></main>'), doc('')],
  ['link-text', doc('<a href="/x">Click here</a>'), doc('<a href="/x">Opening hours</a>')],
  ['target-inline', doc('<button style="width:30px;height:30px">Go</button>'), doc('<button style="width:30px;min-width:44px;min-height:44px">Go</button>')],
  ['aria-hidden-focus', doc('<div aria-hidden="true"><button>Go</button></div>'), doc('<div aria-hidden="true"><span>x</span></div>')],
  ['iframe-title', doc('<iframe src="x"></iframe>'), doc('<iframe src="x" title="Map"></iframe>')],
  ['autoplay', doc('<video autoplay></video>'), doc('<video autoplay muted></video>')],
  ['table-headers', doc('<table><tr><td>a</td></tr></table>'), doc('<table aria-label="Hours"><tr><th>Day</th></tr><tr><td>Mon</td></tr></table>')],
  ['table-caption', doc('<table><tr><th>Day</th></tr><tr><td>Mon</td></tr></table>'), doc('<table><caption>Hours</caption><tr><th>Day</th></tr><tr><td>Mon</td></tr></table>')],
  [
    'fieldset-legend',
    doc('<input type="radio" name="r" aria-label="A"><input type="radio" name="r" aria-label="B">'),
    doc('<fieldset><legend>Pick</legend><input type="radio" name="r" aria-label="A"><input type="radio" name="r" aria-label="B"></fieldset>'),
  ],
  ['nested-interactive', doc('<a href="/x"><button>Go</button></a>'), doc('<a href="/x">Go</a><button>Stop</button>')],
  ['empty-heading', doc('<h2></h2>'), doc('<h2>Hours</h2><h2><img src="a" alt="Logo"></h2>')],
  ['svg-name', doc('<svg role="img"></svg>'), doc('<svg role="img" aria-label="Map"></svg><svg aria-hidden="true"></svg>')],
  ['media-captions', doc('<video src="a.mp4"></video>'), doc('<video src="a.mp4"><track kind="captions" src="c.vtt"></video>')],
  ['meta-refresh', doc('', { head: HEAD + '<meta http-equiv="refresh" content="5;url=/x">' }), doc('', { head: HEAD + '<meta http-equiv="refresh" content="0;url=/x">' })],
  ['autocomplete-token', doc('<label>Mail <input autocomplete="e-mail"></label>'), doc('<label>Mail <input autocomplete="email"></label>')],
  ['list-structure', doc('<li>a</li>'), doc('<ul><li>a</li></ul>')],
  ['lang-part', doc('<p lang="english">a</p>'), doc('<p lang="fr-CA">a</p>')],
  [
    'landmark-label',
    doc('<nav><a href="/a">A</a></nav><nav><a href="/b">B</a></nav>'),
    doc('<nav aria-label="Main"><a href="/a">A</a></nav><nav aria-label="Footer"><a href="/b">B</a></nav>'),
  ],
  ['accesskey-dup', doc('<button accesskey="s">A</button><button accesskey="S">B</button>'), doc('<button accesskey="s">A</button><button accesskey="t">B</button>')],
  [
    'invalid-describedby',
    doc('<label>Mail <input aria-invalid="true" autocomplete="email"></label>'),
    doc('<label>Mail <input aria-invalid="true" aria-describedby="e" autocomplete="email"></label><p id="e">Enter a valid address</p>'),
  ],
  ['autofocus', doc('<label>Q <input autofocus></label>'), doc('<label>Q <input></label>')],
  ['details-summary', doc('<details><p>x</p></details>'), doc('<details><summary>More</summary><p>x</p></details>')],
  ['dialog-name', doc('<dialog open><p>x</p></dialog>'), doc('<dialog open aria-label="Filters"><p>x</p></dialog>')],
  ['hreflang-code', doc('', { head: HEAD + '<link rel="alternate" hreflang="english" href="/en">' }), doc('', { head: HEAD + '<link rel="alternate" hreflang="fr-CA" href="/fr"><link rel="alternate" hreflang="x-default" href="/">' })],
];

describe('parseHtml', () => {
  it('reads tags, attributes, text and line numbers', () => {
    const p = parseHtml('<!DOCTYPE html>\n<p id=a class="x y" hidden>Hi <b>there</b></p>\n<img src=a.png alt=\'q\'>');
    expect(p.doctype).toBe(true);
    const para = p.nodes.find((n) => n.tag === 'p');
    expect(para?.attrs).toEqual({ id: 'a', class: 'x y', hidden: '' });
    expect(para?.text).toBe('Hi there');
    expect(para?.own).toBe('Hi');
    expect(para?.line).toBe(2);
    expect(p.nodes.find((n) => n.tag === 'img')?.attrs['alt']).toBe('q');
    expect(p.nodes.find((n) => n.tag === 'img')?.line).toBe(3);
  });
  it('skips comments and script or style bodies, and ignores stray angle brackets', () => {
    const p = parseHtml('<!-- <b>no</b> --><script>if (a < b) { x("<p>") }</script><style>p{}</style><p>a < b</p>');
    expect(p.nodes.map((n) => n.tag)).toEqual(['script', 'style', 'p']);
    expect(p.nodes[2]?.text).toBe('a < b');
  });
  it('closes elements on their end tag and handles void tags', () => {
    const p = parseHtml('<div><br><input><span>a</span></div><p>b</p>');
    expect(p.nodes.find((n) => n.tag === 'p')?.parent).toBe(-1);
    expect(p.nodes.find((n) => n.tag === 'span')?.parent).toBe(0);
  });
  it('decodes the common entities in text and attributes', () => {
    const p = parseHtml('<a title="a &amp; b">x &lt; y</a>');
    expect(p.nodes[0]?.attrs['title']).toBe('a & b');
    expect(p.nodes[0]?.text).toBe('x < y');
  });
});

describe('rules', () => {
  it('has a fixture for every rule', () => {
    expect(FIXTURES.map((f) => f[0]).sort()).toEqual([...HTML_RULES].sort());
  });
  it.each(FIXTURES)('%s is reported for a broken page and not for a good one', (rule, bad, good) => {
    expect(rules(bad)).toContain(rule);
    expect(rules(good)).not.toContain(rule);
  });
  it('a good page has no entries at all', () => {
    const good = doc('<h2>Sub</h2><p>Text</p><button style="min-height:44px">Go</button>');
    expect(lintHtml(good).entries).toEqual([]);
  });
  it('autocomplete and link text only ask for a look', () => {
    const entries = lintHtml(doc('<a href="/x">here</a><label>Tel <input type="tel"></label>')).entries;
    expect(entries.map((e) => [e.rule, e.status])).toEqual([
      ['link-text', 'unknown'],
      ['autocomplete', 'unknown'],
    ]);
  });
  it('reports a missing h1 and a heading jump with the levels', () => {
    const noH1 = lintHtml(doc('', { main: false }));
    expect(noH1.entries.some((e) => e.rule === 'headings' && e.message.en.includes('no h1'))).toBe(true);
    const jump = lintHtml(doc('<h2>a</h2><h4>b</h4>')).entries.find((e) => e.rule === 'headings');
    expect(jump?.message.fr).toContain('h2 à h4');
  });
  it('gives ids with the tag, id and line', () => {
    const e = lintHtml(doc('\n<button id="go"></button>')).entries.find((x) => x.rule === 'name');
    expect(e?.id).toMatch(/^button#go@L\d+$/);
  });
  it('counts labels given by label-for, wrapping labels, title and aria-label', () => {
    expect(rules(doc('<input id="a" title="Search"><input aria-label="B"><label>C<input></label>'))).not.toContain('label');
  });
  it('does not flag a name given through aria-labelledby that resolves', () => {
    expect(rules(doc('<h2 id="t">Menu</h2><nav aria-labelledby="t"><a href="/a">A</a></nav>'))).toEqual([]);
  });
  it('fragments skip the document rules', () => {
    expect(rules('<h2>x</h2><button style="min-height:44px">Go</button>', true)).toEqual([]);
    expect(rules('<html><body><p>x</p></body></html>', true)).toEqual([]);
    expect(rules('<html><body><p>x</p></body></html>')).toEqual(expect.arrayContaining(['doctype', 'lang', 'title', 'viewport', 'main']));
  });
  it('lets viewport max scale of 2 or more pass', () => {
    expect(rules(doc('', { head: '<title>t</title><meta name="viewport" content="width=device-width, maximum-scale=5">' }))).toEqual([]);
    expect(rules(doc('', { head: '<title>t</title><meta name="viewport" content="width=device-width, maximum-scale=1">' }))).toContain('viewport');
  });
});

describe('htmlTextItems', () => {
  it('lists elements with their own text', () => {
    const items = htmlTextItems(doc('<p>Hello <b>world</b></p>'));
    expect(items.map((i) => i.text)).toEqual(['Page', 'Title', 'Hello', 'world']);
  });
});
