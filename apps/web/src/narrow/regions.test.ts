import { afterEach, describe, expect, it } from 'vitest';
import { auditRegions, EMPTY_REGIONS, KEEP_OUTSIDE, regionsInPage, type RegionFacts } from './regions.js';
import { noFrIssues } from './expect-fr.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { installDom, type Installed } from './testkit.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});
const facts = (): RegionFacts => regionsInPage({ maxElements: 200, selector: INTERACTIVE_SELECTOR });
const SENTENCE = 'The ramp is on the left side of the door.';

describe('regionsInPage', () => {
  it('finds no outside content when everything is in main', () => {
    dom = installDom([{ tag: 'main', children: [{ tag: 'p', text: SENTENCE }] }]);
    const f = facts();
    expect(f.landmarks).toBe(1);
    expect(f.outsideCount).toBe(0);
    expect(f.checked).toBe(1);
  });
  it('finds text that sits outside every landmark', () => {
    dom = installDom([{ tag: 'main', children: [{ tag: 'p', text: SENTENCE }] }, { tag: 'p', id: 'loose', text: SENTENCE }]);
    const f = facts();
    expect(f.outsideCount).toBe(1);
    expect(f.outside).toEqual(['p#loose[1]']);
  });
  it('counts a landmark role as a landmark', () => {
    dom = installDom([{ tag: 'div', attrs: { role: 'main' }, children: [{ tag: 'p', text: SENTENCE }] }]);
    expect(facts().outsideCount).toBe(0);
  });
  it('counts nav, header, footer and aside', () => {
    for (const tag of ['nav', 'header', 'footer', 'aside']) {
      dom = installDom([{ tag, children: [{ tag: 'p', text: SENTENCE }] }]);
      expect(facts().outsideCount, tag).toBe(0);
      dom.uninstall();
      dom = null;
    }
  });
  it('does not count a section without a name', () => {
    dom = installDom([{ tag: 'section', children: [{ tag: 'p', text: SENTENCE }] }]);
    expect(facts().landmarks).toBe(0);
    expect(facts().outsideCount).toBe(1);
  });
  it('counts a section that has a name', () => {
    dom = installDom([{ tag: 'section', attrs: { 'aria-label': 'Help' }, children: [{ tag: 'p', text: SENTENCE }] }]);
    expect(facts().landmarks).toBe(1);
    expect(facts().outsideCount).toBe(0);
  });
  it('skips hidden content', () => {
    dom = installDom([{ tag: 'main' }, { tag: 'p', text: SENTENCE, style: { display: 'none' } }]);
    expect(facts().outsideCount).toBe(0);
  });
  it('skips short text', () => {
    dom = installDom([{ tag: 'main' }, { tag: 'p', text: 'Hi there' }]);
    expect(facts().checked).toBe(0);
  });
  it('keeps only a few ids but counts them all', () => {
    dom = installDom([{ tag: 'main' }, ...Array.from({ length: 8 }, () => ({ tag: 'p', text: SENTENCE }))]);
    const f = facts();
    expect(f.outsideCount).toBe(8);
    expect(f.outside).toHaveLength(KEEP_OUTSIDE);
  });
  it('stops at the element limit and says so', () => {
    dom = installDom([{ tag: 'main' }, ...Array.from({ length: 8 }, () => ({ tag: 'p', text: SENTENCE }))]);
    expect(regionsInPage({ maxElements: 3, selector: INTERACTIVE_SELECTOR }).truncated).toBe(true);
  });
  it('does not change the document', () => {
    dom = installDom([{ tag: 'main' }, { tag: 'p', text: SENTENCE }]);
    facts();
    expect(dom.world.styleElements).toBe(0);
  });
});

describe('auditRegions', () => {
  const base: RegionFacts = { landmarks: 1, checked: 5, outside: ['p[3]', 'p[4]'], outsideCount: 2, truncated: false };
  it('reports one UNKNOWN finding that names the first block and the count', () => {
    const r = auditRegions(base);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ check: 'regions', status: 'unknown', rule: 'outside-landmark', id: 'p[3]' });
    expect(r.entries[0]?.message.en).toContain('2 text blocks or controls sit outside');
    expect(r.entries[0]?.message.fr).toContain('2 blocs de texte ou contrôles se trouvent hors');
  });
  it('uses the singular for one block', () => {
    const e = auditRegions({ ...base, outside: ['p[3]'], outsideCount: 1 }).entries[0]!;
    expect(e.message.en).toContain('1 text block or control sits outside');
    expect(e.message.fr).toContain('1 bloc de texte ou contrôle se trouve hors');
  });
  it('has clean French in both forms', () => {
    noFrIssues([...auditRegions(base).entries, ...auditRegions({ ...base, outsideCount: 1 }).entries]);
  });
  it('says nothing when the page has no landmark at all (the static rule covers that)', () => {
    expect(auditRegions({ ...base, landmarks: 0 }).entries).toEqual([]);
  });
  it('says nothing when nothing is outside', () => {
    expect(auditRegions({ ...base, outside: [], outsideCount: 0 }).entries).toEqual([]);
    expect(auditRegions(EMPTY_REGIONS)).toEqual({ checked: 0, entries: [] });
  });
});
