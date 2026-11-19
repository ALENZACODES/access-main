/**
 * Each dataset at a glance: one card for each dataset with how many sources it has, their
 * status, the tiers and licence types in use, the oldest and newest retrieved dates, the next
 * review date, and how many records carry all four facts. Everything is counted from the audit;
 * a dataset with no usable dates says so instead of showing a date.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import { licenceKind, type FreshnessState, type LicenceKind, type Locale } from './dataStatus';
import { daysUntilReview, FILTER_LICENCE_KINDS, GAP_FIELDS, hasGap } from './filters';
import type { DatasetKind } from './freshnessPolicy';
import { t } from './i18n';
import { kindLabel } from './licenceBreakdown';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { reviewDateIso } from './rowDetail';
import { escapeHtml } from './sourceList';
import { emptyTierCounts, tierLabel, type TierCounts } from './tiers';
import { TIER_IDS } from './tierValue';

export const MAX_DATASET_CARDS = 20;

export interface DatasetCard {
  id: string;
  name: string;
  kind: DatasetKind;
  total: number;
  states: Record<FreshnessState, number>;
  tiers: TierCounts;
  tierUnknown: number;
  licences: Record<LicenceKind, number>;
  /** Oldest and newest usable retrieved dates (YYYY-MM-DD); null when no source has one. */
  oldestIso: string | null;
  newestIso: string | null;
  /** The nearest review date that has not passed, with the days until it; null when there is none. */
  nextReview: { iso: string; days: number } | null;
  /** Sources already past their review date. */
  pastReview: number;
  /** Sources that carry a source, a licence, a usable date and a tier. */
  complete: number;
}

export interface DatasetCards {
  cards: DatasetCard[];
  /** Datasets not shown because of the limit. */
  hidden: number;
}

function cardFor(id: string, sources: readonly AuditedSource[]): DatasetCard {
  const first = sources[0];
  const card: DatasetCard = {
    id,
    name: first?.datasetName ?? id,
    kind: first?.kind ?? 'reference',
    total: sources.length,
    states: { fresh: 0, stale: 0, unknown: 0 },
    tiers: emptyTierCounts(),
    tierUnknown: 0,
    licences: { open: 0, terms: 0, unrecognised: 0, unknown: 0 },
    oldestIso: null,
    newestIso: null,
    nextReview: null,
    pastReview: 0,
    complete: 0,
  };
  for (const s of sources) {
    card.states[s.state] += 1;
    if (s.tier === null) card.tierUnknown += 1;
    else card.tiers[s.tier] += 1;
    card.licences[licenceKind(s.licence)] += 1;
    if (GAP_FIELDS.every((g) => !hasGap(s, g))) card.complete += 1;
    // Only a usable date takes part: a future or unreadable one is Unknown and sets no bound.
    if (s.retrievedIso !== null && s.ageDays !== null) {
      if (card.oldestIso === null || s.retrievedIso < card.oldestIso) card.oldestIso = s.retrievedIso;
      if (card.newestIso === null || s.retrievedIso > card.newestIso) card.newestIso = s.retrievedIso;
    }
    const days = daysUntilReview(s);
    const iso = reviewDateIso(s);
    if (days !== null && days < 0) card.pastReview += 1;
    else if (days !== null && iso !== null && (card.nextReview === null || days < card.nextReview.days)) card.nextReview = { iso, days };
  }
  return card;
}

/** One card for each dataset id that has sources, in audit order. Datasets that share an id form one card. */
export function buildDatasetCards(audit: AuditResult, limit: number = MAX_DATASET_CARDS): DatasetCards {
  const byId = new Map<string, AuditedSource[]>();
  for (const s of audit.sources) {
    const list = byId.get(s.datasetId);
    if (list === undefined) byId.set(s.datasetId, [s]);
    else list.push(s);
  }
  const all = [...byId.entries()].map(([id, sources]) => cardFor(id, sources));
  const cap = Math.max(0, Math.trunc(Number.isFinite(limit) ? limit : 0));
  return { cards: all.slice(0, cap), hidden: Math.max(0, all.length - cap) };
}

