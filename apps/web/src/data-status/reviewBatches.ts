/**
 * The review work for the listed sources, split into sessions of a chosen size. A source goes
 * into a session only when it has something to do (a finding, no tier, or a review date coming
 * up). Sources of the same dataset are kept next to each other, and the datasets with the most
 * steps come first, so a session can be done with one publisher's pages open. Nothing here
 * decides when a session happens: it only cuts the list into pieces of a size a person chose.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import type { Filters } from './filters';
import { t } from './i18n';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { buildChecklist, markdownLine, type ChecklistEntry } from './reviewChecklist';
import { escapeHtml } from './sourceList';
import type { SortSpec } from './sorting';

export const BATCH_SIZES = [5, 10, 20] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];

export function isBatchSize(v: unknown): v is BatchSize {
  return typeof v === 'number' && (BATCH_SIZES as readonly number[]).includes(v);
}

/** `?batch=10`. Anything else means the review is not split. */
export function parseBatchSize(search: string): BatchSize | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = p.get('batch');
  if (raw === null || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return isBatchSize(n) ? n : null;
}

export function batchParams(size: BatchSize | null | undefined): [string, string][] {
  return size === null || size === undefined || !isBatchSize(size) ? [] : [['batch', String(size)]];
}

export interface ReviewBatch {
  /** 1 for the first session. */
  number: number;
  entries: ChecklistEntry[];
  /** All the steps in this session. */
  taskCount: number;
  /** The datasets in this session, in the order they appear in it. */
  datasets: string[];
}

export interface ReviewBatches {
  size: BatchSize;
  batches: ReviewBatch[];
  /** Sources with something to do. */
  sourceCount: number;
  taskCount: number;
  /** Listed sources with nothing to do, which are in no session. */
  clear: number;
  listed: number;
}

function datasetLabel(s: AuditedSource): string {
  return s.datasetName.trim() === '' ? s.datasetId : s.datasetName;
}

/**
 * The entries in session order: datasets with the most steps first (ties keep the order of the
 * list), and inside a dataset the sources with the most steps first (ties keep the order of the list).
 */
export function orderForSessions(entries: readonly ChecklistEntry[]): ChecklistEntry[] {
  const steps = new Map<string, number>();
  const first = new Map<string, number>();
  entries.forEach((e, i) => {
    steps.set(e.source.datasetId, (steps.get(e.source.datasetId) ?? 0) + e.tasks.length);
    if (!first.has(e.source.datasetId)) first.set(e.source.datasetId, i);
  });
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const da = a.entry.source.datasetId;
      const db = b.entry.source.datasetId;
      if (da !== db) return (steps.get(db) ?? 0) - (steps.get(da) ?? 0) || (first.get(da) ?? 0) - (first.get(db) ?? 0);
      return b.entry.tasks.length - a.entry.tasks.length || a.index - b.index;
    })
    .map((x) => x.entry);
}

export function buildReviewBatches(audit: AuditResult, filters: Filters, locale: Locale, size: BatchSize, sort: SortSpec | null = null): ReviewBatches {
  const checklist = buildChecklist(audit, filters, locale, sort);
  const ordered = orderForSessions(checklist.entries);
  const batches: ReviewBatch[] = [];
  for (let i = 0; i < ordered.length; i += size) {
    const entries = ordered.slice(i, i + size);
    batches.push({
      number: batches.length + 1,
      entries,
      taskCount: entries.reduce((n, e) => n + e.tasks.length, 0),
      datasets: [...new Set(entries.map((e) => datasetLabel(e.source)))],
    });
  }
  return { size, batches, sourceCount: ordered.length, taskCount: checklist.taskCount, clear: checklist.clear, listed: checklist.listed };
}

type Key =
  | 'rb.title'
  | 'rb.intro'
  | 'rb.control'
  | 'rb.off'
  | 'rb.size'
  | 'rb.none'
  | 'rb.summary.one'
  | 'rb.summary.other'
  | 'rb.clear.one'
  | 'rb.clear.other'
  | 'rb.session'
  | 'rb.sessionOf'
  | 'rb.sources.one'
  | 'rb.sources.other'
  | 'rb.steps.one'
  | 'rb.steps.other'
  | 'rb.line'
  | 'rb.datasets'
  | 'rb.join'
  | 'rb.item.one'
  | 'rb.item.other'
  | 'rb.said.one'
  | 'rb.said.other'
  | 'rb.saidNone'
  | 'rb.saidOff'
  | 'rb.export'
  | 'rb.fileTitle'
  | 'rb.made'
  | 'rb.saved.one'
  | 'rb.saved.other';

