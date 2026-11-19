/**
 * A review checklist for the sources the filters list: one entry for each source that has
 * something to do, with a tick-box line for each step. It is written as Markdown for reading
 * and ticking off, and as CSV for a spreadsheet. A source with nothing to do is left out, and
 * the count of those left out is stated, so the list is never mistaken for the whole registry.
 */
import { listActiveFilters } from './activeFilters';
import { toCsv } from './csv';
import type { AuditedSource, AuditResult, FindingCode } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { applyFilters, daysUntilReview, DUE_WINDOW_DAYS, type Filters } from './filters';
import { t } from './i18n';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { escapeMarkdown } from './markdownReport';
import { remedyStep, remedyTitle } from './remedies';
import { findingCodesFor, reviewDateIso, reviewText } from './rowDetail';
import { applySort, type SortSpec } from './sorting';

/** A review date this close counts as something to do, even when nothing else is. */
export const CHECKLIST_SOON_DAYS = DUE_WINDOW_DAYS.d30;

export type ChecklistTaskKind = 'finding' | 'tier' | 'soon';

export interface ChecklistTask {
  kind: ChecklistTaskKind;
  /** Set for a finding. */
  code: FindingCode | null;
  title: string;
  step: string;
}

export interface ChecklistEntry {
  source: AuditedSource;
  tasks: ChecklistTask[];
}

export interface Checklist {
  entries: ChecklistEntry[];
  /** Sources the filters list. */
  listed: number;
  /** Listed sources with nothing to do. */
  clear: number;
  /** All the steps across all entries. */
  taskCount: number;
}

type Key =
  | 'cl.title'
  | 'cl.asOf'
  | 'cl.scope.one'
  | 'cl.scope.other'
  | 'cl.filters'
  | 'cl.noFilters'
  | 'cl.filters.join'
  | 'cl.clear.one'
  | 'cl.clear.other'
  | 'cl.empty'
  | 'cl.status'
  | 'cl.review'
  | 'cl.task'
  | 'cl.tier.title'
  | 'cl.tier.step'
  | 'cl.soon.title'
  | 'cl.soon.step'
  | 'cl.note'
  | 'cl.col.dataset'
  | 'cl.col.record'
  | 'cl.col.task'
  | 'cl.col.step'
  | 'cl.col.status'
  | 'cl.col.review'
  | 'cl.md'
  | 'cl.csv'
  | 'cl.said.one'
  | 'cl.said.other'
  | 'cl.saidNone';

