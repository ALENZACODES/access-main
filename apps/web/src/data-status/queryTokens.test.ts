import { describe, expect, it } from 'vitest';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import { auditRegistry } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  applyQueryTokens,
  describeTokensApplied,
  parseQueryTokens,
  renderQueryTokensHtml,
  TOKEN_EXAMPLES,
  TOKEN_KEYS,
  tokenFilterLabels,
  TOKENS_APPLY_ACTION,
} from './queryTokens';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const withQuery = (query: string): Filters => ({ ...NO_FILTERS, query });

describe('parseQueryTokens', () => {
  it('leaves plain search text alone', () => {
    for (const q of ['', '   ', 'transit', 'ramps and lifts', 'a:', ':b', 'https://example.org', 'colour:blue']) {
      const p = parseQueryTokens(q);
      expect(p.filters, q).toEqual({});
      expect(p.recognised, q).toEqual([]);
      expect(p.notUnderstood, q).toEqual([]);
      expect(p.rest, q).toBe(q.trim());
    }
  });
  it('reads one word for each kind of filter', () => {
    expect(parseQueryTokens('tier:E').filters).toEqual({ tier: 'E' });
    expect(parseQueryTokens('tier:2').filters).toEqual({ tier: '2' });
    expect(parseQueryTokens('licence:open').filters).toEqual({ licence: 'open' });
    expect(parseQueryTokens('license:terms').filters).toEqual({ licence: 'terms' });
    expect(parseQueryTokens('status:stale').filters).toEqual({ state: 'stale' });
    expect(parseQueryTokens('unknown:date').filters).toEqual({ gap: 'date' });
    expect(parseQueryTokens('age:31-90').filters).toEqual({ age: 'd31_90' });
    expect(parseQueryTokens('age:366+').filters).toEqual({ age: 'd366_plus' });
    expect(parseQueryTokens('due:30').filters).toEqual({ due: 'd30' });
  });
  it('reads the French words, with or without accents and capitals', () => {
    expect(parseQueryTokens('niveau:E').filters).toEqual({ tier: 'E' });
    expect(parseQueryTokens('Niveau:inconnu').filters).toEqual({ tier: 'unknown' });
    expect(parseQueryTokens('licence:ouverte').filters).toEqual({ licence: 'open' });
    expect(parseQueryTokens('état:périmé').filters).toEqual({ state: 'stale' });
    expect(parseQueryTokens('ETAT:PERIME').filters).toEqual({ state: 'stale' });
    expect(parseQueryTokens('sans:date').filters).toEqual({ gap: 'date' });
    expect(parseQueryTokens('révision:7').filters).toEqual({ due: 'd7' });
    expect(parseQueryTokens('âge:inconnu').filters).toEqual({ age: 'unknown' });
  });
  it('every example shown to people is understood in full', () => {
    for (const locale of ['en', 'fr'] as const) {
      const p = parseQueryTokens(TOKEN_EXAMPLES[locale].join(' '));
      expect(p.recognised).toEqual([...TOKEN_EXAMPLES[locale]]);
      expect(p.notUnderstood).toEqual([]);
      expect(p.rest).toBe('');
      expect(Object.keys(p.filters).sort()).toEqual([...TOKEN_KEYS].sort());
    }
    expect(parseQueryTokens(TOKEN_EXAMPLES.en.join(' ')).filters).toEqual(parseQueryTokens(TOKEN_EXAMPLES.fr.join(' ')).filters);
  });
  it('keeps the other words as the search text, in order', () => {
    const p = parseQueryTokens('  city  tier:E transit   licence:open  stops ');
    expect(p.rest).toBe('city transit stops');
    expect(p.recognised).toEqual(['tier:E', 'licence:open']);
    expect(p.filters).toEqual({ tier: 'E', licence: 'open' });
  });
  it('a later word for the same filter replaces an earlier one', () => {
    const p = parseQueryTokens('tier:1 tier:3');
    expect(p.filters).toEqual({ tier: '3' });
    expect(p.recognised).toEqual(['tier:1', 'tier:3']);
  });
  it('a known key with a value it cannot read stays in the search and is reported', () => {
    const p = parseQueryTokens('tier:9 bus due:soon');
    expect(p.filters).toEqual({});
    expect(p.notUnderstood).toEqual(['tier:9', 'due:soon']);
    expect(p.rest).toBe('tier:9 bus due:soon');
  });
  it('does not reach inherited properties', () => {
    for (const q of ['constructor:1', 'toString:x', '__proto__:x', 'tier:constructor', 'licence:toString', 'age:__proto__']) {
      const p = parseQueryTokens(q);
      expect(p.filters, q).toEqual({});
      expect(p.recognised, q).toEqual([]);
    }
    expect(parseQueryTokens('tier:constructor').notUnderstood).toEqual(['tier:constructor']);
  });
});