const MESSAGES: Messages<Key> = {
  en: {
    'rb.title': 'Review sessions',
    'rb.intro': 'The listed sources that have something to do, cut into sessions. Sources of the same dataset are kept together. A session is only a piece of the list; no date is set for it.',
    'rb.control': 'Split the review into sessions of',
    'rb.off': 'Do not split',
    'rb.size': 'Up to {count} sources',
    'rb.none': 'No listed source has anything to do, so there is no session to plan.',
    'rb.summary.one': '{n} session of up to {size} sources.',
    'rb.summary.other': '{n} sessions of up to {size} sources.',
    'rb.clear.one': '{n} listed source has nothing to do and is in no session.',
    'rb.clear.other': '{n} listed sources have nothing to do and are in no session.',
    'rb.session': 'Session {number}',
    'rb.sessionOf': 'Session {number} of {total}',
    'rb.sources.one': '{n} source',
    'rb.sources.other': '{n} sources',
    'rb.steps.one': '{n} step',
    'rb.steps.other': '{n} steps',
    'rb.line': '{sources}, {steps}.',
    'rb.datasets': 'Datasets: {list}.',
    'rb.join': ', ',
    'rb.item.one': '{name} ({n} step)',
    'rb.item.other': '{name} ({n} steps)',
    'rb.said.one': 'Review split into {n} session of up to {size} sources.',
    'rb.said.other': 'Review split into {n} sessions of up to {size} sources.',
    'rb.saidNone': 'No listed source has anything to do, so there is no session.',
    'rb.saidOff': 'Review sessions removed.',
    'rb.export': 'Download the review sessions (Markdown)',
    'rb.fileTitle': 'Review sessions',
    'rb.made': 'Made on {date} from the records saved on this device.',
    'rb.saved.one': 'File saved with {n} session.',
    'rb.saved.other': 'File saved with {n} sessions.',
  },
  fr: {
    'rb.title': 'Séances de révision',
    'rb.intro': 'Les sources de la liste qui ont quelque chose à faire, réparties en séances. Les sources d’un même jeu de données restent ensemble. Une séance n’est qu’une partie de la liste, et aucune date ne lui est fixée.',
    'rb.control': 'Répartir la révision en séances de',
    'rb.off': 'Ne pas répartir',
    'rb.size': 'Jusqu’à {count} sources',
    'rb.none': 'Aucune source de la liste n’a quoi que ce soit à faire, il n’y a donc aucune séance à planifier.',
    'rb.summary.one': '{n} séance d’au plus {size} sources.',
    'rb.summary.other': '{n} séances d’au plus {size} sources.',
    'rb.clear.one': '{n} source de la liste n’a rien à faire et ne figure dans aucune séance.',
    'rb.clear.other': '{n} sources de la liste n’ont rien à faire et ne figurent dans aucune séance.',
    'rb.session': 'Séance {number}',
    'rb.sessionOf': 'Séance {number} sur {total}',
    'rb.sources.one': '{n} source',
    'rb.sources.other': '{n} sources',
    'rb.steps.one': '{n} étape',
    'rb.steps.other': '{n} étapes',
    'rb.line': '{sources}, {steps}.',
    'rb.datasets': 'Jeux de données\u00A0: {list}.',
    'rb.join': ', ',
    'rb.item.one': '{name} ({n} étape)',
    'rb.item.other': '{name} ({n} étapes)',
    'rb.said.one': 'Révision répartie en {n} séance d’au plus {size} sources.',
    'rb.said.other': 'Révision répartie en {n} séances d’au plus {size} sources.',
    'rb.saidNone': 'Aucune source de la liste n’a quoi que ce soit à faire, il n’y a donc aucune séance.',
    'rb.saidOff': 'Séances de révision retirées.',
    'rb.export': 'Télécharger les séances de révision (Markdown)',
    'rb.fileTitle': 'Séances de révision',
    'rb.made': 'Produit le {date} à partir des enregistrements conservés sur cet appareil.',
    'rb.saved.one': 'Fichier enregistré avec {n} séance.',
    'rb.saved.other': 'Fichier enregistré avec {n} séances.',
  },
};

export const REVIEW_BATCH_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

function sourceName(s: AuditedSource, locale: Locale): string {
  return `${datasetLabel(s)} / ${s.name ?? t(locale, 'unknownName')}`;
}

/** "10 sources, 14 steps." */
export function batchLine(b: ReviewBatch, locale: Locale): string {
  return tx(locale, 'rb.line', { sources: tx.count(locale, 'rb.sources', b.entries.length), steps: tx.count(locale, 'rb.steps', b.taskCount) });
}

