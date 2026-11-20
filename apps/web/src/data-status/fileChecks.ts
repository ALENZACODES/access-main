/**
 * The newer files, made and then read back. Each file is built from the saved records exactly
 * as a download would build it, then counted from its own text (the rows of a CSV, the lines
 * of a table, the tick boxes of a checklist) and compared with the number the list itself
 * gives. A file that disagrees with the list is a fault in this panel, not in the data, and is
 * shown as one. Nothing is repaired.
 */
import { COLUMN_IDS } from './columns';
import { parseCsv } from './consistency';
import { auditedSourcesToCsv } from './csv';
import type { AuditResult, DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { buildFactsCsv } from './factsCsv';
import { applyFilters, type Filters } from './filters';
import { buildListedJson, listedJsonText } from './listedJson';
import { readListedJson } from './listedJsonSchema';
import { buildListedTable, listedTableToMarkdown, listedTableToText } from './listedTable';
import { createTranslator, type Messages } from './localText';
import { buildPivot, pivotToCsv } from './pivot';
import { batchesToMarkdown, buildReviewBatches } from './reviewBatches';
import { buildChecklist, checklistToCsv, checklistToMarkdown } from './reviewChecklist';
import { escapeHtml } from './sourceList';

export const FILE_CHECK_IDS = ['sourcesCsv', 'listedJson', 'listedMd', 'listedTxt', 'checklistCsv', 'checklistMd', 'sessionSources', 'sessionSteps', 'counts', 'facts'] as const;
export type FileCheckId = (typeof FILE_CHECK_IDS)[number];

export interface FileCheck {
  id: FileCheckId;
  /** The number the list gives. */
  expected: number;
  /** The number read back from the text of the file; -1 when the file could not be read at all. */
  found: number;
  ok: boolean;
}

export interface FileChecks {
  checks: FileCheck[];
  ok: boolean;
  failed: number;
}

function countLines(text: string, test: RegExp): number {
  return text.split('\n').filter((line) => test.test(line)).length;
}

function csvRows(text: string): number {
  try {
    return Math.max(0, parseCsv(text).length - 1);
  } catch {
    return -1;
  }
}

/**
 * Builds each file for the filters given and counts it. Every file gets every extra column and a
 * count table by status and tier, so the widest form of each file is the one that is checked.
 */
export function runFileChecks(records: readonly DatasetRecord[], audit: AuditResult, filters: Filters, now: Date, locale: Locale): FileChecks {
  const listed = applyFilters(audit.sources, filters);
  const checklist = buildChecklist(audit, filters, locale);
  const sessions = buildReviewBatches(audit, filters, locale, 5);
  const table = buildListedTable(audit, filters, locale, { columns: [...COLUMN_IDS] });
  const firstHeading = table.headings[0] ?? '';
  const results: Record<FileCheckId, [number, number]> = {
    sourcesCsv: [listed.length, csvRows(auditedSourcesToCsv(listed, locale))],
    listedJson: [
      listed.length,
      (() => {
        const read = readListedJson(listedJsonText(buildListedJson(audit, filters, now, locale)));
        const sources = (read.value as { sources?: unknown } | undefined)?.sources;
        return read.ok && Array.isArray(sources) ? sources.length : -1;
      })(),
    ],
    listedMd: [listed.length, Math.max(0, countLines(listedTableToMarkdown(table, filters, now, locale), /^\| /) - 2)],
    // One block per source, each starting with the first column.
    listedTxt: [listed.length, listedTableToText(table, filters, now, locale).split('\n').filter((line) => line.startsWith(`${firstHeading}:`) || line.startsWith(`${firstHeading}\u00A0:`)).length],
    checklistCsv: [checklist.taskCount, csvRows(checklistToCsv(checklist, locale))],
    checklistMd: [checklist.taskCount, countLines(checklistToMarkdown(checklist, filters, now, locale), /^\s*- \[ \] /)],
    sessionSources: [checklist.entries.length, countLines(batchesToMarkdown(sessions, now, locale), /^- \[ \] /)],
    sessionSteps: [checklist.taskCount, countLines(batchesToMarkdown(sessions, now, locale), /^ {2}- \[ \] /)],
    counts: [
      listed.length,
      (() => {
        const rows = parseCsv(pivotToCsv(buildPivot(listed, { rows: 'state', cols: 'tier' }), locale));
        const last = rows.at(-1)?.at(-1);
        return last !== undefined && /^\d+$/.test(last) ? Number(last) : -1;
      })(),
    ],
    facts: [audit.sources.length, csvRows(buildFactsCsv(records, audit, locale))],
  };
  const checks = FILE_CHECK_IDS.map((id) => {
    const [expected, found] = results[id];
    return { id, expected, found, ok: expected === found };
  });
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, ok: failed === 0, failed };
}

