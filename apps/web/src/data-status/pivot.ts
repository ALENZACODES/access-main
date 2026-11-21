/**
 * Count the listed sources two ways at once: one fact down the side, another across the top
 * (for example tier by status). Every listed source is counted in exactly one cell, so the row
 * totals, the column totals and the grand total all agree with the list. A cell with sources in
 * it can be chosen to narrow the list to exactly those sources.
 */
import { ageValueLabel } from './ageBands';
import { toCsv } from './csv';
import type { AuditedSource } from './datasetRegistry';
import { licenceKind, type FreshnessState, type LicenceKind, type Locale } from './dataStatus';
import { ageFilterOf, FILTER_AGES, FILTER_KINDS, FILTER_LICENCE_KINDS, FILTER_STATES, FILTER_TIERS, isAgeFilter, isDatasetFilter, isLicenceKind, isTierFilter, withOptionalFilter, type Filters, type TierFilter } from './filters';
import type { DatasetKind } from './freshnessPolicy';
import { t } from './i18n';
import { kindLabel } from './licenceBreakdown';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { tierLabel } from './tiers';
import { UNKNOWN_WORD } from './unknownWord';

export const PIVOT_DIMS = ['state', 'kind', 'tier', 'licence', 'age', 'dataset'] as const;
export type PivotDim = (typeof PIVOT_DIMS)[number];

export function isPivotDim(v: unknown): v is PivotDim {
  return typeof v === 'string' && (PIVOT_DIMS as readonly string[]).includes(v);
}

export interface PivotSpec {
  rows: PivotDim;
  /** Null for a table with one count per row. */
  cols: PivotDim | null;
}

/** `?pv=tier&pvby=state`. No valid `pv` means no table. A `pvby` equal to `pv`, or not a fact, is dropped. */
export function parsePivot(search: string): PivotSpec | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rows = p.get('pv');
  if (!isPivotDim(rows)) return null;
  const cols = p.get('pvby');
  return { rows, cols: isPivotDim(cols) && cols !== rows ? cols : null };
}

export function pivotParams(spec: PivotSpec | null | undefined): [string, string][] {
  if (!spec) return [];
  return spec.cols === null || spec.cols === spec.rows ? [['pv', spec.rows]] : [['pv', spec.rows], ['pvby', spec.cols]];
}

/** The value a source is counted under for one fact. Every source has exactly one. */
export function pivotValueOf(s: AuditedSource, dim: PivotDim): string {
  if (dim === 'state') return s.state;
  if (dim === 'kind') return s.kind;
  if (dim === 'tier') return s.tier ?? 'unknown';
  if (dim === 'licence') return licenceKind(s.licence);
  if (dim === 'age') return ageFilterOf(s);
  return s.datasetId;
}

const FIXED: Readonly<Record<Exclude<PivotDim, 'dataset'>, readonly string[]>> = { state: FILTER_STATES, kind: FILTER_KINDS, tier: FILTER_TIERS, licence: FILTER_LICENCE_KINDS, age: FILTER_AGES };

/** The values in use among these sources, in the fixed order of the fact; datasets in the order they first appear. */
export function pivotValues(sources: readonly AuditedSource[], dim: PivotDim): string[] {
  const used = new Set(sources.map((s) => pivotValueOf(s, dim)));
  if (dim === 'dataset') return [...used];
  return FIXED[dim].filter((v) => used.has(v));
}

export interface PivotRow {
  value: string;
  /** One count per column, in column order. Empty when the table has no columns. */
  cells: number[];
  total: number;
}

export interface Pivot {
  spec: PivotSpec;
  cols: { value: string; total: number }[];
  rows: PivotRow[];
  total: number;
}

