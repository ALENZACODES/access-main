/**
 * Patterns worth a second look. None of these is an error and none changes a status: each is
 * something that is sometimes a slip made while recording a source (the same name twice in one
 * dataset, one licence written two ways, a date on the first of January). The panel lists them
 * so a person can look. It does not decide for them, and it corrects nothing.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { foldText } from './searchText';
import { escapeHtml } from './sourceList';

export const ODDITY_CODES = ['same-name', 'licence-spelling', 'plain-http', 'very-old', 'name-is-address', 'first-of-january'] as const;
export type OddityCode = (typeof ODDITY_CODES)[number];

/** A retrieved date older than this many days is listed as possibly mistyped. About five years. */
export const VERY_OLD_DAYS = 1826;
export const MAX_ODDITY_EXAMPLES = 5;

export interface OddityItem {
  /** The sources this is about. One for most checks, two or more for a shared name or a licence written several ways. */
  sources: AuditedSource[];
  /** What was seen, as recorded: the shared name, the spellings, the address or the date. */
  detail: string;
}

export interface OddityGroup {
  code: OddityCode;
  items: OddityItem[];
}

export interface Oddities {
  groups: OddityGroup[];
  /** Items across all groups. */
  total: number;
  sourceCount: number;
}

function nameKey(s: AuditedSource): string {
  return s.name === null ? '' : foldText(s.name);
}

/** A licence text in one spelling: folded, with punctuation and spaces dropped. */
export function licenceKey(licence: string | null): string {
  return licence === null ? '' : foldText(licence).replace(/[^\p{L}\p{N}]+/gu, '');
}

