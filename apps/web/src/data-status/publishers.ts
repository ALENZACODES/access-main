/**
 * The sources grouped by who published them. A publisher is the text recorded as the source of
 * a record, compared without regard to case, accents or spacing, so "City of X" and "city of x"
 * are one publisher. For each one this shows how many sources and datasets it has, the licence
 * types in use, the oldest retrieved date and the next review date. Sources with no publisher
 * recorded are counted together under UNKNOWN. Nothing is inferred about a publisher.
 */
import type { AuditedSource, AuditResult, DatasetRecord } from './datasetRegistry';
import { licenceKind, type LicenceKind, type Locale } from './dataStatus';
import { daysUntilReview, FILTER_LICENCE_KINDS } from './filters';
import { kindLabel } from './licenceBreakdown';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { reviewDateIso } from './rowDetail';
import { foldText } from './searchText';
import { escapeHtml } from './sourceList';
import { cleanValue } from './unknownTokens';
import { UNKNOWN_WORD } from './unknownWord';

export const MAX_PUBLISHERS = 25;

export interface Publisher {
  /** The compared spelling; '' for sources with no publisher recorded. */
  key: string;
  /** The first spelling met, as recorded; null for the UNKNOWN row. */
  name: string | null;
  /** Other spellings recorded for the same publisher, in the order met. */
  spellings: string[];
  sources: AuditedSource[];
  /** Dataset names, in the order met. */
  datasets: string[];
  licences: Record<LicenceKind, number>;
  stale: number;
  /** YYYY-MM-DD of the oldest usable retrieved date; null when none of its sources has one. */
  oldestIso: string | null;
  /** YYYY-MM-DD of the next review date that has not passed; null when there is none. */
  nextReviewIso: string | null;
}

export interface Publishers {
  publishers: Publisher[];
  /** How many publishers there are, before the limit, not counting the UNKNOWN row. */
  named: number;
  /** Sources with no publisher recorded. */
  unknown: number;
  sourceCount: number;
}

const SEP = '\u0000';

/** The publisher text for each record, as recorded, keyed by dataset and record id (the first one wins). */
export function publisherTexts(records: readonly DatasetRecord[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const r of records) {
    for (const s of r.sources) {
      const k = `${r.id}${SEP}${s.id}`;
      if (!m.has(k)) m.set(k, cleanValue(s.source));
    }
  }
  return m;
}

