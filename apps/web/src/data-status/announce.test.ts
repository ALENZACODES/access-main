import { describe, expect, it } from 'vitest';
import { createAnnouncer, describeChange, describeList, filterParts, REPEAT_MARK, sortPart, type ListState } from './announce';
import { NO_FILTERS, type Filters } from './filters';
import { lintFrench } from './i18n';

const base: ListState = { shown: 12, total: 40, filters: NO_FILTERS, sort: null, page: 1, pages: 1 };
const with_ = (over: Partial<ListState>): ListState => ({ ...base, ...over });
const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

describe('filterParts', () => {
  it('is empty with no filters', () => {
    expect(filterParts(NO_FILTERS, 'en')).toEqual([]);
  });
  it('names each active filter using the catalog labels in lower case', () => {
    expect(filterParts(f({ state: 'stale' }), 'en')).toEqual(['status may be out of date']);
    expect(filterParts(f({ kind: 'places' }), 'en')).toEqual(['dataset type places']);
    expect(filterParts(f({ query: ' park ' }), 'en')).toEqual(['name contains “park”']);
    expect(filterParts(f({ onlyIssues: true }), 'en')).toEqual(['only items to review']);
  });
  it('lists them in a fixed order', () => {
    expect(filterParts(f({ onlyIssues: true, query: 'x', kind: 'routes', state: 'unknown' }), 'en')).toEqual([
      'status update date unknown',
      'dataset type routes',
      'name contains “x”',
      'only items to review',
    ]);
  });
  it('uses French quotation marks with no-break spaces', () => {
    const [part] = filterParts(f({ query: 'parc' }), 'fr');
    expect(part).toBe('le nom contient « parc »');
  });
  it('ignores a query that is only spaces', () => {
    expect(filterParts(f({ query: '   ' }), 'en')).toEqual([]);
  });
});

describe('sortPart', () => {
  it('is null when not sorted', () => {
    expect(sortPart(null, 'en')).toBeNull();
  });
  it('says the column and direction in both languages', () => {
    expect(sortPart({ key: 'retrieved', dir: 'desc' }, 'en')).toBe('Sorted by retrieved date, descending.');
    expect(sortPart({ key: 'licence', dir: 'asc' }, 'fr')).toBe('Tri par licence, croissant.');
    expect(sortPart({ key: 'status', dir: 'asc' }, 'fr')).toBe('Tri par état, croissant.');
  });
});

describe('describeList', () => {
  it('gives only the count when nothing is set', () => {
    expect(describeList(base, 'en')).toBe('12 sources shown.');
    expect(describeList(with_({ shown: 1 }), 'en')).toBe('1 source shown.');
    expect(describeList(with_({ shown: 1 }), 'fr')).toBe('1 source affichée.');
    expect(describeList(with_({ shown: 0 }), 'en')).toBe('No sources match.');
    expect(describeList(with_({ shown: 0 }), 'fr')).toBe('Aucune source ne correspond.');
  });
  it('adds filters, sort and page in that order', () => {
    const text = describeList(with_({ filters: f({ state: 'stale' }), sort: { key: 'source', dir: 'asc' }, page: 2, pages: 5 }), 'en');
    expect(text).toBe('12 sources shown. Filters: status may be out of date. Sorted by source, ascending. Page 2 of 5.');
  });
  it('leaves the page out when there is only one', () => {
    expect(describeList(with_({ page: 1, pages: 1 }), 'en')).not.toContain('Page');
  });
  it('uses a no-break space before the colon in French and passes the typography check', () => {
    const text = describeList(with_({ filters: f({ kind: 'transit', query: 'gare' }), page: 3, pages: 4 }), 'fr');
    expect(text).toContain('Filtres : ');
    expect(text).toContain('Page 3 sur 4.');
    expect(lintFrench(text)).toEqual([]);
  });
});

