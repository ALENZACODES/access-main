/**
 * EN + FR message catalog for the data-status modules, plus an FR typography linter.
 * FR rules: typographic apostrophe, U+00A0 before ':', U+202F before ; ! ? and inside « ».
 */
import type { Locale } from './dataStatus';

export const EN = {
  unknown: 'Unknown',
  unknownName: 'Unknown name',
  'qa.title': 'Data quality overview',
  'qa.counts.datasets': 'Datasets',
  'qa.counts.sources': 'Sources',
  'qa.counts.stale': 'Sources possibly out of date',
  'qa.counts.unknownDate': 'Sources with unknown date',
  'qa.counts.notOpen': 'Licences to review',
  'qa.counts.missing': 'Missing details',
  'qa.counts.duplicates': 'Duplicate ids',
  'qa.itemsHeading': 'Items to review',
  'qa.noItems': 'No items to review in the data provided.',
  'issue.missing-source': '{name}: source not recorded',
  'issue.missing-licence': '{name}: licence not recorded',
  'issue.missing-date': '{name}: retrieved date not recorded',
  'issue.invalid-date': '{name}: retrieved date could not be read',
  'issue.future-date': '{name}: retrieved date is in the future',
  'issue.licence-not-open': '{name}: licence is not on the open list',
  'issue.stale': '{name}: may be out of date',
  'issue.no-sources': '{name}: no sources recorded',
  'issue.duplicate-dataset-id': '{name}: duplicate dataset id',
  'issue.duplicate-source-id': '{name}: duplicate source id',
  'issue.empty-name': '{name}: name is empty',
  'state.fresh': 'Recently updated',
  'state.stale': 'May be out of date',
  'state.unknown': 'Update date unknown',
  'tbl.datasets': 'Datasets',
  'tbl.sources': 'Sources',
  'tbl.dataset': 'Dataset',
  'tbl.sourceCount': 'Sources',
  'tbl.status': 'Status',
  'tbl.source': 'Source',
  'tbl.licence': 'Licence',
  'tbl.retrieved': 'Retrieved',
  'cov.title': 'Coverage by attribute',
  'cov.attribute': 'Attribute',
  'cov.yes': 'Yes',
  'cov.no': 'No',
  'cov.unknown': 'Unknown',
  'cov.unknownShare': 'Unknown share',
  'cov.yesOfKnown': 'Yes among known',
  'cov.records': 'Records',
  'snap.savedOn': 'Saved copy from {date}',
  'snap.none': 'No saved copy',
  'snap.unreadable': 'Saved copy could not be read',
  'act.recalculate': 'Recalculate',
  'act.exportCsv': 'Download source list (CSV)',
  'csv.dataset': 'Dataset',
  'csv.source': 'Source',
  'csv.url': 'Link',
  'csv.licence': 'Licence',
  'csv.openLicence': 'Open licence',
  'csv.retrieved': 'Retrieved',
  'csv.status': 'Status',
  'page.title': 'Data sources and quality',
  'page.skip': 'Skip to main content',
  'page.switchLang': 'Français',
  'page.footer': 'Dates and licences are shown as recorded by the App. Check each publisher’s current terms before reuse.',
  'page.loadErrors': 'Some records could not be read',
  'flt.legend': 'Filter sources',
  'flt.state': 'Status',
  'flt.kind': 'Dataset type',
  'flt.query': 'Search by name',
  'flt.onlyIssues': 'Only items to review',
  'flt.any': 'All',
  'flt.reset': 'Clear filters',
  'flt.result': '{shown} of {total} sources shown',
  'flt.noMatch': 'No sources match these filters.',
  'kind.places': 'Places',
  'kind.routes': 'Routes',
  'kind.transit': 'Transit',
  'kind.boundaries': 'Boundaries',
  'kind.reference': 'Reference',
  'diff.title': 'Changes since the saved copy',
  'diff.none': 'No changes found.',
  'diff.dataset-added': '{name}: dataset added',
  'diff.dataset-removed': '{name}: dataset removed',
  'diff.source-added': '{name}: source added',
  'diff.source-removed': '{name}: source removed',
  'diff.licence-changed': '{name}: licence changed from {from} to {to}',
  'diff.licence-lost': '{name}: licence is no longer recorded (was {from})',
  'diff.licence-added': '{name}: licence recorded ({to})',
  'diff.retrieved-advanced': '{name}: retrieved date moved from {from} to {to}',
  'diff.retrieved-regressed': '{name}: retrieved date moved earlier, from {from} to {to}',
  'diff.retrieved-lost': '{name}: retrieved date is no longer recorded (was {from})',
  'diff.retrieved-added': '{name}: retrieved date recorded ({to})',
  'attr.title': 'Credits and licences',
  'attr.credit': 'Credit',
  'attr.creditRequired': 'Credit required',
  'attr.noCredit': 'No credit required',
  'attr.creditUnknown': 'Credit requirement unknown',
  'attr.shareAlike': 'Share-alike applies',
  'attr.line': '{source}. Licence: {licence}. Retrieved: {date}.',
  'load.not-json': 'The registry file is not valid JSON.',
  'load.not-array': 'The registry must be a list of datasets.',
  'load.not-object': '{path}: an object was expected',
  'load.missing-id': '{path}: an id is required',
  'load.bad-kind': '{path}: unknown dataset type',
  'load.bad-sources': '{path}: sources must be a list',
  'load.bad-field': '{path}: text or an empty value was expected',
  'load.licence-normalised': '{path}: licence name recognised as {licence}',
  'app.loading': 'Loading data sources…',
  'app.offline': 'Showing the saved copy because the data could not be loaded.',
  'app.noData': 'No data available.',
} as const;