type Key =
  | 'fk.title'
  | 'fk.intro'
  | 'fk.caption'
  | 'fk.colFile'
  | 'fk.colWhat'
  | 'fk.colExpected'
  | 'fk.colFound'
  | 'fk.colResult'
  | 'fk.agrees'
  | 'fk.differs'
  | 'fk.unreadable'
  | 'fk.ok.one'
  | 'fk.ok.other'
  | 'fk.bad.one'
  | 'fk.bad.other'
  | `fk.file.${FileCheckId}`
  | `fk.what.${FileCheckId}`;

const MESSAGES: Messages<Key> = {
  en: {
    'fk.title': 'Files read back and counted',
    'fk.intro': 'Each file below was made from every saved record, with no filter set, then read back and counted. The count has to match the list. A difference is a fault in this panel, not in the data.',
    'fk.caption': 'Each file against the list',
    'fk.colFile': 'File',
    'fk.colWhat': 'What is counted',
    'fk.colExpected': 'The list says',
    'fk.colFound': 'The file holds',
    'fk.colResult': 'Result',
    'fk.agrees': 'Agrees',
    'fk.differs': 'Does not agree',
    'fk.unreadable': 'Could not be read back',
    'fk.ok.one': 'The {n} file agrees with the list.',
    'fk.ok.other': 'All {n} files agree with the list.',
    'fk.bad.one': '{n} file does not agree with the list.',
    'fk.bad.other': '{n} files do not agree with the list.',
    'fk.file.sourcesCsv': 'data-sources.csv',
    'fk.file.listedJson': 'listed-sources.json',
    'fk.file.listedMd': 'listed-sources.md',
    'fk.file.listedTxt': 'listed-sources.txt',
    'fk.file.checklistCsv': 'review-checklist.csv',
    'fk.file.checklistMd': 'review-checklist.md',
    'fk.file.sessionSources': 'review-sessions.md',
    'fk.file.sessionSteps': 'review-sessions.md',
    'fk.file.counts': 'list-counts.csv',
    'fk.file.facts': 'record-facts.csv',
    'fk.what.sourcesCsv': 'Rows, one per source',
    'fk.what.listedJson': 'Sources, after the file passed its own check',
    'fk.what.listedMd': 'Table lines, one per source',
    'fk.what.listedTxt': 'Blocks, one per source',
    'fk.what.checklistCsv': 'Rows, one per step',
    'fk.what.checklistMd': 'Tick boxes, one per step',
    'fk.what.sessionSources': 'Tick boxes for sources with something to do',
    'fk.what.sessionSteps': 'Tick boxes for steps',
    'fk.what.counts': 'The grand total of the count table',
    'fk.what.facts': 'Rows, one per record',
  },
  fr: {
    'fk.title': 'Fichiers relus et comptés',
    'fk.intro': 'Chaque fichier ci-dessous a été produit à partir de tous les enregistrements conservés, sans aucun filtre, puis relu et compté. Le nombre doit correspondre à la liste. Un écart est un défaut de ce panneau, pas des données.',
    'fk.caption': 'Chaque fichier comparé à la liste',
    'fk.colFile': 'Fichier',
    'fk.colWhat': 'Ce qui est compté',
    'fk.colExpected': 'D’après la liste',
    'fk.colFound': 'Dans le fichier',
    'fk.colResult': 'Résultat',
    'fk.agrees': 'Concorde',
    'fk.differs': 'Ne concorde pas',
    'fk.unreadable': 'Relecture impossible',
    'fk.ok.one': 'Le fichier concorde avec la liste ({n}).',
    'fk.ok.other': 'Les {n} fichiers concordent avec la liste.',
    'fk.bad.one': '{n} fichier ne concorde pas avec la liste.',
    'fk.bad.other': '{n} fichiers ne concordent pas avec la liste.',
    'fk.file.sourcesCsv': 'data-sources.csv',
    'fk.file.listedJson': 'listed-sources.json',
    'fk.file.listedMd': 'listed-sources.md',
    'fk.file.listedTxt': 'listed-sources.txt',
    'fk.file.checklistCsv': 'review-checklist.csv',
    'fk.file.checklistMd': 'review-checklist.md',
    'fk.file.sessionSources': 'review-sessions.md',
    'fk.file.sessionSteps': 'review-sessions.md',
    'fk.file.counts': 'list-counts.csv',
    'fk.file.facts': 'record-facts.csv',
    'fk.what.sourcesCsv': 'Lignes, une par source',
    'fk.what.listedJson': 'Sources, une fois le fichier passé par son propre contrôle',
    'fk.what.listedMd': 'Lignes de tableau, une par source',
    'fk.what.listedTxt': 'Blocs, un par source',
    'fk.what.checklistCsv': 'Lignes, une par étape',
    'fk.what.checklistMd': 'Cases à cocher, une par étape',
    'fk.what.sessionSources': 'Cases à cocher des sources qui ont quelque chose à faire',
    'fk.what.sessionSteps': 'Cases à cocher des étapes',
    'fk.what.counts': 'Le total général du tableau de comptage',
    'fk.what.facts': 'Lignes, une par enregistrement',
  },
};

