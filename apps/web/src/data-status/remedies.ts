/**
 * "What to do next": each kind of finding with one plain next step, grouped so a reviewer sees
 * the biggest kinds of work first. The steps only say how to record the facts; they never fill
 * a value in, and a value that cannot be found stays Unknown.
 */
import type { AuditResult, Finding, FindingCode } from './datasetRegistry';
import { findingRank } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export const FINDING_CODES: readonly FindingCode[] = [
  'missing-source',
  'missing-licence',
  'licence-unrecognised',
  'missing-date',
  'invalid-date',
  'future-date',
  'stale',
  'no-sources',
  'duplicate-dataset-id',
  'duplicate-source-id',
  'empty-name',
];

export const MAX_EXAMPLES = 3;

type CodeKey = `rm.${FindingCode}.title` | `rm.${FindingCode}.step`;
type Key =
  | CodeKey
  | 'rm.title'
  | 'rm.intro'
  | 'rm.none'
  | 'rm.sep'
  | 'rm.count.one'
  | 'rm.count.other'
  | 'rm.examples'
  | 'rm.examplesMore.one'
  | 'rm.examplesMore.other';

const MESSAGES: Messages<Key> = {
  en: {
    'rm.title': 'What to do next',
    'rm.intro': 'One step for each kind of item to review, most urgent first. A value that cannot be found stays UNKNOWN.',
    'rm.none': 'Nothing needs action.',
    'rm.sep': '; ',
    'rm.count.one': '{n} item',
    'rm.count.other': '{n} items',
    'rm.examples': 'For example: {list}.',
    'rm.examplesMore.one': 'For example: {list}, and {n} more.',
    'rm.examplesMore.other': 'For example: {list}, and {n} more.',
    'rm.missing-source.title': 'Source name missing',
    'rm.missing-source.step': 'Record who published the data, using the name on the publisher’s own page.',
    'rm.missing-licence.title': 'Licence missing',
    'rm.missing-licence.step': 'Find the licence on the publisher’s page and record its name. Until then the licence stays UNKNOWN.',
    'rm.licence-unrecognised.title': 'Licence not on the reference list',
    'rm.licence-unrecognised.step': 'Compare it with the reference list. If it is another name for a listed licence, record the listed name. If not, ask the publisher what reuse is allowed.',
    'rm.missing-date.title': 'Retrieved date missing',
    'rm.missing-date.step': 'Record the day the data was fetched. If that day is not known, leave it UNKNOWN instead of estimating it.',
    'rm.invalid-date.title': 'Retrieved date unreadable',
    'rm.invalid-date.step': 'Replace it with a real calendar date written as year-month-day, for example 2026-11-15.',
    'rm.future-date.title': 'Retrieved date in the future',
    'rm.future-date.step': 'Correct it to the day the data was actually fetched. A date that has not happened yet is treated as UNKNOWN.',
    'rm.stale.title': 'Possibly out of date',
    'rm.stale.step': 'Look at the source again and fetch a newer copy if one exists. Then record the new retrieved date.',
    'rm.no-sources.title': 'No sources listed',
    'rm.no-sources.step': 'Add at least one source, with its name, licence and retrieved date.',
    'rm.duplicate-dataset-id.title': 'Dataset id used more than once',
    'rm.duplicate-dataset-id.step': 'Give each dataset its own id, so its sources are counted once.',
    'rm.duplicate-source-id.title': 'Source id used more than once',
    'rm.duplicate-source-id.step': 'Give each source its own id inside its dataset.',
    'rm.empty-name.title': 'Dataset name empty',
    'rm.empty-name.step': 'Add a short name that people will recognise.',
  },
  fr: {
    'rm.title': 'Prochaines étapes',
    'rm.intro': 'Une étape pour chaque type d’élément à examiner, du plus urgent au moins urgent. Une valeur introuvable reste UNKNOWN.',
    'rm.none': 'Aucune action n’est nécessaire.',
    'rm.sep': '\u202F; ',
    'rm.count.one': '{n} élément',
    'rm.count.other': '{n} éléments',
    'rm.examples': 'Par exemple : {list}.',
    'rm.examplesMore.one': 'Par exemple : {list} et {n} autre.',
    'rm.examplesMore.other': 'Par exemple : {list} et {n} autres.',
    'rm.missing-source.title': 'Nom de la source manquant',
    'rm.missing-source.step': 'Indiquez qui a publié les données, avec le nom figurant sur la page du diffuseur.',
    'rm.missing-licence.title': 'Licence manquante',
    'rm.missing-licence.step': 'Trouvez la licence sur la page du diffuseur et notez son nom. D’ici là, la licence reste UNKNOWN.',
    'rm.licence-unrecognised.title': 'Licence absente de la liste de référence',
    'rm.licence-unrecognised.step': 'Comparez-la avec la liste de référence. S’il s’agit d’un autre nom d’une licence de la liste, notez le nom de la liste. Sinon, demandez au diffuseur quelle réutilisation est permise.',
    'rm.missing-date.title': 'Date de récupération manquante',
    'rm.missing-date.step': 'Notez le jour où les données ont été récupérées. Si ce jour n’est pas connu, laissez-le UNKNOWN au lieu de l’estimer.',
    'rm.invalid-date.title': 'Date de récupération illisible',
    'rm.invalid-date.step': 'Remplacez-la par une vraie date du calendrier, écrite sous la forme année-mois-jour, par exemple 2026-11-15.',
    'rm.future-date.title': 'Date de récupération dans le futur',
    'rm.future-date.step': 'Corrigez-la pour le jour où les données ont réellement été récupérées. Une date qui n’est pas encore arrivée est traitée comme UNKNOWN.',
    'rm.stale.title': 'Possiblement périmé',
    'rm.stale.step': 'Consultez de nouveau la source et récupérez une copie plus récente s’il en existe une. Notez ensuite la nouvelle date de récupération.',
    'rm.no-sources.title': 'Aucune source indiquée',
    'rm.no-sources.step': 'Ajoutez au moins une source, avec son nom, sa licence et sa date de récupération.',
    'rm.duplicate-dataset-id.title': 'Identifiant de jeu de données utilisé plus d’une fois',
    'rm.duplicate-dataset-id.step': 'Donnez à chaque jeu de données son propre identifiant, afin que ses sources soient comptées une seule fois.',
    'rm.duplicate-source-id.title': 'Identifiant de source utilisé plus d’une fois',
    'rm.duplicate-source-id.step': 'Donnez à chaque source son propre identifiant dans son jeu de données.',
    'rm.empty-name.title': 'Nom du jeu de données vide',
    'rm.empty-name.step': 'Ajoutez un nom court que les gens reconnaîtront.',
  },
};