const MESSAGES: Messages<Key> = {
  en: {
    'cl.title': 'Review checklist',
    'cl.asOf': 'As of {date}.',
    'cl.scope.one': '{n} source to review, out of {listed} listed.',
    'cl.scope.other': '{n} sources to review, out of {listed} listed.',
    'cl.filters': 'Filters: {list}.',
    'cl.noFilters': 'Filters: none. Every source is listed.',
    'cl.filters.join': '; ',
    'cl.clear.one': '{n} listed source has nothing to do and is left out.',
    'cl.clear.other': '{n} listed sources have nothing to do and are left out.',
    'cl.empty': 'None of the listed sources has anything to do.',
    'cl.status': 'Status: {value}',
    'cl.review': 'Review date: {value}',
    'cl.task': '{title}. {step}',
    'cl.tier.title': 'Tier not recorded',
    'cl.tier.step': 'Record the tier written by the publisher or by the person who collected the data. If it is not known, leave it Unknown.',
    'cl.soon.title': 'Review date within {days} days',
    'cl.soon.step': 'Fetch the data again from the source before the review date, and record the new retrieved date.',
    'cl.note': 'This checklist restates the audit. It does not change any record.',
    'cl.col.dataset': 'Dataset',
    'cl.col.record': 'Record',
    'cl.col.task': 'Task',
    'cl.col.step': 'Step',
    'cl.col.status': 'Status',
    'cl.col.review': 'Review date (YYYY-MM-DD)',
    'cl.md': 'Download a review checklist for the listed sources (Markdown)',
    'cl.csv': 'Download a review checklist for the listed sources (CSV)',
    'cl.said.one': 'Checklist saved with {n} step.',
    'cl.said.other': 'Checklist saved with {n} steps.',
    'cl.saidNone': 'Checklist saved. None of the listed sources has anything to do.',
  },
  fr: {
    'cl.title': 'Liste de contrôle de révision',
    'cl.asOf': 'En date du {date}.',
    'cl.scope.one': '{n} source à examiner, sur {listed} dans la liste.',
    'cl.scope.other': '{n} sources à examiner, sur {listed} dans la liste.',
    'cl.filters': 'Filtres\u00A0: {list}.',
    'cl.noFilters': 'Filtres\u00A0: aucun. Toutes les sources sont dans la liste.',
    'cl.filters.join': '\u202F; ',
    'cl.clear.one': '{n} source de la liste n’a rien à faire et n’est pas reprise.',
    'cl.clear.other': '{n} sources de la liste n’ont rien à faire et ne sont pas reprises.',
    'cl.empty': 'Aucune des sources de la liste n’a quoi que ce soit à faire.',
    'cl.status': 'État\u00A0: {value}',
    'cl.review': 'Date de révision\u00A0: {value}',
    'cl.task': '{title}. {step}',
    'cl.tier.title': 'Niveau non inscrit',
    'cl.tier.step': 'Inscrivez le niveau indiqué par le diffuseur ou par la personne qui a recueilli les données. S’il n’est pas connu, laissez-le inconnu.',
    'cl.soon.title': 'Date de révision d’ici {days} jours',
    'cl.soon.step': 'Récupérez de nouveau les données auprès de la source avant la date de révision, puis inscrivez la nouvelle date de récupération.',
    'cl.note': 'Cette liste de contrôle reprend l’audit. Elle ne modifie aucun enregistrement.',
    'cl.col.dataset': 'Jeu de données',
    'cl.col.record': 'Enregistrement',
    'cl.col.task': 'Tâche',
    'cl.col.step': 'Étape',
    'cl.col.status': 'État',
    'cl.col.review': 'Date de révision (AAAA-MM-JJ)',
    'cl.md': 'Télécharger une liste de contrôle de révision pour les sources de la liste (Markdown)',
    'cl.csv': 'Télécharger une liste de contrôle de révision pour les sources de la liste (CSV)',
    'cl.said.one': 'Liste de contrôle enregistrée avec {n} étape.',
    'cl.said.other': 'Liste de contrôle enregistrée avec {n} étapes.',
    'cl.saidNone': 'Liste de contrôle enregistrée. Aucune des sources de la liste n’a quoi que ce soit à faire.',
  },
};

export const CHECKLIST_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** The steps for one source: its findings, then a missing tier, then a review date that is close. */
export function tasksFor(s: AuditedSource, audit: AuditResult, locale: Locale): ChecklistTask[] {
  const tasks: ChecklistTask[] = findingCodesFor(s, audit.findings).map((code) => ({ kind: 'finding', code, title: remedyTitle(code, locale), step: remedyStep(code, locale) }));
  if (s.tier === null) tasks.push({ kind: 'tier', code: null, title: tx(locale, 'cl.tier.title'), step: tx(locale, 'cl.tier.step') });
  const days = daysUntilReview(s);
  if (days !== null && days >= 0 && days <= CHECKLIST_SOON_DAYS) {
    tasks.push({ kind: 'soon', code: null, title: tx(locale, 'cl.soon.title', { days: CHECKLIST_SOON_DAYS }), step: tx(locale, 'cl.soon.step') });
  }
  return tasks;
}

/** The checklist for what the filters list, in the given order (the order of the audit when no order is given). */
export function buildChecklist(audit: AuditResult, filters: Filters, locale: Locale, sort: SortSpec | null = null): Checklist {
  const listed = applySort(applyFilters(audit.sources, filters), sort, locale);
  const entries: ChecklistEntry[] = [];
  for (const source of listed) {
    const tasks = tasksFor(source, audit, locale);
    if (tasks.length > 0) entries.push({ source, tasks });
  }
  return { entries, listed: listed.length, clear: listed.length - entries.length, taskCount: entries.reduce((n, e) => n + e.tasks.length, 0) };
}

function recordName(s: AuditedSource, locale: Locale): string {
  return s.name ?? t(locale, 'unknownName');
}

function filtersLine(filters: Filters, locale: Locale, datasetNames?: ReadonlyMap<string, string>): string {
  const active = listActiveFilters(filters, locale, datasetNames).map((a) => a.label);
  return active.length === 0 ? tx(locale, 'cl.noFilters') : tx(locale, 'cl.filters', { list: active.join(tx(locale, 'cl.filters.join')) });
}