export function buildPivot(listed: readonly AuditedSource[], spec: PivotSpec): Pivot {
  const colDim = spec.cols !== null && spec.cols !== spec.rows ? spec.cols : null;
  const rowValues = pivotValues(listed, spec.rows);
  const colValues = colDim === null ? [] : pivotValues(listed, colDim);
  const rowIndex = new Map(rowValues.map((v, i) => [v, i]));
  const colIndex = new Map(colValues.map((v, i) => [v, i]));
  const rows: PivotRow[] = rowValues.map((value) => ({ value, cells: colValues.map(() => 0), total: 0 }));
  const cols = colValues.map((value) => ({ value, total: 0 }));
  for (const s of listed) {
    const row = rows[rowIndex.get(pivotValueOf(s, spec.rows)) ?? -1];
    if (row === undefined) continue;
    row.total += 1;
    if (colDim === null) continue;
    const c = colIndex.get(pivotValueOf(s, colDim));
    const col = c === undefined ? undefined : cols[c];
    if (c === undefined || col === undefined) continue;
    row.cells[c] = (row.cells[c] ?? 0) + 1;
    col.total += 1;
  }
  return { spec: { rows: spec.rows, cols: colDim }, cols, rows, total: listed.length };
}

/** The filters with one fact set to one value. Null when the value is not one this fact can take. */
export function withPivotValue(f: Filters, dim: PivotDim, value: string): Filters | null {
  if (dim === 'state') return (FILTER_STATES as readonly string[]).includes(value) ? { ...f, state: value as FreshnessState } : null;
  if (dim === 'kind') return (FILTER_KINDS as readonly string[]).includes(value) ? { ...f, kind: value as DatasetKind } : null;
  if (dim === 'tier') return isTierFilter(value) ? withOptionalFilter(f, 'tier', value as TierFilter) : null;
  if (dim === 'licence') return isLicenceKind(value) ? withOptionalFilter(f, 'licence', value as LicenceKind) : null;
  if (dim === 'age') return isAgeFilter(value) ? withOptionalFilter(f, 'age', value) : null;
  return isDatasetFilter(value) ? withOptionalFilter(f, 'dataset', value) : null;
}

export interface PivotCell {
  rows: PivotDim;
  row: string;
  cols: PivotDim | null;
  col: string | null;
}

/** The filters that list exactly the sources counted in one cell (or one row, with no column). */
export function pivotCellFilters(f: Filters, cell: PivotCell): Filters | null {
  const withRow = withPivotValue(f, cell.rows, cell.row);
  if (withRow === null || cell.cols === null || cell.col === null) return withRow;
  return cell.cols === cell.rows ? null : withPivotValue(withRow, cell.cols, cell.col);
}

export const PIVOT_ACTION_PREFIX = 'pivot:';

/** Values are percent-encoded, so a dataset id may hold any character. */
export function pivotAction(cell: PivotCell): string {
  const row = `${cell.rows}=${encodeURIComponent(cell.row)}`;
  return cell.cols === null || cell.col === null ? `${PIVOT_ACTION_PREFIX}${row}` : `${PIVOT_ACTION_PREFIX}${row}&${cell.cols}=${encodeURIComponent(cell.col)}`;
}

function readPair(part: string): { dim: PivotDim; value: string } | null {
  const cut = part.indexOf('=');
  if (cut < 1) return null;
  const dim = part.slice(0, cut);
  if (!isPivotDim(dim)) return null;
  try {
    const value = decodeURIComponent(part.slice(cut + 1));
    return value === '' ? null : { dim, value };
  } catch {
    return null;
  }
}

/** Reads an action back; null for anything that is not a cell of a table this panel can draw. */
export function parsePivotAction(action: string | null | undefined): PivotCell | null {
  if (typeof action !== 'string' || !action.startsWith(PIVOT_ACTION_PREFIX)) return null;
  const parts = action.slice(PIVOT_ACTION_PREFIX.length).split('&');
  if (parts.length < 1 || parts.length > 2) return null;
  const row = readPair(parts[0] ?? '');
  if (row === null) return null;
  if (parts.length === 1) return { rows: row.dim, row: row.value, cols: null, col: null };
  const col = readPair(parts[1] ?? '');
  if (col === null || col.dim === row.dim) return null;
  return { rows: row.dim, row: row.value, cols: col.dim, col: col.value };
}

type Key =
  | 'pv.title'
  | 'pv.intro'
  | 'pv.rows'
  | 'pv.cols'
  | 'pv.off'
  | 'pv.noCols'
  | 'pv.dim.state'
  | 'pv.dim.kind'
  | 'pv.dim.tier'
  | 'pv.dim.licence'
  | 'pv.dim.age'
  | 'pv.dim.dataset'
  | 'pv.caption2'
  | 'pv.caption1'
  | 'pv.total'
  | 'pv.count'
  | 'pv.cell.one'
  | 'pv.cell.other'
  | 'pv.rowCell.one'
  | 'pv.rowCell.other'
  | 'pv.empty'
  | 'pv.said2'
  | 'pv.said1'
  | 'pv.saidOff'
  | 'pv.picked.one'
  | 'pv.picked.other'
  | 'pv.export';

