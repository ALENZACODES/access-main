/**
 * A guide to every file this panel can save: what each one holds, its format, and whether it
 * follows the list on screen (its filters, its order, its extra columns) or always covers every
 * source. The same table says where each file comes from: a button on the live panel, an
 * address on the page the server sends, or both. The tests check this list against the real
 * buttons and the real addresses, so it cannot drift from what the panel does.
 */
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const FILE_SCOPES = ['all', 'filters', 'order', 'columns', 'table', 'sessions'] as const;
/**
 * What a file follows. Each scope includes the ones before it in this sense: `order` files also
 * follow the filters, `columns` files also follow the order, and `table` and `sessions` files
 * follow the filters plus the count table or the session size chosen.
 */
export type FileScope = (typeof FILE_SCOPES)[number];

export const FILE_IDS = [
  'sources',
  'listedJson',
  'listedSchema',
  'listedMd',
  'listedTxt',
  'checklistMd',
  'checklistCsv',
  'sessions',
  'counts',
  'facts',
  'tables',
  'textSummary',
  'report',
  'checksums',
  'publishers',
  'notes',
  'outlook',
  'credits',
  'summaryJson',
  'calendar',
  'catalogue',
  'completeness',
  'consistency',
] as const;
export type FileId = (typeof FILE_IDS)[number];

export interface FileGuideEntry {
  id: FileId;
  /** The name the file is saved under; null when the server sends it to be read in the browser. */
  filename: string | null;
  format: 'CSV' | 'JSON' | 'JSON-LD' | 'Markdown' | 'text' | 'iCalendar';
  scope: FileScope;
  /** The button on the live panel (its data-action); null when the live panel has none. */
  action: string | null;
  /** The address on the page the server sends, after the page path; null when it has none. */
  route: string | null;
}

export const FILE_GUIDE: readonly FileGuideEntry[] = [
  { id: 'sources', filename: 'data-sources.csv', format: 'CSV', scope: 'filters', action: 'export-csv', route: '/sources.csv' },
  { id: 'listedJson', filename: 'listed-sources.json', format: 'JSON', scope: 'order', action: 'export-listed-json', route: '/listed-sources.json' },
  { id: 'listedSchema', filename: null, format: 'JSON', scope: 'all', action: null, route: '/listed-sources.schema.json' },
  { id: 'listedMd', filename: 'listed-sources.md', format: 'Markdown', scope: 'columns', action: 'export-listed-md', route: '/listed-sources.md' },
  { id: 'listedTxt', filename: 'listed-sources.txt', format: 'text', scope: 'columns', action: 'export-listed-txt', route: '/listed-sources.txt' },
  { id: 'checklistMd', filename: 'review-checklist.md', format: 'Markdown', scope: 'order', action: 'export-checklist-md', route: '/review-checklist.md' },
  { id: 'checklistCsv', filename: 'review-checklist.csv', format: 'CSV', scope: 'order', action: 'export-checklist-csv', route: '/review-checklist.csv' },
  { id: 'sessions', filename: 'review-sessions.md', format: 'Markdown', scope: 'sessions', action: 'export-batches', route: '/review-sessions.md' },
  { id: 'counts', filename: 'list-counts.csv', format: 'CSV', scope: 'table', action: 'export-pivot', route: '/list-counts.csv' },
  { id: 'facts', filename: 'record-facts.csv', format: 'CSV', scope: 'all', action: 'export-facts', route: '/record-facts.csv' },
  { id: 'tables', filename: 'planning-tables.csv', format: 'CSV', scope: 'all', action: 'export-tables', route: '/planning-tables.csv' },
  { id: 'textSummary', filename: 'data-status-summary.txt', format: 'text', scope: 'all', action: 'export-summary', route: '/summary.txt' },
  { id: 'report', filename: 'data-status.md', format: 'Markdown', scope: 'all', action: 'export-report', route: null },
  { id: 'checksums', filename: 'checksums.txt', format: 'text', scope: 'all', action: 'export-checksums', route: null },
  { id: 'publishers', filename: 'publishers.csv', format: 'CSV', scope: 'all', action: null, route: '/publishers.csv' },
  { id: 'notes', filename: 'second-look.md', format: 'Markdown', scope: 'all', action: null, route: '/second-look.md' },
  { id: 'outlook', filename: 'outlook.csv', format: 'CSV', scope: 'all', action: null, route: '/outlook.csv' },
  { id: 'credits', filename: 'credits.txt', format: 'text', scope: 'all', action: null, route: '/credits.txt' },
  { id: 'summaryJson', filename: 'summary.json', format: 'JSON', scope: 'all', action: null, route: '/summary.json' },
  { id: 'calendar', filename: 'review-dates.ics', format: 'iCalendar', scope: 'all', action: null, route: '/review.ics' },
  { id: 'catalogue', filename: 'catalogue.json', format: 'JSON-LD', scope: 'all', action: null, route: '/catalogue.json' },
  { id: 'completeness', filename: null, format: 'JSON', scope: 'all', action: null, route: '/completeness.json' },
  { id: 'consistency', filename: null, format: 'JSON', scope: 'all', action: null, route: '/consistency.json' },
];

