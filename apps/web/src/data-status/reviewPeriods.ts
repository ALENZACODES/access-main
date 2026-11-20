/**
 * Review periods, and what would change with another one. A source is marked possibly out of
 * date when it was retrieved more than its review period ago, and the period depends on the
 * kind of data. This module lets a person try another period for one kind and see at once how
 * many sources that would mark, and it shows the same answer for a fixed set of periods in one
 * table. A period is a reminder to look at a source again. It says nothing about how often a
 * publisher updates, and trying another one changes no record.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { DATASET_KINDS, DEFAULT_STALE_DAYS, isDatasetKind, staleAfterFor, type DatasetKind } from './freshnessPolicy';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { MAX_THRESHOLD_DAYS, MIN_THRESHOLD_DAYS, type Thresholds } from './thresholds';

/** The periods offered, in days. The default for a kind is always offered as well. */
export const PERIOD_PRESETS = [30, 60, 90, 120, 180, 365, 730] as const;

export function isUsablePeriod(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_THRESHOLD_DAYS && n <= MAX_THRESHOLD_DAYS;
}

/** The periods a person can choose for a kind: the presets, its default, and its current value, in order. */
export function periodChoices(kind: DatasetKind, thresholds: Thresholds = {}): number[] {
  const current = staleAfterFor(kind, thresholds);
  return [...new Set([...PERIOD_PRESETS, DEFAULT_STALE_DAYS[kind], ...(isUsablePeriod(current) ? [current] : [])])].sort((a, b) => a - b);
}

/** How many of these sources were retrieved more than `days` ago. Sources with no usable date are never counted. */
export function staleUnder(sources: readonly AuditedSource[], days: number): number {
  return sources.filter((s) => s.ageDays !== null && s.state !== 'unknown' && s.ageDays > days).length;
}

/** The thresholds with one kind set. A value equal to the default, or not usable, removes the override. The input is not changed. */
export function withPeriod(thresholds: Thresholds, kind: DatasetKind, days: number | null): Thresholds {
  const next: Thresholds = { ...thresholds };
  if (days === null || !isUsablePeriod(days) || days === DEFAULT_STALE_DAYS[kind]) delete next[kind];
  else next[kind] = days;
  return next;
}

/** Reads the value of the period select: a whole number of days, or null for the default. */
export function parsePeriodValue(value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  const n = Number(value);
  return isUsablePeriod(n) ? n : null;
}

export interface PeriodRow {
  kind: DatasetKind;
  /** The period in force for this kind. */
  current: number;
  custom: boolean;
  /** Sources of this kind. */
  total: number;
  /** Of those, the ones with no usable retrieved date, which no period can mark. */
  undated: number;
  /** One count per preset, in preset order. */
  counts: number[];
  /** The count under the period in force. */
  now: number;
}

export interface PeriodWhatIf {
  rows: PeriodRow[];
  sourceCount: number;
}

/** One row for each kind of data that has at least one source, in the fixed order of the kinds. */
export function buildPeriodWhatIf(audit: AuditResult, thresholds: Thresholds = {}): PeriodWhatIf {
  const rows: PeriodRow[] = [];
  for (const kind of DATASET_KINDS) {
    const sources = audit.sources.filter((s) => s.kind === kind);
    if (sources.length === 0) continue;
    const current = staleAfterFor(kind, thresholds);
    rows.push({
      kind,
      current,
      custom: current !== DEFAULT_STALE_DAYS[kind],
      total: sources.length,
      undated: sources.filter((s) => s.ageDays === null || s.state === 'unknown').length,
      counts: PERIOD_PRESETS.map((days) => staleUnder(sources, days)),
      now: staleUnder(sources, current),
    });
  }
  return { rows, sourceCount: audit.sources.length };
}

type Key =
  | 'rp.title'
  | 'rp.intro'
  | 'rp.none'
  | 'rp.caption'
  | 'rp.colKind'
  | 'rp.colNow'
  | 'rp.colDays'
  | 'rp.now.one'
  | 'rp.now.other'
  | 'rp.nowCustom.one'
  | 'rp.nowCustom.other'
  | 'rp.undated.one'
  | 'rp.undated.other'
  | 'rp.kind'
  | 'rp.days'
  | 'rp.optDefault'
  | 'rp.opt'
  | 'rp.legend'
  | 'rp.staticLabel'
  | 'rp.said.one'
  | 'rp.said.other'
  | 'rp.saidDefault.one'
  | 'rp.saidDefault.other'
  | 'rp.saidKind';

