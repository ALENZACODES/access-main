/**
 * The listed sources as a table to paste elsewhere: a Markdown table for an issue or a wiki
 * page, and plain text with one block per source for a message. Both follow the filters, the
 * order and the extra columns of the list. A fact that is not known is written UNKNOWN.
 */
import { listActiveFilters } from './activeFilters';
import { columnHeading, columnText, normaliseColumns, type ColumnId } from './columns';
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { applyFilters, type Filters } from './filters';
import { t } from './i18n';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { markdownLine } from './reviewChecklist';
import { applySort, type SortSpec } from './sorting';
import { UNKNOWN_WORD } from './unknownWord';

export interface ListedTable {
  headings: string[];
  rows: string[][];
  /** Every source in the registry, listed or not. */
  total: number;
}

export interface ListedTableOptions {
  sort?: SortSpec | null;
  columns?: readonly ColumnId[];
}

function orUnknown(v: string | null): string {
  return v === null || v.trim() === '' ? UNKNOWN_WORD : v.trim();
}

function baseCells(s: AuditedSource, locale: Locale): string[] {
  return [
    s.datasetName.trim() === '' ? s.datasetId : s.datasetName,
    orUnknown(s.name),
    orUnknown(s.licence),
    // A date in the future stays on the record but is not a usable retrieved date.
    s.retrievedIso === null || s.state === 'unknown' ? UNKNOWN_WORD : s.retrievedIso,
    t(locale, `state.${s.state}`),
    s.tier ?? UNKNOWN_WORD,
  ];
}

type Key =
  | 'lt.dataset'
  | 'lt.source'
  | 'lt.licence'
  | 'lt.retrieved'
  | 'lt.status'
  | 'lt.tier'
  | 'lt.title'
  | 'lt.made'
  | 'lt.count.one'
  | 'lt.count.other'
  | 'lt.filters'
  | 'lt.noFilters'
  | 'lt.join'
  | 'lt.empty'
  | 'lt.unknownNote'
  | 'lt.pair'
  | 'lt.labelMd'
  | 'lt.labelTxt'
  | 'lt.said.one'
  | 'lt.said.other'
  | 'lt.saidNone';

const MESSAGES: Messages<Key> = {
  en: {
    'lt.dataset': 'Dataset',
    'lt.source': 'Source',
    'lt.licence': 'Licence',
    'lt.retrieved': 'Retrieved (YYYY-MM-DD)',
    'lt.status': 'Status',
    'lt.tier': 'Tier',
    'lt.title': 'Listed sources',
    'lt.made': 'Made on {date} from the records saved on this device.',
    'lt.count.one': '{n} source listed, of {total} in all.',
    'lt.count.other': '{n} sources listed, of {total} in all.',
    'lt.filters': 'Filters: {list}.',
    'lt.noFilters': 'No filter is set.',
    'lt.join': '; ',
    'lt.empty': 'No source is listed.',
    'lt.unknownNote': 'UNKNOWN means the fact is not recorded. It is never filled in by estimate.',
    'lt.pair': '{label}: {value}',
    'lt.labelMd': 'Download the listed sources as a table (Markdown)',
    'lt.labelTxt': 'Download the listed sources (text)',
    'lt.said.one': 'File saved with {n} source.',
    'lt.said.other': 'File saved with {n} sources.',
    'lt.saidNone': 'File saved. No source is listed, so it holds none.',
  },
  fr: {
    'lt.dataset': 'Jeu de données',
    'lt.source': 'Source',
    'lt.licence': 'Licence',
    'lt.retrieved': 'Récupération (AAAA-MM-JJ)',
    'lt.status': 'État',
    'lt.tier': 'Niveau',
    'lt.title': 'Sources de la liste',
    'lt.made': 'Produit le {date} à partir des enregistrements conservés sur cet appareil.',
    'lt.count.one': '{n} source dans la liste, sur {total} au total.',
    'lt.count.other': '{n} sources dans la liste, sur {total} au total.',
    'lt.filters': 'Filtres\u00A0: {list}.',
    'lt.noFilters': 'Aucun filtre n’est en place.',
    'lt.join': '\u202F; ',
    'lt.empty': 'Aucune source n’est dans la liste.',
    'lt.unknownNote': 'UNKNOWN signifie que l’élément n’est pas consigné. Il n’est jamais rempli par estimation.',
    'lt.pair': '{label}\u00A0: {value}',
    'lt.labelMd': 'Télécharger les sources de la liste sous forme de tableau (Markdown)',
    'lt.labelTxt': 'Télécharger les sources de la liste (texte)',
    'lt.said.one': 'Fichier enregistré avec {n} source.',
    'lt.said.other': 'Fichier enregistré avec {n} sources.',
    'lt.saidNone': 'Fichier enregistré. Aucune source n’est dans la liste, il n’en contient donc aucune.',
  },
};

export const LISTED_TABLE_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const BASE_HEADINGS: readonly Key[] = ['lt.dataset', 'lt.source', 'lt.licence', 'lt.retrieved', 'lt.status', 'lt.tier'];

