/**
 * A short plain-text summary of the panel, for pasting into a message or a ticket: how many
 * records there are, their status, the licences and tiers in use, and how many records carry a
 * source, a licence, a retrieved date and a tier. It restates the audit; it never changes it.
 */
import type { AuditResult, DatasetRecord } from './datasetRegistry';
import type { FreshnessState, Locale } from './dataStatus';
import { glanceSentences } from './glance';
import { t } from './i18n';
import { buildLicenceBreakdown, kindLabel, licenceDisplay } from './licenceBreakdown';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { buildRecordFacts, FACT_FIELDS, factLabel, factsSummary } from './recordFacts';
import { buildTierBreakdown, tierLabel, tiersInUse, tierSummary } from './tiers';

type Key = 'ts.title' | 'ts.asOf' | 'ts.status' | 'ts.licences' | 'ts.tiers' | 'ts.facts' | 'ts.line' | 'ts.lineDetail' | 'ts.unknownOn' | 'ts.none';

const MESSAGES: Messages<Key> = {
  en: {
    'ts.title': 'Data status summary',
    'ts.asOf': 'As of {date}',
    'ts.status': 'Status',
    'ts.licences': 'Licences',
    'ts.tiers': 'Tiers',
    'ts.facts': 'Source, licence, date and tier',
    'ts.line': '- {label}: {n}',
    'ts.lineDetail': '- {label}: {n} ({detail})',
    'ts.unknownOn': '- {label}: UNKNOWN on {n}',
    'ts.none': 'There are no records.',
  },
  fr: {
    'ts.title': 'Résumé de l’état des données',
    'ts.asOf': 'En date du {date}',
    'ts.status': 'État',
    'ts.licences': 'Licences',
    'ts.tiers': 'Niveaux',
    'ts.facts': 'Source, licence, date et niveau',
    'ts.line': '- {label}\u00A0: {n}',
    'ts.lineDetail': '- {label}\u00A0: {n} ({detail})',
    'ts.unknownOn': '- {label}\u00A0: UNKNOWN pour {n}',
    'ts.none': 'Il n’y a aucun enregistrement.',
  },
};

export const TEXT_SUMMARY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const STATES: readonly FreshnessState[] = ['fresh', 'stale', 'unknown'];

export function stateCounts(audit: AuditResult): Record<FreshnessState, number> {
  const counts: Record<FreshnessState, number> = { fresh: 0, stale: 0, unknown: 0 };
  for (const s of audit.sources) counts[s.state] += 1;
  return counts;
}

/** The summary as lines of text, without line endings. */
export function buildTextSummaryLines(records: readonly DatasetRecord[], audit: AuditResult, now: Date, locale: Locale): string[] {
  const lines: string[] = [tx(locale, 'ts.title'), tx(locale, 'ts.asOf', { date: formatDisplayDate(now.toISOString(), locale) }), ''];
  if (audit.sources.length === 0) return [...lines, tx(locale, 'ts.none')];
  lines.push(...glanceSentences(audit, locale), '');

  const states = stateCounts(audit);
  lines.push(tx(locale, 'ts.status'));
  for (const s of STATES) lines.push(tx(locale, 'ts.line', { label: t(locale, `state.${s}`), n: states[s] }));
  lines.push('');

  lines.push(tx(locale, 'ts.licences'));
  for (const r of buildLicenceBreakdown(audit).rows) {
    lines.push(tx(locale, 'ts.lineDetail', { label: licenceDisplay(r.licence, locale), n: r.count, detail: kindLabel(r.kind, locale) }));
  }
  lines.push('');

  const tiers = buildTierBreakdown(records);
  lines.push(tx(locale, 'ts.tiers'));
  for (const id of tiersInUse(tiers)) lines.push(tx(locale, 'ts.line', { label: tierLabel(id, locale), n: tiers.counts[id] }));
  if (tiers.unknown > 0) lines.push(tx(locale, 'ts.line', { label: tierLabel(null, locale), n: tiers.unknown }));
  lines.push(tierSummary(tiers, locale), '');

  const facts = buildRecordFacts(records, audit, 0);
  lines.push(tx(locale, 'ts.facts'), factsSummary(facts, locale));
  for (const f of FACT_FIELDS) lines.push(tx(locale, 'ts.unknownOn', { label: factLabel(f, locale), n: facts.missingBy[f] }));
  return lines;
}

/** The summary as one text, with a line feed after every line. Control characters in names are removed. */
export function buildTextSummary(records: readonly DatasetRecord[], audit: AuditResult, now: Date, locale: Locale): string {
  return (
    buildTextSummaryLines(records, audit, now, locale)
      .map((l) => l.replace(/[\p{Cc}\u2028\u2029]+/gu, ' '))
      .join('\n') + '\n'
  );
}
