/** Paging for long lists. Page and size come from the query string; bad values are ignored. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE = 10_000;

export interface Paging {
  page: number;
  size: number;
}

export const FIRST_PAGE: Readonly<Paging> = { page: 1, size: DEFAULT_PAGE_SIZE };

export function parsePaging(search: string): Paging {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawPage = p.get('page');
  const rawSize = p.get('size');
  const page = rawPage !== null && /^\d{1,5}$/.test(rawPage) ? Number(rawPage) : 1;
  const size = rawSize !== null && /^\d{1,3}$/.test(rawSize) && (PAGE_SIZES as readonly number[]).includes(Number(rawSize)) ? Number(rawSize) : DEFAULT_PAGE_SIZE;
  return { page: page >= 1 && page <= MAX_PAGE ? page : 1, size };
}

/** Defaults are left out so the plain page keeps a plain address. */
export function pagingParams(paging: Paging, withPage = true): [string, string][] {
  const out: [string, string][] = [];
  if (paging.size !== DEFAULT_PAGE_SIZE) out.push(['size', String(paging.size)]);
  if (withPage && paging.page > 1) out.push(['page', String(paging.page)]);
  return out;
}

export interface PageSlice<T> {
  items: T[];
  /** The page actually shown (an out-of-range request is moved to the last page). */
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last shown row; 0 when there are none. */
  from: number;
  to: number;
}

export function paginate<T>(items: readonly T[], paging: Paging): PageSlice<T> {
  const size = (PAGE_SIZES as readonly number[]).includes(paging.size) ? paging.size : DEFAULT_PAGE_SIZE;
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.trunc(paging.page) || 1), pages);
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page, pages, total, from: slice.length === 0 ? 0 : start + 1, to: start + slice.length };
}
