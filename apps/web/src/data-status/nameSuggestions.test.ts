import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, MAX_QUERY_LENGTH, NO_FILTERS, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  allowedDistance,
  buildNameSuggestions,
  describeSuggestionApplied,
  editDistance,
  MAX_SUGGESTIONS,
  parseSuggestAction,
  renderNameSuggestionsHtml,
  searchVocabulary,
  suggestAction,
  suggestionLabel,
} from './nameSuggestions';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, structureProblems, targetsBelow44 } from './testkit';

const src = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [src('a', 'Library ramps'), src('b', 'Librairie centrale', { tier: 'E' }), src('c', 'Théâtre municipal')] },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('d', 'Transit stops'), src('e', 'Transit shelters', { licence: 'Proprietary' })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const q = (query: string, over: Partial<Filters> = {}): Filters => ({ ...NO_FILTERS, ...over, query });
const suggest = (query: string, over: Partial<Filters> = {}) => buildNameSuggestions(audit.sources, q(query, over));

describe('editDistance', () => {
  it('counts added, removed, replaced and swapped letters', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('transit', 'transt')).toBe(1);
    expect(editDistance('transit', 'transitt')).toBe(1);
    expect(editDistance('transit', 'trensit')).toBe(1);
    expect(editDistance('transit', 'tarnsit')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('ca', 'abc')).toBe(3);
  });
  it('is the same in both directions', () => {
    for (const [a, b] of [['library', 'librairie'], ['stops', 'spots'], ['a', 'b'], ['théâtre', 'theatre']] as const) expect(editDistance(a, b)).toBe(editDistance(b, a));
  });
  it('stops early and answers max + 1 when the words are further apart', () => {
    expect(editDistance('kitten', 'sitting', 2)).toBe(3);
    expect(editDistance('kitten', 'sitting', 1)).toBe(2);
    expect(editDistance('a', 'abcdefgh', 2)).toBe(3);
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
    expect(editDistance('abc', 'abc', 0)).toBe(0);
    expect(editDistance('abc', 'abd', 0)).toBe(1);
  });
  it('counts letters, not code units', () => {
    expect(editDistance('a😀b', 'ab')).toBe(1);
  });
});

describe('allowedDistance and searchVocabulary', () => {
  it('allows no change in short words, one in medium words and two in long ones', () => {
    expect(['', 'a', 'bus'].map(allowedDistance)).toEqual([0, 0, 0]);
    expect(['ramp', 'transit'].map(allowedDistance)).toEqual([1, 1]);
    expect(['shelters', 'municipal'].map(allowedDistance)).toEqual([2, 2]);
  });
  it('lists each folded word of four letters or more once, sorted', () => {
    const words = searchVocabulary(audit.sources);
    expect(words).toEqual([...new Set(words)].sort());
    expect(words).toContain('theatre');
    expect(words).toContain('ontario');
    expect(words).not.toContain('ogl');
    expect(words.every((w) => [...w].length >= 4)).toBe(true);
  });
});

