/**
 * Plain-language meanings of the words this panel uses. The status names are taken from the
 * panel's own message table, so the glossary cannot drift from the labels it explains.
 */
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const GLOSSARY_TERMS = ['record', 'source', 'licence', 'openLicence', 'terms', 'retrieved', 'limit', 'fresh', 'stale', 'unknown', 'tier'] as const;
export type GlossaryTerm = (typeof GLOSSARY_TERMS)[number];

export interface GlossaryEntry {
  term: GlossaryTerm;
  name: string;
  meaning: string;
}

type Key = 'gs.title' | 'gs.intro' | `gs.t.${Exclude<GlossaryTerm, 'fresh' | 'stale'>}` | `gs.d.${GlossaryTerm}`;

const MESSAGES: Messages<Key> = {
  en: {
    'gs.title': 'Words used on this panel',
    'gs.intro': 'Short meanings for the terms in the tables.',
    'gs.t.record': 'Record',
    'gs.t.source': 'Source',
    'gs.t.licence': 'Licence',
    'gs.t.openLicence': 'Open licence',
    'gs.t.terms': 'Accepted provider terms',
    'gs.t.retrieved': 'Retrieved date',
    'gs.t.limit': 'Review period',
    'gs.t.unknown': 'Unknown',
    'gs.t.tier': 'Tier',
    'gs.d.record': 'One saved item, such as a place or a journey, together with where it came from.',
    'gs.d.source': 'The publisher or dataset a record was taken from.',
    'gs.d.licence': 'The terms under which the publisher allows the data to be used.',
    'gs.d.openLicence': 'A licence on this app’s reference list that allows reuse, usually with credit to the publisher.',
    'gs.d.terms': 'Terms of use from a provider that this app has accepted for that provider’s data.',
    'gs.d.retrieved': 'The day the data was fetched from the source. It is not the day the publisher last changed it.',
    'gs.d.limit': 'The number of days after the retrieved date before a record is shown as possibly out of date. You can change it for each kind of data.',
    'gs.d.fresh': 'The retrieved date is known and the review period has not passed.',
    'gs.d.stale': 'The retrieved date is known and the review period has passed. The data may still be correct.',
    'gs.d.unknown': 'The value is missing or cannot be used. Nothing is assumed in its place.',
    'gs.d.tier': 'How the information was obtained, written as 0, 1, 2, 3, 4 or E on the record.',
  },
  fr: {
    'gs.title': 'Termes employés dans ce panneau',
    'gs.intro': 'Brève définition des termes des tableaux.',
    'gs.t.record': 'Enregistrement',
    'gs.t.source': 'Source',
    'gs.t.licence': 'Licence',
    'gs.t.openLicence': 'Licence ouverte',
    'gs.t.terms': 'Conditions du diffuseur acceptées',
    'gs.t.retrieved': 'Date de récupération',
    'gs.t.limit': 'Période de révision',
    'gs.t.unknown': 'Inconnu',
    'gs.t.tier': 'Niveau',
    'gs.d.record': 'Un élément enregistré, comme un lieu ou un trajet, accompagné de sa provenance.',
    'gs.d.source': 'Le diffuseur ou le jeu de données d’où provient un enregistrement.',
    'gs.d.licence': 'Les conditions auxquelles le diffuseur permet l’utilisation des données.',
    'gs.d.openLicence': 'Une licence de la liste de référence de cette application qui permet la réutilisation, habituellement avec mention du diffuseur.',
    'gs.d.terms': 'Des conditions d’utilisation d’un diffuseur que cette application a acceptées pour les données de ce diffuseur.',
    'gs.d.retrieved': 'Le jour où les données ont été obtenues de la source. Ce n’est pas le jour de la dernière modification par le diffuseur.',
    'gs.d.limit': 'Le nombre de jours après la date de récupération au terme duquel un enregistrement est présenté comme possiblement périmé. Vous pouvez le modifier pour chaque type de données.',
    'gs.d.fresh': 'La date de récupération est connue et la période de révision n’est pas écoulée.',
    'gs.d.stale': 'La date de récupération est connue et la période de révision est écoulée. Les données peuvent encore être exactes.',
    'gs.d.unknown': 'La valeur est absente ou inutilisable. Rien n’est supposé à sa place.',
    'gs.d.tier': 'La façon dont l’information a été obtenue, inscrite sous la forme 0, 1, 2, 3, 4 ou E dans l’enregistrement.',
  },
};

export const GLOSSARY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

function termName(term: GlossaryTerm, locale: Locale): string {
  if (term === 'fresh' || term === 'stale') return t(locale, `state.${term}`);
  return tx(locale, `gs.t.${term}`);
}

export function buildGlossary(locale: Locale): GlossaryEntry[] {
  return GLOSSARY_TERMS.map((term) => ({ term, name: termName(term, locale), meaning: tx(locale, `gs.d.${term}`) }));
}

export function renderGlossaryHtml(locale: Locale): string {
  const items = buildGlossary(locale)
    .map((e) => `<dt>${escapeHtml(e.name)}</dt><dd>${escapeHtml(e.meaning)}</dd>`)
    .join('');
  return (
    `<section aria-labelledby="ds-glossary-title"><h2 id="ds-glossary-title">${escapeHtml(tx(locale, 'gs.title'))}</h2>` +
    `<p>${escapeHtml(tx(locale, 'gs.intro'))}</p><dl>${items}</dl></section>`
  );
}
