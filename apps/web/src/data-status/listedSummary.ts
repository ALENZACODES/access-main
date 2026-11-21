/**
 * A one-line summary of the sources the filters currently list: how many may be out of date,
 * how many have no usable date, how many have no tier, and how many have a licence to review.
 * It is counted from the listed sources themselves, so it always matches the table under it.
 */
import type { AuditedSource } from './datasetRegistry';
import { licenceKind, type Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export interface ListedSummary {
  listed: number;
  stale: number;
  undated: number;
  noTier: number;
  /** Licence missing or not on the reference list. */
  licenceToReview: number;
}

export function buildListedSummary(listed: readonly AuditedSource[]): ListedSummary {
  const out: ListedSummary = { listed: listed.length, stale: 0, undated: 0, noTier: 0, licenceToReview: 0 };
  for (const s of listed) {
    if (s.state === 'stale') out.stale += 1;
    if (s.state === 'unknown') out.undated += 1;
    if (s.tier === null) out.noTier += 1;
    const kind = licenceKind(s.licence);
    if (kind === 'unknown' || kind === 'unrecognised') out.licenceToReview += 1;
  }
  return out;
}

type Part = 'stale' | 'undated' | 'noTier' | 'licence';
type Key = 'ls.lead' | 'ls.clear' | 'ls.join' | `ls.${Part}.one` | `ls.${Part}.other`;

const MESSAGES: Messages<Key> = {
  en: {
    'ls.lead': 'In this list: {list}.',
    'ls.clear': 'In this list, every source has a usable date, a tier and a licence on the reference list, and none is past its review period.',
    'ls.join': ', ',
    'ls.stale.one': '{n} possibly out of date',
    'ls.stale.other': '{n} possibly out of date',
    'ls.undated.one': '{n} with no usable date',
    'ls.undated.other': '{n} with no usable date',
    'ls.noTier.one': '{n} with no tier',
    'ls.noTier.other': '{n} with no tier',
    'ls.licence.one': '{n} with a licence to review',
    'ls.licence.other': '{n} with a licence to review',
  },
  fr: {
    'ls.lead': 'Dans cette liste : {list}.',
    'ls.clear': 'Dans cette liste, chaque source a une date utilisable, un niveau et une licence de la liste de référence, et aucune n’a dépassé sa période de révision.',
    'ls.join': ', ',
    'ls.stale.one': '{n} possiblement périmée',
    'ls.stale.other': '{n} possiblement périmées',
    'ls.undated.one': '{n} sans date utilisable',
    'ls.undated.other': '{n} sans date utilisable',
    'ls.noTier.one': '{n} sans niveau',
    'ls.noTier.other': '{n} sans niveau',
    'ls.licence.one': '{n} dont la licence est à examiner',
    'ls.licence.other': '{n} dont la licence est à examiner',
  },
};

export const LISTED_SUMMARY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** The sentence for a summary; null when nothing is listed. */
export function listedSummaryText(s: ListedSummary, locale: Locale): string | null {
  if (s.listed === 0) return null;
  const parts: string[] = [];
  const add = (part: Part, n: number) => {
    if (n > 0) parts.push(tx.count(locale, `ls.${part}`, n));
  };
  add('stale', s.stale);
  add('undated', s.undated);
  add('noTier', s.noTier);
  add('licence', s.licenceToReview);
  return parts.length === 0 ? tx(locale, 'ls.clear') : tx(locale, 'ls.lead', { list: parts.join(tx(locale, 'ls.join')) });
}

export function renderListedSummaryHtml(s: ListedSummary, locale: Locale): string {
  const text = listedSummaryText(s, locale);
  return text === null ? '' : `<p data-listed-summary="${s.listed}">${escapeHtml(text)}</p>`;
}