describe('buildNameSuggestions', () => {
  it('offers the close spelling for a slip, with how many sources it lists', () => {
    expect(suggest('transt')).toEqual([{ query: 'transit', count: 2, distance: 1 }]);
    expect(suggest('theater')).toEqual([{ query: 'theatre', count: 1, distance: 1 }]);
  });
  it('reads accents and capitals as the search does', () => {
    expect(suggest('THÉATER')).toEqual([{ query: 'theatre', count: 1, distance: 1 }]);
  });
  it('keeps the words that already match and corrects the others', () => {
    expect(suggest('transit sheltrs')).toEqual([{ query: 'transit shelters', count: 1, distance: 1 }]);
  });
  it('offers nothing when the list is not empty, the search is empty or the limit is under one', () => {
    expect(suggest('transit')).toEqual([]);
    expect(suggest('')).toEqual([]);
    expect(suggest('   ')).toEqual([]);
    expect(buildNameSuggestions(audit.sources, q('transt'), 0)).toEqual([]);
    expect(buildNameSuggestions([], q('transt'))).toEqual([]);
  });
  it('offers nothing for a short word or a word with no near spelling', () => {
    expect(suggest('bsu')).toEqual([]);
    expect(suggest('zzzzzz')).toEqual([]);
    expect(suggest('transt zzzzzz')).toEqual([]);
  });
  it('offers nothing when each word matches some source but no source has them all', () => {
    expect(suggest('library transit')).toEqual([]);
  });
  it('only offers a search that lists something with the other filters as they are', () => {
    expect(suggest('transt', { kind: 'places' })).toEqual([]);
    expect(suggest('transt', { licence: 'unrecognised' })).toEqual([{ query: 'transit', count: 1, distance: 1 }]);
    expect(suggest('transt', { state: 'stale' })).toEqual([]);
  });
  it('puts the nearest first, then the one that lists more, and never more than the limit', () => {
    const out = suggest('libary');
    expect(out[0]).toEqual({ query: 'library', count: 1, distance: 1 });
    expect(out.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    const distances = out.map((s) => s.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(buildNameSuggestions(audit.sources, q('libary'), 1)).toHaveLength(1);
  });
  it('holds its promises on random registries', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const word of searchVocabulary(a.sources).slice(0, 6)) {
        const typo = `${word.slice(0, 1)}${word.slice(2)}`;
        const f = q(typo);
        const out = buildNameSuggestions(a.sources, f);
        if (applyFilters(a.sources, f).length > 0) expect(out, `seed ${seed} ${typo}`).toEqual([]);
        expect(out.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
        for (const s of out) {
          expect(applyFilters(a.sources, { ...f, query: s.query }).length, `seed ${seed} ${typo} -> ${s.query}`).toBe(s.count);
          expect(s.count).toBeGreaterThan(0);
          expect(s.distance).toBeGreaterThan(0);
          expect(s.query.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
        }
      }
    }
  });
});

describe('actions and words', () => {
  it('round-trips positions and rejects anything else', () => {
    for (let i = 0; i < MAX_SUGGESTIONS; i++) expect(parseSuggestAction(suggestAction(i))).toBe(i);
    for (const bad of [null, undefined, '', 'suggest:', 'suggest:-1', 'suggest:3', 'suggest:1.5', 'suggest:x', 'suggest:001', 'show:tier:E']) expect(parseSuggestAction(bad), String(bad)).toBeNull();
  });
  it('labels a suggestion with the text and the count, in both languages', () => {
    expect(suggestionLabel({ query: 'transit', count: 1, distance: 1 }, 'en')).toBe('Search for “transit” instead (1 source)');
    expect(suggestionLabel({ query: 'transit', count: 2, distance: 1 }, 'en')).toBe('Search for “transit” instead (2 sources)');
    expect(suggestionLabel({ query: 'transit', count: 2, distance: 1 }, 'fr')).toBe('Chercher plutôt «\u202Ftransit\u202F» (2 sources)');
    expect(describeSuggestionApplied({ query: 'transit', count: 2, distance: 1 }, 'en')).toBe('Now searching for “transit”. 2 sources listed.');
    for (const n of [1, 2]) {
      expect(lintFrench(suggestionLabel({ query: 'transit', count: n, distance: 1 }, 'fr'))).toEqual([]);
      expect(lintFrench(describeSuggestionApplied({ query: 'transit', count: n, distance: 1 }, 'fr'))).toEqual([]);
    }
  });
});

describe('renderNameSuggestionsHtml', () => {
  const items = [
    { query: 'transit', count: 2, distance: 1 },
    { query: '<b>&"', count: 1, distance: 2 },
  ];
  it('is empty with nothing to suggest', () => {
    expect(renderNameSuggestionsHtml([], 'en')).toBe('');
  });
  it('has one button per suggestion, in order, and escapes the text', () => {
    const html = renderNameSuggestionsHtml(items, 'en');
    expect(html).toContain('data-name-suggestions="2"');
    expect([...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1])).toEqual(['suggest:0', 'suggest:1']);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;&amp;&quot;');
  });
  it('uses links on static pages', () => {
    const html = renderNameSuggestionsHtml(items, 'en', { hrefFor: (s) => `/x?q=${encodeURIComponent(s.query)}` });
    expect(html).not.toContain('<button');
    expect(html).toContain('href="/x?q=transit"');
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderNameSuggestionsHtml(items, locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});

describe('in the panel', () => {
  const mount = () => {
    const host = new FakeHost();
    const changes: unknown[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v) });
    return { host, panel, changes };
  };
  it('offers the close spelling when the search lists nothing, and does not change the search by itself', () => {
    const { host, panel } = mount();
    host.filter('input', 'query', 'transt');
    expect(panel.getFilters().query).toBe('transt');
    expect(host.region.innerHTML).toContain('data-name-suggestions="1"');
    expect(host.region.innerHTML).toContain('Search for “transit” instead (2 sources)');
  });
  it('searches for it when asked, says so and moves focus to the search box', () => {
    const { host, panel, changes } = mount();
    host.filter('input', 'query', 'transt');
    host.click('suggest:0');
    expect(panel.getFilters()).toEqual(q('transit'));
    expect(host.announce.innerHTML).toContain('Now searching for “transit”. 2 sources listed.');
    expect(host.innerHTML).toContain('value="transit"');
    expect(host.innerHTML).not.toContain('data-name-suggestions');
    expect(host.focused.at(-1)).toBe('#ds-f-q');
    expect(changes).toHaveLength(2);
  });
  it('does nothing for a position with no suggestion', () => {
    const { host, panel, changes } = mount();
    host.filter('input', 'query', 'transt');
    host.click('suggest:2');
    expect(panel.getFilters().query).toBe('transt');
    expect(changes).toHaveLength(1);
    host.filter('input', 'query', '');
    host.click('suggest:0');
    expect(panel.getFilters()).toEqual(NO_FILTERS);
  });
  it('shows no suggestion while the list has sources', () => {
    const { host } = mount();
    host.filter('input', 'query', 'transit');
    expect(host.region.innerHTML).not.toContain('data-name-suggestions');
  });
  it('the static page links to the corrected search and passes the audits', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, filters: q('transt'), staticView: { action: `/${locale}/data-status`, csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
      expect(page).toContain('data-name-suggestions="1"');
      expect(page).not.toContain('data-action="suggest:');
      expect(page).toContain(`href="/${locale}/data-status?q=transit"`);
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});
