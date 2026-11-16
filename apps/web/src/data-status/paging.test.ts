import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, FIRST_PAGE, MAX_PAGE, PAGE_SIZES, buildQuery, pagingParams, paginate, parsePaging, parseTableView, NO_FILTERS, EMPTY_VIEW } from './index';

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('parsePaging', () => {
  it('reads page and an allowed size', () => {
    expect(parsePaging('?page=3&size=50')).toEqual({ page: 3, size: 50 });
    expect(parsePaging('')).toEqual(FIRST_PAGE);
  });
  it('ignores bad values', () => {
    for (const q of ['?page=0', '?page=-1', '?page=abc', '?page=1.5', '?page=100000', `?page=${MAX_PAGE + 1}`, '?page=%20']) expect(parsePaging(q).page, q).toBe(1);
    for (const q of ['?size=7', '?size=1000', '?size=abc', '?size=0', '?size=-25']) expect(parsePaging(q).size, q).toBe(DEFAULT_PAGE_SIZE);
  });
  it('accepts every allowed size', () => {
    for (const n of PAGE_SIZES) expect(parsePaging(`?size=${n}`).size).toBe(n);
  });
});

describe('pagingParams', () => {
  it('omits defaults', () => {
    expect(pagingParams({ page: 1, size: DEFAULT_PAGE_SIZE })).toEqual([]);
    expect(pagingParams({ page: 2, size: 10 })).toEqual([['size', '10'], ['page', '2']]);
    expect(pagingParams({ page: 2, size: 10 }, false)).toEqual([['size', '10']]);
  });
});

describe('paginate', () => {
  it('slices and reports position', () => {
    const p = paginate(nums(60), { page: 2, size: 25 });
    expect(p).toMatchObject({ page: 2, pages: 3, total: 60, from: 26, to: 50 });
    expect(p.items).toEqual(nums(60).slice(25, 50));
  });
  it('the last page may be short', () => {
    expect(paginate(nums(60), { page: 3, size: 25 })).toMatchObject({ from: 51, to: 60, items: nums(60).slice(50) });
  });
  it('moves an out-of-range page to the last page instead of showing nothing', () => {
    expect(paginate(nums(30), { page: 99, size: 10 })).toMatchObject({ page: 3, from: 21, to: 30 });
  });
  it('empty list is one empty page', () => {
    expect(paginate([], { page: 5, size: 25 })).toEqual({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
  it('an unsupported size falls back to the default', () => {
    expect(paginate(nums(100), { page: 1, size: 7 }).items).toHaveLength(DEFAULT_PAGE_SIZE);
  });
  it('exactly one full page is one page', () => {
    expect(paginate(nums(25), { page: 1, size: 25 }).pages).toBe(1);
    expect(paginate(nums(26), { page: 1, size: 25 }).pages).toBe(2);
  });
});

describe('table view and query building', () => {
  it('parses sort and paging together', () => {
    expect(parseTableView('?sort=retrieved&dir=desc&page=2&size=10')).toEqual({ sort: { key: 'retrieved', dir: 'desc' }, paging: { page: 2, size: 10 } });
    expect(parseTableView('')).toEqual({ sort: null, paging: FIRST_PAGE });
  });
  it('builds one query with filters, thresholds, sort and page; defaults give ""', () => {
    expect(buildQuery(EMPTY_VIEW, parseTableView(''))).toBe('');
    const view = { filters: { ...NO_FILTERS, state: 'stale' as const }, thresholds: { places: 90 } };
    const table = parseTableView('?sort=status&page=3&size=10');
    expect(buildQuery(view, table)).toBe('?state=stale&stale_places=90&sort=status&size=10&page=3');
    expect(buildQuery(view, table, { withPage: false })).toBe('?state=stale&stale_places=90&sort=status&size=10');
  });
  it('a query built from a view parses back to the same view', () => {
    const table = parseTableView('?sort=licence&dir=desc&page=4&size=100');
    const back = parseTableView(buildQuery(EMPTY_VIEW, table));
    expect(back).toEqual(table);
  });
});
