/**
 * Grouping the source list: the same rows, set out under a heading for each dataset, status,
 * tier, licence type or age band. Every source lands in exactly one group, groups keep a fixed
 * order with Unknown last, and a group with no source is left out.
 */
import { ageValueLabel } from './ageBands';
import type { AuditedSource } from './datasetRegistry';
import { licenceKind, type FreshnessState, type Locale } from './dataStatus';
import { ageFilterOf, FILTER_AGES, FILTER_LICENCE_KINDS, type Filters } from './filters';
import { t } from './i18n';
import { kindLabel } from './licenceBreakdown';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { UNKNOWN_WORD } from './unknownWord';
import { tierLabel } from './tiers';
import { TIER_IDS, type TierId } from './tierValue';

export const GROUP_KEYS = ['none', 'dataset', 'status', 'tier', 'licence', 'age'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export function isGroupKey(v: unknown): v is GroupKey {
  return typeof v === 'string' && (GROUP_KEYS as readonly string[]).includes(v);
}

/** Reads `?group=`; anything unreadable means no grouping. */
export function parseGroup(search: string): GroupKey {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const g = p.get('group');
  return isGroupKey(g) ? g : 'none';
}

export interface SourceGroup {
  /** Stable within one grouping: a dataset id, a status, a tier, a licence type or an age band. */
  id: string;
  label: string;
  sources: AuditedSource[];
  /** The one filter that lists exactly this group, so a group can be opened as its own list. */
  filter: Partial<Filters>;
}

// Items to look at come first; Unknown is always last.
const STATUS_ORDER: readonly FreshnessState[] = ['stale', 'fresh', 'unknown'];

function bucket(sources: readonly AuditedSource[], keyOf: (s: AuditedSource) => string): Map<string, AuditedSource[]> {
  const m = new Map<string, AuditedSource[]>();
  for (const s of sources) {
    const k = keyOf(s);
    const list = m.get(k);
    if (list === undefined) m.set(k, [s]);
    else list.push(s);
  }
  return m;
}

/**
 * Splits the sources into groups. The order of sources inside a group is the order given, so a
 * sorted list stays sorted within each group. With 'none' there is one group holding everything.
 */
export function groupSources(sources: readonly AuditedSource[], key: GroupKey, locale: Locale): SourceGroup[] {
  if (sources.length === 0) return [];
  if (key === 'none') return [{ id: 'all', label: t(locale, 'tbl.sources'), sources: [...sources], filter: {} }];
  const out: SourceGroup[] = [];
  const push = (id: string, label: string, list: AuditedSource[] | undefined, filter: Partial<Filters>) => {
    if (list !== undefined && list.length > 0) out.push({ id, label, sources: list, filter });
  };
  if (key === 'dataset') {
    // Datasets appear in the order their first source appears.
    for (const [id, list] of bucket(sources, (s) => s.datasetId)) push(id, list[0]?.datasetName ?? id, list, { dataset: id });
    return out;
  }
  if (key === 'status') {
    const m = bucket(sources, (s) => s.state);
    for (const s of STATUS_ORDER) push(s, t(locale, `state.${s}`), m.get(s), { state: s });
    return out;
  }
  if (key === 'tier') {
    const m = bucket(sources, (s) => s.tier ?? 'unknown');
    for (const id of TIER_IDS) push(id, tierLabel(id as TierId, locale), m.get(id), { tier: id });
    push('unknown', tx(locale, 'gr.tierUnknown', { unknown: UNKNOWN_WORD }), m.get('unknown'), { tier: 'unknown' });
    return out;
  }
  if (key === 'licence') {
    const m = bucket(sources, (s) => licenceKind(s.licence));
    for (const k of FILTER_LICENCE_KINDS) push(k, k === 'unknown' ? tx(locale, 'gr.licenceUnknown', { unknown: UNKNOWN_WORD }) : kindLabel(k, locale), m.get(k), { licence: k });
    return out;
  }
  const m = bucket(sources, ageFilterOf);
  for (const a of FILTER_AGES) push(a, ageValueLabel(a, locale) ?? a, m.get(a), { age: a });
  return out;
}

type Key =
  | 'gr.label'
  | 'gr.help'
  | 'gr.none'
  | 'gr.dataset'
  | 'gr.status'
  | 'gr.tier'
  | 'gr.licence'
  | 'gr.age'
  | 'gr.tierUnknown'
  | 'gr.licenceUnknown'
  | 'gr.heading.one'
  | 'gr.heading.other'
  | 'gr.caption'
  | 'gr.partial'
  | 'gr.pagePart'
  | 'gr.said'
  | 'gr.saidOff'
  | 'gr.count.one'
  | 'gr.count.other';

const MESSAGES: Messages<Key> = {
  en: {
    'gr.label': 'Group by',
    'gr.help': 'Each group has its own heading and table. UNKNOWN always comes last.',
    'gr.none': 'No grouping',
    'gr.dataset': 'Dataset',
    'gr.status': 'Status',
    'gr.tier': 'Tier',
    'gr.licence': 'Licence type',
    'gr.age': 'Age of retrieved date',
    'gr.tierUnknown': 'Tier: {unknown}',
    'gr.licenceUnknown': 'Licence: {unknown}',
    'gr.heading.one': '{label} ({n} source)',
    'gr.heading.other': '{label} ({n} sources)',
    'gr.caption': 'Sources: {label}',
    'gr.partial': 'Showing the first {shown} of {total} in this group.',
    'gr.pagePart': '{shown} of the {total} in this group are on this page.',
    'gr.said': 'Grouped by {by}, in {groups}.',
    'gr.saidOff': 'Grouping removed.',
    'gr.count.one': '{n} group',
    'gr.count.other': '{n} groups',
  },
  fr: {
    'gr.label': 'Regrouper par',
    'gr.help': 'Chaque groupe a son propre titre et son propre tableau. UNKNOWN vient toujours en dernier.',
    'gr.none': 'Aucun regroupement',
    'gr.dataset': 'Jeu de données',
    'gr.status': 'État',
    'gr.tier': 'Niveau',
    'gr.licence': 'Type de licence',
    'gr.age': 'Âge de la date de récupération',
    'gr.tierUnknown': 'Niveau\u00A0: {unknown}',
    'gr.licenceUnknown': 'Licence\u00A0: {unknown}',
    'gr.heading.one': '{label} ({n} source)',
    'gr.heading.other': '{label} ({n} sources)',
    'gr.caption': 'Sources\u00A0: {label}',
    'gr.partial': 'Affichage des {shown} premières sur {total} dans ce groupe.',
    'gr.pagePart': '{shown} des {total} sources de ce groupe figurent sur cette page.',
    'gr.said': 'Regroupement par {by}, en {groups}.',
    'gr.saidOff': 'Regroupement retiré.',
    'gr.count.one': '{n} groupe',
    'gr.count.other': '{n} groupes',
  },
};

export const GROUPED_LIST_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function groupKeyLabel(key: GroupKey, locale: Locale): string {
  return tx(locale, `gr.${key}`);
}

export function groupHeading(g: Pick<SourceGroup, 'label' | 'sources'>, locale: Locale): string {
  return tx.count(locale, 'gr.heading', g.sources.length, { label: g.label });
}

export function groupCaption(g: Pick<SourceGroup, 'label'>, locale: Locale): string {
  return tx(locale, 'gr.caption', { label: g.label });
}

export function groupPartialText(shown: number, total: number, locale: Locale): string {
  return tx(locale, 'gr.partial', { shown, total });
}

/** For a paged list: how many of a group's sources are on the page being shown. */
export function groupPageText(shown: number, total: number, locale: Locale): string {
  return tx(locale, 'gr.pagePart', { shown, total });
}

/** The groups cut down to the sources on one page, in order; groups with nothing on the page are left out. */
export function groupsOnPage(groups: readonly SourceGroup[], page: readonly AuditedSource[]): DrawnGroup[] {
  const onPage = new Set(page);
  const out: DrawnGroup[] = [];
  for (const group of groups) {
    const drawn = group.sources.filter((s) => onPage.has(s));
    if (drawn.length > 0) out.push({ group, drawn });
  }
  return out;
}

/** What to say when the grouping changes. */
export function describeGrouping(key: GroupKey, groups: number, locale: Locale): string {
  if (key === 'none') return tx(locale, 'gr.saidOff');
  return tx(locale, 'gr.said', { by: groupKeyLabel(key, locale).toLowerCase(), groups: tx.count(locale, 'gr.count', groups) });
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

/** The "Group by" field. It carries `data-filter="group"` so it travels with the other list controls. */
export function renderGroupControl(current: GroupKey, locale: Locale): string {
  const options = GROUP_KEYS.map((k) => `<option value="${k}"${k === current ? ' selected' : ''}>${escapeHtml(groupKeyLabel(k, locale))}</option>`).join('');
  return (
    `<div><label for="ds-f-group">${escapeHtml(tx(locale, 'gr.label'))}</label> ` +
    `<select id="ds-f-group" name="group" data-filter="group" aria-describedby="ds-f-group-help" style="${FIELD_STYLE}">${options}</select> ` +
    `<span id="ds-f-group-help">${escapeHtml(tx(locale, 'gr.help'))}</span></div>`
  );
}

export interface DrawnGroup {
  group: SourceGroup;
  /** The sources of this group that fit within the row budget, in order. */
  drawn: AuditedSource[];
}

/**
 * Shares a row budget across groups in order: earlier groups are drawn in full before a later
 * one starts, and groups with nothing drawn are left out. The total drawn never exceeds the budget.
 */
export function drawGroups(groups: readonly SourceGroup[], budget: number): DrawnGroup[] {
  let left = Math.max(0, Math.trunc(Number.isFinite(budget) ? budget : 0));
  const out: DrawnGroup[] = [];
  for (const group of groups) {
    if (left === 0) break;
    const drawn = group.sources.slice(0, left);
    left -= drawn.length;
    out.push({ group, drawn });
  }
  return out;
}