export type MessageKey = keyof typeof EN;

export const FR: Record<MessageKey, string> = {
  unknown: 'Inconnu',
  unknownName: 'Nom inconnu',
  'qa.title': 'Aperçu de la qualité des données',
  'qa.counts.datasets': 'Jeux de données',
  'qa.counts.sources': 'Sources',
  'qa.counts.stale': 'Sources possiblement périmées',
  'qa.counts.unknownDate': 'Sources à date inconnue',
  'qa.counts.notOpen': 'Licences à examiner',
  'qa.counts.missing': 'Informations manquantes',
  'qa.counts.duplicates': 'Identifiants en double',
  'qa.itemsHeading': 'Éléments à examiner',
  'qa.noItems': 'Aucun élément à examiner dans les données fournies.',
  'issue.missing-source': '{name}\u00A0: source non renseignée',
  'issue.missing-licence': '{name}\u00A0: licence non renseignée',
  'issue.missing-date': '{name}\u00A0: date de récupération non renseignée',
  'issue.invalid-date': '{name}\u00A0: date de récupération illisible',
  'issue.future-date': '{name}\u00A0: date de récupération dans le futur',
  'issue.licence-not-open': '{name}\u00A0: licence absente de la liste ouverte',
  'issue.stale': '{name}\u00A0: possiblement périmé',
  'issue.no-sources': '{name}\u00A0: aucune source renseignée',
  'issue.duplicate-dataset-id': '{name}\u00A0: identifiant de jeu de données en double',
  'issue.duplicate-source-id': '{name}\u00A0: identifiant de source en double',
  'issue.empty-name': '{name}\u00A0: nom vide',
  'state.fresh': 'Mis à jour récemment',
  'state.stale': 'Possiblement périmé',
  'state.unknown': 'Date de mise à jour inconnue',
  'tbl.datasets': 'Jeux de données',
  'tbl.sources': 'Sources',
  'tbl.dataset': 'Jeu de données',
  'tbl.sourceCount': 'Sources',
  'tbl.status': 'État',
  'tbl.source': 'Source',
  'tbl.licence': 'Licence',
  'tbl.retrieved': 'Date de récupération',
  'cov.title': 'Couverture par attribut',
  'cov.attribute': 'Attribut',
  'cov.yes': 'Oui',
  'cov.no': 'Non',
  'cov.unknown': 'Inconnu',
  'cov.unknownShare': 'Part inconnue',
  'cov.yesOfKnown': 'Oui parmi les connus',
  'cov.records': 'Fiches',
  'snap.savedOn': 'Copie enregistrée le {date}',
  'snap.none': 'Aucune copie enregistrée',
  'snap.unreadable': 'La copie enregistrée est illisible',
  'act.recalculate': 'Recalculer',
  'act.exportCsv': 'Télécharger la liste des sources (CSV)',
  'csv.dataset': 'Jeu de données',
  'csv.source': 'Source',
  'csv.url': 'Lien',
  'csv.licence': 'Licence',
  'csv.openLicence': 'Licence ouverte',
  'csv.retrieved': 'Date de récupération',
  'csv.status': 'État',
  'page.title': 'Sources et qualité des données',
  'page.skip': 'Passer au contenu principal',
  'page.switchLang': 'English',
  'page.footer': 'Les dates et licences sont celles consignées par l’App. Consultez les conditions actuelles de chaque éditeur avant toute réutilisation.',
  'page.loadErrors': 'Certaines fiches n’ont pas pu être lues',
  'flt.legend': 'Filtrer les sources',
  'flt.state': 'État',
  'flt.kind': 'Type de jeu de données',
  'flt.query': 'Rechercher par nom',
  'flt.onlyIssues': 'Seulement les éléments à examiner',
  'flt.any': 'Tous',
  'flt.reset': 'Effacer les filtres',
  'flt.result': '{shown} sources affichées sur {total}',
  'flt.noMatch': 'Aucune source ne correspond à ces filtres.',
  'kind.places': 'Lieux',
  'kind.routes': 'Itinéraires',
  'kind.transit': 'Transport en commun',
  'kind.boundaries': 'Limites territoriales',
  'kind.reference': 'Référence',
  'diff.title': 'Changements depuis la copie enregistrée',
  'diff.none': 'Aucun changement relevé.',
  'diff.dataset-added': '{name}\u00A0: jeu de données ajouté',
  'diff.dataset-removed': '{name}\u00A0: jeu de données retiré',
  'diff.source-added': '{name}\u00A0: source ajoutée',
  'diff.source-removed': '{name}\u00A0: source retirée',
  'diff.licence-changed': '{name}\u00A0: licence passée de {from} à {to}',
  'diff.licence-lost': '{name}\u00A0: licence non renseignée désormais (était {from})',
  'diff.licence-added': '{name}\u00A0: licence renseignée ({to})',
  'diff.retrieved-advanced': '{name}\u00A0: date de récupération passée du {from} au {to}',
  'diff.retrieved-regressed': '{name}\u00A0: date de récupération reculée, du {from} au {to}',
  'diff.retrieved-lost': '{name}\u00A0: date de récupération non renseignée désormais (était {from})',
  'diff.retrieved-added': '{name}\u00A0: date de récupération renseignée ({to})',
  'attr.title': 'Crédits et licences',
  'attr.credit': 'Mention',
  'attr.creditRequired': 'Mention requise',
  'attr.noCredit': 'Aucune mention requise',
  'attr.creditUnknown': 'Exigence de mention inconnue',
  'attr.shareAlike': 'Partage dans les mêmes conditions',
  'attr.line': '{source}. Licence\u00A0: {licence}. Date de récupération\u00A0: {date}.',
  'load.not-json': 'Le fichier du registre n’est pas du JSON valide.',
  'load.not-array': 'Le registre doit être une liste de jeux de données.',
  'load.not-object': '{path}\u00A0: objet attendu',
  'load.missing-id': '{path}\u00A0: identifiant requis',
  'load.bad-kind': '{path}\u00A0: type de jeu de données inconnu',
  'load.bad-sources': '{path}\u00A0: les sources doivent former une liste',
  'load.bad-field': '{path}\u00A0: texte ou valeur vide attendu',
  'load.licence-normalised': '{path}\u00A0: licence reconnue comme {licence}',
  'app.loading': 'Chargement des sources de données…',
  'app.offline': 'Affichage de la copie enregistrée, car les données n’ont pas pu être chargées.',
  'app.noData': 'Aucune donnée disponible.',
};