export const FILE_CHECK_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function fileCheckName(id: FileCheckId, locale: Locale): string {
  return tx(locale, `fk.file.${id}`);
}

export function fileCheckWhat(id: FileCheckId, locale: Locale): string {
  return tx(locale, `fk.what.${id}`);
}

export function fileCheckResult(c: FileCheck, locale: Locale): string {
  if (c.ok) return tx(locale, 'fk.agrees');
  return tx(locale, c.found < 0 ? 'fk.unreadable' : 'fk.differs');
}

export function fileChecksSummary(d: FileChecks, locale: Locale): string {
  return d.ok ? tx.count(locale, 'fk.ok', d.checks.length) : tx.count(locale, 'fk.bad', d.failed);
}

export function renderFileChecksHtml(d: FileChecks, locale: Locale): string {
  const heads = (['fk.colFile', 'fk.colWhat', 'fk.colExpected', 'fk.colFound', 'fk.colResult'] as const).map((k) => `<th scope="col">${escapeHtml(tx(locale, k))}</th>`).join('');
  const rows = d.checks
    .map(
      (c) =>
        `<tr data-check="${c.id}" data-ok="${c.ok}"><th scope="row"><code>${escapeHtml(fileCheckName(c.id, locale))}</code></th><td>${escapeHtml(fileCheckWhat(c.id, locale))}</td>` +
        `<td>${c.expected}</td><td>${c.found < 0 ? '' : c.found}</td><td>${c.ok ? '' : '<strong>'}${escapeHtml(fileCheckResult(c, locale))}${c.ok ? '' : '</strong>'}</td></tr>`,
    )
    .join('');
  return (
    `<section aria-labelledby="ds-filecheck-title" data-file-checks="${d.failed}"><h2 id="ds-filecheck-title">${escapeHtml(tx(locale, 'fk.title'))}</h2>` +
    `<p>${escapeHtml(tx(locale, 'fk.intro'))}</p><p>${escapeHtml(fileChecksSummary(d, locale))}</p>` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${escapeHtml(tx(locale, 'fk.caption'))}"><table><caption>${escapeHtml(tx(locale, 'fk.caption'))}</caption>` +
    `<thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div></section>`
  );
}
