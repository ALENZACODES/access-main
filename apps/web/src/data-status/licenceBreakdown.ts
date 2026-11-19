/**
 * Sources grouped by licence: which licences are in use, what kind each is, and how many
 * sources rely on it. "Not on the reference list" is not a claim that a licence is closed; it
 * means this app has not listed it. A source with no licence is counted as Unknown.
 */
import type { AuditResult } from './datasetRegistry';
import { licenceKind, type LicenceKind, type Locale } from './dataStatus';
import { licenceName } from './licences';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { t } from './i18n';

export interface LicenceRow {
  /** The licence as recorded (first spelling seen), or null when none is recorded. */
  licence: string | null;
  kind: LicenceKind;
  count: number;
}

export interface LicenceBreakdown {
  rows: LicenceRow[];
  total: number;
  /** Sources on an open licence or accepted provider terms. */
  reusable: number;
}

const keyOf = (licence: string): string => licence.trim().toLocaleLowerCase('en');

export function buildLicenceBreakdown(audit: AuditResult): LicenceBreakdown {
  const byKey = new Map<string, LicenceRow>();
  let unknown = 0;
  for (const s of audit.sources) {
    if (s.licence === null || licenceKind(s.licence) === 'unknown') {
      unknown += 1;
      continue;
    }
    const k = keyOf(s.licence);
    const row = byKey.get(k);
    if (row === undefined) byKey.set(k, { licence: s.licence, kind: licenceKind(s.licence), count: 1 });
    else row.count += 1;
  }
  const rows = [...byKey.values()].sort((a, b) => b.count - a.count || (a.licence ?? '').localeCompare(b.licence ?? ''));
  if (unknown > 0) rows.push({ licence: null, kind: 'unknown', count: unknown });
  const reusable = rows.filter((r) => r.kind === 'open' || r.kind === 'terms').reduce((n, r) => n + r.count, 0);
  return { rows, total: audit.sources.length, reusable };
}

type Key =
  | 'lb.title'
  | 'lb.intro'
  | 'lb.none'
  | 'lb.caption'
  | 'lb.colLicence'
  | 'lb.colType'
  | 'lb.colCount'
  | 'lb.kind.open'
  | 'lb.kind.terms'
  | 'lb.kind.unrecognised'
  | 'lb.kind.unknown'
  | 'lb.summary.one'
  | 'lb.summary.other';

const MESSAGES: Messages<Key> = {
  en: {
    'lb.title': 'Licences in use',
    'lb.intro': 'Each source is counted once under the licence recorded for it. “Not on the reference list” means this app has not listed the licence, not that it is closed.',
    'lb.none': 'There are no sources to group.',
    'lb.caption': 'Sources by licence',
    'lb.colLicence': 'Licence',
    'lb.colType': 'Type',
    'lb.colCount': 'Sources',
    'lb.kind.open': 'Open licence',
    'lb.kind.terms': 'Accepted provider terms',
    'lb.kind.unrecognised': 'Not on the reference list',
    'lb.kind.unknown': 'Unknown',
    'lb.summary.one': '{reusable} of {total} source is on an open licence or accepted terms.',
    'lb.summary.other': '{reusable} of {total} sources are on an open licence or accepted terms.',
  },
  fr: {
    'lb.title': 'Licences utilisées',
    'lb.intro': 'Chaque source est comptée une seule fois sous la licence qui lui est associée. « Absente de la liste de référence » signifie que cette application n’a pas inscrit la licence, et non qu’elle est fermée.',
    'lb.none': 'Il n’y a aucune source à regrouper.',
    'lb.caption': 'Sources selon la licence',
    'lb.colLicence': 'Licence',
    'lb.colType': 'Type',
    'lb.colCount': 'Sources',
    'lb.kind.open': 'Licence ouverte',
    'lb.kind.terms': 'Conditions du diffuseur acceptées',
    'lb.kind.unrecognised': 'Absente de la liste de référence',
    'lb.kind.unknown': 'Inconnue',
    'lb.summary.one': '{reusable} source sur {total} est sous une licence ouverte ou des conditions acceptées.',
    'lb.summary.other': '{reusable} sources sur {total} sont sous une licence ouverte ou des conditions acceptées.',
  },
};

export const LICENCE_BREAKDOWN_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function kindLabel(kind: LicenceKind, locale: Locale): string {
  return tx(locale, `lb.kind.${kind}`);
}

/** The licence's full name when it is on the reference list, else the text as recorded. */
export function licenceDisplay(licence: string | null, locale: Locale): string {
  if (licence === null) return t(locale, 'unknown');
  return licenceName(licence, locale) ?? licence;
}

export function licenceSummary(b: LicenceBreakdown, locale: Locale): string {
  return tx.count(locale, 'lb.summary', b.total, { reusable: b.reusable, total: b.total });
}

export function renderLicenceBreakdownHtml(b: LicenceBreakdown, locale: Locale): string {
  const heading = `<h2 id="ds-licences-title">${escapeHtml(tx(locale, 'lb.title'))}</h2>`;
  if (b.total === 0) return `<section aria-labelledby="ds-licences-title">${heading}<p>${escapeHtml(tx(locale, 'lb.none'))}</p></section>`;
  const body = b.rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(licenceDisplay(r.licence, locale))}</th><td>${escapeHtml(kindLabel(r.kind, locale))}</td><td>${r.count}</td></tr>`,
    )
    .join('');
  return (
    `<section aria-labelledby="ds-licences-title">${heading}<p>${escapeHtml(tx(locale, 'lb.intro'))}</p>` +
    `<table><caption>${escapeHtml(tx(locale, 'lb.caption'))}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(tx(locale, 'lb.colLicence'))}</th><th scope="col">${escapeHtml(tx(locale, 'lb.colType'))}</th>` +
    `<th scope="col">${escapeHtml(tx(locale, 'lb.colCount'))}</th></tr></thead><tbody>${body}</tbody></table>` +
    `<p>${escapeHtml(licenceSummary(b, locale))}</p></section>`
  );
}
