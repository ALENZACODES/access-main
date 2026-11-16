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
  'issue.licence-unrecognised': '{name}: licence not recognised, to review',
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
  'issue.licence-unrecognised': '{name}\u00A0: licence non reconnue, à examiner',
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