const MESSAGES: Messages<Key> = {
  en: {
    'pv.title': 'The list counted two ways',
    'pv.intro': 'Each listed source is counted in exactly one cell. A number that is a button narrows the list to those sources.',
    'pv.rows': 'Count the list by',
    'pv.cols': 'And across by',
    'pv.off': 'No count table',
    'pv.noCols': 'Nothing (one count per row)',
    'pv.dim.state': 'Status',
    'pv.dim.kind': 'Kind of data',
    'pv.dim.tier': 'Tier',
    'pv.dim.licence': 'Licence type',
    'pv.dim.age': 'Age of retrieved date',
    'pv.dim.dataset': 'Dataset',
    'pv.caption2': 'Listed sources by {rows} and {cols}',
    'pv.caption1': 'Listed sources by {rows}',
    'pv.total': 'All',
    'pv.count': 'Sources',
    'pv.cell.one': '{n} source. {row}, {col}. List it',
    'pv.cell.other': '{n} sources. {row}, {col}. List them',
    'pv.rowCell.one': '{n} source. {row}. List it',
    'pv.rowCell.other': '{n} sources. {row}. List them',
    'pv.empty': 'No source is listed, so there is nothing to count.',
    'pv.said2': 'Count table by {rows} and {cols}.',
    'pv.said1': 'Count table by {rows}.',
    'pv.saidOff': 'Count table removed.',
    'pv.picked.one': 'List narrowed to {n} source. {what}.',
    'pv.picked.other': 'List narrowed to {n} sources. {what}.',
    'pv.export': 'Download the count table (CSV)',
  },
  fr: {
    'pv.title': 'La liste comptée de deux façons',
    'pv.intro': 'Chaque source de la liste est comptée dans une seule case. Un nombre qui est un bouton restreint la liste à ces sources.',
    'pv.rows': 'Compter la liste par',
    'pv.cols': 'Et en colonnes par',
    'pv.off': 'Aucun tableau de comptage',
    'pv.noCols': 'Rien (un seul nombre par ligne)',
    'pv.dim.state': 'État',
    'pv.dim.kind': 'Type de données',
    'pv.dim.tier': 'Niveau',
    'pv.dim.licence': 'Type de licence',
    'pv.dim.age': 'Âge de la date de récupération',
    'pv.dim.dataset': 'Jeu de données',
    'pv.caption2': 'Sources de la liste par {rows} et {cols}',
    'pv.caption1': 'Sources de la liste par {rows}',
    'pv.total': 'Ensemble',
    'pv.count': 'Sources',
    'pv.cell.one': '{n} source. {row}, {col}. L’afficher dans la liste',
    'pv.cell.other': '{n} sources. {row}, {col}. Les afficher dans la liste',
    'pv.rowCell.one': '{n} source. {row}. L’afficher dans la liste',
    'pv.rowCell.other': '{n} sources. {row}. Les afficher dans la liste',
    'pv.empty': 'Aucune source n’est dans la liste, il n’y a donc rien à compter.',
    'pv.said2': 'Tableau de comptage par {rows} et {cols}.',
    'pv.said1': 'Tableau de comptage par {rows}.',
    'pv.saidOff': 'Tableau de comptage retiré.',
    'pv.picked.one': 'Liste restreinte à {n} source. {what}.',
    'pv.picked.other': 'Liste restreinte à {n} sources. {what}.',
    'pv.export': 'Télécharger le tableau de comptage (CSV)',
  },
};

export const PIVOT_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function pivotDimLabel(dim: PivotDim, locale: Locale): string {
  return tx(locale, `pv.dim.${dim}`);
}