const MESSAGES: Messages<Key> = {
  en: {
    'rp.title': 'Review periods, and what another one would change',
    'rp.intro': 'A source is marked possibly out of date when it was retrieved more than its review period ago. Each number below is how many sources of that kind would be marked with that period. Trying another period changes no record.',
    'rp.none': 'There are no sources, so there is nothing to compare.',
    'rp.caption': 'Sources that would be marked possibly out of date, for each review period',
    'rp.colKind': 'Kind of data',
    'rp.colNow': 'Period in use',
    'rp.colDays': '{count} days',
    'rp.now.one': '{days} days: {n} source marked',
    'rp.now.other': '{days} days: {n} sources marked',
    'rp.nowCustom.one': '{days} days, chosen here: {n} source marked',
    'rp.nowCustom.other': '{days} days, chosen here: {n} sources marked',
    'rp.undated.one': '{n} source has no usable retrieved date, so no period can mark it.',
    'rp.undated.other': '{n} sources have no usable retrieved date, so no period can mark them.',
    'rp.kind': 'Review period for',
    'rp.days': 'Marked possibly out of date after',
    'rp.optDefault': '{count} days (the default)',
    'rp.opt': '{count} days',
    'rp.legend': 'Review periods',
    'rp.staticLabel': 'Review period for {kind}',
    'rp.said.one': 'Review period for {kind} set to {days} days. {n} source of that kind is now marked possibly out of date (it was {before}).',
    'rp.said.other': 'Review period for {kind} set to {days} days. {n} sources of that kind are now marked possibly out of date (it was {before}).',
    'rp.saidDefault.one': 'Review period for {kind} back to the default, {days} days. {n} source of that kind is now marked possibly out of date (it was {before}).',
    'rp.saidDefault.other': 'Review period for {kind} back to the default, {days} days. {n} sources of that kind are now marked possibly out of date (it was {before}).',
    'rp.saidKind': 'Review period for {kind}: {days} days.',
  },
  fr: {
    'rp.title': 'Périodes de révision, et ce qu’une autre changerait',
    'rp.intro': 'Une source est marquée comme possiblement périmée lorsqu’elle a été récupérée depuis plus longtemps que sa période de révision. Chaque nombre ci-dessous indique combien de sources de ce type seraient marquées avec cette période. Essayer une autre période ne modifie aucun enregistrement.',
    'rp.none': 'Il n’y a aucune source, il n’y a donc rien à comparer.',
    'rp.caption': 'Sources qui seraient marquées comme possiblement périmées, pour chaque période de révision',
    'rp.colKind': 'Type de données',
    'rp.colNow': 'Période utilisée',
    'rp.colDays': '{count} jours',
    'rp.now.one': '{days} jours\u00A0: {n} source marquée',
    'rp.now.other': '{days} jours\u00A0: {n} sources marquées',
    'rp.nowCustom.one': '{days} jours, choisie ici\u00A0: {n} source marquée',
    'rp.nowCustom.other': '{days} jours, choisie ici\u00A0: {n} sources marquées',
    'rp.undated.one': '{n} source n’a pas de date de récupération utilisable, aucune période ne peut donc la marquer.',
    'rp.undated.other': '{n} sources n’ont pas de date de récupération utilisable, aucune période ne peut donc les marquer.',
    'rp.kind': 'Période de révision pour',
    'rp.days': 'Marquée comme possiblement périmée après',
    'rp.optDefault': '{count} jours (valeur par défaut)',
    'rp.opt': '{count} jours',
    'rp.legend': 'Périodes de révision',
    'rp.staticLabel': 'Période de révision pour {kind}',
    'rp.said.one': 'Période de révision pour {kind} fixée à {days} jours. {n} source de ce type est maintenant marquée comme possiblement périmée (auparavant {before}).',
    'rp.said.other': 'Période de révision pour {kind} fixée à {days} jours. {n} sources de ce type sont maintenant marquées comme possiblement périmées (auparavant {before}).',
    'rp.saidDefault.one': 'Période de révision pour {kind} ramenée à la valeur par défaut, {days} jours. {n} source de ce type est maintenant marquée comme possiblement périmée (auparavant {before}).',
    'rp.saidDefault.other': 'Période de révision pour {kind} ramenée à la valeur par défaut, {days} jours. {n} sources de ce type sont maintenant marquées comme possiblement périmées (auparavant {before}).',
    'rp.saidKind': 'Période de révision pour {kind}\u00A0: {days} jours.',
  },
};

export const REVIEW_PERIOD_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

function kindName(kind: DatasetKind, locale: Locale): string {
  return t(locale, `kind.${kind}`);
}

/** "180 days: 2 sources marked", saying so when the period was chosen here and is not the default. */
export function periodNowText(row: PeriodRow, locale: Locale): string {
  return tx.count(locale, row.custom ? 'rp.nowCustom' : 'rp.now', row.now, { days: row.current });
}

export function periodUndatedNote(d: PeriodWhatIf, locale: Locale): string | null {
  const undated = d.rows.reduce((n, r) => n + r.undated, 0);
  return undated === 0 ? null : tx.count(locale, 'rp.undated', undated);
}

