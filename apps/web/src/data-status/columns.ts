/**
 * Extra columns for the source list. The list always shows the source, licence, retrieved date,
 * status and tier. A person can add more facts as columns: the kind of data, the licence type,
 * the age in days, the review date, how far away it is, and which facts are UNKNOWN. The choice
 * is part of the address, so it survives a reload and can be passed on.
 */
import type { AuditedSource } from './datasetRegistry';
import { licenceKind, type Locale } from './dataStatus';
import { daysUntilReview, GAP_FIELDS, hasGap } from './filters';
import { t } from './i18n';
import { kindLabel } from './licenceBreakdown';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { factLabel } from './recordFacts';
import { reviewDateIso } from './rowDetail';
import { escapeHtml } from './sourceList';
import { UNKNOWN_WORD } from './unknownWord';

export const COLUMN_IDS = ['kind', 'licenceType', 'age', 'review', 'due', 'gaps'] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];

export function isColumnId(v: unknown): v is ColumnId {
  return typeof v === 'string' && (COLUMN_IDS as readonly string[]).includes(v);
}

/** The chosen columns in the fixed order, each once. Anything that is not a column is dropped. */
export function normaliseColumns(ids: readonly unknown[]): ColumnId[] {
  const chosen = new Set(ids.filter(isColumnId));
  return COLUMN_IDS.filter((id) => chosen.has(id));
}

/** Reads `cols=kind,review` and `cols=kind&cols=review` alike. */
export function parseColumns(search: string): ColumnId[] {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return normaliseColumns(p.getAll('cols').flatMap((v) => v.split(',')));
}

/** Query pairs for the chosen columns: nothing when none is chosen. */
export function columnParams(columns: readonly ColumnId[] | undefined): [string, string][] {
  const list = normaliseColumns(columns ?? []);
  return list.length === 0 ? [] : [['cols', list.join(',')]];
}

/** The chosen columns with one added or taken out. The input is not changed. */
export function toggleColumn(columns: readonly ColumnId[], id: ColumnId, on: boolean): ColumnId[] {
  return normaliseColumns(on ? [...columns, id] : columns.filter((c) => c !== id));
}

type Key =
  | 'co.legend'
  | 'co.help'
  | 'co.box'
  | 'co.kind'
  | 'co.licenceType'
  | 'co.age'
  | 'co.review'
  | 'co.due'
  | 'co.gaps'
  | 'co.days.one'
  | 'co.days.other'
  | 'co.in.one'
  | 'co.in.other'
  | 'co.ago.one'
  | 'co.ago.other'
  | 'co.today'
  | 'co.noGaps'
  | 'co.join'
  | 'co.said.one'
  | 'co.said.other'
  | 'co.saidNone';

const MESSAGES: Messages<Key> = {
  en: {
    'co.legend': 'More columns',
    'co.help': 'Each one adds a column to the source list and to the Markdown and text files of the listed sources.',
    'co.box': 'Column: {name}',
    'co.kind': 'Kind of data',
    'co.licenceType': 'Licence type',
    'co.age': 'Age of retrieved date',
    'co.review': 'Review date',
    'co.due': 'Time to review date',
    'co.gaps': 'Facts that are UNKNOWN',
    'co.days.one': '{n} day',
    'co.days.other': '{n} days',
    'co.in.one': 'In {n} day',
    'co.in.other': 'In {n} days',
    'co.ago.one': 'Passed {n} day ago',
    'co.ago.other': 'Passed {n} days ago',
    'co.today': 'Today',
    'co.noGaps': 'None',
    'co.join': ', ',
    'co.said.one': '{n} extra column shown. {list}.',
    'co.said.other': '{n} extra columns shown. {list}.',
    'co.saidNone': 'No extra column is shown.',
  },
  fr: {
    'co.legend': 'Colonnes supplémentaires',
    'co.help': 'Chacune ajoute une colonne à la liste des sources et aux fichiers Markdown et texte des sources de la liste.',
    'co.box': 'Colonne\u00A0: {name}',
    'co.kind': 'Type de données',
    'co.licenceType': 'Type de licence',
    'co.age': 'Âge de la date de récupération',
    'co.review': 'Date de révision',
    'co.due': 'Délai avant la date de révision',
    'co.gaps': 'Éléments UNKNOWN',
    'co.days.one': '{n} jour',
    'co.days.other': '{n} jours',
    'co.in.one': 'Dans {n} jour',
    'co.in.other': 'Dans {n} jours',
    'co.ago.one': 'Dépassée depuis {n} jour',
    'co.ago.other': 'Dépassée depuis {n} jours',
    'co.today': 'Aujourd’hui',
    'co.noGaps': 'Aucun',
    'co.join': ', ',
    'co.said.one': '{n} colonne supplémentaire affichée. {list}.',
    'co.said.other': '{n} colonnes supplémentaires affichées. {list}.',
    'co.saidNone': 'Aucune colonne supplémentaire n’est affichée.',
  },
};

