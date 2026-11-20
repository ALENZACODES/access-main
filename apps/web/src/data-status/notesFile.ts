/**
 * Two files for the people who keep the records: the publishers as a CSV sheet, and a Markdown
 * note that puts the publishers and the patterns worth a second look in one place, to paste into
 * an issue or to keep beside the registry. Both cover every saved record, whatever the list on
 * screen is filtered to, and both write UNKNOWN where a fact is not recorded.
 */
import { toCsv } from './csv';
import type { AuditResult, DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { buildOddities, odditiesSummary, oddityCountText, oddityItemText, oddityTitle, oddityWhy, type Oddities } from './oddities';
import { buildPublishers, publisherRows, publishersSummary, type Publishers } from './publishers';
import { markdownLine } from './reviewChecklist';
import { UNKNOWN_WORD } from './unknownWord';

export const PUBLISHERS_CSV_ROUTE = '/publishers.csv';
export const PUBLISHERS_CSV_FILENAME = 'publishers.csv';
export const NOTES_ROUTE = '/second-look.md';
export const NOTES_FILENAME = 'second-look.md';
/** The files list every publisher and every item, not only the first few shown on the panel. */
const NO_LIMIT = 100_000;

type Key = 'nf.title' | 'nf.made' | 'nf.scope.one' | 'nf.scope.other' | 'nf.unknownNote' | 'nf.publishers' | 'nf.noPublishers' | 'nf.oddities' | 'nf.also' | 'nf.labelCsv' | 'nf.labelMd';

const MESSAGES: Messages<Key> = {
  en: {
    'nf.title': 'Notes on the saved records',
    'nf.made': 'Made on {date} from the records saved on this device.',
    'nf.scope.one': 'It covers {n} source, whatever the list on screen is filtered to.',
    'nf.scope.other': 'It covers all {n} sources, whatever the list on screen is filtered to.',
    'nf.unknownNote': 'UNKNOWN means the fact is not recorded. It is never filled in by estimate.',
    'nf.publishers': 'Sources by publisher',
    'nf.noPublishers': 'There are no sources to group.',
    'nf.oddities': 'Worth a second look',
    'nf.also': 'Also written',
    'nf.labelCsv': 'Download the publishers (CSV)',
    'nf.labelMd': 'Download the notes on the saved records (Markdown)',
  },
  fr: {
    'nf.title': 'Notes sur les enregistrements conservés',
    'nf.made': 'Produit le {date} à partir des enregistrements conservés sur cet appareil.',
    'nf.scope.one': 'Il porte sur {n} source, quels que soient les filtres de la liste à l’écran.',
    'nf.scope.other': 'Il porte sur les {n} sources, quels que soient les filtres de la liste à l’écran.',
    'nf.unknownNote': 'UNKNOWN signifie que l’élément n’est pas consigné. Il n’est jamais rempli par estimation.',
    'nf.publishers': 'Sources par diffuseur',
    'nf.noPublishers': 'Il n’y a aucune source à regrouper.',
    'nf.oddities': 'À regarder de plus près',
    'nf.also': 'Aussi écrit',
    'nf.labelCsv': 'Télécharger les diffuseurs (CSV)',
    'nf.labelMd': 'Télécharger les notes sur les enregistrements conservés (Markdown)',
  },
};

export const NOTES_FILE_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function notesFileLabel(file: 'publishers' | 'notes', locale: Locale): string {
  return tx(locale, file === 'publishers' ? 'nf.labelCsv' : 'nf.labelMd');
}

/** The publisher table with one more column: the other spellings recorded for the same publisher. */
export function publisherSheetRows(d: Publishers, locale: Locale): string[][] {
  const [head, ...rows] = publisherRows(d, locale);
  return [[...(head ?? []), tx(locale, 'nf.also')], ...rows.map((r, i) => [...r, d.publishers[i]?.spellings.join(' / ') ?? ''])];
}

/** Every publisher, one row each, with a heading row. Starts with a byte order mark for spreadsheet programs. */
export function publishersToCsv(records: readonly DatasetRecord[], audit: AuditResult, locale: Locale): string {
  return toCsv(publisherSheetRows(buildPublishers(records, audit, NO_LIMIT), locale), true);
}

function cell(text: string): string {
  const c = markdownLine(text);
  return c === '' ? UNKNOWN_WORD : c;
}

function publishersSection(d: Publishers, locale: Locale): string[] {
  const lines = [`## ${markdownLine(tx(locale, 'nf.publishers'))}`, ''];
  if (d.sourceCount === 0) return [...lines, markdownLine(tx(locale, 'nf.noPublishers')), ''];
  for (const s of publishersSummary(d, locale)) lines.push(markdownLine(s), '');
  const [head, ...rows] = publisherRows(d, locale);
  lines.push(`| ${(head ?? []).map(cell).join(' | ')} |`, `| ${(head ?? []).map(() => '---').join(' | ')} |`);
  for (const r of rows) lines.push(`| ${r.map(cell).join(' | ')} |`);
  return [...lines, ''];
}

function odditiesSection(d: Oddities, locale: Locale): string[] {
  const lines = [`## ${markdownLine(tx(locale, 'nf.oddities'))}`, '', markdownLine(odditiesSummary(d, locale)), ''];
  for (const g of d.groups) {
    lines.push(`### ${markdownLine(oddityTitle(g.code, locale))}`, '', `${markdownLine(oddityCountText(g, locale))}. ${markdownLine(oddityWhy(g.code, locale))}`, '');
    for (const item of g.items) lines.push(`- [ ] ${markdownLine(oddityItemText(item, locale))}`);
    lines.push('');
  }
  return lines;
}

/** A title, what the note covers, then the two sections. Every item is listed, each with a tick box. Ends with one new line. */
export function buildNotesMarkdown(records: readonly DatasetRecord[], audit: AuditResult, now: Date, locale: Locale): string {
  const lines = [
    `# ${markdownLine(tx(locale, 'nf.title'))}`,
    '',
    markdownLine(tx(locale, 'nf.made', { date: formatDisplayDate(now.toISOString().slice(0, 10), locale) })),
    '',
    markdownLine(tx.count(locale, 'nf.scope', audit.sources.length)),
    '',
    markdownLine(tx(locale, 'nf.unknownNote')),
    '',
    ...odditiesSection(buildOddities(audit), locale),
    ...publishersSection(buildPublishers(records, audit, NO_LIMIT), locale),
  ];
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}
