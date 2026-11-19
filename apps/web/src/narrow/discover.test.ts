import { describe, expect, it } from 'vitest';
import { FILE_EXTENSIONS, discoverRoutes, linksIn } from './discover.js';

const PAGE = 'https://app.example/fr/index.html';

describe('linksIn', () => {
  it('resolves relative links against the page', () => {
    const links = linksIn('<a href="lieux/1">Un</a><a href="/about">À propos</a><a href="../en/">English</a>', PAGE);
    expect(links.routes).toEqual(['/fr/lieux/1', '/about', '/en']);
  });

  it('follows a base element', () => {
    const links = linksIn('<head><base href="/en/"></head><a href="places/1">One</a>', PAGE);
    expect(links.routes).toEqual(['/en/places/1']);
  });

  it('ignores a base element with no href', () => {
    const links = linksIn('<base target="_blank"><a href="lieux/1">Un</a>', PAGE);
    expect(links.routes).toEqual(['/fr/lieux/1']);
  });

  it('gives each route once, in the order of the page', () => {
    const links = linksIn('<a href="/b">b</a><a href="/a">a</a><a href="/b/">b again</a><a href="/b#part">b part</a>', PAGE);
    expect(links.routes).toEqual(['/b', '/a']);
  });

  it('lists the hosts of links that leave the site, once each', () => {
    const links = linksIn('<a href="https://www.ontario.ca/page/a">a</a><a href="https://www.ontario.ca/page/b">b</a><a href="//cdn.example/x">x</a>', PAGE);
    expect(links.externalHosts).toEqual(['www.ontario.ca', 'cdn.example']);
    expect(links.routes).toEqual([]);
  });

  it('sets files apart by extension and by the download attribute', () => {
    const links = linksIn('<a href="/guide.PDF">Guide</a><a href="/export" download>Export</a><a href="/data/places.geojson">Data</a><a href="/v1.2/notes">Notes</a>', PAGE);
    expect(links.files).toEqual(['/guide.PDF', '/export', '/data/places.geojson']);
    expect(links.routes).toEqual(['/v1.2/notes']);
  });

  it('counts links that are not addresses of pages', () => {
    const links = linksIn('<a href="mailto:someone@app.example">Mail</a><a href="tel:+15555550100">Call</a><a href="javascript:void(0)">Run</a><a href="https://[bad">Bad</a>', PAGE);
    expect(links.other).toBe(4);
    expect(links.routes).toEqual([]);
  });

  it('skips anchors with no href, an empty href or only a fragment', () => {
    const links = linksIn('<a>None</a><a href="">Empty</a><a href="  ">Blank</a><a href="#main">Skip</a>', PAGE);
    expect(links).toEqual({ routes: [], externalHosts: [], files: [], other: 0 });
  });

  it('reads the areas of an image map', () => {
    expect(linksIn('<map name="m"><area href="/zone/1" alt="Zone 1"></map>', PAGE).routes).toEqual(['/zone/1']);
  });

  it('does not read link elements, forms or scripts', () => {
    const html = '<link rel="stylesheet" href="/a.css"><form action="/search"></form><script src="/a.js"></script><img src="/a.png" alt="">';
    expect(linksIn(html, PAGE)).toEqual({ routes: [], externalHosts: [], files: [], other: 0 });
  });

  it('keeps a hash route', () => {
    expect(linksIn('<a href="/#/map">Map</a>', PAGE).routes).toEqual(['/#/map']);
  });

  it('knows the common file extensions in lower case only', () => {
    for (const ext of FILE_EXTENSIONS) expect(ext).toBe(ext.toLowerCase());
    expect(FILE_EXTENSIONS.has('pdf')).toBe(true);
    expect(FILE_EXTENSIONS.has('html')).toBe(false);
  });
});

describe('discoverRoutes', () => {
  const pages = {
    'https://app.example/': '<a href="/places/1">One</a><a href="/about">About</a><a href="https://www.ontario.ca/">Ontario</a>',
    'https://app.example/places/1': '<a href="/">Home</a><a href="/places/2">Two</a><a href="/places/1.pdf">Print</a>',
  };

  it('joins the pages given and the pages they link to', () => {
    const d = discoverRoutes(pages);
    expect(d.routes).toEqual(['/', '/about', '/places/1', '/places/2']);
    expect(d.notRead).toEqual(['/about', '/places/2']);
    expect(d.externalHosts).toEqual(['www.ontario.ca']);
    expect(d.files).toEqual(['/places/1.pdf']);
  });

  it('takes a Map as well as an object', () => {
    expect(discoverRoutes(new Map(Object.entries(pages)))).toEqual(discoverRoutes(pages));
  });

  it('gives nothing for no pages', () => {
    expect(discoverRoutes({})).toEqual({ routes: [], notRead: [], externalHosts: [], files: [] });
  });

  it('leaves nothing unread when every linked page was given', () => {
    const d = discoverRoutes({ 'https://app.example/a': '<a href="/b">b</a>', 'https://app.example/b': '<a href="/a">a</a>' });
    expect(d.notRead).toEqual([]);
  });

  it('does not tell hosts apart, so the pages given are expected to come from one site', () => {
    const d = discoverRoutes({ 'https://app.example/a': '', 'https://docs.example/b': '<a href="/c">c</a>' });
    expect(d.routes).toEqual(['/a', '/b', '/c']);
  });
});
