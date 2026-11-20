/**
 * Pages recorded for more than one source. When two sources point at the same page, their
 * licence and tier would be expected to match, and the retrieved dates show which copy is
 * older. This lists those pages and says which facts differ. It is a prompt to look: nothing
 * is corrected, and a difference is not called an error.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { formatDisplayDate } from './locale';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { UNKNOWN_WORD } from './unknownWord';

export const MAX_SHARED_PAGES = 20;
export const SHARED_FIELDS = ['licence', 'date', 'tier'] as const;
export type SharedField = (typeof SHARED_FIELDS)[number];

/**
 * The page address in one spelling, so that small differences do not hide a match: the scheme
 * and host in lower case, no fragment, no trailing slash on the path, no default port. Only
 * http and https addresses are compared; anything else gives null.
 */
export function normalisePageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : '';
  return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
}

export interface SharedPage {
  /** The address in its compared spelling. */
  url: string;
  sources: AuditedSource[];
  /** The facts that are not the same on every source of this page, in the fixed order. */
  differs: SharedField[];
}

export interface SharedPages {
  pages: SharedPage[];
  /** How many pages are shared, before the limit. */
  total: number;
  /** How many of them have at least one fact that differs, before the limit. */
  differing: number;
  /** How many sources have a page address that can be compared. */
  withPage: number;
  sourceCount: number;
}

function factOf(s: AuditedSource, field: SharedField): string {
  if (field === 'licence') return (s.licence ?? '').trim().toLowerCase();
  if (field === 'tier') return s.tier ?? '';
  // A date in the future is not a usable retrieved date, so it compares as not known.
  return s.state === 'unknown' ? '' : (s.retrievedIso ?? '');
}

/** Pages with a difference first, then the pages with more sources, then by address. */
export function buildSharedPages(audit: AuditResult, limit: number = MAX_SHARED_PAGES): SharedPages {
  const byUrl = new Map<string, AuditedSource[]>();
  let withPage = 0;
  for (const s of audit.sources) {
    const key = normalisePageUrl(s.url);
    if (key === null) continue;
    withPage += 1;
    const list = byUrl.get(key);
    if (list) list.push(s);
    else byUrl.set(key, [s]);
  }
  const pages: SharedPage[] = [];
  for (const [url, sources] of byUrl) {
    if (sources.length < 2) continue;
    const differs = SHARED_FIELDS.filter((f) => new Set(sources.map((s) => factOf(s, f))).size > 1);
    pages.push({ url, sources, differs });
  }
  pages.sort((a, b) => Number(b.differs.length > 0) - Number(a.differs.length > 0) || b.sources.length - a.sources.length || a.url.localeCompare(b.url));
  return {
    pages: pages.slice(0, Math.max(0, Math.trunc(limit))),
    total: pages.length,
    differing: pages.filter((p) => p.differs.length > 0).length,
    withPage,
    sourceCount: audit.sources.length,
  };
}

type Key =
  | 'sp.title'
  | 'sp.intro'
  | 'sp.none'
  | 'sp.noPages'
  | 'sp.summary.one'
  | 'sp.summary.other'
  | 'sp.differing.one'
  | 'sp.differing.other'
  | 'sp.allSame'
  | 'sp.more.one'
  | 'sp.more.other'
  | 'sp.caption'
  | 'sp.colSource'
  | 'sp.colLicence'
  | 'sp.colRetrieved'
  | 'sp.colTier'
  | 'sp.field.licence'
  | 'sp.field.date'
  | 'sp.field.tier'
  | 'sp.differs'
  | 'sp.same'
  | 'sp.join'
  | 'sp.count.one'
  | 'sp.count.other';