describe('applyQueryTokens', () => {
  it('changes nothing when no word is recognised', () => {
    const f = { ...withQuery('tier:9 bus'), onlyIssues: true };
    const out = applyQueryTokens(f, parseQueryTokens(f.query));
    expect(out).toEqual(f);
    expect(out).not.toBe(f);
  });
  it('sets the filters, keeps the rest as search text and leaves the input alone', () => {
    const f: Filters = { ...withQuery('bus tier:E status:stale'), kind: 'routes', dataset: 'transit' };
    const copy = { ...f };
    expect(applyQueryTokens(f, parseQueryTokens(f.query))).toEqual({ ...NO_FILTERS, kind: 'routes', dataset: 'transit', query: 'bus', tier: 'E', state: 'stale' });
    expect(f).toEqual(copy);
  });
  it('lists the same sources as choosing the filters by hand', () => {
    const audit = auditRegistry(RECORDS, NOW, {});
    for (const [typed, byHand] of [
      ['status:stale', { state: 'stale' }],
      ['licence:open', { licence: 'open' }],
      ['unknown:date', { gap: 'date' }],
      ['tier:unknown', { tier: 'unknown' }],
      ['age:0-30 licence:open', { age: 'd0_30', licence: 'open' }],
    ] as const) {
      const fromWords = applyQueryTokens(withQuery(typed), parseQueryTokens(typed));
      expect(fromWords, typed).toEqual({ ...NO_FILTERS, ...byHand });
      const ids = (f: Filters) => applyFilters(audit.sources, f).map((s) => `${s.datasetId}/${s.sourceId}`);
      expect(ids(fromWords), typed).toEqual(ids({ ...NO_FILTERS, ...byHand }));
    }
  });
});

describe('the offer', () => {
  it('is empty for plain search text', () => {
    expect(renderQueryTokensHtml(parseQueryTokens('transit'), 'en')).toBe('');
    expect(renderQueryTokensHtml(parseQueryTokens(''), 'fr')).toBe('');
  });
  it('names the filters in words and offers one button', () => {
    const p = parseQueryTokens('tier:E licence:open bus');
    const html = renderQueryTokensHtml(p, 'en');
    expect(html).toContain('data-query-tokens="2"');
    expect(html.match(/<button /g)).toHaveLength(1);
    expect(html).toContain(`data-action="${TOKENS_APPLY_ACTION}"`);
    expect(tokenFilterLabels(p, 'en')).toHaveLength(2);
    for (const label of tokenFilterLabels(p, 'en')) expect(visibleText(html)).toContain(label);
    expect(visibleText(html)).not.toContain('bus');
  });
  it('is a link on static pages', () => {
    const html = renderQueryTokensHtml(parseQueryTokens('tier:E'), 'en', { href: '/en/data-status?tier=E&a=<b>' });
    expect(html).not.toContain('<button');
    expect(html).toContain('href="/en/data-status?tier=E&amp;a=&lt;b&gt;"');
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('says which words were not understood, with examples, and offers nothing to apply', () => {
    const html = renderQueryTokensHtml(parseQueryTokens('tier:9 <b>:x due:<i>'), 'en');
    expect(html).toContain('data-query-tokens="0"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<i>');
    expect(visibleText(html)).toContain('tier:9');
    for (const example of TOKEN_EXAMPLES.en) expect(visibleText(html)).toContain(example);
  });
  it('reads well in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderQueryTokensHtml(parseQueryTokens('niveau:E etat:perime sans:date age:0-30 due:90 tier:9'), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      expect(describeTokensApplied(parseQueryTokens('tier:E'), locale)).toMatch(/^1 /);
      expect(describeTokensApplied(parseQueryTokens('tier:E due:7'), locale)).toMatch(/^2 /);
    }
    // The words to type hold plain colons on purpose, so the French check covers the prose around them.
    const offer = renderQueryTokensHtml(parseQueryTokens('niveau:E etat:perime sans:date'), 'fr');
    expect(lintFrench(visibleText(offer))).toEqual([]);
    expect(lintFrench(describeTokensApplied(parseQueryTokens('tier:E due:7'), 'fr'))).toEqual([]);
  });
});