export const COLUMN_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function columnHeading(id: ColumnId, locale: Locale): string {
  return tx(locale, `co.${id}`);
}

/** The text of one cell. A fact that is not known is the token UNKNOWN, in both languages. */
export function columnText(id: ColumnId, s: AuditedSource, locale: Locale): string {
  if (id === 'kind') return t(locale, `kind.${s.kind}`);
  if (id === 'licenceType') {
    const kind = licenceKind(s.licence);
    return kind === 'unknown' ? UNKNOWN_WORD : kindLabel(kind, locale);
  }
  if (id === 'age') return s.ageDays === null ? UNKNOWN_WORD : tx.count(locale, 'co.days', s.ageDays);
  if (id === 'review') {
    const iso = reviewDateIso(s);
    return iso === null ? UNKNOWN_WORD : formatDisplayDate(iso, locale);
  }
  if (id === 'due') {
    const days = daysUntilReview(s);
    if (days === null) return UNKNOWN_WORD;
    if (days === 0) return tx(locale, 'co.today');
    return days > 0 ? tx.count(locale, 'co.in', days) : tx.count(locale, 'co.ago', -days);
  }
  const gaps = GAP_FIELDS.filter((g) => hasGap(s, g)).map((g) => factLabel(g, locale));
  return gaps.length === 0 ? tx(locale, 'co.noGaps') : gaps.join(tx(locale, 'co.join'));
}

/** The cell as markup. The review date is a time element, so it can be read by a machine too. */
export function columnCellHtml(id: ColumnId, s: AuditedSource, locale: Locale): string {
  const text = escapeHtml(columnText(id, s, locale));
  if (id === 'review') {
    const iso = reviewDateIso(s);
    if (iso !== null) return `<td><time datetime="${escapeHtml(iso)}">${text}</time></td>`;
  }
  return `<td>${text}</td>`;
}

export function columnHeadsHtml(columns: readonly ColumnId[], locale: Locale): string {
  return columns.map((id) => `<th scope="col" data-col="${id}">${escapeHtml(columnHeading(id, locale))}</th>`).join('');
}

export function columnCellsHtml(columns: readonly ColumnId[], s: AuditedSource, locale: Locale): string {
  return columns.map((id) => columnCellHtml(id, s, locale)).join('');
}

export function describeColumns(columns: readonly ColumnId[], locale: Locale): string {
  if (columns.length === 0) return tx(locale, 'co.saidNone');
  return tx.count(locale, 'co.said', columns.length, { list: columns.map((id) => columnHeading(id, locale)).join(tx(locale, 'co.join')) });
}

/**
 * One checkbox per column, in a group with its own name. On the live panel a change is handled
 * at once; inside the static form the boxes are sent with it as `cols`.
 */
export function renderColumnChooser(columns: readonly ColumnId[], locale: Locale): string {
  const chosen = new Set(columns);
  const boxes = COLUMN_IDS.map(
    (id) =>
      `<label style="display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-right:16px">` +
      `<input type="checkbox" id="ds-col-${id}" name="cols" value="${id}" data-filter="col" style="width:24px;height:24px"${chosen.has(id) ? ' checked' : ''}>` +
      // The name says it is a column, so it is not taken for the filter of the same name.
      `${escapeHtml(tx(locale, 'co.box', { name: columnHeading(id, locale) }))}</label>`,
  ).join('');
  return `<fieldset data-columns="${columns.length}"><legend>${escapeHtml(tx(locale, 'co.legend'))}</legend><p>${escapeHtml(tx(locale, 'co.help'))}</p>${boxes}</fieldset>`;
}
