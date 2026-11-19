/**
 * The facts behind one row of the source list, set out as terms and values: what kind of data it
 * is, the licence type, what its tier means, why it has its status, when it is due for review,
 * which facts are unknown and what there is to do. It restates the audit and adds nothing to it.
 */
import type { AuditedSource, Finding, FindingCode } from './datasetRegistry';
import { findingRank } from './datasetRegistry';
import { licenceKind, type Locale } from './dataStatus';
import { daysUntilReview, GAP_FIELDS, hasGap } from './filters';
import { t } from './i18n';
import { kindLabel } from './licenceBreakdown';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { factLabel } from './recordFacts';
import { FINDING_CODES, remedyTitle } from './remedies';
import { addDaysIso } from './reviewDue';
import { escapeHtml } from './sourceList';
import { explainStatus } from './statusBasis';
import { tierMeaning } from './tiers';

export interface RowDetailPair {
  id: 'kind' | 'licenceType' | 'tier' | 'basis' | 'review' | 'gaps' | 'todo';
  term: string;
  value: string;
}

export interface RowDetail {
  pairs: RowDetailPair[];
}

/** The review date (YYYY-MM-DD) for a source with a usable retrieved date; null otherwise. */
export function reviewDateIso(s: AuditedSource): string | null {
  if (s.retrievedIso === null || s.state === 'unknown') return null;
  return addDaysIso(s.retrievedIso, s.limitDays);
}

/** The finding codes for one source, most urgent first, without repeats. */
export function findingCodesFor(s: AuditedSource, findings: readonly Finding[]): FindingCode[] {
  const codes = new Set<FindingCode>();
  for (const f of findings) if (f.datasetId === s.datasetId && f.sourceId === s.sourceId) codes.add(f.code);
  return [...codes].sort((a, b) => findingRank(a) - findingRank(b) || FINDING_CODES.indexOf(a) - FINDING_CODES.indexOf(b));
}

type Key =
  | 'rd.kind'
  | 'rd.licenceType'
  | 'rd.tier'
  | 'rd.basis'
  | 'rd.review'
  | 'rd.gaps'
  | 'rd.todo'
  | 'rd.none'
  | 'rd.join'
  | 'rd.tierValue'
  | 'rd.review.unknown'
  | 'rd.review.today'
  | 'rd.review.ahead.one'
  | 'rd.review.ahead.other'
  | 'rd.review.past.one'
  | 'rd.review.past.other'
  | 'rd.toggle'
  | 'rd.saidOn'
  | 'rd.saidOff';

const MESSAGES: Messages<Key> = {
  en: {
    'rd.kind': 'Kind of data',
    'rd.licenceType': 'Licence type',
    'rd.tier': 'Tier',
    'rd.basis': 'Why it has this status',
    'rd.review': 'Review date',
    'rd.gaps': 'Unknown facts',
    'rd.todo': 'To do',
    'rd.none': 'None',
    'rd.join': ', ',
    'rd.tierValue': '{tier}. {meaning}',
    'rd.review.unknown': 'Not scheduled, because the retrieved date is unknown.',
    'rd.review.today': '{date} (today)',
    'rd.review.ahead.one': '{date} (in {n} day)',
    'rd.review.ahead.other': '{date} (in {n} days)',
    'rd.review.past.one': '{date} ({n} day ago)',
    'rd.review.past.other': '{date} ({n} days ago)',
    'rd.toggle': 'Show details under each source',
    'rd.saidOn': 'Details are shown under each source.',
    'rd.saidOff': 'Details are hidden.',
  },
  fr: {
    'rd.kind': 'Type de données',
    'rd.licenceType': 'Type de licence',
    'rd.tier': 'Niveau',
    'rd.basis': 'Raison de cet état',
    'rd.review': 'Date de révision',
    'rd.gaps': 'Éléments inconnus',
    'rd.todo': 'À faire',
    'rd.none': 'Aucun',
    'rd.join': ', ',
    'rd.tierValue': '{tier}. {meaning}',
    'rd.review.unknown': 'Non planifiée, car la date de récupération est inconnue.',
    'rd.review.today': '{date} (aujourd’hui)',
    'rd.review.ahead.one': '{date} (dans {n} jour)',
    'rd.review.ahead.other': '{date} (dans {n} jours)',
    'rd.review.past.one': '{date} (il y a {n} jour)',
    'rd.review.past.other': '{date} (il y a {n} jours)',
    'rd.toggle': 'Afficher les détails sous chaque source',
    'rd.saidOn': 'Les détails sont affichés sous chaque source.',
    'rd.saidOff': 'Les détails sont masqués.',
  },
};

