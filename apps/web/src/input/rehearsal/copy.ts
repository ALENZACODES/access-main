import { type AccessFact, type Copy, type LocalCopy, type Locale, type SourceTier, type Status, type StepKind } from './model.ts';

export interface RehearsalCopy {
  title: string; intro: string; caveat: string; edit: string; add: string; remove: string; update: string;
  name: string; step: string; stepEn: string; stepFr: string; detailEn: string; detailFr: string; kind: string; detail: string; access: string;
  source: string; sourceUrl: string; licence: string; date: string; tier: string;
  offline: string; saved: string; cachePath: string; review: string;
  next: string; previous: string; choose: string; cancel: string; reset: string;
  start: string; exportCsv: string; exportJson: string; outcome: string;
  unknown: string; hold: string; ready: string; empty: string;
  sourceNote: string; exportNote: string; validation: string; steps: string;
  localOnly: string; newStep: string; keyboard: string; selected: string;
  assessment: string; noSelection: string; returnHome: string; plainText: string;
}
const EN: RehearsalCopy = {
  title: 'Access rehearsal',
  intro: 'Plan and rehearse your own steps using keyboard or switch-style controls.',
  caveat: 'This device-local exercise does not describe current conditions at a place. Check sources and conditions before travelling.',
  edit: 'Edit step', add: 'Add step', remove: 'Remove step', update: 'Save step', name: 'Journey name', step: 'Step name', stepEn: 'Step name in English', stepFr: 'Step name in French', detailEn: 'Details in English', detailFr: 'Details in French',
  kind: 'Type of step', detail: 'What to check', access: 'Information status',
  source: 'Source name (optional)', sourceUrl: 'Source URL', licence: 'Licence', date: 'Collection date', tier: 'Evidence tier',
  offline: 'Offline copy status', saved: 'Saved date', cachePath: 'Local copy path', review: 'Needs manual review',
  next: 'Next', previous: 'Previous', choose: 'Select', cancel: 'Cancel', reset: 'Reset',
  start: 'Start rehearsal', exportCsv: 'Export diagnostic CSV', exportJson: 'Export diagnostic JSON', outcome: 'Assessment',
  unknown: 'UNKNOWN', hold: 'HOLD', ready: 'READY', empty: 'No steps yet.',
  sourceNote: 'A missing source remains UNKNOWN.', exportNote: 'Exports contain diagnostic codes, not your step descriptions.',
  validation: 'Review the indicated fields.', steps: 'Journey steps', localOnly: 'Nothing is sent or automatically saved.',
  newStep: 'New step', keyboard: 'Keyboard and switch controls', selected: 'Selected step',
  assessment: 'Rehearsal findings', noSelection: 'No step selected', returnHome: 'Return home', plainText: 'Additional notes',
};
const FR: RehearsalCopy = {
  title: 'Répétition d’accessibilité',
  intro: 'Préparez vos étapes et parcourez-les au clavier ou avec des commandes de balayage.',
  caveat: 'Cet exercice local ne décrit pas l’état actuel d’un lieu. Consultez les sources et les conditions avant de partir.',
  edit: 'Modifier l’étape', add: 'Ajouter une étape', remove: 'Retirer l’étape', update: 'Enregistrer l’étape', name: 'Nom du parcours', step: 'Nom de l’étape', stepEn: 'Nom de l’étape en anglais', stepFr: 'Nom de l’étape en français', detailEn: 'Détails en anglais', detailFr: 'Détails en français',
  kind: 'Type d’étape', detail: 'Point à examiner', access: 'État de l’information',
  source: 'Nom de la source (facultatif)', sourceUrl: 'Adresse de la source', licence: 'Licence', date: 'Date de collecte', tier: 'Niveau de preuve',
  offline: 'État de la copie hors ligne', saved: 'Date d’enregistrement', cachePath: 'Chemin de copie locale', review: 'Examen manuel requis',
  next: 'Suivant', previous: 'Précédent', choose: 'Sélectionner', cancel: 'Annuler', reset: 'Réinitialiser',
  start: 'Commencer la répétition', exportCsv: 'Exporter les codes CSV', exportJson: 'Exporter les codes JSON', outcome: 'Évaluation',
  unknown: 'UNKNOWN', hold: 'EN ATTENTE', ready: 'PRÊT', empty: 'Aucune étape pour le moment.',
  sourceNote: 'Une source absente demeure UNKNOWN.', exportNote: 'Les exports contiennent des codes de diagnostic, pas vos descriptions.',
  validation: 'Examinez les champs indiqués.', steps: 'Étapes du parcours', localOnly: 'Aucune donnée n’est envoyée ni enregistrée automatiquement.',
  newStep: 'Nouvelle étape', keyboard: 'Commandes au clavier et par balayage', selected: 'Étape sélectionnée',
  assessment: 'Constats de la répétition', noSelection: 'Aucune étape sélectionnée', returnHome: 'Retour à l’accueil', plainText: 'Notes supplémentaires',
};
export function rehearsalCopy(locale: Locale): RehearsalCopy { return locale === 'fr' ? FR : EN; }
export function statusLabel(status: Status, locale: Locale): string {
  const copy = rehearsalCopy(locale);
  return status === 'UNKNOWN' ? copy.unknown : status === 'HOLD' ? copy.hold : copy.ready;
}
export function kindLabel(kind: StepKind, locale: Locale): string {
  const labels: Record<StepKind, readonly [string, string]> = {
    entrance: ['Entrance', 'Entrée'], path: ['Path', 'Chemin'], lift: ['Lift', 'Ascenseur'],
    washroom: ['Washroom', 'Toilettes'], transit: ['Transit', 'Transport'], exit: ['Exit', 'Sortie'], custom: ['Other', 'Autre'],
  };
  return labels[kind][locale === 'en' ? 0 : 1];
}
export function reasonLabel(code: string, locale: Locale): string {
  const labels: Record<string, readonly [string, string]> = {
    'source.missing': ['Source missing', 'Source absente'],
    'source.tier-unknown': ['Source tier unknown', 'Niveau de source inconnu'],
    'source.age': ['Source may be old', 'La source peut être ancienne'],
    'evidence.unknown': ['Information unknown', 'Information inconnue'],
    'offline.not-stored': ['Offline copy absent', 'Copie hors ligne absente'],
    'review.requested': ['Manual review requested', 'Examen manuel demandé'],
    'selection.unknown': ['Selected step unknown', 'Étape sélectionnée inconnue'],
    'scan.empty': ['No available control', 'Aucune commande disponible'],
    'scan.limit': ['Action limit reached', 'Limite d’actions atteinte'],
  };
  const entry = labels[code];
  return entry ? entry[locale === 'fr' ? 1 : 0] : code;
}