describe('in the panel', () => {
  const mount = (locale: 'en' | 'fr' = 'en') => {
    const host = new FakeHost();
    const changes: unknown[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => locale, now: () => NOW, onFiltersChange: (v) => changes.push(v) });
    return { host, panel, changes };
  };
  it('offers the words as filters without applying them', () => {
    const { host, panel } = mount();
    host.filter('input', 'query', 'status:stale');
    expect(panel.getFilters()).toEqual(withQuery('status:stale'));
    expect(host.region.innerHTML).toContain('data-query-tokens="1"');
    expect(host.region.innerHTML).toContain(`data-action="${TOKENS_APPLY_ACTION}"`);
  });
  it('applies them when asked, says so, and moves focus to the search box', () => {
    const { host, panel, changes } = mount();
    host.filter('input', 'query', 'status:stale');
    const before = changes.length;
    host.click(TOKENS_APPLY_ACTION);
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, state: 'stale' });
    expect(host.region.innerHTML).not.toContain('data-query-tokens');
    expect(host.announce.innerHTML).toContain(describeTokensApplied(parseQueryTokens('status:stale'), 'en'));
    expect(host.focused.at(-1)).toBe('#ds-f-q');
    expect(changes.length).toBe(before + 1);
  });
  it('leaving the search box with the same text does not redraw the results', () => {
    const { host, changes } = mount();
    host.filter('input', 'query', 'status:stale');
    const before = changes.length;
    host.region.innerHTML = 'kept';
    host.filter('change', 'query', 'status:stale');
    expect(host.region.innerHTML).toBe('kept');
    expect(changes.length).toBe(before);
    host.filter('change', 'query', 'status:fresh');
    expect(host.region.innerHTML).toContain('data-query-tokens="1"');
    expect(changes.length).toBe(before + 1);
  });
  it('does nothing when there is nothing to apply', () => {
    const { host, panel, changes } = mount();
    host.filter('input', 'query', 'tier:9');
    const before = changes.length;
    const focusedBefore = host.focused.length;
    host.click(TOKENS_APPLY_ACTION);
    expect(panel.getFilters()).toEqual(withQuery('tier:9'));
    expect(changes.length).toBe(before);
    expect(host.focused.length).toBe(focusedBefore);
    expect(host.region.innerHTML).toContain('data-query-tokens="0"');
  });
  it('the static page links to the list with the words applied', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({
        records: RECORDS,
        locale,
        now: NOW,
        filters: withQuery('bus status:stale'),
        staticView: { action: `/${locale}/data-status`, csvHref: '/c', creditsHref: '/k', summaryHref: '/s' },
      });
      expect(page).toContain('data-query-tokens="1"');
      expect(page).not.toContain(`data-action="${TOKENS_APPLY_ACTION}"`);
      expect(page).toMatch(new RegExp(`<div data-query-tokens="1">.*?href="/${locale}/data-status\\?[^"]*state=stale[^"]*"`, 's'));
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});
