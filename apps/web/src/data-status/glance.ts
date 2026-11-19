/**
 * A short plain-language summary of the audit, placed first so a screen-reader user hears the
 * whole picture before the tables. It restates the audit totals and adds nothing to them.
 */
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

type Key =
  | 'gl.title'
  | 'gl.empty'
  | 'gl.scope'
  | 'gl.sources.one'
  | 'gl.sources.other'
  | 'gl.datasets.one'
  | 'gl.datasets.other'
  | 'gl.clear'
  | 'gl.needs'
  | 'gl.stale.one'
  | 'gl.stale.other'
  | 'gl.unknownDate.one'
  | 'gl.unknownDate.other'
  | 'gl.licence.one'
  | 'gl.licence.other'
  | 'gl.missing.one'
  | 'gl.missing.other'
  | 'gl.duplicates.one'
  | 'gl.duplicates.other';

const MESSAGES: Messages<Key> = {
  en: {
    'gl.title': 'At a glance',
    'gl.empty': 'No sources are saved on this device.',
    'gl.scope': '{sources} saved on this device, in {datasets}.',
    'gl.sources.one': '{n} source',
    'gl.sources.other': '{n} sources',
    'gl.datasets.one': '{n} dataset',
    'gl.datasets.other': '{n} datasets',
    'gl.clear': 'Nothing needs review.',
    'gl.needs': 'To review: {list}.',
    'gl.stale.one': '{n} possibly out of date',
    'gl.stale.other': '{n} possibly out of date',
    'gl.unknownDate.one': '{n} with an unknown update date',
    'gl.unknownDate.other': '{n} with an unknown update date',
    'gl.licence.one': '{n} licence to review',
    'gl.licence.other': '{n} licences to review',
    'gl.missing.one': '{n} missing detail',
    'gl.missing.other': '{n} missing details',
    'gl.duplicates.one': '{n} duplicate id',
    'gl.duplicates.other': '{n} duplicate ids',
  },
  fr: {
    'gl.title': 'En bref',
    'gl.empty': 'Aucune source n’est enregistrée sur cet appareil.',
    'gl.scope': '{sources} enregistrées sur cet appareil, dans {datasets}.',
    'gl.sources.one': '{n} source',
    'gl.sources.other': '{n} sources',
    'gl.datasets.one': '{n} jeu de données',
    'gl.datasets.other': '{n} jeux de données',
    'gl.clear': 'Rien à examiner.',
    'gl.needs': 'À examiner : {list}.',
    'gl.stale.one': '{n} possiblement périmée',
    'gl.stale.other': '{n} possiblement périmées',
    'gl.unknownDate.one': '{n} à date de mise à jour inconnue',
    'gl.unknownDate.other': '{n} à date de mise à jour inconnue',
    'gl.licence.one': '{n} licence à examiner',
    'gl.licence.other': '{n} licences à examiner',
    'gl.missing.one': '{n} information manquante',
    'gl.missing.other': '{n} informations manquantes',
    'gl.duplicates.one': '{n} identifiant en double',
    'gl.duplicates.other': '{n} identifiants en double',
  },
};

export const GLANCE_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const LISTS: Readonly<Record<Locale, Intl.ListFormat>> = {
  en: new Intl.ListFormat('en-CA', { style: 'long', type: 'conjunction' }),
  fr: new Intl.ListFormat('fr-CA', { style: 'long', type: 'conjunction' }),
};

/** The sentences, in reading order: how much is saved, then what needs review (or that nothing does). */
export function glanceSentences(audit: AuditResult, locale: Locale): string[] {
  const t = audit.totals;
  if (t.sources === 0 && t.datasets === 0) return [tx(locale, 'gl.empty')];
  const out = [
    tx(locale, 'gl.scope', {
      sources: tx.count(locale, 'gl.sources', t.sources),
      datasets: tx.count(locale, 'gl.datasets', t.datasets),
    }),
  ];
  const parts: string[] = [];
  if (t.stale > 0) parts.push(tx.count(locale, 'gl.stale', t.stale));
  if (t.unknownDate > 0) parts.push(tx.count(locale, 'gl.unknownDate', t.unknownDate));
  if (t.notOpen > 0) parts.push(tx.count(locale, 'gl.licence', t.notOpen));
  if (t.missingDetails > 0) parts.push(tx.count(locale, 'gl.missing', t.missingDetails));
  if (t.duplicates > 0) parts.push(tx.count(locale, 'gl.duplicates', t.duplicates));
  out.push(parts.length === 0 ? tx(locale, 'gl.clear') : tx(locale, 'gl.needs', { list: LISTS[locale].format(parts) }));
  return out;
}

export function renderGlanceHtml(audit: AuditResult, locale: Locale): string {
  return (
    `<section aria-labelledby="ds-glance-title"><h2 id="ds-glance-title">${escapeHtml(tx(locale, 'gl.title'))}</h2>` +
    glanceSentences(audit, locale)
      .map((s) => `<p>${escapeHtml(s)}</p>`)
      .join('') +
    '</section>'
  );
}