export function fileGuideEntry(id: FileId): FileGuideEntry {
  const entry = FILE_GUIDE.find((e) => e.id === id);
  if (entry === undefined) throw new Error(`no file guide entry: ${id}`);
  return entry;
}

/** The entries one surface offers: the live panel's buttons, or the server's addresses. */
export function fileGuideFor(surface: 'live' | 'static'): FileGuideEntry[] {
  return FILE_GUIDE.filter((e) => (surface === 'live' ? e.action !== null : e.route !== null));
}

type HoldsKey = `fg.holds.${FileId}`;
type ScopeKey = `fg.scope.${FileScope}`;
type Key =
  | 'fg.title'
  | 'fg.intro'
  | 'fg.caption'
  | 'fg.colFile'
  | 'fg.colFormat'
  | 'fg.colHolds'
  | 'fg.colScope'
  | 'fg.browser'
  | 'fg.unknownNote'
  | 'fg.count.one'
  | 'fg.count.other'
  | HoldsKey
  | ScopeKey;

const MESSAGES: Messages<Key> = {
  en: {
    'fg.title': 'Files you can save',
    'fg.intro': 'Every file is made on this device from the records saved here. Nothing is sent anywhere to make one.',
    'fg.caption': 'What each file holds and what it follows',
    'fg.colFile': 'File',
    'fg.colFormat': 'Format',
    'fg.colHolds': 'What it holds',
    'fg.colScope': 'What it follows',
    'fg.browser': 'Opens in the browser',
    'fg.unknownNote': 'In every file, a fact that is not recorded is written UNKNOWN. It is never left blank and never filled in by estimate.',
    'fg.count.one': '{n} file.',
    'fg.count.other': '{n} files.',
    'fg.holds.sources': 'One row per source: dataset, source, page, licence, whether the licence is open, retrieved date and status.',
    'fg.holds.listedJson': 'One object per source with its source, licence, retrieved date, tier, status, review date and the facts that are UNKNOWN.',
    'fg.holds.listedSchema': 'The shape of listed-sources.json as a JSON Schema, for a program that reads that file.',
    'fg.holds.listedMd': 'The source list as a table to paste into an issue or a wiki page.',
    'fg.holds.listedTxt': 'The source list as plain text, one block per source, to paste into a message.',
    'fg.holds.checklistMd': 'A tick box for each step to take on each listed source.',
    'fg.holds.checklistCsv': 'One row per step to take: dataset, record, task, step, status and review date.',
    'fg.holds.sessions': 'The review steps cut into sessions, with a tick box per source and per step.',
    'fg.holds.counts': 'The count table drawn under the list, with its totals.',
    'fg.holds.facts': 'Source, licence, retrieved date and tier for each record, and which of the four are UNKNOWN.',
    'fg.holds.tables': 'The planning tables of this panel in one sheet: review workload, sources by age and licences in use.',
    'fg.holds.textSummary': 'A short summary in lines of text: counts by status, licence and tier, and how many records have a fact that is UNKNOWN.',
    'fg.holds.report': 'The whole audit as one document: counts, items to review and every source.',
    'fg.holds.checksums': 'A SHA-256 line for each of five files (source list, credits, summary, calendar and catalogue), to compare two copies.',
    'fg.holds.publishers': 'One row per publisher: sources, datasets, licence types, oldest retrieved date, next review date and other spellings of the name.',
    'fg.holds.notes': 'The patterns worth a second look, each with a tick box, and the table of publishers.',
    'fg.holds.outlook': 'Three planning tables in one sheet: sources past review on later days, what other review periods would mark, and sources by web site.',
    'fg.holds.credits': 'A line for each source with its licence and its retrieved date.',
    'fg.holds.summaryJson': 'The counts of the audit, for another program to read.',
    'fg.holds.calendar': 'One all-day entry per review date, for a calendar program.',
    'fg.holds.catalogue': 'The datasets and their sources as a DCAT catalogue.',
    'fg.holds.completeness': 'For each fact, how many sources have it and how many do not, overall and for each dataset.',
    'fg.holds.consistency': 'A comparison of every file and table against the same records, listing any that disagree.',
    'fg.scope.all': 'Every source, whatever is listed',
    'fg.scope.filters': 'The filters of the list',
    'fg.scope.order': 'The filters and the order of the list',
    'fg.scope.columns': 'The filters, the order and the extra columns of the list',
    'fg.scope.table': 'The filters of the list and the count table chosen',
    'fg.scope.sessions': 'The filters and the order of the list, and the session size chosen',
  },
  fr: {
    'fg.title': 'Fichiers à enregistrer',
    'fg.intro': 'Chaque fichier est produit sur cet appareil à partir des enregistrements qui y sont conservés. Rien n’est envoyé ailleurs pour le produire.',
    'fg.caption': 'Contenu de chaque fichier et ce qu’il suit',
    'fg.colFile': 'Fichier',
    'fg.colFormat': 'Format',
    'fg.colHolds': 'Contenu',
    'fg.colScope': 'Ce qu’il suit',
    'fg.browser': 'S’ouvre dans le navigateur',
    'fg.unknownNote': 'Dans chaque fichier, un élément qui n’est pas consigné est écrit UNKNOWN. Il n’est jamais laissé vide ni rempli par estimation.',
    'fg.count.one': '{n} fichier.',
    'fg.count.other': '{n} fichiers.',
    'fg.holds.sources': 'Une ligne par source\u00A0: jeu de données, source, page, licence, caractère ouvert de la licence, date de récupération et état.',
    'fg.holds.listedJson': 'Un objet par source, avec sa source, sa licence, sa date de récupération, son niveau, son état, sa date de révision et les éléments UNKNOWN.',
    'fg.holds.listedSchema': 'La forme de listed-sources.json sous forme de schéma JSON, pour un programme qui lit ce fichier.',
    'fg.holds.listedMd': 'La liste des sources sous forme de tableau, à coller dans un ticket ou une page wiki.',
    'fg.holds.listedTxt': 'La liste des sources en texte brut, un bloc par source, à coller dans un message.',
    'fg.holds.checklistMd': 'Une case à cocher pour chaque étape à faire sur chaque source de la liste.',
    'fg.holds.checklistCsv': 'Une ligne par étape à faire\u00A0: jeu de données, enregistrement, tâche, étape, état et date de révision.',
    'fg.holds.sessions': 'Les étapes de révision réparties en séances, avec une case à cocher par source et par étape.',
    'fg.holds.counts': 'Le tableau de comptage affiché sous la liste, avec ses totaux.',
    'fg.holds.facts': 'La source, la licence, la date de récupération et le niveau de chaque enregistrement, et lesquels des quatre sont UNKNOWN.',
    'fg.holds.tables': 'Les tableaux de planification de ce panneau en une seule feuille\u00A0: charge de révision, sources par âge et licences utilisées.',
    'fg.holds.textSummary': 'Un court résumé en lignes de texte\u00A0: nombres par état, par licence et par niveau, et nombre d’enregistrements dont un élément est UNKNOWN.',
    'fg.holds.report': 'L’audit complet en un seul document\u00A0: nombres, éléments à examiner et toutes les sources.',
    'fg.holds.checksums': 'Une ligne SHA-256 pour chacun de cinq fichiers (liste des sources, mentions, résumé, agenda et catalogue), pour comparer deux copies.',
    'fg.holds.publishers': 'Une ligne par diffuseur\u00A0: sources, jeux de données, types de licence, date de récupération la plus ancienne, prochaine date de révision et autres graphies du nom.',
    'fg.holds.notes': 'Les points à regarder de plus près, chacun avec une case à cocher, et le tableau des diffuseurs.',
    'fg.holds.outlook': 'Trois tableaux de planification en une seule feuille\u00A0: sources ayant dépassé leur date de révision à des dates ultérieures, effet d’autres périodes de révision et sources par site Web.',
    'fg.holds.credits': 'Une ligne pour chaque source, avec sa licence et sa date de récupération.',
    'fg.holds.summaryJson': 'Les nombres de l’audit, à lire par un autre programme.',
    'fg.holds.calendar': 'Une entrée d’une journée par date de révision, pour un logiciel d’agenda.',
    'fg.holds.catalogue': 'Les jeux de données et leurs sources sous forme de catalogue DCAT.',
    'fg.holds.completeness': 'Pour chaque élément, le nombre de sources qui l’ont et de celles qui ne l’ont pas, au total et pour chaque jeu de données.',
    'fg.holds.consistency': 'Une comparaison de chaque fichier et de chaque tableau avec les mêmes enregistrements, qui énumère ceux qui ne concordent pas.',
    'fg.scope.all': 'Toutes les sources, quelle que soit la liste',
    'fg.scope.filters': 'Les filtres de la liste',
    'fg.scope.order': 'Les filtres et l’ordre de la liste',
    'fg.scope.columns': 'Les filtres, l’ordre et les colonnes supplémentaires de la liste',
    'fg.scope.table': 'Les filtres de la liste et le tableau de comptage choisi',
    'fg.scope.sessions': 'Les filtres et l’ordre de la liste, ainsi que la taille de séance choisie',
  },
};