/** A value in words. A tier, licence type or date that is not known is the token UNKNOWN. */
export function pivotValueLabel(dim: PivotDim, value: string, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  if (dim === 'state') return (FILTER_STATES as readonly string[]).includes(value) ? t(locale, `state.${value as FreshnessState}`) : value;
  if (dim === 'kind') return (FILTER_KINDS as readonly string[]).includes(value) ? t(locale, `kind.${value as DatasetKind}`) : value;
  if (dim === 'tier') return value === 'unknown' ? UNKNOWN_WORD : isTierFilter(value) ? tierLabel(value as Exclude<TierFilter, 'unknown'>, locale) : value;
  if (dim === 'licence') return isLicenceKind(value) ? kindLabel(value, locale) : value;
  if (dim === 'age') return ageValueLabel(value, locale) ?? value;
  const name = datasetNames?.get(value);
  return name === undefined || name.trim() === '' ? value : name;
}

export function pivotCaption(spec: PivotSpec, locale: Locale): string {
  const rows = pivotDimLabel(spec.rows, locale).toLowerCase();
  return spec.cols === null ? tx(locale, 'pv.caption1', { rows }) : tx(locale, 'pv.caption2', { rows, cols: pivotDimLabel(spec.cols, locale).toLowerCase() });
}

export function describePivot(spec: PivotSpec | null, locale: Locale): string {
  if (spec === null) return tx(locale, 'pv.saidOff');
  const rows = pivotDimLabel(spec.rows, locale).toLowerCase();
  return spec.cols === null ? tx(locale, 'pv.said1', { rows }) : tx(locale, 'pv.said2', { rows, cols: pivotDimLabel(spec.cols, locale).toLowerCase() });
}

/** What a chosen cell stands for, in words: "Tier E, May be out of date". */
export function pivotCellLabel(cell: PivotCell, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  const row = pivotValueLabel(cell.rows, cell.row, locale, datasetNames);
  return cell.cols === null || cell.col === null ? row : `${row}, ${pivotValueLabel(cell.cols, cell.col, locale, datasetNames)}`;
}

export function describePivotPicked(cell: PivotCell, listed: number, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  return tx.count(locale, 'pv.picked', listed, { what: pivotCellLabel(cell, locale, datasetNames) });
}

