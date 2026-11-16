import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { auditWeight, weightInPage, type WeightFacts } from './weight.js';

const KB = 1024;
const facts = (over: Partial<WeightFacts> = {}): WeightFacts => ({ resources: [], images: [], ...over });
const rules = (f: WeightFacts, o = {}): string[] => auditWeight(f, o).entries.map((e) => `${e.rule}:${e.status}`);

describe('auditWeight', () => {
  it('is quiet for a light page', () => {
    const r = auditWeight(facts({ resources: [{ url: 'https://s.test/a.js', bytes: 50 * KB, kind: 'script' }] }));
    expect(r.entries).toEqual([]);
    expect(r.checked).toBe(1);
  });
  it('asks for a look above the soft limit, never fails without a set limit', () => {
    expect(rules(facts({ resources: [{ url: 'a.js', bytes: 2000 * KB, kind: 'script' }] }))).toEqual(['page-weight-high:unknown']);
  });
  it('fails above a limit the team set', () => {
    expect(rules(facts({ resources: [{ url: 'a.js', bytes: 200 * KB, kind: 'script' }] }), { maxKb: 100 })).toEqual(['page-weight:fail']);
  });
  it('does not fail at exactly the limit', () => {
    expect(rules(facts({ resources: [{ url: 'a.js', bytes: 100 * KB, kind: 'script' }] }), { maxKb: 100 })).toEqual([]);
  });
  it('flags one large image as unknown', () => {
    expect(rules(facts({ resources: [{ url: 'https://s.test/p/big.jpg?x=1', bytes: 400 * KB, kind: 'img' }] }))).toEqual(['large-image:unknown']);
  });
  it('treats sizes the browser hid as unknown, not zero', () => {
    expect(rules(facts({ resources: [{ url: 'https://o.test/a.js', bytes: null, kind: 'script' }] }))).toEqual(['weight-unmeasured:unknown']);
  });
  it('flags an image much larger than shown, and one without size attributes', () => {
    const f = facts({ images: [{ id: 'img[0]', src: 'a.jpg', naturalWidth: 2400, shownWidth: 300, hasSize: false }] });
    expect(rules(f).sort()).toEqual(['image-size:fail', 'oversized-image:unknown']);
  });
  it('ignores small images and hidden ones', () => {
    const f = facts({ images: [{ id: 'img[0]', src: 'a.jpg', naturalWidth: 500, shownWidth: 100, hasSize: true }, { id: 'img[1]', src: 'b.jpg', naturalWidth: 3000, shownWidth: 0, hasSize: true }] });
    expect(rules(f)).toEqual([]);
  });
  it('skips the size rule for an image with no source', () => {
    expect(rules(facts({ images: [{ id: 'img[0]', src: '', naturalWidth: 0, shownWidth: 10, hasSize: false }] }))).toEqual([]);
  });
  it('writes both languages with correct French spacing', () => {
    const e = auditWeight(facts({ resources: [{ url: 'a.jpg', bytes: 2000 * KB, kind: 'img' }] }), { maxKb: 10 }).entries;
    expect(e.length).toBeGreaterThan(1);
    for (const x of e) {
      expect(x.message.en).not.toBe('');
      expect(frTypographyIssues(x.message.fr)).toEqual([]);
    }
  });
});

describe('weightInPage', () => {
  it('returns empty facts with no browser globals', () => {
    expect(weightInPage({ max: 10 })).toEqual({ resources: [], images: [] });
  });
  it('reads timing entries and images from the globals', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { location: g.location, performance: g.performance, document: g.document };
    g.location = { host: 'app.test' };
    g.performance = { getEntriesByType: () => [
      { name: 'https://app.test/a.js', initiatorType: 'script', encodedBodySize: 2048 },
      { name: 'https://cdn.test/b.js', initiatorType: 'script', encodedBodySize: 0 },
    ] };
    g.document = { querySelectorAll: () => [{ getAttribute: (n: string) => (n === 'src' ? 'a.png' : null), naturalWidth: 1000, getBoundingClientRect: () => ({ width: 100 }) }] };
    try {
      const r = weightInPage({ max: 10 });
      expect(r.resources.map((x) => x.bytes)).toEqual([2048, null]);
      expect(r.images[0]).toMatchObject({ naturalWidth: 1000, shownWidth: 100, hasSize: false });
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete g[k]; else g[k] = v; }
    }
  });
});