type Key =
  | 'dc.title'
  | 'dc.intro'
  | 'dc.none'
  | 'dc.more.one'
  | 'dc.more.other'
  | 'dc.kind'
  | 'dc.sources'
  | 'dc.status'
  | 'dc.tiers'
  | 'dc.licences'
  | 'dc.dates'
  | 'dc.review'
  | 'dc.facts'
  | 'dc.pair'
  | 'dc.join'
  | 'dc.dates.none'
  | 'dc.dates.single'
  | 'dc.dates.range'
  | 'dc.review.none'
  | 'dc.review.next.one'
  | 'dc.review.next.other'
  | 'dc.review.today'
  | 'dc.review.past.one'
  | 'dc.review.past.other'
  | 'dc.review.join'
  | 'dc.facts.value';

const MESSAGES: Messages<Key> = {
  en: {
    'dc.title': 'Dataset cards',
    'dc.intro': 'One card for each dataset that has sources. Counts are of sources. A zero is left out.',
    'dc.none': 'There are no datasets with sources.',
    'dc.more.one': '{n} more dataset is not shown.',
    'dc.more.other': '{n} more datasets are not shown.',
    'dc.kind': 'Kind of data',
    'dc.sources': 'Sources',
    'dc.status': 'Status',
    'dc.tiers': 'Tiers',
    'dc.licences': 'Licence types',
    'dc.dates': 'Retrieved dates',
    'dc.review': 'Review dates',
    'dc.facts': 'Source, licence, date and tier',
    'dc.pair': '{label}: {count}',
    'dc.join': '; ',
    'dc.dates.none': 'No source has a usable retrieved date.',
    'dc.dates.single': '{date}',
    'dc.dates.range': 'From {oldest} to {newest}',
    'dc.review.none': 'No review date is coming up.',
    'dc.review.next.one': 'Next on {date} (in {n} day)',
    'dc.review.next.other': 'Next on {date} (in {n} days)',
    'dc.review.today': 'Next on {date} (today)',
    'dc.review.past.one': '{n} already passed',
    'dc.review.past.other': '{n} already passed',
    'dc.review.join': '. ',
    'dc.facts.value': 'All four on {complete} of {total}',
  },
  fr: {
    'dc.title': 'Fiches des jeux de données',
    'dc.intro': 'Une fiche pour chaque jeu de données qui a des sources. Les nombres comptent des sources. Un zéro n’est pas affiché.',
    'dc.none': 'Il n’y a aucun jeu de données ayant des sources.',
    'dc.more.one': '{n} autre jeu de données n’est pas affiché.',
    'dc.more.other': '{n} autres jeux de données ne sont pas affichés.',
    'dc.kind': 'Type de données',
    'dc.sources': 'Sources',
    'dc.status': 'État',
    'dc.tiers': 'Niveaux',
    'dc.licences': 'Types de licence',
    'dc.dates': 'Dates de récupération',
    'dc.review': 'Dates de révision',
    'dc.facts': 'Source, licence, date et niveau',
    'dc.pair': '{label}\u00A0: {count}',
    'dc.join': '\u202F; ',
    'dc.dates.none': 'Aucune source n’a de date de récupération utilisable.',
    'dc.dates.single': '{date}',
    'dc.dates.range': 'Du {oldest} au {newest}',
    'dc.review.none': 'Aucune date de révision à venir.',
    'dc.review.next.one': 'Prochaine le {date} (dans {n} jour)',
    'dc.review.next.other': 'Prochaine le {date} (dans {n} jours)',
    'dc.review.today': 'Prochaine le {date} (aujourd’hui)',
    'dc.review.past.one': '{n} déjà dépassée',
    'dc.review.past.other': '{n} déjà dépassées',
    'dc.review.join': '. ',
    'dc.facts.value': 'Les quatre pour {complete} sur {total}',
  },
};

export const DATASET_CARD_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const STATES: readonly FreshnessState[] = ['fresh', 'stale', 'unknown'];

function pairs(items: readonly { label: string; n: number }[], locale: Locale): string {
  return items
    .filter((i) => i.n > 0)
    .map((i) => tx(locale, 'dc.pair', { label: i.label, count: i.n }))
    .join(tx(locale, 'dc.join'));
}