export function pivotExportLabel(locale: Locale): string {
  return tx(locale, 'pv.export');
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

function option(value: string, label: string, selected: boolean): string {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

/**
 * Two selects: the fact down the side (or no table), and the fact across the top (or none).
 * With `compact`, the second select is left out until a table is drawn: it would do nothing
 * before that, and it would be one more stop for the Tab key. A page without scripts needs both.
 */
export function renderPivotControl(spec: PivotSpec | null, locale: Locale, compact = false): string {
  const rows = option('none', tx(locale, 'pv.off'), spec === null) + PIVOT_DIMS.map((d) => option(d, pivotDimLabel(d, locale), spec?.rows === d)).join('');
  const cols = option('none', tx(locale, 'pv.noCols'), spec === null || spec.cols === null) + PIVOT_DIMS.map((d) => option(d, pivotDimLabel(d, locale), spec?.cols === d)).join('');
  return (
    `<div><label for="ds-pv-rows">${escapeHtml(tx(locale, 'pv.rows'))}</label> <select id="ds-pv-rows" name="pv" data-filter="pivotRows" style="${FIELD_STYLE}">${rows}</select></div>` +
    (compact && spec === null ? '' : `<div><label for="ds-pv-cols">${escapeHtml(tx(locale, 'pv.cols'))}</label> <select id="ds-pv-cols" name="pvby" data-filter="pivotCols" style="${FIELD_STYLE}">${cols}</select></div>`)
  );
}

export interface PivotRenderOptions {
  datasetNames?: ReadonlyMap<string, string>;
  /** Static pages: the link that lists the sources of one cell. Without it, buttons are rendered. */
  hrefFor?: (cell: PivotCell) => string | null;
  buttonStyle?: string;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px';
const DEFAULT_BUTTON_STYLE = 'min-width:44px;min-height:44px;font:inherit';

function cellControl(n: number, cell: PivotCell, total: number, locale: Locale, opts: PivotRenderOptions): string {
  // Nothing to list for an empty cell, and nothing to narrow when the cell is the whole list.
  if (n === 0 || n === total) return String(n);
  const row = pivotValueLabel(cell.rows, cell.row, locale, opts.datasetNames);
  const name =
    cell.cols === null || cell.col === null
      ? tx.count(locale, 'pv.rowCell', n, { row })
      : tx.count(locale, 'pv.cell', n, { row, col: pivotValueLabel(cell.cols, cell.col, locale, opts.datasetNames) });
  const href = opts.hrefFor?.(cell);
  if (opts.hrefFor) return href ? `<a href="${escapeHtml(href)}" aria-label="${escapeHtml(name)}" style="${LINK_STYLE}">${n}</a>` : String(n);
  return `<button type="button" data-action="${escapeHtml(pivotAction(cell))}" aria-label="${escapeHtml(name)}" style="${opts.buttonStyle ?? DEFAULT_BUTTON_STYLE}">${n}</button>`;
}

export function renderPivotHtml(p: Pivot, locale: Locale, opts: PivotRenderOptions = {}): string {
  const open = `<section aria-labelledby="ds-pivot-title" data-pivot="${p.spec.rows}${p.spec.cols === null ? '' : ` ${p.spec.cols}`}"><h3 id="ds-pivot-title">${escapeHtml(tx(locale, 'pv.title'))}</h3>`;
  if (p.total === 0) return `${open}<p>${escapeHtml(tx(locale, 'pv.empty'))}</p></section>`;
  const { rows: rowDim, cols: colDim } = p.spec;
  const all = escapeHtml(tx(locale, 'pv.total'));
  const corner = `<th scope="col">${escapeHtml(pivotDimLabel(rowDim, locale))}</th>`;
  const heads =
    colDim === null
      ? `${corner}<th scope="col">${escapeHtml(tx(locale, 'pv.count'))}</th>`
      : corner + p.cols.map((c) => `<th scope="col">${escapeHtml(pivotValueLabel(colDim, c.value, locale, opts.datasetNames))}</th>`).join('') + `<th scope="col">${all}</th>`;
  const body = p.rows
    .map((r) => {
      const head = `<th scope="row">${escapeHtml(pivotValueLabel(rowDim, r.value, locale, opts.datasetNames))}</th>`;
      const rowCell = cellControl(r.total, { rows: rowDim, row: r.value, cols: null, col: null }, p.total, locale, opts);
      if (colDim === null) return `<tr>${head}<td>${rowCell}</td></tr>`;
      const cells = r.cells.map((n, i) => `<td>${cellControl(n, { rows: rowDim, row: r.value, cols: colDim, col: p.cols[i]?.value ?? '' }, p.total, locale, opts)}</td>`).join('');
      return `<tr>${head}${cells}<td>${rowCell}</td></tr>`;
    })
    .join('');
  const foot = colDim === null ? `<tr><th scope="row">${all}</th><td>${p.total}</td></tr>` : `<tr><th scope="row">${all}</th>${p.cols.map((c) => `<td>${c.total}</td>`).join('')}<td>${p.total}</td></tr>`;
  return (
    `${open}<p>${escapeHtml(tx(locale, 'pv.intro'))}</p>` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${escapeHtml(pivotCaption(p.spec, locale))}"><table><caption>${escapeHtml(pivotCaption(p.spec, locale))}</caption>` +
    `<thead><tr>${heads}</tr></thead><tbody>${body}${foot}</tbody></table></div></section>`
  );
}

/** The table as rows of text: a heading row, one row per value, and the totals. */
export function pivotRows(p: Pivot, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string[][] {
  const { rows: rowDim, cols: colDim } = p.spec;
  const all = tx(locale, 'pv.total');
  if (colDim === null) {
    return [[pivotDimLabel(rowDim, locale), tx(locale, 'pv.count')], ...p.rows.map((r) => [pivotValueLabel(rowDim, r.value, locale, datasetNames), String(r.total)]), [all, String(p.total)]];
  }
  return [
    [pivotDimLabel(rowDim, locale), ...p.cols.map((c) => pivotValueLabel(colDim, c.value, locale, datasetNames)), all],
    ...p.rows.map((r) => [pivotValueLabel(rowDim, r.value, locale, datasetNames), ...r.cells.map(String), String(r.total)]),
    [all, ...p.cols.map((c) => String(c.total)), String(p.total)],
  ];
}

export const PIVOT_EXPORT_ACTION = 'export-pivot';
export const PIVOT_FILENAME = 'list-counts.csv';

export function pivotToCsv(p: Pivot, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  return toCsv(pivotRows(p, locale, datasetNames), true);
}
