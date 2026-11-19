/** How the sources table is arranged (sort, page, grouping, row details), and links that keep every other setting. */
import { isGroupKey, parseGroup, type GroupKey } from './groupedList';
import { parsePaging, pagingParams, type Paging } from './paging';
import { parseSort, sortParams, type SortSpec } from './sorting';
import { serializeViewState, type ViewState } from './thresholds';

export interface TableView {
  sort: SortSpec | null;
  paging: Paging;
  /** Present only when the rows are grouped, so an ungrouped view compares equal to older ones. */
  group?: GroupKey;
  /** Present (true) only when the facts behind each row are shown. */
  details?: true;
}

/** `?details=1` turns row details on; anything else leaves them off. */
export function parseDetails(search: string): boolean {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return p.get('details') === '1';
}

export function parseTableView(search: string): TableView {
  const group = parseGroup(search);
  return {
    sort: parseSort(search),
    paging: parsePaging(search),
    ...(group === 'none' ? {} : { group }),
    ...(parseDetails(search) ? { details: true as const } : {}),
  };
}

/** The layout part of a table view as query pairs: nothing for one plain table. */
export function layoutParams(table: Pick<TableView, 'group' | 'details'>): [string, string][] {
  const out: [string, string][] = [];
  if (table.group !== undefined && table.group !== 'none' && isGroupKey(table.group)) out.push(['group', table.group]);
  if (table.details === true) out.push(['details', '1']);
  return out;
}

/** Query string for the filters, thresholds and table arrangement together ('' when all are defaults). */
export function buildQuery(view: ViewState, table: TableView, opts: { withPage?: boolean } = {}): string {
  const base = serializeViewState(view);
  const p = new URLSearchParams(base.startsWith('?') ? base.slice(1) : base);
  for (const [k, v] of [...sortParams(table.sort), ...pagingParams(table.paging, opts.withPage ?? true), ...layoutParams(table)]) p.set(k, v);
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}