/** The six fixed columns, then the extra ones in their fixed order. One row per listed source, in the order of the list. */
export function buildListedTable(audit: AuditResult, filters: Filters, locale: Locale, opts: ListedTableOptions = {}): ListedTable {
  const columns = normaliseColumns(opts.columns ?? []);
  const listed = applySort(applyFilters(audit.sources, filters), opts.sort ?? null, locale);
  return {
    headings: [...BASE_HEADINGS.map((k) => tx(locale, k)), ...columns.map((id) => columnHeading(id, locale))],
    rows: listed.map((s) => [...baseCells(s, locale), ...columns.map((id) => columnText(id, s, locale))]),
    total: audit.sources.length,
  };
}

export interface ListedTextOptions {
  datasetNames?: ReadonlyMap<string, string>;
}

function headerLines(table: ListedTable, filters: Filters, now: Date, locale: Locale, opts: ListedTextOptions): string[] {
  const active = listActiveFilters(filters, locale, opts.datasetNames).map((a) => a.label);
  return [
    tx(locale, 'lt.made', { date: formatDisplayDate(now.toISOString().slice(0, 10), locale) }),
    tx.count(locale, 'lt.count', table.rows.length, { total: table.total }),
    active.length === 0 ? tx(locale, 'lt.noFilters') : tx(locale, 'lt.filters', { list: active.join(tx(locale, 'lt.join')) }),
    tx(locale, 'lt.unknownNote'),
  ];
}

/** A cell for a Markdown table: one line, with the characters Markdown would act on escaped. */
export function markdownCell(text: string): string {
  const cell = markdownLine(text);
  return cell === '' ? UNKNOWN_WORD : cell;
}

/** A heading, a few lines about the list, then a pipe table. Ends with a new line. */
export function listedTableToMarkdown(table: ListedTable, filters: Filters, now: Date, locale: Locale, opts: ListedTextOptions = {}): string {
  const lines = [`# ${markdownLine(tx(locale, 'lt.title'))}`, '', ...headerLines(table, filters, now, locale, opts).flatMap((l) => [markdownLine(l), '']).slice(0, -1), ''];
  if (table.rows.length === 0) lines.push(markdownLine(tx(locale, 'lt.empty')));
  else {
    lines.push(`| ${table.headings.map(markdownCell).join(' | ')} |`, `| ${table.headings.map(() => '---').join(' | ')} |`);
    for (const row of table.rows) lines.push(`| ${row.map(markdownCell).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** One line of plain text: control characters and line breaks become spaces. */
export function textLine(text: string): string {
  return text
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** A title, a few lines about the list, then one block per source with a line for each column. Ends with a new line. */
export function listedTableToText(table: ListedTable, filters: Filters, now: Date, locale: Locale, opts: ListedTextOptions = {}): string {
  const lines = [textLine(tx(locale, 'lt.title')), '', ...headerLines(table, filters, now, locale, opts).map(textLine)];
  if (table.rows.length === 0) lines.push('', textLine(tx(locale, 'lt.empty')));
  for (const row of table.rows) {
    lines.push('');
    row.forEach((value, i) => lines.push(textLine(tx(locale, 'lt.pair', { label: table.headings[i] ?? '', value: value === '' ? UNKNOWN_WORD : value }))));
  }
  return `${lines.join('\n')}\n`;
}

export const LISTED_TABLE_FORMATS = ['md', 'txt'] as const;
export type ListedTableFormat = (typeof LISTED_TABLE_FORMATS)[number];

export const LISTED_TABLE_ACTION_PREFIX = 'export-listed-';

export function listedTableAction(format: ListedTableFormat): string {
  return `${LISTED_TABLE_ACTION_PREFIX}${format}`;
}

export function listedTableFormatFromAction(action: string | null | undefined): ListedTableFormat | null {
  if (typeof action !== 'string' || !action.startsWith(LISTED_TABLE_ACTION_PREFIX)) return null;
  const rest = action.slice(LISTED_TABLE_ACTION_PREFIX.length);
  return (LISTED_TABLE_FORMATS as readonly string[]).includes(rest) ? (rest as ListedTableFormat) : null;
}

export interface ListedTableFile {
  filename: string;
  mime: string;
  text: string;
}

export function buildListedTableFile(table: ListedTable, format: ListedTableFormat, filters: Filters, now: Date, locale: Locale, opts: ListedTextOptions = {}): ListedTableFile {
  if (format === 'md') return { filename: 'listed-sources.md', mime: 'text/markdown;charset=utf-8', text: listedTableToMarkdown(table, filters, now, locale, opts) };
  return { filename: 'listed-sources.txt', mime: 'text/plain;charset=utf-8', text: listedTableToText(table, filters, now, locale, opts) };
}

export function listedTableLabel(format: ListedTableFormat, locale: Locale): string {
  return tx(locale, format === 'md' ? 'lt.labelMd' : 'lt.labelTxt');
}

export function describeListedTableSaved(table: ListedTable, locale: Locale): string {
  return table.rows.length === 0 ? tx(locale, 'lt.saidNone') : tx.count(locale, 'lt.said', table.rows.length);
}