function sameName(audit: AuditResult): OddityItem[] {
  const groups = new Map<string, AuditedSource[]>();
  for (const s of audit.sources) {
    const key = nameKey(s);
    if (key === '') continue;
    const k = `${s.datasetId}\u0000${key}`;
    const list = groups.get(k);
    if (list) list.push(s);
    else groups.set(k, [s]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((sources) => ({ sources, detail: sources[0]?.name ?? '' }));
}

function licenceSpelling(audit: AuditResult): OddityItem[] {
  const groups = new Map<string, { spellings: Map<string, AuditedSource[]> }>();
  for (const s of audit.sources) {
    const key = licenceKey(s.licence);
    if (key === '' || s.licence === null) continue;
    let g = groups.get(key);
    if (g === undefined) {
      g = { spellings: new Map() };
      groups.set(key, g);
    }
    const text = s.licence.trim();
    const list = g.spellings.get(text);
    if (list) list.push(s);
    else g.spellings.set(text, [s]);
  }
  const out: OddityItem[] = [];
  for (const g of groups.values()) {
    if (g.spellings.size < 2) continue;
    // The spelling used most is taken as the usual one; the sources listed are those written another way.
    const ranked = [...g.spellings.entries()].sort((a, b) => b[1].length - a[1].length);
    const others = ranked.slice(1);
    out.push({ sources: others.flatMap(([, list]) => list), detail: ranked.map(([text]) => text).join(' / ') });
  }
  return out;
}

function isPlainHttp(url: string | null): boolean {
  return url !== null && /^http:\/\//i.test(url.trim());
}

function looksLikeAddress(name: string | null): boolean {
  return name !== null && /^(https?:\/\/|www\.)\S+$/i.test(name.trim());
}

function single(audit: AuditResult, test: (s: AuditedSource) => boolean, detail: (s: AuditedSource) => string): OddityItem[] {
  return audit.sources.filter(test).map((s) => ({ sources: [s], detail: detail(s) }));
}

/** Every group that has at least one item, in the fixed order of the checks. */
export function buildOddities(audit: AuditResult): Oddities {
  const found: Record<OddityCode, OddityItem[]> = {
    'same-name': sameName(audit),
    'licence-spelling': licenceSpelling(audit),
    'plain-http': single(audit, (s) => isPlainHttp(s.url), (s) => s.url ?? ''),
    'very-old': single(audit, (s) => s.ageDays !== null && s.ageDays > VERY_OLD_DAYS, (s) => s.retrievedIso ?? ''),
    'name-is-address': single(audit, (s) => looksLikeAddress(s.name), (s) => s.name ?? ''),
    // A usable date only: a date in the future or one that cannot be read is already a finding.
    'first-of-january': single(audit, (s) => s.state !== 'unknown' && s.retrievedIso !== null && s.retrievedIso.endsWith('-01-01'), (s) => s.retrievedIso ?? ''),
  };
  const groups = ODDITY_CODES.filter((code) => found[code].length > 0).map((code) => ({ code, items: found[code] }));
  return { groups, total: groups.reduce((n, g) => n + g.items.length, 0), sourceCount: audit.sources.length };
}

type Key =
  | 'od.title'
  | 'od.intro'
  | 'od.none'
  | 'od.empty'
  | 'od.summary.one'
  | 'od.summary.other'
  | 'od.more.one'
  | 'od.more.other'
  | 'od.item'
  | 'od.join'
  | `od.t.${OddityCode}`
  | `od.why.${OddityCode}`
  | `od.count.${OddityCode}.one`
  | `od.count.${OddityCode}.other`;

const MESSAGES: Messages<Key> = {
  en: {
    'od.title': 'Worth a second look',
    'od.intro': 'None of these is an error, and none changes a status. Each is a pattern that is sometimes a slip made while recording a source.',
    'od.none': 'Nothing stands out in the records saved on this device.',
    'od.empty': 'There are no sources to look at.',
    'od.summary.one': '{n} thing to look at.',
    'od.summary.other': '{n} things to look at.',
    'od.more.one': 'And {n} more.',
    'od.more.other': 'And {n} more.',
    'od.item': '{sources}. Recorded: {detail}',
    'od.join': '; ',
    'od.t.same-name': 'The same name twice in one dataset',
    'od.t.licence-spelling': 'One licence written more than one way',
    'od.t.plain-http': 'A page address that does not start with https',
    'od.t.very-old': 'A retrieved date more than five years ago',
    'od.t.name-is-address': 'A name that is a web address',
    'od.t.first-of-january': 'A retrieved date on the first of January',
    'od.why.same-name': 'Two sources with one name are hard to tell apart in the list. One of them may be a copy.',
    'od.why.licence-spelling': 'The spellings below differ only in capitals, spaces or punctuation. Using one spelling keeps the counts by licence together.',
    'od.why.plain-http': 'The address may have changed since it was recorded. Many publishers have moved their pages to https.',
    'od.why.very-old': 'The date may be right. It is listed because a slip in the year gives a date like this.',
    'od.why.name-is-address': 'An address in place of a name is hard to read in the list and in the files.',
    'od.why.first-of-january': 'The date may be right. It is listed because the first of January is sometimes entered when only the year is known.',
    'od.count.same-name.one': '{n} name is used more than once',
    'od.count.same-name.other': '{n} names are used more than once',
    'od.count.licence-spelling.one': '{n} licence is written more than one way',
    'od.count.licence-spelling.other': '{n} licences are written more than one way',
    'od.count.plain-http.one': '{n} source',
    'od.count.plain-http.other': '{n} sources',
    'od.count.very-old.one': '{n} source',
    'od.count.very-old.other': '{n} sources',
    'od.count.name-is-address.one': '{n} source',
    'od.count.name-is-address.other': '{n} sources',
    'od.count.first-of-january.one': '{n} source',
    'od.count.first-of-january.other': '{n} sources',
  },
  fr: {
    'od.title': 'À regarder de plus près',
    'od.intro': 'Rien de ceci n’est une erreur, et rien ne change un état. Chaque point est une forme qui résulte parfois d’une inattention au moment de consigner une source.',
    'od.none': 'Rien ne ressort dans les enregistrements conservés sur cet appareil.',
    'od.empty': 'Il n’y a aucune source à regarder.',
    'od.summary.one': '{n} point à regarder.',
    'od.summary.other': '{n} points à regarder.',
    'od.more.one': 'Et {n} de plus.',
    'od.more.other': 'Et {n} de plus.',
    'od.item': '{sources}. Consigné\u00A0: {detail}',
    'od.join': '\u202F; ',
    'od.t.same-name': 'Le même nom deux fois dans un jeu de données',
    'od.t.licence-spelling': 'Une licence écrite de plus d’une façon',
    'od.t.plain-http': 'Une adresse de page qui ne commence pas par https',
    'od.t.very-old': 'Une date de récupération vieille de plus de cinq ans',
    'od.t.name-is-address': 'Un nom qui est une adresse Web',
    'od.t.first-of-january': 'Une date de récupération au premier janvier',
    'od.why.same-name': 'Deux sources qui portent le même nom sont difficiles à distinguer dans la liste. L’une d’elles est peut-être une copie.',
    'od.why.licence-spelling': 'Les graphies ci-dessous ne diffèrent que par les majuscules, les espaces ou la ponctuation. Une seule graphie garde ensemble les nombres par licence.',
    'od.why.plain-http': 'L’adresse a peut-être changé depuis qu’elle a été consignée. De nombreux diffuseurs ont déplacé leurs pages vers https.',
    'od.why.very-old': 'La date est peut-être exacte. Elle figure ici parce qu’une année mal saisie donne une date de ce genre.',
    'od.why.name-is-address': 'Une adresse à la place d’un nom se lit mal dans la liste et dans les fichiers.',
    'od.why.first-of-january': 'La date est peut-être exacte. Elle figure ici parce que le premier janvier est parfois saisi lorsque seule l’année est connue.',
    'od.count.same-name.one': '{n} nom est utilisé plus d’une fois',
    'od.count.same-name.other': '{n} noms sont utilisés plus d’une fois',
    'od.count.licence-spelling.one': '{n} licence est écrite de plus d’une façon',
    'od.count.licence-spelling.other': '{n} licences sont écrites de plus d’une façon',
    'od.count.plain-http.one': '{n} source',
    'od.count.plain-http.other': '{n} sources',
    'od.count.very-old.one': '{n} source',
    'od.count.very-old.other': '{n} sources',
    'od.count.name-is-address.one': '{n} source',
    'od.count.name-is-address.other': '{n} sources',
    'od.count.first-of-january.one': '{n} source',
    'od.count.first-of-january.other': '{n} sources',
  },
};

export const ODDITY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function oddityTitle(code: OddityCode, locale: Locale): string {
  return tx(locale, `od.t.${code}`);
}

export function oddityWhy(code: OddityCode, locale: Locale): string {
  return tx(locale, `od.why.${code}`);
}

export function oddityCountText(g: OddityGroup, locale: Locale): string {
  return tx.count(locale, `od.count.${g.code}`, g.items.length);
}

function sourceLabel(s: AuditedSource, locale: Locale): string {
  return `${s.datasetName.trim() === '' ? s.datasetId : s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`;
}

/** One item in words: the sources it is about, then what was recorded. */
export function oddityItemText(item: OddityItem, locale: Locale): string {
  const names = [...new Set(item.sources.map((s) => sourceLabel(s, locale)))];
  return tx(locale, 'od.item', { sources: names.join(tx(locale, 'od.join')), detail: item.detail });
}

export function odditiesSummary(d: Oddities, locale: Locale): string {
  if (d.sourceCount === 0) return tx(locale, 'od.empty');
  return d.total === 0 ? tx(locale, 'od.none') : tx.count(locale, 'od.summary', d.total);
}

export function renderOdditiesHtml(d: Oddities, locale: Locale, maxExamples: number = MAX_ODDITY_EXAMPLES): string {
  const open = `<section aria-labelledby="ds-odd-title" data-oddities="${d.total}"><h2 id="ds-odd-title">${escapeHtml(tx(locale, 'od.title'))}</h2>`;
  if (d.total === 0) return `${open}<p>${escapeHtml(odditiesSummary(d, locale))}</p></section>`;
  const groups = d.groups
    .map((g, i) => {
      const id = `ds-odd-${i + 1}`;
      const shown = g.items.slice(0, Math.max(0, maxExamples));
      const items = shown.map((item) => `<li>${escapeHtml(oddityItemText(item, locale))}</li>`).join('');
      const more = g.items.length > shown.length ? `<p>${escapeHtml(tx.count(locale, 'od.more', g.items.length - shown.length))}</p>` : '';
      return (
        `<section aria-labelledby="${id}" data-oddity="${g.code}"><h3 id="${id}">${escapeHtml(oddityTitle(g.code, locale))}</h3>` +
        `<p>${escapeHtml(oddityCountText(g, locale))}. ${escapeHtml(oddityWhy(g.code, locale))}</p><ul>${items}</ul>${more}</section>`
      );
    })
    .join('');
  return `${open}<p>${escapeHtml(tx(locale, 'od.intro'))}</p><p>${escapeHtml(odditiesSummary(d, locale))}</p>${groups}</section>`;
}