export function cardStatusText(c: DatasetCard, locale: Locale): string {
  return pairs(STATES.map((s) => ({ label: t(locale, `state.${s}`), n: c.states[s] })), locale);
}

export function cardTierText(c: DatasetCard, locale: Locale): string {
  return pairs([...TIER_IDS.map((id) => ({ label: tierLabel(id, locale), n: c.tiers[id] })), { label: t(locale, 'unknown'), n: c.tierUnknown }], locale);
}

export function cardLicenceText(c: DatasetCard, locale: Locale): string {
  return pairs(FILTER_LICENCE_KINDS.map((k) => ({ label: kindLabel(k, locale), n: c.licences[k] })), locale);
}

export function cardDatesText(c: DatasetCard, locale: Locale): string {
  if (c.oldestIso === null || c.newestIso === null) return tx(locale, 'dc.dates.none');
  if (c.oldestIso === c.newestIso) return tx(locale, 'dc.dates.single', { date: formatDisplayDate(c.oldestIso, locale) });
  return tx(locale, 'dc.dates.range', { oldest: formatDisplayDate(c.oldestIso, locale), newest: formatDisplayDate(c.newestIso, locale) });
}

export function cardReviewText(c: DatasetCard, locale: Locale): string {
  const parts: string[] = [];
  if (c.nextReview !== null) {
    const date = formatDisplayDate(c.nextReview.iso, locale);
    parts.push(c.nextReview.days === 0 ? tx(locale, 'dc.review.today', { date }) : tx.count(locale, 'dc.review.next', c.nextReview.days, { date }));
  }
  if (c.pastReview > 0) parts.push(tx.count(locale, 'dc.review.past', c.pastReview));
  return parts.length === 0 ? tx(locale, 'dc.review.none') : `${parts.join(tx(locale, 'dc.review.join'))}.`;
}

export function cardFactsText(c: DatasetCard, locale: Locale): string {
  return tx(locale, 'dc.facts.value', { complete: c.complete, total: c.total });
}

export interface DatasetCardExtra {
  /** Ready-made HTML placed at the foot of a card, such as a control that lists its sources. */
  foot: (card: DatasetCard) => string;
}

export function renderDatasetCardsHtml(d: DatasetCards, locale: Locale, extra?: DatasetCardExtra): string {
  const heading = `<h2 id="ds-cards-title">${escapeHtml(tx(locale, 'dc.title'))}</h2>`;
  if (d.cards.length === 0 && d.hidden === 0) return `<section aria-labelledby="ds-cards-title">${heading}<p>${escapeHtml(tx(locale, 'dc.none'))}</p></section>`;
  const pair = (key: Key, value: string) => `<dt>${escapeHtml(tx(locale, key))}</dt><dd>${escapeHtml(value)}</dd>`;
  const cards = d.cards
    .map((c, i) => {
      const id = `ds-card-${i + 1}`;
      return (
        `<section aria-labelledby="${id}" data-card="${escapeHtml(c.id)}"><h3 id="${id}">${escapeHtml(c.name)}</h3><dl>` +
        pair('dc.kind', t(locale, `kind.${c.kind}`)) +
        pair('dc.sources', String(c.total)) +
        pair('dc.status', cardStatusText(c, locale)) +
        pair('dc.tiers', cardTierText(c, locale)) +
        pair('dc.licences', cardLicenceText(c, locale)) +
        pair('dc.dates', cardDatesText(c, locale)) +
        pair('dc.review', cardReviewText(c, locale)) +
        pair('dc.facts', cardFactsText(c, locale)) +
        `</dl>${extra ? `<p>${extra.foot(c)}</p>` : ''}</section>`
      );
    })
    .join('');
  return (
    `<section aria-labelledby="ds-cards-title">${heading}<p>${escapeHtml(tx(locale, 'dc.intro'))}</p>${cards}` +
    (d.hidden > 0 ? `<p>${escapeHtml(tx.count(locale, 'dc.more', d.hidden))}</p>` : '') +
    '</section>'
  );
}
