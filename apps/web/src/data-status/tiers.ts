/**
 * Tier per record: reads the tier written on each record and counts records by tier.
 * A tier is one of 0, 1, 2, 3, 4 or E, exactly as recorded. Nothing is guessed: a record with
 * no tier, a placeholder, or any other text counts as Unknown, and text that is present but is
 * not a tier is also reported separately so it can be corrected at the source.
 */
import type { DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { cleanValue } from './unknownTokens';

export const TIER_IDS = ['0', '1', '2', '3', '4', 'E'] as const;
export type TierId = (typeof TIER_IDS)[number];

export type TierRead =
  | { kind: 'tier'; tier: TierId }
  /** Nothing usable is recorded. */
  | { kind: 'unknown' }
  /** Something is recorded, but it is not one of the tiers. */
  | { kind: 'unrecognised'; text: string };

const UNKNOWN: TierRead = { kind: 'unknown' };

export function isTierId(v: unknown): v is TierId {
  return typeof v === 'string' && (TIER_IDS as readonly string[]).includes(v);
}

/** Reads one recorded tier. Whole numbers 0 to 4 and the letter E (either case) are tiers; nothing else is. */
export function readTier(raw: unknown): TierRead {
  if (typeof raw === 'number') {
    if (Number.isInteger(raw) && raw >= 0 && raw <= 4) return { kind: 'tier', tier: String(raw) as TierId };
    return Number.isNaN(raw) ? UNKNOWN : { kind: 'unrecognised', text: String(raw) };
  }
  if (typeof raw !== 'string') return UNKNOWN;
  const text = cleanValue(raw);
  if (text === null) return UNKNOWN;
  const upper = text.toUpperCase();
  if (isTierId(upper)) return { kind: 'tier', tier: upper };
  return { kind: 'unrecognised', text };
}

export interface TieredRecord {
  datasetId: string;
  datasetName: string;
  sourceId: string;
  name: string;
  read: TierRead;
}

/** One entry per source, in registry order. */
export function readTiers(records: readonly DatasetRecord[]): TieredRecord[] {
  const out: TieredRecord[] = [];
  for (const r of records) {
    const datasetName = cleanValue(r.name) ?? r.id;
    for (const s of r.sources) {
      out.push({ datasetId: r.id, datasetName, sourceId: s.id, name: cleanValue(s.name) ?? s.id, read: readTier(s.tier) });
    }
  }
  return out;
}

export type TierCounts = Record<TierId, number>;

export function emptyTierCounts(): TierCounts {
  return { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, E: 0 };
}

export interface DatasetTiers {
  datasetId: string;
  datasetName: string;
  counts: TierCounts;
  /** Records with no usable tier, including unrecognised text. */
  unknown: number;
  total: number;
}

export interface TierBreakdown {
  counts: TierCounts;
  /** Records with no usable tier, including unrecognised text. */
  unknown: number;
  /** Of the unknown records, how many have text that is not a tier. */
  unrecognised: number;
  /** The distinct unrecognised texts, in first-seen order, at most MAX_UNRECOGNISED_SHOWN. */
  unrecognisedTexts: string[];
  total: number;
  known: number;
  datasets: DatasetTiers[];
}

export const MAX_UNRECOGNISED_SHOWN = 5;

export function buildTierBreakdown(records: readonly DatasetRecord[]): TierBreakdown {
  const counts = emptyTierCounts();
  const byDataset = new Map<string, DatasetTiers>();
  const texts: string[] = [];
  let unknown = 0;
  let unrecognised = 0;
  const all = readTiers(records);
  for (const rec of all) {
    let d = byDataset.get(rec.datasetId);
    if (d === undefined) {
      d = { datasetId: rec.datasetId, datasetName: rec.datasetName, counts: emptyTierCounts(), unknown: 0, total: 0 };
      byDataset.set(rec.datasetId, d);
    }
    d.total += 1;
    if (rec.read.kind === 'tier') {
      counts[rec.read.tier] += 1;
      d.counts[rec.read.tier] += 1;
      continue;
    }
    unknown += 1;
    d.unknown += 1;
    if (rec.read.kind === 'unrecognised') {
      unrecognised += 1;
      if (!texts.includes(rec.read.text) && texts.length < MAX_UNRECOGNISED_SHOWN) texts.push(rec.read.text);
    }
  }
  return { counts, unknown, unrecognised, unrecognisedTexts: texts, total: all.length, known: all.length - unknown, datasets: [...byDataset.values()] };
}

/** The tiers that at least one record states, in the fixed tier order. */
export function tiersInUse(b: TierBreakdown): TierId[] {
  return TIER_IDS.filter((id) => b.counts[id] > 0);
}

type Key =
  | 'tr.title'
  | 'tr.intro'
  | 'tr.none'
  | 'tr.caption'
  | 'tr.colTier'
  | 'tr.colMeaning'
  | 'tr.colCount'
  | 'tr.label'
  | 'tr.m.0'
  | 'tr.m.1'
  | 'tr.m.2'
  | 'tr.m.3'
  | 'tr.m.4'
  | 'tr.m.E'
  | 'tr.m.unknown'
  | 'tr.summary'
  | 'tr.unrecognised.one'
  | 'tr.unrecognised.other'
  | 'tr.dsCaption'
  | 'tr.colDataset'
  | 'tr.list.join';

const MESSAGES: Messages<Key> = {
  en: {
    'tr.title': 'Tier of each record',
    'tr.intro': 'Each record is counted once under the tier written on it. A record with no tier, or with text that is not a tier, is counted as Unknown.',
    'tr.none': 'There are no records to count.',
    'tr.caption': 'Records by tier',
    'tr.colTier': 'Tier',
    'tr.colMeaning': 'What the tier means',
    'tr.colCount': 'Records',
    'tr.label': 'Tier {tier}',
    'tr.m.0': 'Open data or another import. Not measured by this app.',
    'tr.m.1': 'Reported by a venue or operator. Not measured by this app.',
    'tr.m.2': 'Report from a peer.',
    'tr.m.3': 'Recorded on site by a trained person, with evidence.',
    'tr.m.4': 'Feed from an operator that changes through the day.',
    'tr.m.E': 'Checked at a desk against a published page.',
    'tr.m.unknown': 'The record does not state a tier.',
    'tr.summary': 'Records that state a tier: {known} of {total}.',
    'tr.unrecognised.one': '{n} record has text in place of a tier that is not a tier: {list}.',
    'tr.unrecognised.other': '{n} records have text in place of a tier that is not a tier: {list}.',
    'tr.dsCaption': 'Records by tier, for each dataset',
    'tr.colDataset': 'Dataset',
    'tr.list.join': ', ',
  },
  fr: {
    'tr.title': 'Niveau de chaque enregistrement',
    'tr.intro': 'Chaque enregistrement est compté une seule fois sous le niveau qui y est inscrit. Un enregistrement sans niveau, ou dont le texte n’est pas un niveau, est compté comme inconnu.',
    'tr.none': 'Il n’y a aucun enregistrement à compter.',
    'tr.caption': 'Enregistrements selon le niveau',
    'tr.colTier': 'Niveau',
    'tr.colMeaning': 'Ce que le niveau signifie',
    'tr.colCount': 'Enregistrements',
    'tr.label': 'Niveau {tier}',
    'tr.m.0': 'Données ouvertes ou autre importation. Non mesuré par cette application.',
    'tr.m.1': 'Déclaré par un lieu ou un exploitant. Non mesuré par cette application.',
    'tr.m.2': 'Signalement par un pair.',
    'tr.m.3': 'Relevé sur place par une personne formée, avec des preuves.',
    'tr.m.4': 'Flux d’un exploitant qui change au fil de la journée.',
    'tr.m.E': 'Contrôle au bureau à partir d’une page publiée.',
    'tr.m.unknown': 'L’enregistrement n’indique aucun niveau.',
    'tr.summary': 'Enregistrements qui indiquent un niveau\u00A0: {known} sur {total}.',
    'tr.unrecognised.one': '{n} enregistrement contient, à la place du niveau, un texte qui n’est pas un niveau\u00A0: {list}.',
    'tr.unrecognised.other': '{n} enregistrements contiennent, à la place du niveau, un texte qui n’est pas un niveau\u00A0: {list}.',
    'tr.dsCaption': 'Enregistrements selon le niveau, pour chaque jeu de données',
    'tr.colDataset': 'Jeu de données',
    'tr.list.join': ', ',
  },
};

export const TIER_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function tierLabel(tier: TierId | null, locale: Locale): string {
  return tier === null ? t(locale, 'unknown') : tx(locale, 'tr.label', { tier });
}

export function tierMeaning(tier: TierId | null, locale: Locale): string {
  return tx(locale, tier === null ? 'tr.m.unknown' : `tr.m.${tier}`);
}

/** The tier as a short cell value: the id itself, or the word for Unknown. */
export function tierCell(read: TierRead, locale: Locale): string {
  return read.kind === 'tier' ? read.tier : t(locale, 'unknown');
}

export function tierSummary(b: TierBreakdown, locale: Locale): string {
  return tx(locale, 'tr.summary', { known: b.known, total: b.total });
}

export function unrecognisedNote(b: TierBreakdown, locale: Locale): string | null {
  if (b.unrecognised === 0) return null;
  return tx.count(locale, 'tr.unrecognised', b.unrecognised, { list: b.unrecognisedTexts.join(tx(locale, 'tr.list.join')) });
}

export function renderTierBreakdownHtml(b: TierBreakdown, locale: Locale): string {
  const heading = `<h2 id="ds-tiers-title">${escapeHtml(tx(locale, 'tr.title'))}</h2>`;
  if (b.total === 0) return `<section aria-labelledby="ds-tiers-title">${heading}<p>${escapeHtml(tx(locale, 'tr.none'))}</p></section>`;
  const used = tiersInUse(b);
  const row = (tier: TierId | null, count: number) =>
    `<tr><th scope="row">${escapeHtml(tierLabel(tier, locale))}</th><td>${escapeHtml(tierMeaning(tier, locale))}</td><td>${count}</td></tr>`;
  const rows = used.map((id) => row(id, b.counts[id])).join('') + (b.unknown > 0 ? row(null, b.unknown) : '');
  const note = unrecognisedNote(b, locale);
  const dsHead = used.map((id) => `<th scope="col">${escapeHtml(tierLabel(id, locale))}</th>`).join('');
  const dsRows = b.datasets
    .map(
      (d) =>
        `<tr><th scope="row">${escapeHtml(d.datasetName)}</th>${used.map((id) => `<td>${d.counts[id]}</td>`).join('')}<td>${d.unknown}</td></tr>`,
    )
    .join('');
  return (
    `<section aria-labelledby="ds-tiers-title">${heading}<p>${escapeHtml(tx(locale, 'tr.intro'))}</p>` +
    `<table><caption>${escapeHtml(tx(locale, 'tr.caption'))}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(tx(locale, 'tr.colTier'))}</th><th scope="col">${escapeHtml(tx(locale, 'tr.colMeaning'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'tr.colCount'))}</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p>${escapeHtml(tierSummary(b, locale))}</p>` +
    (note === null ? '' : `<p>${escapeHtml(note)}</p>`) +
    `<table><caption>${escapeHtml(tx(locale, 'tr.dsCaption'))}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(tx(locale, 'tr.colDataset'))}</th>${dsHead}<th scope="col">${escapeHtml(t(locale, 'unknown'))}</th></tr></thead>` +
    `<tbody>${dsRows}</tbody></table></section>`
  );
}