const MESSAGES: Messages<Key> = {
  en: {
    'sp.title': 'Pages recorded for more than one source',
    'sp.intro': 'When two sources point at the same page, their licence and tier would be expected to match. A difference is a prompt to look at both records, not a finding about the data.',
    'sp.none': 'No page is recorded for more than one source.',
    'sp.noPages': 'No source has a page address that can be compared.',
    'sp.summary.one': '{n} page is recorded for more than one source.',
    'sp.summary.other': '{n} pages are recorded for more than one source.',
    'sp.differing.one': 'On {n} of them, at least one fact differs between the sources.',
    'sp.differing.other': 'On {n} of them, at least one fact differs between the sources.',
    'sp.allSame': 'On each of them, the licence, retrieved date and tier are the same on every source.',
    'sp.more.one': '{n} more page is not shown here.',
    'sp.more.other': '{n} more pages are not shown here.',
    'sp.caption': 'Sources recorded for {page}',
    'sp.colSource': 'Source',
    'sp.colLicence': 'Licence',
    'sp.colRetrieved': 'Retrieved',
    'sp.colTier': 'Tier',
    'sp.field.licence': 'licence',
    'sp.field.date': 'retrieved date',
    'sp.field.tier': 'tier',
    'sp.differs': 'Differs between these sources: {list}.',
    'sp.same': 'Licence, retrieved date and tier are the same on these sources.',
    'sp.join': ', ',
    'sp.count.one': '{page} ({n} source)',
    'sp.count.other': '{page} ({n} sources)',
  },
  fr: {
    'sp.title': 'Pages consignées pour plus d’une source',
    'sp.intro': 'Lorsque deux sources renvoient à la même page, on s’attend à ce que leur licence et leur niveau concordent. Un écart invite à regarder les deux enregistrements. Il ne dit rien des données elles-mêmes.',
    'sp.none': 'Aucune page n’est consignée pour plus d’une source.',
    'sp.noPages': 'Aucune source n’a d’adresse de page comparable.',
    'sp.summary.one': '{n} page est consignée pour plus d’une source.',
    'sp.summary.other': '{n} pages sont consignées pour plus d’une source.',
    'sp.differing.one': 'Pour {n} d’entre elles, au moins un élément diffère d’une source à l’autre.',
    'sp.differing.other': 'Pour {n} d’entre elles, au moins un élément diffère d’une source à l’autre.',
    'sp.allSame': 'Pour chacune, la licence, la date de récupération et le niveau sont les mêmes sur toutes les sources.',
    'sp.more.one': '{n} autre page n’est pas présentée ici.',
    'sp.more.other': '{n} autres pages ne sont pas présentées ici.',
    'sp.caption': 'Sources consignées pour {page}',
    'sp.colSource': 'Source',
    'sp.colLicence': 'Licence',
    'sp.colRetrieved': 'Récupération',
    'sp.colTier': 'Niveau',
    'sp.field.licence': 'licence',
    'sp.field.date': 'date de récupération',
    'sp.field.tier': 'niveau',
    'sp.differs': 'Diffère d’une source à l’autre\u00A0: {list}.',
    'sp.same': 'La licence, la date de récupération et le niveau sont les mêmes sur ces sources.',
    'sp.join': ', ',
    'sp.count.one': '{page} ({n} source)',
    'sp.count.other': '{page} ({n} sources)',
  },
};

export const SHARED_PAGE_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

/** The address without its scheme, which is how it is shown and named. */
export function pageLabel(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function sharedFieldLabel(field: SharedField, locale: Locale): string {
  return tx(locale, `sp.field.${field}`);
}

export function differsText(page: SharedPage, locale: Locale): string {
  if (page.differs.length === 0) return tx(locale, 'sp.same');
  return tx(locale, 'sp.differs', { list: page.differs.map((f) => sharedFieldLabel(f, locale)).join(tx(locale, 'sp.join')) });
}

/** The counts in sentences: how many pages are shared, and on how many something differs. Empty when none is shared. */
export function sharedPagesSummary(d: SharedPages, locale: Locale): string[] {
  if (d.total === 0) return [];
  const out = [tx.count(locale, 'sp.summary', d.total)];
  out.push(d.differing === 0 ? tx(locale, 'sp.allSame') : tx.count(locale, 'sp.differing', d.differing));
  if (d.total > d.pages.length) out.push(tx.count(locale, 'sp.more', d.total - d.pages.length));
  return out;
}

function retrievedText(s: AuditedSource, locale: Locale): string {
  return s.state === 'unknown' || s.retrievedIso === null ? UNKNOWN_WORD : formatDisplayDate(s.retrievedIso, locale);
}

export function renderSharedPagesHtml(d: SharedPages, locale: Locale): string {
  const heading = `<h2 id="ds-shared-title">${escapeHtml(tx(locale, 'sp.title'))}</h2>`;
  const open = `<section aria-labelledby="ds-shared-title" data-shared-pages="${d.total}">${heading}`;
  if (d.total === 0) return `${open}<p>${escapeHtml(tx(locale, d.withPage === 0 && d.sourceCount > 0 ? 'sp.noPages' : 'sp.none'))}</p></section>`;
  const summary = sharedPagesSummary(d, locale)
    .map((s) => `<p>${escapeHtml(s)}</p>`)
    .join('');
  const heads = (['sp.colSource', 'sp.colLicence', 'sp.colRetrieved', 'sp.colTier'] as const).map((k) => `<th scope="col">${escapeHtml(tx(locale, k))}</th>`).join('');
  const blocks = d.pages
    .map((page, i) => {
      const label = pageLabel(page.url);
      const rows = page.sources
        .map(
          (s) =>
            `<tr><th scope="row">${escapeHtml(`${s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`)}</th><td>${escapeHtml(s.licence ?? UNKNOWN_WORD)}</td>` +
            `<td>${escapeHtml(retrievedText(s, locale))}</td><td>${escapeHtml(s.tier ?? UNKNOWN_WORD)}</td></tr>`,
        )
        .join('');
      return (
        `<section aria-labelledby="ds-shared-${i + 1}" data-differs="${page.differs.join(' ')}"><h3 id="ds-shared-${i + 1}">${escapeHtml(tx.count(locale, 'sp.count', page.sources.length, { page: label }))}</h3>` +
        `<p>${escapeHtml(differsText(page, locale))}</p>` +
        `<table><caption>${escapeHtml(tx(locale, 'sp.caption', { page: label }))}</caption><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></section>`
      );
    })
    .join('');
  return `${open}<p>${escapeHtml(tx(locale, 'sp.intro'))}</p>${summary}${blocks}</section>`;
}