type RehearsalChoice = AccessFact | SourceTier | LocalCopy['state'];

const choiceText: Record<RehearsalChoice, readonly [string, string]> = {
  unknown: ['UNKNOWN', 'UNKNOWN'],
  UNKNOWN: ['UNKNOWN', 'UNKNOWN'],
  supported: ['SUPPORTED', 'PRIS EN CHARGE'],
  limited: ['LIMITED', 'LIMITÉ'],
  unsupported: ['UNSUPPORTED', 'NON PRIS EN CHARGE'],
  PRIMARY: ['PRIMARY', 'PRIMAIRE'],
  SECONDARY: ['SECONDARY', 'SECONDAIRE'],
  COMMUNITY: ['COMMUNITY', 'COMMUNAUTAIRE'],
  absent: ['absent', 'Absente'],
  stored: ['stored', 'Enregistrée'],
};

export function choiceLabel(value: RehearsalChoice, locale: Locale): string {
  return choiceText[value][locale === 'fr' ? 1 : 0];
}


export interface StepChange {
  readonly action: 'add' | 'edit' | 'remove';
  readonly label: Copy;
}

export function stepChangeMessage(change: StepChange | null, locale: Locale): string {
  if (!change) return '';
  if (locale === 'fr') {
    const action = { add: 'Étape ajoutée', edit: 'Étape modifiée', remove: 'Étape retirée' }[change.action];
    return `${action}\u00a0: «\u00a0${change.label.fr}\u00a0».`;
  }
  const action = { add: 'Added', edit: 'Updated', remove: 'Removed' }[change.action];
  return `${action} step “${change.label.en}”.`;
}
