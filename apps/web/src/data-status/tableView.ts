/** How the sources table is arranged (sort + page), and links that keep every other setting. */
import { parsePaging, pagingParams, type Paging } from './paging';
import { parseSort, sortParams, type SortSpec } from './sorting';
import { serializeViewState, type ViewState } from './thresholds';

export interface TableView {
  sort: SortSpec | null;
  paging: Paging;
}

export function parseTableView(search: string): TableView {
  return { sort: parseSort(search), paging: parsePaging(search) };
}

/** Query string for the filters, thresholds and table arrangement together ('' when all are defaults). */
export function buildQuery(view: ViewState, table: TableView, opts: { withPage?: boolean } = {}): string {
  const base = serializeViewState(view);
  const p = new URLSearchParams(base.startsWith('?') ? base.slice(1) : base);
  for (const [k, v] of [...sortParams(table.sort), ...pagingParams(table.paging, opts.withPage ?? true)]) p.set(k, v);
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}
