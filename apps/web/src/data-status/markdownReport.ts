/**
 * Markdown copy of the data-status audit, for pasting into an issue or a review note.
 * Every value that came from a record is escaped so a name cannot break the table or add
 * links, headings or HTML. Unknown stays Unknown; nothing is filled in.
 */
import type { AuditResult, AuditedSource, Finding } from './datasetRegistry';
import { findingRank } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { ageDays } from './age';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { t } from './i18n';

export const DEFAULT_ROW_LIMIT = 200;
export const MAX_CELL_LENGTH = 200;

const MD_SPECIALS = /([\\`*_{}[\]()#+!|<>~])/g;

/** Make text safe for one table cell or one inline run: no line breaks, no markup, bounded length. */
export function escapeMarkdown(text: string, max: number = MAX_CELL_LENGTH): string {
  const flat = text.replace(/[\p{Cc}\u2028\u2029]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const cut = flat.length > max ? `${Array.from(flat).slice(0, Math.max(1, max - 1)).join('')}\u2026` : flat;
  return cut.replace(MD_SPECIALS, '\\$1').replace(/^(\d+)\./, '$1\\.').replace(/^-/, '\\-');
}

type Key =
  | 'md.title'
  | 'md.asOf'
  | 'md.totals'
  | 'md.colMeasure'
  | 'md.colValue'
  | 'md.findings'
  | 'md.noFindings'
  | 'md.finding.more.one'
  | 'md.finding.more.other'
  | 'md.sources'
  | 'md.noSources'
  | 'md.colSource'
  | 'md.colDataset'
  | 'md.colLicence'
  | 'md.colRetrieved'
  | 'md.colStatus'
  | 'md.rows.more.one'
  | 'md.rows.more.other'
  | 'md.note'
  | 'md.finding.line'
  | 'md.findingCode.missing-source'
  | 'md.findingCode.missing-licence'
  | 'md.findingCode.licence-unrecognised'
  | 'md.findingCode.missing-date'
  | 'md.findingCode.invalid-date'
  | 'md.findingCode.future-date'
  | 'md.findingCode.stale'
  | 'md.findingCode.no-sources'
  | 'md.findingCode.duplicate-dataset-id'
  | 'md.findingCode.duplicate-source-id'
  | 'md.findingCode.empty-name';

const MESSAGES: Messages<Key> = {
  en: {
    'md.title': 'Data status',
    'md.asOf': 'As of {date}.',
    'md.totals': 'Totals',
    'md.colMeasure': 'Measure',
    'md.colValue': 'Count',
    'md.findings': 'Items to review',
    'md.noFindings': 'No items to review.',
    'md.finding.more.one': '{n} more item is not listed.',
    'md.finding.more.other': '{n} more items are not listed.',
    'md.sources': 'Sources',
    'md.noSources': 'There are no sources.',
    'md.colSource': 'Source',
    'md.colDataset': 'Dataset',
    'md.colLicence': 'Licence',
    'md.colRetrieved': 'Retrieved',
    'md.colStatus': 'Status',
    'md.rows.more.one': '{n} more source is not listed.',
    'md.rows.more.other': '{n} more sources are not listed.',
    'md.note': 'This is a record of what is stored on this device. Unknown means the value is missing or unreadable.',
    'md.finding.line': '{dataset}{source}: {what}',
    'md.findingCode.missing-source': 'source name missing',
    'md.findingCode.missing-licence': 'licence missing',
    'md.findingCode.licence-unrecognised': 'licence not on the reference list',
    'md.findingCode.missing-date': 'retrieved date missing',
    'md.findingCode.invalid-date': 'retrieved date unreadable',
    'md.findingCode.future-date': 'retrieved date is in the future',
    'md.findingCode.stale': 'possibly out of date',
    'md.findingCode.no-sources': 'no sources listed',
    'md.findingCode.duplicate-dataset-id': 'dataset id used more than once',
    'md.findingCode.duplicate-source-id': 'source id used more than once',
    'md.findingCode.empty-name': 'dataset name empty',
  },
  fr: {
    'md.title': 'État des données',
    'md.asOf': 'En date du {date}.',
    'md.totals': 'Totaux',
    'md.colMeasure': 'Mesure',
    'md.colValue': 'Nombre',
    'md.findings': 'Éléments à examiner',
    'md.noFindings': 'Aucun élément à examiner.',
    'md.finding.more.one': '{n} autre élément n’est pas affiché.',
    'md.finding.more.other': '{n} autres éléments ne sont pas affichés.',
    'md.sources': 'Sources',
    'md.noSources': 'Il n’y a aucune source.',
    'md.colSource': 'Source',
    'md.colDataset': 'Jeu de données',
    'md.colLicence': 'Licence',
    'md.colRetrieved': 'Récupération',
    'md.colStatus': 'État',
    'md.rows.more.one': '{n} autre source n’est pas affichée.',
    'md.rows.more.other': '{n} autres sources ne sont pas affichées.',
    'md.note': 'Ceci est un relevé de ce qui est stocké sur cet appareil. Inconnu signifie que la valeur est absente ou illisible.',
    'md.finding.line': '{dataset}{source}\u00A0: {what}',
    'md.findingCode.missing-source': 'nom de la source manquant',
    'md.findingCode.missing-licence': 'licence manquante',
    'md.findingCode.licence-unrecognised': 'licence absente de la liste de référence',
    'md.findingCode.missing-date': 'date de récupération manquante',
    'md.findingCode.invalid-date': 'date de récupération illisible',
    'md.findingCode.future-date': 'date de récupération dans le futur',
    'md.findingCode.stale': 'possiblement périmé',
    'md.findingCode.no-sources': 'aucune source indiquée',
    'md.findingCode.duplicate-dataset-id': 'identifiant de jeu de données utilisé plus d’une fois',
    'md.findingCode.duplicate-source-id': 'identifiant de source utilisé plus d’une fois',
    'md.findingCode.empty-name': 'nom du jeu de données vide',
  },
};

export const MARKDOWN_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [row(head), row(head.map(() => '---')), ...rows.map(row)];
}

function findingLine(f: Finding, locale: Locale): string {
  const dataset = escapeMarkdown(f.datasetName.trim() === '' ? f.datasetId : f.datasetName);
  const source = f.sourceId === null ? '' : ` / ${escapeMarkdown(f.sourceId)}`;
  return `- ${tx(locale, 'md.finding.line', { dataset, source, what: tx(locale, `md.findingCode.${f.code}`) })}`;
}

function sortedFindings(audit: AuditResult): Finding[] {
  return audit.findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => findingRank(a.f.code) - findingRank(b.f.code) || a.i - b.i)
    .map((x) => x.f);
}

function statusText(s: AuditedSource, now: Date, locale: Locale): string {
  const label = t(locale, `state.${s.state}`);
  const days = ageDays(s.retrievedIso, now);
  return days === null ? label : `${label} (${days}\u00A0${locale === 'fr' ? 'j' : 'd'})`;
}

export interface MarkdownOptions {
  rowLimit?: number;
}

export function buildMarkdownReport(audit: AuditResult, now: Date, locale: Locale, opts: MarkdownOptions = {}): string {
  const limit = Math.max(0, Math.trunc(opts.rowLimit ?? DEFAULT_ROW_LIMIT));
  const tot = audit.totals;
  const lines: string[] = [`# ${tx(locale, 'md.title')}`, '', tx(locale, 'md.asOf', { date: formatDisplayDate(now.toISOString().slice(0, 10), locale) }), ''];
  lines.push(`## ${tx(locale, 'md.totals')}`, '');
  lines.push(
    ...table(
      [tx(locale, 'md.colMeasure'), tx(locale, 'md.colValue')],
      [
        [t(locale, 'qa.counts.datasets'), String(tot.datasets)],
        [t(locale, 'qa.counts.sources'), String(tot.sources)],
        [t(locale, 'qa.counts.stale'), String(tot.stale)],
        [t(locale, 'qa.counts.unknownDate'), String(tot.unknownDate)],
        [t(locale, 'qa.counts.notOpen'), String(tot.notOpen)],
        [t(locale, 'qa.counts.missing'), String(tot.missingDetails)],
        [t(locale, 'qa.counts.duplicates'), String(tot.duplicates)],
      ],
    ),
    '',
  );
  lines.push(`## ${tx(locale, 'md.findings')}`, '');
  const findings = sortedFindings(audit);
  if (findings.length === 0) lines.push(tx(locale, 'md.noFindings'));
  else {
    lines.push(...findings.slice(0, limit).map((f) => findingLine(f, locale)));
    if (findings.length > limit) lines.push('', tx.count(locale, 'md.finding.more', findings.length - limit, { n: findings.length - limit }));
  }
  lines.push('', `## ${tx(locale, 'md.sources')}`, '');
  if (audit.sources.length === 0) lines.push(tx(locale, 'md.noSources'));
  else {
    const rows = audit.sources.slice(0, limit).map((s) => [
      escapeMarkdown(s.name ?? s.sourceId),
      escapeMarkdown(s.datasetName.trim() === '' ? s.datasetId : s.datasetName),
      escapeMarkdown(s.licence ?? t(locale, 'unknown')),
      s.retrievedIso === null ? t(locale, 'unknown') : escapeMarkdown(s.retrievedIso.slice(0, 10)),
      statusText(s, now, locale),
    ]);
    lines.push(
      ...table(
        [tx(locale, 'md.colSource'), tx(locale, 'md.colDataset'), tx(locale, 'md.colLicence'), tx(locale, 'md.colRetrieved'), tx(locale, 'md.colStatus')],
        rows,
      ),
    );
    if (audit.sources.length > limit) lines.push('', tx.count(locale, 'md.rows.more', audit.sources.length - limit, { n: audit.sources.length - limit }));
  }
  lines.push('', `_${tx(locale, 'md.note')}_`, '');
  return lines.join('\n');
}
