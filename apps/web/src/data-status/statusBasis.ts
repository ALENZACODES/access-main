/**
 * The stated reason behind every freshness status, so a badge never stands alone.
 * "Within the limit" and "past the limit" always name the retrieved date, the age and the limit;
 * Unknown always says why (no date, unreadable date, or a date in the future).
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import { DATASET_KINDS, type DatasetKind } from './freshnessPolicy';
import { formatDisplayDate } from './locale';
import { pluralCategory } from './plural';
import { escapeHtml } from './sourceList';
import { t, type MessageKey } from './i18n';
import type { Locale } from './dataStatus';

export type BasisCode = 'fresh' | 'stale' | 'missing-date' | 'invalid-date' | 'future-date';

export interface Basis {
  code: BasisCode;
  text: string;
}

/** "1 day" / "180 days" (French: 0 and 1 are singular). */
export function daysText(locale: Locale, n: number): string {
  return t(locale, `basis.days.${pluralCategory(locale, n)}` as MessageKey, { n });
}

/**
 * Why this source has its status. Derived only from the audited values: the code is chosen from
 * the state and the recorded issues, never recomputed from the raw date.
 */
export function basisCode(s: AuditedSource): BasisCode {
  if (s.state === 'fresh') return 'fresh';
  if (s.state === 'stale') return 'stale';
  if (s.issues.includes('future-date')) return 'future-date';
  if (s.issues.includes('invalid-date')) return 'invalid-date';
  return 'missing-date';
}

export function explainSource(s: AuditedSource, locale: Locale): Basis {
  const code = basisCode(s);
  const kind = t(locale, `kind.${s.kind}` as MessageKey);
  if (code === 'fresh' || code === 'stale') {
    // fresh and stale always carry an age; a null here would be a bug in the audit.
    const age = s.ageDays === null ? 0 : s.ageDays;
    const date = s.retrievedIso === null ? '' : formatDisplayDate(s.retrievedIso, locale);
    return { code, text: t(locale, `basis.${code}`, { date, age: daysText(locale, age), limit: daysText(locale, s.limitDays), kind }) };
  }
  if (code === 'future-date') {
    const date = s.retrievedIso === null ? '' : formatDisplayDate(s.retrievedIso, locale);
    return { code, text: t(locale, 'basis.future-date', { date }) };
  }
  return { code, text: t(locale, `basis.${code}` as MessageKey) };
}

/** The stale rule for one dataset type as a sentence. */
export function ruleText(kind: DatasetKind, limitDays: number, locale: Locale): string {
  return t(locale, 'basis.rule', { limit: daysText(locale, limitDays), kind: t(locale, `kind.${kind}` as MessageKey) });
}

/** Limit in force for each dataset type present in the audit (largest dataset order preserved). */
export function limitsInUse(audit: AuditResult): { kind: DatasetKind; days: number }[] {
  const seen = new Map<DatasetKind, number>();
  for (const d of audit.datasets) if (!seen.has(d.kind)) seen.set(d.kind, d.staleAfterDays);
  return DATASET_KINDS.filter((k) => seen.has(k)).map((kind) => ({ kind, days: seen.get(kind) as number }));
}

/** One short rule per dataset type in use, plus the reason for each source that is not within its limit. */
export function renderBasisHtml(audit: AuditResult, locale: Locale): string {
  const title = escapeHtml(t(locale, 'basis.title'));
  const rules = limitsInUse(audit)
    .map((l) => `<li>${escapeHtml(ruleText(l.kind, l.days, locale))}</li>`)
    .join('');
  const colon = locale === 'fr' ? '\u00A0:' : ':';
  const flagged = audit.sources.filter((s) => s.state !== 'fresh');
  const items = flagged
    .map((s) => `<li><strong>${escapeHtml(s.datasetName)} / ${escapeHtml(s.name ?? t(locale, 'unknownName'))}</strong>${colon} ${escapeHtml(explainSource(s, locale).text)}</li>`)
    .join('');
  const body = flagged.length === 0 ? `<p>${escapeHtml(t(locale, 'basis.none'))}</p>` : `<ul>${items}</ul>`;
  return `<section aria-labelledby="ds-basis-title"><h2 id="ds-basis-title">${title}</h2><ul>${rules}</ul>${body}</section>`;
}
