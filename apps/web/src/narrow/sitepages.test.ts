import { describe, expect, it } from 'vitest';
import { auditConsistency } from './consistency.js';
import { parseHtml } from './htmllint.js';
import { alternate, pageHtml, sitePage } from './site-testkit.js';
import { SITE_BASE, factsFromMarkup, markupName, readPage, readSite, regionOfNode } from './sitepages.js';

const read = (route: string, html: string) => readPage({ route, html });

describe('readPage', () => {
  it('reads the language, the title and the main headings', () => {
    const info = read('/', pageHtml({ lang: 'fr-CA', title: 'Accueil', main: '<h1>Bienvenue  à tous</h1><h1>Encore</h1>' }));
    expect(info).toMatchObject({ route: '/', lang: 'fr', title: 'Accueil', h1: ['Bienvenue à tous', 'Encore'] });
  });

  it('does not take the title of an inline image for the page title', () => {
    const info = read('/', '<html><head><title>Real</title></head><body><svg><title>Icon</title></svg></body></html>');
    expect(info.title).toBe('Real');
  });

  it('gives an empty language and title when the page has none', () => {
    expect(read('/', '<p>Hello</p>')).toMatchObject({ lang: '', title: '', h1: [] });
  });

  it('resolves links against the route of the page', () => {
    const info = read('/places/12', pageHtml({ main: '<a href="photos">Photos</a><a href="../about">About</a><a href="/help/">Help</a><a href="?tab=2">Tab</a>' }));
    expect(info.links.map((l) => l.to)).toEqual(['/places/photos', '/about', '/help', '/places/12?tab=2']);
  });

  it('follows a base element', () => {
    const info = read('/a/b', pageHtml({ head: '<base href="/fr/">', main: '<a href="lieux">Lieux</a>' }));
    expect(info.links[0]?.to).toBe('/fr/lieux');
  });

  it('splits the fragment from the route and decodes it', () => {
    const info = read('/', pageHtml({ main: '<a href="/places#list">List</a><a href="#top">Top</a><a href="/p#caf%C3%A9">Café</a><a href="/#/map">Map</a>' }));
    expect(info.links.map((l) => [l.to, l.fragment])).toEqual([
      ['/places', 'list'],
      ['/', 'top'],
      ['/p', 'café'],
      ['/#/map', ''],
    ]);
  });

  it('gives no route for a link that leaves the site or is not a page', () => {
    const info = read('/', pageHtml({ main: '<a href="https://www.ontario.ca/page">Ontario</a><a href="mailto:someone@app.example">Mail</a><a href="tel:+15555550100">Call</a><a href="javascript:void(0)">Run</a>' }));
    expect(info.links.map((l) => l.to)).toEqual([null, null, null, null]);
    expect(info.counts.links).toBe(4);
  });

  it('skips anchors with no href and links that are hidden', () => {
    const info = read('/', pageHtml({ main: '<a>None</a><a href="">Empty</a><a href="/a" hidden>Hidden</a><div aria-hidden="true"><a href="/b">Also hidden</a></div><a href="/c">Seen</a>' }));
    expect(info.links.map((l) => l.to)).toEqual(['/c']);
  });

  it('names each link and says where it sits', () => {
    const html = pageHtml({ nav: [['/', 'Home']], main: '<a href="/a" aria-label="Details for Union Station">Details</a><a href="/b"><img src="x.png" alt="Map"></a><a href="/c" title="Tip"></a>', footer: '<a href="/help">Help</a>' });
    const info = read('/', html);
    expect(info.links.map((l) => [l.name, l.region])).toEqual([
      ['Home', 'nav'],
      ['Details for Union Station', 'main'],
      ['Map', 'main'],
      ['Tip', 'main'],
      ['Help', 'footer'],
    ]);
    expect(info.links[0]?.id).toMatch(/^a@L\d+$/);
  });

  it('collects ids and anchor names', () => {
    const info = read('/', pageHtml({ main: '<h2 id="hours">Hours</h2><a name="old-anchor"></a><p id="">Empty</p>' }));
    expect([...info.ids].sort()).toEqual(['hours', 'old-anchor']);
  });

  it('reads alternates from link elements, in lower case', () => {
    const info = read('/', pageHtml({ head: `${alternate('FR', '/fr')}${alternate('x-default', '/')}<link rel="alternate" type="application/rss+xml" href="/feed"><link rel="stylesheet alternate" hreflang="en" href="/a.css">` }));
    expect(info.alternates).toEqual([
      { hreflang: 'fr', to: '/fr', href: '/fr' },
      { hreflang: 'x-default', to: '/', href: '/' },
      { hreflang: 'en', to: '/a.css', href: '/a.css' },
    ]);
  });

  it('gives no route for an alternate on another host', () => {
    expect(read('/', pageHtml({ head: alternate('fr', 'https://fr.example/') })).alternates[0]?.to).toBeNull();
  });

  it.each([
    ['<input type="search" name="q">', true],
    ['<form role="search"><input name="q"></form>', true],
    ['<search><input name="q"></search>', true],
    ['<input type="text" name="q">', false],
  ])('finds a search in %s: %s', (main, want) => {
    expect(read('/', pageHtml({ main })).hasSearch).toBe(want);
  });

  it('counts the parts of a page, leaving hidden ones out', () => {
    const main =
      '<h2>A</h2><h3>B</h3><img src="a.png" alt=""><table><tr><td>x</td></tr></table><ul><li>1</li><li>2</li></ul>' +
      '<button type="button">Go</button><input name="a"><select name="b"></select><textarea name="c"></textarea>' +
      '<input type="hidden" name="t"><input type="submit" value="Send"><div hidden><h2>Hidden</h2><img src="b.png" alt=""></div><a href="/x">x</a>';
    expect(read('/', pageHtml({ title: 'T', main })).counts).toEqual({ headings: 3, links: 1, fields: 3, images: 1, tables: 1, listItems: 2, buttons: 1 });
  });

  it('never asks for the base address it resolves links with', () => {
    expect(SITE_BASE.endsWith('.invalid')).toBe(true);
  });
});