export const REMEDY_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export interface ActionItem {
  code: FindingCode;
  count: number;
  /** Up to MAX_EXAMPLES distinct "dataset / source" names, in audit order. */
  examples: string[];
  /** Number of further distinct names that are not listed. */
  more: number;
}

function nameOf(f: Finding): string {
  return f.sourceId === null ? f.datasetName : `${f.datasetName} / ${f.sourceId}`;
}

/** One entry per kind of finding present, most urgent first, then by how many there are. */
export function buildActions(audit: AuditResult): ActionItem[] {
  const groups = new Map<FindingCode, Finding[]>();
  for (const f of audit.findings) {
    const list = groups.get(f.code);
    if (list === undefined) groups.set(f.code, [f]);
    else list.push(f);
  }
  const items: ActionItem[] = [];
  for (const [code, list] of groups) {
    const names = [...new Set(list.map(nameOf))];
    items.push({ code, count: list.length, examples: names.slice(0, MAX_EXAMPLES), more: Math.max(0, names.length - MAX_EXAMPLES) });
  }
  return items.sort((a, b) => findingRank(a.code) - findingRank(b.code) || b.count - a.count || FINDING_CODES.indexOf(a.code) - FINDING_CODES.indexOf(b.code));
}

export function remedyTitle(code: FindingCode, locale: Locale): string {
  return tx(locale, `rm.${code}.title`);
}

export function remedyStep(code: FindingCode, locale: Locale): string {
  return tx(locale, `rm.${code}.step`);
}

export function exampleText(item: ActionItem, locale: Locale): string {
  const list = item.examples.join(tx(locale, 'rm.sep'));
  return item.more > 0 ? tx.count(locale, 'rm.examplesMore', item.more, { list }) : tx(locale, 'rm.examples', { list });
}

export function renderActionsHtml(items: readonly ActionItem[], locale: Locale): string {
  const heading = `<h2 id="ds-actions-title">${escapeHtml(tx(locale, 'rm.title'))}</h2>`;
  if (items.length === 0) {
    return `<section aria-labelledby="ds-actions-title">${heading}<p>${escapeHtml(tx(locale, 'rm.none'))}</p></section>`;
  }
  const list = items
    .map(
      (i) =>
        `<li><p><strong>${escapeHtml(remedyTitle(i.code, locale))}</strong> (${escapeHtml(tx.count(locale, 'rm.count', i.count))})</p>` +
        `<p>${escapeHtml(remedyStep(i.code, locale))}</p><p>${escapeHtml(exampleText(i, locale))}</p></li>`,
    )
    .join('');
  return `<section aria-labelledby="ds-actions-title">${heading}<p>${escapeHtml(tx(locale, 'rm.intro'))}</p><ol>${list}</ol></section>`;
}
