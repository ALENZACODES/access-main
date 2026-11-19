/**
 * Items to review, source by source: for each source that has a finding, a collapsible card with
 * what is recorded about it, why it has its status, and the next step for each of its findings.
 * It restates the audit and the step texts; it never changes a value.
 */
import type { AuditResult, AuditedSource, Finding, FindingCode } from './datasetRegistry';
import { findingRank } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { FINDING_CODES, remedyStep, remedyTitle } from './remedies';
import { escapeHtml } from './sourceList';
import { explainStatus } from './statusBasis';
import { t } from './i18n';

export const MAX_DETAILS = 25;

export interface SourceDetail {
  source: AuditedSource;
  /** Finding codes for this source, most urgent first, without repeats. */
  codes: FindingCode[];
}

export interface SourceDetails {
  items: SourceDetail[];
  /** Sources with findings that are not in `items` because of the limit. */
  hidden: number;
}

function sourceKey(datasetId: string, sourceId: string | null): string {
  return `${datasetId}\u0000${sourceId ?? ''}`;
}

export function buildSourceDetails(audit: AuditResult, limit: number = MAX_DETAILS): SourceDetails {
  const byKey = new Map<string, Finding[]>();
  for (const f of audit.findings) {
    if (f.sourceId === null) continue;
    const k = sourceKey(f.datasetId, f.sourceId);
    const list = byKey.get(k);
    if (list === undefined) byKey.set(k, [f]);
    else list.push(f);
  }
  const all: SourceDetail[] = [];
  const done = new Set<string>();
  for (const s of audit.sources) {
    const k = sourceKey(s.datasetId, s.sourceId);
    const findings = byKey.get(k);
    if (findings === undefined || done.has(k)) continue;
    done.add(k);
    const codes = [...new Set(findings.map((f) => f.code))].sort(
      (a, b) => findingRank(a) - findingRank(b) || FINDING_CODES.indexOf(a) - FINDING_CODES.indexOf(b),
    );
    all.push({ source: s, codes });
  }
  all.sort(
    (a, b) =>
      findingRank(a.codes[0] ?? 'stale') - findingRank(b.codes[0] ?? 'stale') ||
      b.codes.length - a.codes.length ||
      a.source.datasetName.localeCompare(b.source.datasetName) ||
      a.source.sourceId.localeCompare(b.source.sourceId),
  );
  const cap = Math.max(0, Math.trunc(limit));
  return { items: all.slice(0, cap), hidden: Math.max(0, all.length - cap) };
}

type Key =
  | 'sd.title'
  | 'sd.intro'
  | 'sd.none'
  | 'sd.more.one'
  | 'sd.more.other'
  | 'sd.items.one'
  | 'sd.items.other'
  | 'sd.licence'
  | 'sd.retrieved'
  | 'sd.status'
  | 'sd.steps'
  | 'sd.link';

const MESSAGES: Messages<Key> = {
  en: {
    'sd.title': 'Items to review, source by source',
    'sd.intro': 'Open a source to see what is recorded and the next step for each item.',
    'sd.none': 'No source has an item to review.',
    'sd.more.one': '{n} more source with items to review is not listed.',
    'sd.more.other': '{n} more sources with items to review are not listed.',
    'sd.items.one': '{n} item',
    'sd.items.other': '{n} items',
    'sd.licence': 'Licence',
    'sd.retrieved': 'Retrieved',
    'sd.status': 'Status',
    'sd.steps': 'Next steps',
    'sd.link': 'Source page',
  },
  fr: {
    'sd.title': 'Éléments à examiner, source par source',
    'sd.intro': 'Ouvrez une source pour voir ce qui est enregistré et la prochaine étape pour chaque élément.',
    'sd.none': 'Aucune source n’a d’élément à examiner.',
    'sd.more.one': '{n} autre source ayant des éléments à examiner n’est pas affichée.',
    'sd.more.other': '{n} autres sources ayant des éléments à examiner ne sont pas affichées.',
    'sd.items.one': '{n} élément',
    'sd.items.other': '{n} éléments',
    'sd.licence': 'Licence',
    'sd.retrieved': 'Récupération',
    'sd.status': 'État',
    'sd.steps': 'Prochaines étapes',
    'sd.link': 'Page de la source',
  },
};

export const SOURCE_DETAIL_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const SUMMARY_STYLE = 'display:flex;align-items:center;min-height:44px;cursor:pointer';

function displayName(d: SourceDetail): string {
  const s = d.source;
  return `${s.datasetName} / ${s.name ?? s.sourceId}`;
}

function renderOne(d: SourceDetail, locale: Locale): string {
  const s = d.source;
  const basis = explainStatus({ state: s.state, ageDays: s.ageDays, retrievedIso: s.retrievedIso, limitDays: s.limitDays, issues: s.issues, kind: s.kind }, locale).text;
  const link = s.url === null ? '' : `<dt>${escapeHtml(tx(locale, 'sd.link'))}</dt><dd><a href="${escapeHtml(s.url)}" rel="noopener noreferrer" style="display:inline-flex;align-items:center;min-height:44px;min-width:44px">${escapeHtml(s.url)}</a></dd>`;
  return (
    `<details><summary style="${SUMMARY_STYLE}">${escapeHtml(displayName(d))} (${escapeHtml(tx.count(locale, 'sd.items', d.codes.length))})</summary>` +
    `<dl><dt>${escapeHtml(tx(locale, 'sd.licence'))}</dt><dd>${escapeHtml(s.licence ?? t(locale, 'unknown'))}</dd>` +
    `<dt>${escapeHtml(tx(locale, 'sd.retrieved'))}</dt><dd>${escapeHtml(s.retrievedIso === null ? t(locale, 'unknown') : formatDisplayDate(s.retrievedIso, locale))}</dd>` +
    `<dt>${escapeHtml(t(locale, 'tbl.tier'))}</dt><dd>${escapeHtml(s.tier ?? t(locale, 'unknown'))}</dd>` +
    `<dt>${escapeHtml(tx(locale, 'sd.status'))}</dt><dd>${escapeHtml(t(locale, `state.${s.state}`))}. ${escapeHtml(basis)}</dd>${link}</dl>` +
    `<h3>${escapeHtml(tx(locale, 'sd.steps'))}</h3><ul>` +
    d.codes.map((c) => `<li><strong>${escapeHtml(remedyTitle(c, locale))}</strong>. ${escapeHtml(remedyStep(c, locale))}</li>`).join('') +
    '</ul></details>'
  );
}

export function renderSourceDetailsHtml(details: SourceDetails, locale: Locale): string {
  const heading = `<h2 id="ds-detail-title">${escapeHtml(tx(locale, 'sd.title'))}</h2>`;
  if (details.items.length === 0) return `<section aria-labelledby="ds-detail-title">${heading}<p>${escapeHtml(tx(locale, 'sd.none'))}</p></section>`;
  return (
    `<section aria-labelledby="ds-detail-title">${heading}<p>${escapeHtml(tx(locale, 'sd.intro'))}</p>` +
    details.items.map((d) => renderOne(d, locale)).join('') +
    (details.hidden > 0 ? `<p>${escapeHtml(tx.count(locale, 'sd.more', details.hidden))}</p>` : '') +
    '</section>'
  );
}