/** What to say after a period was changed: the new period, the new count for that kind, and the count before. */
export function describePeriodChange(kind: DatasetKind, days: number, now: number, before: number, locale: Locale): string {
  const key = days === DEFAULT_STALE_DAYS[kind] ? 'rp.saidDefault' : 'rp.said';
  return tx.count(locale, key, now, { kind: kindName(kind, locale), days, before });
}

/** What to say when another kind is chosen in the editor: its period as it stands. */
export function describePeriodKind(kind: DatasetKind, days: number, locale: Locale): string {
  return tx(locale, 'rp.saidKind', { kind: kindName(kind, locale), days });
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

function periodOptionsHtml(kind: DatasetKind, thresholds: Thresholds, locale: Locale, defaultValue: string): string {
  const current = staleAfterFor(kind, thresholds);
  return periodChoices(kind, thresholds)
    .map((days) => {
      const isDefault = days === DEFAULT_STALE_DAYS[kind];
      const label = tx(locale, isDefault ? 'rp.optDefault' : 'rp.opt', { count: days });
      return `<option value="${isDefault ? defaultValue : days}"${days === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

/**
 * The editor on the live panel: one list for the kind of data and one for its period. Two
 * controls serve all five kinds, so the page stays short to cross with the Tab key.
 */
export function renderPeriodEditor(kind: DatasetKind, thresholds: Thresholds, locale: Locale): string {
  const kinds = DATASET_KINDS.map((k) => `<option value="${k}"${k === kind ? ' selected' : ''}>${escapeHtml(kindName(k, locale))}</option>`).join('');
  return (
    `<div><label for="ds-rp-kind">${escapeHtml(tx(locale, 'rp.kind'))}</label> <select id="ds-rp-kind" data-filter="periodKind" style="${FIELD_STYLE}">${kinds}</select></div>` +
    `<div><label for="ds-rp-days">${escapeHtml(tx(locale, 'rp.days'))}</label> <select id="ds-rp-days" data-filter="periodDays" style="${FIELD_STYLE}">${periodOptionsHtml(kind, thresholds, locale, 'default')}</select></div>`
  );
}

/**
 * The fields for a page without scripts: one list per kind, named as the address names it
 * (`stale_places` and so on). The default is sent as an empty value, which the address ignores.
 */
export function renderPeriodFields(thresholds: Thresholds, locale: Locale): string {
  const fields = DATASET_KINDS.map(
    (kind) =>
      `<div><label for="ds-rp-${kind}">${escapeHtml(tx(locale, 'rp.staticLabel', { kind: kindName(kind, locale) }))}</label> ` +
      `<select id="ds-rp-${kind}" name="stale_${kind}" style="${FIELD_STYLE}">${periodOptionsHtml(kind, thresholds, locale, '')}</select></div>`,
  ).join('');
  return `<fieldset data-periods><legend>${escapeHtml(tx(locale, 'rp.legend'))}</legend>${fields}</fieldset>`;
}

/** Reads the kind select; null for anything that is not a kind of data. */
export function parsePeriodKind(value: string): DatasetKind | null {
  return isDatasetKind(value) ? value : null;
}

/** `controls` is ready-made markup placed under the introduction: the editor, on the live panel. */
export function renderPeriodWhatIfHtml(d: PeriodWhatIf, locale: Locale, controls = ''): string {
  const open = `<section aria-labelledby="ds-periods-title" data-period-rows="${d.rows.length}"><h2 id="ds-periods-title">${escapeHtml(tx(locale, 'rp.title'))}</h2>`;
  if (d.rows.length === 0) return `${open}<p>${escapeHtml(tx(locale, 'rp.none'))}</p>${controls}</section>`;
  const heads =
    `<th scope="col">${escapeHtml(tx(locale, 'rp.colKind'))}</th><th scope="col">${escapeHtml(tx(locale, 'rp.colNow'))}</th>` +
    PERIOD_PRESETS.map((days) => `<th scope="col">${escapeHtml(tx(locale, 'rp.colDays', { count: days }))}</th>`).join('');
  const rows = d.rows
    .map(
      (r) =>
        `<tr data-kind="${r.kind}"><th scope="row">${escapeHtml(kindName(r.kind, locale))}</th><td>${escapeHtml(periodNowText(r, locale))}</td>` +
        r.counts.map((n) => `<td>${n}</td>`).join('') +
        '</tr>',
    )
    .join('');
  const note = periodUndatedNote(d, locale);
  const caption = escapeHtml(tx(locale, 'rp.caption'));
  return (
    `${open}<p>${escapeHtml(tx(locale, 'rp.intro'))}</p>${controls}` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${caption}"><table><caption>${caption}</caption><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>` +
    (note === null ? '' : `<p>${escapeHtml(note)}</p>`) +
    '</section>'
  );
}