export const CATALOG: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en: EN, fr: FR };

/** Look up a message and replace {param} placeholders; unknown placeholders are left as-is. */
export function t(locale: Locale, key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const raw = CATALOG[locale][key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined ? m : String(v);
  });
}

export type FrenchLintCode =
  | 'ascii-apostrophe'
  | 'colon-needs-nbsp'
  | 'high-punctuation-needs-narrow-nbsp'
  | 'guillemet-spacing';

export interface FrenchLintIssue {
  code: FrenchLintCode;
  index: number;
}

/**
 * Check one French string. HTML entities are ignored; colons inside URLs
 * (scheme://) and times (12:30) are allowed.
 */
export function lintFrench(input: string): FrenchLintIssue[] {
  const s = input.replace(/&[a-zA-Z#0-9]+;/g, (m) => ' '.repeat(m.length));
  const issues: FrenchLintIssue[] = [];
  const push = (code: FrenchLintCode, index: number) => issues.push({ code, index });
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const prev = s[i - 1] ?? '';
    const next = s[i + 1] ?? '';
    if (c === "'") push('ascii-apostrophe', i);
    else if (c === ':') {
      const inUrl = next === '/' && s[i + 2] === '/';
      const inTime = /\d/.test(prev) && /\d/.test(next);
      if (!inUrl && !inTime && prev !== '\u00A0') push('colon-needs-nbsp', i);
    } else if (c === ';' || c === '!' || c === '?') {
      if (prev !== '\u202F') push('high-punctuation-needs-narrow-nbsp', i);
    } else if (c === '«') {
      if (next !== '\u202F' && next !== '\u00A0') push('guillemet-spacing', i);
    } else if (c === '»') {
      if (prev !== '\u202F' && prev !== '\u00A0') push('guillemet-spacing', i);
    }
  }
  return issues;
}

/** Lint every FR message; returns "key: code" strings, empty when clean. */
export function lintFrenchCatalog(catalog: Readonly<Record<string, string>> = FR): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(catalog)) {
    for (const issue of lintFrench(value)) out.push(`${key}: ${issue.code}`);
  }
  return out;
}

/** Keys present in EN but missing or empty in FR (and the reverse). */
export function catalogParityProblems(): string[] {
  const problems: string[] = [];
  for (const k of Object.keys(EN) as MessageKey[]) {
    if (!FR[k] || FR[k].trim() === '') problems.push(`fr missing: ${k}`);
    const enParams = (EN[k].match(/\{\w+\}/g) ?? []).sort().join(',');
    const frParams = (FR[k].match(/\{\w+\}/g) ?? []).sort().join(',');
    if (enParams !== frParams) problems.push(`placeholder mismatch: ${k}`);
  }
  return problems;
}
