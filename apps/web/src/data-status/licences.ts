/**
 * Reference table for the open licences the App accepts, plus alias recognition.
 * Recognition is exact-by-alias: a licence name that is not in the table stays
 * unrecognised (null). Nothing here guesses a licence from similar-looking text.
 * Links are reference pages; publishers' own current terms always apply.
 */
import type { Locale } from './dataStatus';

export interface LicenceInfo {
  id: string;
  name: { en: string; fr: string };
  url: string;
  /** Credit to the source must be given when reusing. */
  attribution: boolean;
  /** Derived work must be shared under the same terms. */
  shareAlike: boolean;
}

export const LICENCES: readonly LicenceInfo[] = [
  {
    id: 'CC0-1.0',
    name: { en: 'CC0 1.0 Universal (public domain dedication)', fr: 'CC0 1.0 Universel (transfert au domaine public)' },
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: false,
    shareAlike: false,
  },
  {
    id: 'CC-BY-4.0',
    name: { en: 'Creative Commons Attribution 4.0 International', fr: 'Creative Commons Attribution 4.0 International' },
    url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true,
    shareAlike: false,
  },
  {
    id: 'CC-BY-SA-4.0',
    name: {
      en: 'Creative Commons Attribution-ShareAlike 4.0 International',
      fr: 'Creative Commons Attribution – Partage dans les mêmes conditions 4.0 International',
    },
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: true,
    shareAlike: true,
  },
  {
    id: 'ODbL-1.0',
    name: { en: 'Open Database Licence (ODbL) 1.0', fr: 'Licence ouverte de base de données (ODbL) 1.0' },
    url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: true,
    shareAlike: true,
  },
  {
    id: 'ODC-By-1.0',
    name: { en: 'Open Data Commons Attribution Licence 1.0', fr: 'Licence Open Data Commons Attribution 1.0' },
    url: 'https://opendatacommons.org/licenses/by/1-0/',
    attribution: true,
    shareAlike: false,
  },
  {
    id: 'PDDL-1.0',
    name: {
      en: 'Open Data Commons Public Domain Dedication and Licence 1.0',
      fr: 'Licence et dédicace au domaine public Open Data Commons 1.0',
    },
    url: 'https://opendatacommons.org/licenses/pddl/1-0/',
    attribution: false,
    shareAlike: false,
  },
  {
    id: 'OGL-Canada-2.0',
    name: { en: 'Open Government Licence – Canada 2.0', fr: 'Licence du gouvernement ouvert – Canada 2.0' },
    url: 'https://open.canada.ca/en/open-government-licence-canada',
    attribution: true,
    shareAlike: false,
  },
  {
    id: 'OGL-Ontario',
    name: { en: 'Open Government Licence – Ontario', fr: 'Licence du gouvernement ouvert – Ontario' },
    url: 'https://www.ontario.ca/page/open-government-licence-ontario',
    attribution: true,
    shareAlike: false,
  },
];

/** Lower-case, strip accents and punctuation, collapse spaces: "CC BY 4.0" ~ "cc-by-4.0". */
export function licenceKey(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

const EXTRA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'CC0-1.0': ['cc0', 'cc0 1.0 universal', 'cc zero 1.0'],
  'CC-BY-4.0': ['creative commons attribution 4.0', 'creative commons attribution 4.0 international', 'cc by 4.0 international'],
  'CC-BY-SA-4.0': [
    'creative commons attribution sharealike 4.0',
    'creative commons attribution share alike 4.0',
    'creative commons attribution sharealike 4.0 international',
    'cc by sa 4.0 international',
  ],
  'ODbL-1.0': ['odbl', 'open database license odbl 1.0', 'open database licence odbl 1.0', 'open database license', 'open database licence'],
  'ODC-By-1.0': ['odc by', 'open data commons attribution license 1.0', 'open data commons attribution licence 1.0'],
  'PDDL-1.0': ['pddl', 'open data commons public domain dedication and license 1.0', 'open data commons public domain dedication and licence 1.0'],
  'OGL-Canada-2.0': [
    'ogl canada',
    'open government licence canada',
    'open government license canada',
    'open government licence canada 2.0',
    'open government license canada 2.0',
    'licence du gouvernement ouvert canada',
    'licence du gouvernement ouvert canada 2.0',
  ],
  'OGL-Ontario': [
    'ogl ontario 1.0',
    'open government licence ontario',
    'open government license ontario',
    'licence du gouvernement ouvert ontario',
  ],
};

const ALIAS_TO_ID: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const l of LICENCES) {
    m.set(licenceKey(l.id), l.id);
    m.set(licenceKey(l.name.en), l.id);
    m.set(licenceKey(l.name.fr), l.id);
    for (const a of EXTRA_ALIASES[l.id] ?? []) m.set(licenceKey(a), l.id);
  }
  return m;
})();

export interface LicenceMatch {
  /** Canonical id, or null when the text is not a recognised licence name. */
  id: string | null;
  /** true when the recognised text differed from the canonical id. */
  changed: boolean;
}

export function normaliseLicence(raw: string | null | undefined): LicenceMatch {
  if (typeof raw !== 'string' || raw.trim() === '') return { id: null, changed: false };
  const id = ALIAS_TO_ID.get(licenceKey(raw)) ?? null;
  return { id, changed: id !== null && raw.trim() !== id };
}

export function licenceInfo(id: string | null | undefined): LicenceInfo | null {
  return LICENCES.find((l) => l.id === id) ?? null;
}

export function licenceName(id: string, locale: Locale): string | null {
  return licenceInfo(id)?.name[locale] ?? null;
}
