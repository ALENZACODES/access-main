/**
 * "Do the tables and files agree?": runs the cross-surface consistency check on the records the
 * panel is showing, so a reader can see that the summary, the CSV, the catalogue, the calendar
 * and the tables were all built from one audit. The technical differences, when there are any,
 * are listed as written (they are English diagnostics, marked lang="en").
 */
import { checkConsistency } from './consistency';
import type { DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import type { Thresholds } from './thresholds';

export const MAX_PROBLEMS_SHOWN = 10;

export interface SelfCheck {
  ok: boolean;
  surfaces: string[];
  problems: string[];
  /** The first MAX_PROBLEMS_SHOWN problems. */
  shown: string[];
  hidden: number;
}

export function runSelfCheck(records: readonly DatasetRecord[], now: Date, thresholds: Thresholds = {}): SelfCheck {
  let surfaces: string[] = [];
  let problems: string[] = [];
  try {
    const r = checkConsistency(records, now, { thresholds });
    surfaces = r.surfaces;
    problems = r.problems;
  } catch (error) {
    problems = [`self-check could not run: ${error instanceof Error ? error.message : 'unknown error'}`];
  }
  return {
    ok: problems.length === 0,
    surfaces,
    problems,
    shown: problems.slice(0, MAX_PROBLEMS_SHOWN),
    hidden: Math.max(0, problems.length - MAX_PROBLEMS_SHOWN),
  };
}

type Key =
  | 'sc.title'
  | 'sc.intro'
  | 'sc.ok.one'
  | 'sc.ok.other'
  | 'sc.found.one'
  | 'sc.found.other'
  | 'sc.more.one'
  | 'sc.more.other'
  | 'sc.compared'
  | 'sc.list.join'
  | 'sc.s.audit'
  | 'sc.s.summary'
  | 'sc.s.catalogue'
  | 'sc.s.csv'
  | 'sc.s.source-list'
  | 'sc.s.review'
  | 'sc.s.calendar'
  | 'sc.s.qa-counts'
  | 'sc.s.completeness'
  | 'sc.s.credits';

const MESSAGES: Messages<Key> = {
  en: {
    'sc.title': 'Do the tables and files agree?',
    'sc.intro': 'The page and each download are built from the same saved records. This check compares them and reports any difference.',
    'sc.ok.one': 'The {n} compared surface agrees. No differences were found.',
    'sc.ok.other': 'All {n} compared surfaces agree. No differences were found.',
    'sc.found.one': '{n} difference was found:',
    'sc.found.other': '{n} differences were found:',
    'sc.more.one': '{n} more difference is not listed.',
    'sc.more.other': '{n} more differences are not listed.',
    'sc.compared': 'Compared: {list}.',
    'sc.list.join': ', ',
    'sc.s.audit': 'audit rules',
    'sc.s.summary': 'summary file',
    'sc.s.catalogue': 'catalogue file',
    'sc.s.csv': 'source list file',
    'sc.s.source-list': 'source list table',
    'sc.s.review': 'review schedule',
    'sc.s.calendar': 'calendar file',
    'sc.s.qa-counts': 'quality counts',
    'sc.s.completeness': 'completeness table',
    'sc.s.credits': 'credits',
  },
  fr: {
    'sc.title': 'Les tableaux et les fichiers concordent-ils ?',
    'sc.intro': 'La page et chaque fichier téléchargeable sont construits à partir des mêmes enregistrements. Cette comparaison signale toute différence.',
    'sc.ok.one': 'La {n} surface comparée concorde. Aucune différence n’a été trouvée.',
    'sc.ok.other': 'Les {n} surfaces comparées concordent. Aucune différence n’a été trouvée.',
    'sc.found.one': '{n} différence a été trouvée :',
    'sc.found.other': '{n} différences ont été trouvées :',
    'sc.more.one': '{n} autre différence n’est pas affichée.',
    'sc.more.other': '{n} autres différences ne sont pas affichées.',
    'sc.compared': 'Comparé : {list}.',
    'sc.list.join': ', ',
    'sc.s.audit': 'règles d’audit',
    'sc.s.summary': 'fichier de résumé',
    'sc.s.catalogue': 'fichier de catalogue',
    'sc.s.csv': 'fichier de la liste des sources',
    'sc.s.source-list': 'tableau de la liste des sources',
    'sc.s.review': 'calendrier de révision',
    'sc.s.calendar': 'fichier de calendrier',
    'sc.s.qa-counts': 'compteurs de qualité',
    'sc.s.completeness': 'tableau de complétude',
    'sc.s.credits': 'crédits',
  },
};

export const SELF_CHECK_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const SLUGS: Readonly<Record<string, Key>> = {
  audit: 'sc.s.audit',
  summary: 'sc.s.summary',
  catalogue: 'sc.s.catalogue',
  csv: 'sc.s.csv',
  'source list': 'sc.s.source-list',
  review: 'sc.s.review',
  calendar: 'sc.s.calendar',
  'qa counts': 'sc.s.qa-counts',
  completeness: 'sc.s.completeness',
  credits: 'sc.s.credits',
};

/** The reader-facing name of a compared surface; an unknown name is shown as given. */
export function surfaceLabel(surface: string, locale: Locale): string {
  const key = SLUGS[surface];
  return key === undefined ? surface : tx(locale, key);
}

export function renderSelfCheckHtml(check: SelfCheck, locale: Locale): string {
  const heading = `<h2 id="ds-selfcheck-title">${escapeHtml(tx(locale, 'sc.title'))}</h2>`;
  const intro = `<p>${escapeHtml(tx(locale, 'sc.intro'))}</p>`;
  const compared =
    check.surfaces.length === 0
      ? ''
      : `<p>${escapeHtml(tx(locale, 'sc.compared', { list: check.surfaces.map((s) => surfaceLabel(s, locale)).join(tx(locale, 'sc.list.join')) }))}</p>`;
  let result: string;
  if (check.ok) {
    result = `<p role="status">${escapeHtml(tx.count(locale, 'sc.ok', check.surfaces.length))}</p>`;
  } else {
    result =
      `<p role="status">${escapeHtml(tx.count(locale, 'sc.found', check.problems.length))}</p>` +
      `<ul>${check.shown.map((p) => `<li lang="en">${escapeHtml(p)}</li>`).join('')}</ul>` +
      (check.hidden > 0 ? `<p>${escapeHtml(tx.count(locale, 'sc.more', check.hidden))}</p>` : '');
  }
  return `<section aria-labelledby="ds-selfcheck-title">${heading}${intro}${compared}${result}</section>`;
}
