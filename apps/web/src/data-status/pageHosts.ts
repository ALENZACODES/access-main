/**
 * The sources grouped by the web site their page is on. Checking that pages still open is done
 * one site at a time, so this shows how many sources each site carries, in which datasets, and
 * whether every address on it starts with https. Sources with no page address, or one that is
 * not a web address, are counted together under UNKNOWN. No page is opened to make this table.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';
import { UNKNOWN_WORD } from './unknownWord';

export const MAX_PAGE_HOSTS = 20;

/** The site of a page address: its host in lower case, without a leading "www.". Null for anything that is not a web address. */
export function pageHost(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return host === '' ? null : host;
}

export interface PageHost {
  /** The site; '' for sources with no usable page address. */
  host: string;
  sources: AuditedSource[];
  /** Dataset names, in the order met. */
  datasets: string[];
  /** Distinct page addresses on this site, as recorded (trimmed). */
  pages: number;
  /** Sources on this site whose address does not start with https. */
  notHttps: number;
}

export interface PageHosts {
  hosts: PageHost[];
  /** Sites, before the limit, not counting the UNKNOWN row. */
  named: number;
  /** Sources with no usable page address. */
  unknown: number;
  sourceCount: number;
}

/** Sites with the most sources first, then by name; the UNKNOWN row always last. */
export function buildPageHosts(audit: AuditResult, limit: number = MAX_PAGE_HOSTS): PageHosts {
  const byHost = new Map<string, PageHost & { seen: Set<string> }>();
  for (const s of audit.sources) {
    const host = pageHost(s.url) ?? '';
    let h = byHost.get(host);
    if (h === undefined) {
      h = { host, sources: [], datasets: [], pages: 0, notHttps: 0, seen: new Set() };
      byHost.set(host, h);
    }
    h.sources.push(s);
    const dataset = s.datasetName.trim() === '' ? s.datasetId : s.datasetName;
    if (!h.datasets.includes(dataset)) h.datasets.push(dataset);
    if (host !== '' && s.url !== null) {
      const page = s.url.trim();
      if (!h.seen.has(page)) {
        h.seen.add(page);
        h.pages += 1;
      }
      if (!/^https:\/\//i.test(page)) h.notHttps += 1;
    }
  }
  const strip = (h: PageHost & { seen: Set<string> }): PageHost => ({ host: h.host, sources: h.sources, datasets: h.datasets, pages: h.pages, notHttps: h.notHttps });
  const unknownRow = byHost.get('');
  const named = [...byHost.values()].filter((h) => h.host !== '').sort((a, b) => b.sources.length - a.sources.length || a.host.localeCompare(b.host));
  const shown = named.slice(0, Math.max(0, Math.trunc(limit))).map(strip);
  return { hosts: unknownRow ? [...shown, strip(unknownRow)] : shown, named: named.length, unknown: unknownRow?.sources.length ?? 0, sourceCount: audit.sources.length };
}

type Key =
  | 'ph.title'
  | 'ph.intro'
  | 'ph.none'
  | 'ph.caption'
  | 'ph.colHost'
  | 'ph.colSources'
  | 'ph.colPages'
  | 'ph.colDatasets'
  | 'ph.colHttps'
  | 'ph.join'
  | 'ph.allHttps'
  | 'ph.notHttps.one'
  | 'ph.notHttps.other'
  | 'ph.notApplicable'
  | 'ph.summary.one'
  | 'ph.summary.other'
  | 'ph.unknown.one'
  | 'ph.unknown.other'
  | 'ph.more.one'
  | 'ph.more.other';

const MESSAGES: Messages<Key> = {
  en: {
    'ph.title': 'Sources by web site',
    'ph.intro': 'The web site is read from the page address recorded for each source. No page is opened to make this table, so it does not say whether a page still exists.',
    'ph.none': 'There are no sources to group.',
    'ph.caption': 'Web sites, with the most sources first',
    'ph.colHost': 'Web site',
    'ph.colSources': 'Sources',
    'ph.colPages': 'Different pages',
    'ph.colDatasets': 'Datasets',
    'ph.colHttps': 'Addresses',
    'ph.join': '; ',
    'ph.allHttps': 'All start with https',
    'ph.notHttps.one': '{n} does not start with https',
    'ph.notHttps.other': '{n} do not start with https',
    'ph.notApplicable': 'Does not apply',
    'ph.summary.one': 'The pages recorded are on {n} web site.',
    'ph.summary.other': 'The pages recorded are on {n} web sites.',
    'ph.unknown.one': '{n} source has no page address that can be read.',
    'ph.unknown.other': '{n} sources have no page address that can be read.',
    'ph.more.one': '{n} more web site is not shown here.',
    'ph.more.other': '{n} more web sites are not shown here.',
  },
  fr: {
    'ph.title': 'Sources par site Web',
    'ph.intro': 'Le site Web est tiré de l’adresse de page consignée pour chaque source. Aucune page n’est ouverte pour produire ce tableau, il ne dit donc pas si une page existe encore.',
    'ph.none': 'Il n’y a aucune source à regrouper.',
    'ph.caption': 'Sites Web, en commençant par ceux qui ont le plus de sources',
    'ph.colHost': 'Site Web',
    'ph.colSources': 'Sources',
    'ph.colPages': 'Pages différentes',
    'ph.colDatasets': 'Jeux de données',
    'ph.colHttps': 'Adresses',
    'ph.join': '\u202F; ',
    'ph.allHttps': 'Toutes commencent par https',
    'ph.notHttps.one': '{n} ne commence pas par https',
    'ph.notHttps.other': '{n} ne commencent pas par https',
    'ph.notApplicable': 'Sans objet',
    'ph.summary.one': 'Les pages consignées se trouvent sur {n} site Web.',
    'ph.summary.other': 'Les pages consignées se trouvent sur {n} sites Web.',
    'ph.unknown.one': '{n} source n’a aucune adresse de page lisible.',
    'ph.unknown.other': '{n} sources n’ont aucune adresse de page lisible.',
    'ph.more.one': '{n} autre site Web n’est pas présenté ici.',
    'ph.more.other': '{n} autres sites Web ne sont pas présentés ici.',
  },
};

export const PAGE_HOST_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function pageHostName(h: PageHost): string {
  return h.host === '' ? UNKNOWN_WORD : h.host;
}

export function pageHostHttpsText(h: PageHost, locale: Locale): string {
  if (h.host === '') return tx(locale, 'ph.notApplicable');
  return h.notHttps === 0 ? tx(locale, 'ph.allHttps') : tx.count(locale, 'ph.notHttps', h.notHttps);
}

/** The counts in sentences. Empty when there is no source. */
export function pageHostsSummary(d: PageHosts, locale: Locale): string[] {
  if (d.sourceCount === 0) return [];
  const out = d.named === 0 ? [] : [tx.count(locale, 'ph.summary', d.named)];
  if (d.unknown > 0) out.push(tx.count(locale, 'ph.unknown', d.unknown));
  const shown = d.hosts.filter((h) => h.host !== '').length;
  if (d.named > shown) out.push(tx.count(locale, 'ph.more', d.named - shown));
  return out;
}

/** The table as rows of text: a heading row, then one row per site shown. */
export function pageHostRows(d: PageHosts, locale: Locale): string[][] {
  return [
    (['ph.colHost', 'ph.colSources', 'ph.colPages', 'ph.colDatasets', 'ph.colHttps'] as const).map((k) => tx(locale, k)),
    ...d.hosts.map((h) => [pageHostName(h), String(h.sources.length), h.host === '' ? tx(locale, 'ph.notApplicable') : String(h.pages), h.datasets.join(tx(locale, 'ph.join')), pageHostHttpsText(h, locale)]),
  ];
}

export function renderPageHostsHtml(d: PageHosts, locale: Locale): string {
  const open = `<section aria-labelledby="ds-hosts-title" data-page-hosts="${d.named}"><h2 id="ds-hosts-title">${escapeHtml(tx(locale, 'ph.title'))}</h2>`;
  if (d.sourceCount === 0) return `${open}<p>${escapeHtml(tx(locale, 'ph.none'))}</p></section>`;
  const [head, ...rows] = pageHostRows(d, locale);
  const heads = (head ?? []).map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows.map((r) => `<tr><th scope="row">${escapeHtml(r[0] ?? '')}</th>${r.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  const summary = pageHostsSummary(d, locale)
    .map((s) => `<p>${escapeHtml(s)}</p>`)
    .join('');
  const caption = escapeHtml(tx(locale, 'ph.caption'));
  return (
    `${open}<p>${escapeHtml(tx(locale, 'ph.intro'))}</p>${summary}` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${caption}"><table><caption>${caption}</caption><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></section>`
  );
}
