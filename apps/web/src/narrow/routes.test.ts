import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_SIBLINGS, WILD, groupByTemplate, looksLikeData, matchTemplate, normalizeRoute, segmentsOf, shapeOf } from './routes.js';

const BASE = 'https://app.example/';

describe('normalizeRoute', () => {
  it.each([
    ['/a//b/', '/a/b'],
    ['/', '/'],
    ['  /fr/ ', '/fr'],
    ['about', '/about'],
    ['https://app.example/places/1', '/places/1'],
    ['/x?b=1&a=2#top', '/x?b=1&a=2'],
    ['/x#section', '/x'],
    ['#/map', '/#/map'],
    ['/app#!/map', '/app#!/map'],
  ])('%s gives %s', (input, want) => {
    expect(normalizeRoute(input, BASE)).toBe(want);
  });

  it.each([['https://other.example/a'], ['mailto:someone@app.example'], ['tel:+15555550100'], ['javascript:void(0)'], [''], ['   '], ['https://[bad']])(
    '%s is not a route of the site',
    (input) => {
      expect(normalizeRoute(input, BASE)).toBeNull();
    },
  );

  it('treats another port as another host', () => {
    expect(normalizeRoute('https://app.example:8443/a', BASE)).toBeNull();
  });

  it('resolves a relative link against the page it is on', () => {
    expect(normalizeRoute('photos', 'https://app.example/places/1/')).toBe('/places/1/photos');
    expect(normalizeRoute('../2', 'https://app.example/places/1/')).toBe('/places/2');
  });

  it('gives null when the base is not a URL', () => {
    expect(normalizeRoute('/a', 'not a base')).toBeNull();
  });
});

describe('segments and shapes', () => {
  it('cuts a path into segments and leaves the query out', () => {
    expect(segmentsOf('/places/12/photos?page=2')).toEqual(['places', '12', 'photos']);
    expect(segmentsOf('/')).toEqual([]);
    expect(segmentsOf('/#/map')).toEqual([]);
  });

  it.each([
    ['123', true],
    ['2026-11-19', true],
    ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', true],
    ['0123456789abcdef', true],
    ['abc', false],
    ['cn-tower', false],
    ['12a', false],
    ['deadbeef', false],
  ])('%s as data: %s', (segment, want) => {
    expect(looksLikeData(segment)).toBe(want);
  });

  it.each([
    ['/places/123/photos', `/places/${WILD}/photos`],
    ['/p/2026-01-02', `/p/${WILD}`],
    ['/s?q=a&lang=fr&q=b', '/s?lang&q'],
    ['/', '/'],
    ['/places/cn-tower', '/places/cn-tower'],
    ['/a?', '/a'],
  ])('shape of %s is %s', (route, want) => {
    expect(shapeOf(route)).toBe(want);
  });
});

describe('groupByTemplate', () => {
  const slugs = Array.from({ length: DEFAULT_MIN_SIBLINGS }, (_v, i) => `/places/place-${String.fromCharCode(97 + i)}`);

  it('joins numbered pages by shape alone', () => {
    const groups = groupByTemplate(['/places/1', '/places/2', '/about']);
    expect(groups[0]).toEqual({ template: `/places/${WILD}`, routes: ['/places/1', '/places/2'] });
    expect(groups[1]).toEqual({ template: '/about', routes: ['/about'] });
  });

  it('joins slugs once there are enough of them', () => {
    const groups = groupByTemplate(slugs);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.template).toBe(`/places/${WILD}`);
    expect(groups[0]?.routes).toHaveLength(DEFAULT_MIN_SIBLINGS);
  });

  it('keeps slugs apart below the limit', () => {
    const groups = groupByTemplate(slugs.slice(0, DEFAULT_MIN_SIBLINGS - 1));
    expect(groups).toHaveLength(DEFAULT_MIN_SIBLINGS - 1);
  });

  it('takes the limit from the options, with two as the least', () => {
    expect(groupByTemplate(['/c/x', '/c/y'], { minSiblings: 2 })).toHaveLength(1);
    expect(groupByTemplate(['/c/x'], { minSiblings: 0 })).toEqual([{ template: '/c/x', routes: ['/c/x'] }]);
  });

  it('never replaces the first segment, however many top-level pages there are', () => {
    const top = Array.from({ length: 30 }, (_v, i) => `/page-${String.fromCharCode(97 + (i % 26))}${i}`);
    expect(groupByTemplate(top)).toHaveLength(30);
  });

  it('puts a slug with the numbered pages of the same place', () => {
    const groups = groupByTemplate(['/places/1', '/places/2', '/places/cn-tower']);
    expect(groups).toEqual([{ template: `/places/${WILD}`, routes: ['/places/1', '/places/2', '/places/cn-tower'] }]);
  });

  it('finds a placeholder in the middle of a path', () => {
    const routes = slugs.map((s) => `${s}/photos`);
    expect(groupByTemplate(routes)[0]?.template).toBe(`/places/${WILD}/photos`);
  });

  it('keeps the pages of a named section apart', () => {
    const help = Array.from({ length: 12 }, (_v, i) => `/help/topic-${String.fromCharCode(97 + i)}`);
    expect(groupByTemplate(help)).toHaveLength(1);
    expect(groupByTemplate(help, { literals: ['help'] })).toHaveLength(12);
  });

  it('keeps routes with different query names apart', () => {
    const groups = groupByTemplate(['/s?q=a', '/s?q=b', '/s?q=a&page=2']);
    expect(groups.map((g) => g.template)).toEqual(['/s?q', '/s?page&q']);
  });

  it('counts a repeated route once and sorts the largest group first', () => {
    const groups = groupByTemplate(['/about', '/places/2', '/places/1', '/places/1']);
    expect(groups.map((g) => g.routes.length)).toEqual([2, 1]);
    expect(groups[0]?.routes).toEqual(['/places/1', '/places/2']);
  });

  it('gives nothing for no routes', () => {
    expect(groupByTemplate([])).toEqual([]);
  });

  it('keeps the root as its own template', () => {
    expect(groupByTemplate(['/', '/fr'])).toEqual([
      { template: '/', routes: ['/'] },
      { template: '/fr', routes: ['/fr'] },
    ]);
  });
});

describe('matchTemplate', () => {
  const templates = [`/places/${WILD}`, '/about', `/places/${WILD}/photos`];

  it('matches a slug against a placeholder', () => {
    expect(matchTemplate('/places/union-station', templates)).toBe(`/places/${WILD}`);
  });

  it('matches a numbered route by its shape first', () => {
    expect(matchTemplate('/places/77/photos', templates)).toBe(`/places/${WILD}/photos`);
  });

  it('matches a literal template', () => {
    expect(matchTemplate('/about', templates)).toBe('/about');
  });

  it('gives null for a route no template covers', () => {
    expect(matchTemplate('/cities/toronto', templates)).toBeNull();
    expect(matchTemplate('/places', templates)).toBeNull();
    expect(matchTemplate('/places/1/photos/2', templates)).toBeNull();
  });
});