describe('regionOfNode and markupName', () => {
  const { nodes } = parseHtml('<div role="banner"><a id="a" href="/">A</a></div><div role="navigation"><div role="main"><a id="b" href="/">B</a></div></div><aside><a id="c" href="/">C</a></aside><a id="d" href="/">D</a><div role="contentinfo"><a id="e" href="/"><svg aria-label="Logo"></svg></a></div>');
  const byId = (id: string) => {
    const n = nodes.find((x) => x.attrs['id'] === id);
    if (!n) throw new Error(id);
    return n;
  };

  it('reads regions from roles and tags, the nearest first', () => {
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => regionOfNode(nodes, byId(id)))).toEqual(['header', 'main', 'aside', 'body', 'footer']);
  });

  it('takes the label of an inline image as a name', () => {
    expect(markupName(nodes, byId('e'))).toBe('Logo');
    expect(markupName(nodes, byId('a'))).toBe('A');
  });
});

describe('readSite', () => {
  it('reads each route once and keeps the first', () => {
    const infos = readSite([sitePage('/', { title: 'First' }), sitePage('/a'), sitePage('/', { title: 'Second' })]);
    expect(infos.map((i) => [i.route, i.title])).toEqual([
      ['/', 'First'],
      ['/a', 'Page'],
    ]);
  });
});

describe('factsFromMarkup', () => {
  it('gives the navigation names and the first help link with its region', () => {
    const info = readPage(sitePage('/', { lang: 'en', title: 'Home', nav: [['/', 'Home'], ['/places', 'Places']], main: '<a href="/x">More</a>', footer: '<a href="/contact">Contact us</a><a href="/help">Help</a>' }));
    expect(factsFromMarkup(info)).toEqual({
      title: 'Home',
      lang: 'en',
      links: [],
      controls: [],
      draggables: [],
      nav: ['Home', 'Places'],
      help: { text: 'Contact us', region: 'footer', afterMain: true },
      truncated: false,
    });
  });

  it('gives no help when no link is named for it', () => {
    expect(factsFromMarkup(readPage(sitePage('/', { nav: [['/', 'Home']] }))).help).toBeNull();
  });

  it('lets the consistency check run on markup: navigation that changes order fails', () => {
    const a = readPage(sitePage('/a', { title: 'A', nav: [['/m', 'Map'], ['/t', 'Tools'], ['/h', 'Help']] }));
    const b = readPage(sitePage('/b', { title: 'B', nav: [['/t', 'Tools'], ['/m', 'Map'], ['/h', 'Help']] }));
    const result = auditConsistency([a, b].map((info) => ({ route: info.route, facts: factsFromMarkup(info) })));
    expect(result.entries.map((e) => [e.id, e.rule, e.status])).toEqual([['/b', 'nav-order', 'fail']]);
  });

  it('lets the consistency check run on markup: a help link that moves fails', () => {
    const a = readPage(sitePage('/a', { title: 'A', footer: '<a href="/help">Help</a>' }));
    const b = readPage({ route: '/b', html: '<html lang="en"><head><title>B</title></head><body><header><a href="/help">Help</a></header><main><h1>B</h1></main></body></html>' });
    const result = auditConsistency([a, b].map((info) => ({ route: info.route, facts: factsFromMarkup(info) })));
    expect(result.entries.map((e) => e.rule)).toEqual(['help-place']);
  });
});