export function batchHeading(b: ReviewBatch, total: number, locale: Locale): string {
  return tx(locale, 'rb.sessionOf', { number: b.number, total });
}

/** The counts in sentences. Empty when the review is not split. */
export function batchesSummary(d: ReviewBatches, locale: Locale): string[] {
  if (d.batches.length === 0) return [tx(locale, 'rb.none')];
  const out = [tx.count(locale, 'rb.summary', d.batches.length, { size: d.size })];
  if (d.clear > 0) out.push(tx.count(locale, 'rb.clear', d.clear));
  return out;
}

export function describeBatches(d: ReviewBatches | null, locale: Locale): string {
  if (d === null) return tx(locale, 'rb.saidOff');
  return d.batches.length === 0 ? tx(locale, 'rb.saidNone') : tx.count(locale, 'rb.said', d.batches.length, { size: d.size });
}

export function describeBatchesSaved(d: ReviewBatches, locale: Locale): string {
  return d.batches.length === 0 ? tx(locale, 'rb.saidNone') : tx.count(locale, 'rb.saved', d.batches.length);
}

export function batchExportLabel(locale: Locale): string {
  return tx(locale, 'rb.export');
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

export function renderBatchControl(size: BatchSize | null, locale: Locale): string {
  const options =
    `<option value="none"${size === null ? ' selected' : ''}>${escapeHtml(tx(locale, 'rb.off'))}</option>` +
    BATCH_SIZES.map((n) => `<option value="${n}"${size === n ? ' selected' : ''}>${escapeHtml(tx(locale, 'rb.size', { count: n }))}</option>`).join('');
  return `<div><label for="ds-f-batch">${escapeHtml(tx(locale, 'rb.control'))}</label> <select id="ds-f-batch" name="batch" data-filter="batch" style="${FIELD_STYLE}">${options}</select></div>`;
}

export function renderReviewBatchesHtml(d: ReviewBatches, locale: Locale): string {
  const open = `<section aria-labelledby="ds-batches-title" data-batches="${d.batches.length}"><h3 id="ds-batches-title">${escapeHtml(tx(locale, 'rb.title'))}</h3>`;
  const summary = batchesSummary(d, locale)
    .map((s) => `<p>${escapeHtml(s)}</p>`)
    .join('');
  if (d.batches.length === 0) return `${open}${summary}</section>`;
  const sessions = d.batches
    .map((b) => {
      const id = `ds-batch-${b.number}`;
      const items = b.entries.map((e) => `<li>${escapeHtml(tx.count(locale, 'rb.item', e.tasks.length, { name: sourceName(e.source, locale) }))}</li>`).join('');
      return (
        `<section aria-labelledby="${id}"><h4 id="${id}">${escapeHtml(batchHeading(b, d.batches.length, locale))}</h4>` +
        `<p>${escapeHtml(batchLine(b, locale))} ${escapeHtml(tx(locale, 'rb.datasets', { list: b.datasets.join(tx(locale, 'rb.join')) }))}</p><ol>${items}</ol></section>`
      );
    })
    .join('');
  return `${open}<p>${escapeHtml(tx(locale, 'rb.intro'))}</p>${summary}${sessions}</section>`;
}

/** A heading per session, a tick box per source, and under it a tick box for each step. Ends with a new line. */
export function batchesToMarkdown(d: ReviewBatches, now: Date, locale: Locale): string {
  const lines = [`# ${markdownLine(tx(locale, 'rb.fileTitle'))}`, '', markdownLine(tx(locale, 'rb.made', { date: formatDisplayDate(now.toISOString().slice(0, 10), locale) })), ''];
  for (const s of batchesSummary(d, locale)) lines.push(markdownLine(s), '');
  for (const b of d.batches) {
    lines.push(`## ${markdownLine(batchHeading(b, d.batches.length, locale))}`, '', markdownLine(batchLine(b, locale)), '');
    for (const e of b.entries) {
      lines.push(`- [ ] ${markdownLine(sourceName(e.source, locale))}`);
      for (const task of e.tasks) lines.push(`  - [ ] ${markdownLine(task.title)}. ${markdownLine(task.step)}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export const BATCH_EXPORT_ACTION = 'export-batches';
export const BATCH_FILENAME = 'review-sessions.md';

export interface BatchFile {
  filename: string;
  mime: string;
  text: string;
}

export function buildBatchFile(d: ReviewBatches, now: Date, locale: Locale): BatchFile {
  return { filename: BATCH_FILENAME, mime: 'text/markdown;charset=utf-8', text: batchesToMarkdown(d, now, locale) };
}