describe('describeChange', () => {
  it('describes the whole list on first use', () => {
    expect(describeChange(null, base, 'en')).toBe(describeList(base, 'en'));
  });
  it('repeats the full description when nothing changed', () => {
    expect(describeChange(base, { ...base }, 'en')).toBe(describeList(base, 'en'));
  });
  it('names the new result and filters after a filter change', () => {
    const next = with_({ shown: 3, filters: f({ query: 'park' }) });
    expect(describeChange(base, next, 'en')).toBe('3 sources shown. Filters: name contains “park”.');
  });
  it('says filters were cleared when the last one is removed', () => {
    const prev = with_({ shown: 3, filters: f({ query: 'park' }) });
    expect(describeChange(prev, base, 'en')).toBe('12 sources shown. Filters cleared.');
    expect(describeChange(prev, base, 'fr')).toBe('12 sources affichées. Filtres effacés.');
  });
  it('says only the sort after a sort change, and says when it is removed', () => {
    const sorted = with_({ sort: { key: 'status', dir: 'desc' } });
    expect(describeChange(base, sorted, 'en')).toBe('Sorted by status, descending.');
    expect(describeChange(sorted, base, 'en')).toBe('Sorting removed.');
  });
  it('says the page and the row count after a page change', () => {
    const prev = with_({ page: 1, pages: 3, shown: 25 });
    const next = with_({ page: 2, pages: 3, shown: 25 });
    expect(describeChange(prev, next, 'en')).toBe('Page 2 of 3. 25 sources shown.');
  });
  it('does not repeat the count after a filter change that also moves the page', () => {
    const prev = with_({ page: 3, pages: 3, shown: 5 });
    const next = with_({ page: 1, pages: 1, shown: 2, filters: f({ onlyIssues: true }) });
    expect(describeChange(prev, next, 'en')).toBe('2 sources shown. Filters: only items to review.');
  });
  it('combines a filter change and a sort change', () => {
    const next = with_({ shown: 0, filters: f({ query: 'zzz' }), sort: { key: 'source', dir: 'asc' } });
    expect(describeChange(base, next, 'en')).toBe('No sources match. Filters: name contains “zzz”. Sorted by source, ascending.');
  });
  it('has no French typography problems in any of the change sentences', () => {
    const states = [
      with_({ shown: 3, filters: f({ query: 'parc', state: 'fresh' }) }),
      with_({ sort: { key: 'retrieved', dir: 'asc' } }),
      with_({ page: 2, pages: 2 }),
      with_({ shown: 0, filters: f({ onlyIssues: true }) }),
    ];
    for (const s of states) expect(lintFrench(describeChange(base, s, 'fr')), JSON.stringify(s)).toEqual([]);
  });
});

describe('createAnnouncer', () => {
  it('writes the text into the region', () => {
    const region = { textContent: '' as string | null };
    const a = createAnnouncer(region);
    expect(a.say('Hello')).toBe('Hello');
    expect(region.textContent).toBe('Hello');
  });
  it('alternates a trailing no-break space when the same text is said again', () => {
    const region = { textContent: '' as string | null };
    const a = createAnnouncer(region);
    const seen = [a.say('x'), a.say('x'), a.say('x'), a.say('x')];
    expect(seen).toEqual(['x', `x${REPEAT_MARK}`, 'x', `x${REPEAT_MARK}`]);
    expect(region.textContent).toBe(`x${REPEAT_MARK}`);
  });
  it('starts over when the text changes', () => {
    const region = { textContent: '' as string | null };
    const a = createAnnouncer(region);
    a.say('x');
    a.say('x');
    expect(a.say('y')).toBe('y');
    expect(a.say('x')).toBe('x');
    expect(a.say('x')).toBe(`x${REPEAT_MARK}`);
  });
  it('clears the region and forgets the last text', () => {
    const region = { textContent: '' as string | null };
    const a = createAnnouncer(region);
    a.say('x');
    a.clear();
    expect(region.textContent).toBe('');
    expect(a.say('x')).toBe('x');
  });
  it('always writes text that differs from what is on screen', () => {
    const region = { textContent: '' as string | null };
    const a = createAnnouncer(region);
    let previous: string | null = null;
    for (const text of ['a', 'a', 'a', 'b', 'b', 'a', 'a']) {
      a.say(text);
      expect(region.textContent).not.toBe(previous);
      previous = region.textContent;
    }
  });
});