/**
 * Makes one line of running text safe inside Markdown: control characters and line breaks become
 * spaces and characters that start markup are escaped. Unlike a table cell, the no-break spaces
 * French punctuation needs are kept.
 */
export function markdownLine(text: string): string {
  return text
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .replace(/([\\`*_{}[\]()#+|<>~])/g, '\\$1');
}

export interface ChecklistTextOptions {
  datasetNames?: ReadonlyMap<string, string>;
}

/** The checklist as Markdown. Names from the data are escaped so they cannot start markup. */
export function checklistToMarkdown(c: Checklist, filters: Filters, now: Date, locale: Locale, opts: ChecklistTextOptions = {}): string {
  const lines: string[] = [
    `# ${tx(locale, 'cl.title')}`,
    '',
    tx(locale, 'cl.asOf', { date: formatDisplayDate(now.toISOString(), locale) }),
    markdownLine(filtersLine(filters, locale, opts.datasetNames)),
    c.entries.length === 0 ? tx(locale, 'cl.empty') : tx.count(locale, 'cl.scope', c.entries.length, { listed: c.listed }),
  ];
  if (c.entries.length > 0 && c.clear > 0) lines.push(tx.count(locale, 'cl.clear', c.clear));
  for (const e of c.entries) {
    const s = e.source;
    lines.push('', `## ${escapeMarkdown(s.datasetName.trim() === '' ? s.datasetId : s.datasetName)} / ${escapeMarkdown(recordName(s, locale))}`, '');
    lines.push(`- ${tx(locale, 'cl.status', { value: t(locale, `state.${s.state}`) })}`);
    lines.push(`- ${tx(locale, 'cl.review', { value: reviewText(s, locale) })}`);
    for (const task of e.tasks) lines.push(`- [ ] ${tx(locale, 'cl.task', { title: task.title, step: task.step })}`);
  }
  lines.push('', `_${tx(locale, 'cl.note')}_`, '');
  return lines.join('\n');
}

export const CHECKLIST_CSV_COLUMNS: readonly Key[] = ['cl.col.dataset', 'cl.col.record', 'cl.col.task', 'cl.col.step', 'cl.col.status', 'cl.col.review'];

/** One row for each step. A review date that is not scheduled is written as the word for Unknown. */
export function checklistRows(c: Checklist, locale: Locale): string[][] {
  const rows: string[][] = [CHECKLIST_CSV_COLUMNS.map((k) => tx(locale, k))];
  for (const e of c.entries) {
    const s = e.source;
    for (const task of e.tasks) {
      rows.push([s.datasetName.trim() === '' ? s.datasetId : s.datasetName, recordName(s, locale), task.title, task.step, t(locale, `state.${s.state}`), reviewDateIso(s) ?? t(locale, 'unknown')]);
    }
  }
  return rows;
}

export function checklistToCsv(c: Checklist, locale: Locale, bom = true): string {
  return toCsv(checklistRows(c, locale), bom);
}

export type ChecklistFormat = 'md' | 'csv';
export const CHECKLIST_FORMATS: readonly ChecklistFormat[] = ['md', 'csv'];

export function checklistAction(format: ChecklistFormat): string {
  return `export-checklist-${format}`;
}

export function checklistFormatFromAction(action: string | null | undefined): ChecklistFormat | null {
  return action === 'export-checklist-md' ? 'md' : action === 'export-checklist-csv' ? 'csv' : null;
}

export function checklistLabel(format: ChecklistFormat, locale: Locale): string {
  return tx(locale, format === 'md' ? 'cl.md' : 'cl.csv');
}

export interface ChecklistFile {
  filename: string;
  mime: string;
  text: string;
}

export function buildChecklistFile(c: Checklist, format: ChecklistFormat, filters: Filters, now: Date, locale: Locale, opts: ChecklistTextOptions = {}): ChecklistFile {
  if (format === 'csv') return { filename: 'review-checklist.csv', mime: 'text/csv;charset=utf-8', text: checklistToCsv(c, locale) };
  return { filename: 'review-checklist.md', mime: 'text/markdown;charset=utf-8', text: checklistToMarkdown(c, filters, now, locale, opts) };
}

/** What to say once a checklist file has been handed over. */
export function describeChecklistSaved(c: Checklist, locale: Locale): string {
  return c.taskCount === 0 ? tx(locale, 'cl.saidNone') : tx.count(locale, 'cl.said', c.taskCount);
}