export const ROW_DETAIL_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** The review date in words, with how far away it is; says so when nothing is scheduled. */
export function reviewText(s: AuditedSource, locale: Locale): string {
  const iso = reviewDateIso(s);
  const days = daysUntilReview(s);
  if (iso === null || days === null) return tx(locale, 'rd.review.unknown');
  const date = formatDisplayDate(iso, locale);
  if (days === 0) return tx(locale, 'rd.review.today', { date });
  return days > 0 ? tx.count(locale, 'rd.review.ahead', days, { date }) : tx.count(locale, 'rd.review.past', -days, { date });
}

export function buildRowDetail(s: AuditedSource, findings: readonly Finding[], locale: Locale): RowDetail {
  const none = tx(locale, 'rd.none');
  const join = tx(locale, 'rd.join');
  const gaps = GAP_FIELDS.filter((g) => hasGap(s, g)).map((g) => factLabel(g, locale));
  const todo = findingCodesFor(s, findings).map((c) => remedyTitle(c, locale));
  const basis = explainStatus({ state: s.state, ageDays: s.ageDays, retrievedIso: s.retrievedIso, limitDays: s.limitDays, issues: s.issues, kind: s.kind }, locale).text;
  return {
    pairs: [
      { id: 'kind', term: tx(locale, 'rd.kind'), value: t(locale, `kind.${s.kind}`) },
      { id: 'licenceType', term: tx(locale, 'rd.licenceType'), value: kindLabel(licenceKind(s.licence), locale) },
      { id: 'tier', term: tx(locale, 'rd.tier'), value: s.tier === null ? tierMeaning(null, locale) : tx(locale, 'rd.tierValue', { tier: s.tier, meaning: tierMeaning(s.tier, locale) }) },
      { id: 'basis', term: tx(locale, 'rd.basis'), value: basis },
      { id: 'review', term: tx(locale, 'rd.review'), value: reviewText(s, locale) },
      { id: 'gaps', term: tx(locale, 'rd.gaps'), value: gaps.length === 0 ? none : gaps.join(join) },
      { id: 'todo', term: tx(locale, 'rd.todo'), value: todo.length === 0 ? none : todo.join(join) },
    ],
  };
}

export function renderRowDetailHtml(detail: RowDetail): string {
  return `<dl data-row-detail="${detail.pairs.length}">${detail.pairs.map((p) => `<dt>${escapeHtml(p.term)}</dt><dd>${escapeHtml(p.value)}</dd>`).join('')}</dl>`;
}

/** What to say when row details are turned on or off. */
export function describeDetails(on: boolean, locale: Locale): string {
  return tx(locale, on ? 'rd.saidOn' : 'rd.saidOff');
}

/** The checkbox that turns row details on. It carries `data-filter="details"`. */
export function renderDetailsToggle(on: boolean, locale: Locale): string {
  return (
    `<div><label style="display:inline-flex;align-items:center;gap:8px;min-height:44px">` +
    `<input type="checkbox" id="ds-f-details" data-filter="details" style="width:24px;height:24px"${on ? ' checked' : ''}>` +
    `${escapeHtml(tx(locale, 'rd.toggle'))}</label></div>`
  );
}