export const FILE_GUIDE_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function fileHolds(id: FileId, locale: Locale): string {
  return tx(locale, `fg.holds.${id}`);
}

export function fileScopeText(scope: FileScope, locale: Locale): string {
  return tx(locale, `fg.scope.${scope}`);
}

/** The name shown for a file: its saved name, or the last part of its address when it opens in the browser. */
export function fileDisplayName(e: FileGuideEntry): string {
  return e.filename ?? (e.route ?? '').replace(/^\//, '');
}

/** The guide as rows of text: a heading row, then one row per file of this surface. */
export function fileGuideRows(surface: 'live' | 'static', locale: Locale): string[][] {
  return [
    [tx(locale, 'fg.colFile'), tx(locale, 'fg.colFormat'), tx(locale, 'fg.colHolds'), tx(locale, 'fg.colScope')],
    ...fileGuideFor(surface).map((e) => [fileDisplayName(e), e.format, fileHolds(e.id, locale), fileScopeText(e.scope, locale)]),
  ];
}

/** The section for one surface. Only the files that surface can give are listed. */
export function renderFileGuideHtml(surface: 'live' | 'static', locale: Locale): string {
  const entries = fileGuideFor(surface);
  const [head, ...rows] = fileGuideRows(surface, locale);
  const heads = (head ?? []).map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((r, i) => {
      const note = entries[i]?.filename === null ? ` (${escapeHtml(tx(locale, 'fg.browser'))})` : '';
      return `<tr><th scope="row"><code>${escapeHtml(r[0] ?? '')}</code>${note}</th><td>${escapeHtml(r[1] ?? '')}</td><td>${escapeHtml(r[2] ?? '')}</td><td>${escapeHtml(r[3] ?? '')}</td></tr>`;
    })
    .join('');
  return (
    `<section aria-labelledby="ds-files-title" data-file-guide="${entries.length}"><h2 id="ds-files-title">${escapeHtml(tx(locale, 'fg.title'))}</h2>` +
    `<p>${escapeHtml(tx(locale, 'fg.intro'))} ${escapeHtml(tx.count(locale, 'fg.count', entries.length))}</p><p>${escapeHtml(tx(locale, 'fg.unknownNote'))}</p>` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${escapeHtml(tx(locale, 'fg.caption'))}"><table><caption>${escapeHtml(tx(locale, 'fg.caption'))}</caption>` +
    `<thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></section>`
  );
}