/** One spelling for a publisher: folded, with punctuation and repeated spaces dropped. */
export function publisherKey(name: string | null): string {
  return name === null ? '' : foldText(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Publishers with the most sources first, then by name; the UNKNOWN row always last. */
export function buildPublishers(records: readonly DatasetRecord[], audit: AuditResult, limit: number = MAX_PUBLISHERS): Publishers {
  const texts = publisherTexts(records);
  const byKey = new Map<string, Publisher>();
  for (const s of audit.sources) {
    const text = texts.get(`${s.datasetId}${SEP}${s.sourceId}`) ?? null;
    const key = publisherKey(text);
    let p = byKey.get(key);
    if (p === undefined) {
      p = { key, name: key === '' ? null : text, spellings: [], sources: [], datasets: [], licences: { open: 0, terms: 0, unrecognised: 0, unknown: 0 }, stale: 0, oldestIso: null, nextReviewIso: null };
      byKey.set(key, p);
    } else if (text !== null && key !== '' && text !== p.name && !p.spellings.includes(text)) p.spellings.push(text);
    p.sources.push(s);
    const dataset = s.datasetName.trim() === '' ? s.datasetId : s.datasetName;
    if (!p.datasets.includes(dataset)) p.datasets.push(dataset);
    p.licences[licenceKind(s.licence)] += 1;
    if (s.state === 'stale') p.stale += 1;
    if (s.state !== 'unknown' && s.retrievedIso !== null && (p.oldestIso === null || s.retrievedIso < p.oldestIso)) p.oldestIso = s.retrievedIso;
    const days = daysUntilReview(s);
    const review = reviewDateIso(s);
    if (days !== null && days >= 0 && review !== null && (p.nextReviewIso === null || review < p.nextReviewIso)) p.nextReviewIso = review;
  }
  const unknownRow = byKey.get('');
  const named = [...byKey.values()].filter((p) => p.key !== '').sort((a, b) => b.sources.length - a.sources.length || a.key.localeCompare(b.key));
  const shown = named.slice(0, Math.max(0, Math.trunc(limit)));
  return { publishers: unknownRow ? [...shown, unknownRow] : shown, named: named.length, unknown: unknownRow?.sources.length ?? 0, sourceCount: audit.sources.length };
}

type Key =
  | 'pb.title'
  | 'pb.intro'
  | 'pb.none'
  | 'pb.caption'
  | 'pb.colPublisher'
  | 'pb.colSources'
  | 'pb.colDatasets'
  | 'pb.colLicences'
  | 'pb.colOldest'
  | 'pb.colReview'
  | 'pb.pair'
  | 'pb.join'
  | 'pb.also'
  | 'pb.noReview'
  | 'pb.summary.one'
  | 'pb.summary.other'
  | 'pb.unknown.one'
  | 'pb.unknown.other'
  | 'pb.more.one'
  | 'pb.more.other'
  | 'pb.stale.one'
  | 'pb.stale.other';

const MESSAGES: Messages<Key> = {
  en: {
    'pb.title': 'Sources by publisher',
    'pb.intro': 'A publisher is the name recorded as the source of a record. Names that differ only in capitals, accents or punctuation are counted as one.',
    'pb.none': 'There are no sources to group.',
    'pb.caption': 'Publishers, with the most sources first',
    'pb.colPublisher': 'Publisher',
    'pb.colSources': 'Sources',
    'pb.colDatasets': 'Datasets',
    'pb.colLicences': 'Licence types',
    'pb.colOldest': 'Oldest retrieved date',
    'pb.colReview': 'Next review date',
    'pb.pair': '{label}: {count}',
    'pb.join': '; ',
    'pb.also': 'Also written: {list}',
    'pb.noReview': 'None coming up',
    'pb.summary.one': '{n} publisher is recorded.',
    'pb.summary.other': '{n} publishers are recorded.',
    'pb.unknown.one': '{n} source has no publisher recorded.',
    'pb.unknown.other': '{n} sources have no publisher recorded.',
    'pb.more.one': '{n} more publisher is not shown here.',
    'pb.more.other': '{n} more publishers are not shown here.',
    'pb.stale.one': '{n} may be out of date',
    'pb.stale.other': '{n} may be out of date',
  },
  fr: {
    'pb.title': 'Sources par diffuseur',
    'pb.intro': 'Un diffuseur est le nom consigné comme source d’un enregistrement. Les noms qui ne diffèrent que par les majuscules, les accents ou la ponctuation sont comptés comme un seul.',
    'pb.none': 'Il n’y a aucune source à regrouper.',
    'pb.caption': 'Diffuseurs, en commençant par ceux qui ont le plus de sources',
    'pb.colPublisher': 'Diffuseur',
    'pb.colSources': 'Sources',
    'pb.colDatasets': 'Jeux de données',
    'pb.colLicences': 'Types de licence',
    'pb.colOldest': 'Date de récupération la plus ancienne',
    'pb.colReview': 'Prochaine date de révision',
    'pb.pair': '{label}\u00A0: {count}',
    'pb.join': '\u202F; ',
    'pb.also': 'Aussi écrit\u00A0: {list}',
    'pb.noReview': 'Aucune à venir',
    'pb.summary.one': '{n} diffuseur est consigné.',
    'pb.summary.other': '{n} diffuseurs sont consignés.',
    'pb.unknown.one': '{n} source n’a aucun diffuseur consigné.',
    'pb.unknown.other': '{n} sources n’ont aucun diffuseur consigné.',
    'pb.more.one': '{n} autre diffuseur n’est pas présenté ici.',
    'pb.more.other': '{n} autres diffuseurs ne sont pas présentés ici.',
    'pb.stale.one': '{n} possiblement périmée',
    'pb.stale.other': '{n} possiblement périmées',
  },
};

export const PUBLISHER_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function publisherName(p: Publisher): string {
  return p.name ?? UNKNOWN_WORD;
}

/** "Open licence: 2; UNKNOWN: 1", leaving out the types with no source. */
export function publisherLicenceText(p: Publisher, locale: Locale): string {
  return FILTER_LICENCE_KINDS.filter((k) => p.licences[k] > 0)
    .map((k) => tx(locale, 'pb.pair', { label: kindLabel(k, locale), count: p.licences[k] }))
    .join(tx(locale, 'pb.join'));
}

/** The number of sources, with how many may be out of date when any is. */
export function publisherCountText(p: Publisher, locale: Locale): string {
  return p.stale === 0 ? String(p.sources.length) : `${p.sources.length} (${tx.count(locale, 'pb.stale', p.stale)})`;
}

/** The counts in sentences. Empty when there is no source. */
export function publishersSummary(d: Publishers, locale: Locale): string[] {
  if (d.sourceCount === 0) return [];
  const out = [tx.count(locale, 'pb.summary', d.named)];
  if (d.unknown > 0) out.push(tx.count(locale, 'pb.unknown', d.unknown));
  const shown = d.publishers.filter((p) => p.key !== '').length;
  if (d.named > shown) out.push(tx.count(locale, 'pb.more', d.named - shown));
  return out;
}

/** The table as rows of text: a heading row, then one row per publisher shown. */
export function publisherRows(d: Publishers, locale: Locale): string[][] {
  const head = (['pb.colPublisher', 'pb.colSources', 'pb.colDatasets', 'pb.colLicences', 'pb.colOldest', 'pb.colReview'] as const).map((k) => tx(locale, k));
  return [
    head,
    ...d.publishers.map((p) => [
      publisherName(p),
      publisherCountText(p, locale),
      p.datasets.join(tx(locale, 'pb.join')),
      publisherLicenceText(p, locale),
      p.oldestIso === null ? UNKNOWN_WORD : formatDisplayDate(p.oldestIso, locale),
      p.nextReviewIso === null ? tx(locale, 'pb.noReview') : formatDisplayDate(p.nextReviewIso, locale),
    ]),
  ];
}

export function renderPublishersHtml(d: Publishers, locale: Locale): string {
  const open = `<section aria-labelledby="ds-publishers-title" data-publishers="${d.named}"><h2 id="ds-publishers-title">${escapeHtml(tx(locale, 'pb.title'))}</h2>`;
  if (d.sourceCount === 0) return `${open}<p>${escapeHtml(tx(locale, 'pb.none'))}</p></section>`;
  const [head, ...rows] = publisherRows(d, locale);
  const heads = (head ?? []).map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((r, i) => {
      const p = d.publishers[i];
      const also = p && p.spellings.length > 0 ? `<br><small>${escapeHtml(tx(locale, 'pb.also', { list: p.spellings.join(tx(locale, 'pb.join')) }))}</small>` : '';
      const cells = r
        .slice(1)
        .map((c) => `<td>${escapeHtml(c)}</td>`)
        .join('');
      return `<tr><th scope="row">${escapeHtml(r[0] ?? '')}${also}</th>${cells}</tr>`;
    })
    .join('');
  const summary = publishersSummary(d, locale)
    .map((s) => `<p>${escapeHtml(s)}</p>`)
    .join('');
  return (
    `${open}<p>${escapeHtml(tx(locale, 'pb.intro'))}</p>${summary}` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${escapeHtml(tx(locale, 'pb.caption'))}"><table><caption>${escapeHtml(tx(locale, 'pb.caption'))}</caption>` +
    `<thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></section>`
  );
}
