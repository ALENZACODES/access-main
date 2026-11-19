import type { Level } from './criteria.js';
import type { Lang } from './types.js';

/**
 * Every Level A and Level AA success criterion of WCAG 2.2 (W3C
 * Recommendation of 2023-10-05): 31 at Level A and 24 at Level AA, 55 in
 * all. Success criterion 4.1.1 Parsing is not in the list, because WCAG 2.2
 * removed it. Level AAA is left out: the App aims at Level AA.
 *
 * Numbers, English names and levels are those of the Recommendation. The
 * French names are this tool's own wording and are not quoted as the
 * authorized translation.
 */

export interface AaCriterion {
  /** Number of the criterion, such as 1.4.10. */
  readonly sc: string;
  readonly level: Exclude<Level, 'AAA'>;
  readonly en: string;
  readonly fr: string;
  /** WCAG version that introduced the criterion. */
  readonly since: '2.0' | '2.1' | '2.2';
}

const c = (sc: string, level: 'A' | 'AA', en: string, fr: string, since: '2.0' | '2.1' | '2.2' = '2.0'): AaCriterion => ({ sc, level, en, fr, since });

export const WCAG22_AA: readonly AaCriterion[] = [
  c('1.1.1', 'A', 'Non-text Content', 'Contenu non textuel'),
  c('1.2.1', 'A', 'Audio-only and Video-only (Prerecorded)', 'Contenu seulement audio ou vidéo (pré-enregistré)'),
  c('1.2.2', 'A', 'Captions (Prerecorded)', 'Sous-titres (pré-enregistrés)'),
  c('1.2.3', 'A', 'Audio Description or Media Alternative (Prerecorded)', 'Audiodescription ou version de remplacement pour un média temporel (pré-enregistré)'),
  c('1.2.4', 'AA', 'Captions (Live)', 'Sous-titres (en direct)'),
  c('1.2.5', 'AA', 'Audio Description (Prerecorded)', 'Audiodescription (pré-enregistrée)'),
  c('1.3.1', 'A', 'Info and Relationships', 'Information et relations'),
  c('1.3.2', 'A', 'Meaningful Sequence', 'Ordre séquentiel logique'),
  c('1.3.3', 'A', 'Sensory Characteristics', 'Caractéristiques sensorielles'),
  c('1.3.4', 'AA', 'Orientation', 'Orientation', '2.1'),
  c('1.3.5', 'AA', 'Identify Input Purpose', 'Identifier la finalité de la saisie', '2.1'),
  c('1.4.1', 'A', 'Use of Color', 'Utilisation de la couleur'),
  c('1.4.2', 'A', 'Audio Control', 'Contrôle du son'),
  c('1.4.3', 'AA', 'Contrast (Minimum)', 'Contraste (minimum)'),
  c('1.4.4', 'AA', 'Resize Text', 'Redimensionnement du texte'),
  c('1.4.5', 'AA', 'Images of Text', 'Texte sous forme d’image'),
  c('1.4.10', 'AA', 'Reflow', 'Redistribution', '2.1'),
  c('1.4.11', 'AA', 'Non-text Contrast', 'Contraste du contenu non textuel', '2.1'),
  c('1.4.12', 'AA', 'Text Spacing', 'Espacement du texte', '2.1'),
  c('1.4.13', 'AA', 'Content on Hover or Focus', 'Contenu au survol ou au focus', '2.1'),
  c('2.1.1', 'A', 'Keyboard', 'Clavier'),
  c('2.1.2', 'A', 'No Keyboard Trap', 'Pas de piège au clavier'),
  c('2.1.4', 'A', 'Character Key Shortcuts', 'Raccourcis clavier à caractère unique', '2.1'),
  c('2.2.1', 'A', 'Timing Adjustable', 'Réglage du délai'),
  c('2.2.2', 'A', 'Pause, Stop, Hide', 'Mettre en pause, arrêter, masquer'),
  c('2.3.1', 'A', 'Three Flashes or Below Threshold', 'Pas plus de trois flashs ou sous le seuil critique'),
  c('2.4.1', 'A', 'Bypass Blocks', 'Contourner des blocs'),
  c('2.4.2', 'A', 'Page Titled', 'Titre de page'),
  c('2.4.3', 'A', 'Focus Order', 'Parcours du focus'),
  c('2.4.4', 'A', 'Link Purpose (In Context)', 'Fonction du lien (selon le contexte)'),
  c('2.4.5', 'AA', 'Multiple Ways', 'Accès multiples'),
  c('2.4.6', 'AA', 'Headings and Labels', 'En-têtes et étiquettes'),
  c('2.4.7', 'AA', 'Focus Visible', 'Visibilité du focus'),
  c('2.4.11', 'AA', 'Focus Not Obscured (Minimum)', 'Focus non masqué (minimum)', '2.2'),
  c('2.5.1', 'A', 'Pointer Gestures', 'Gestes pour le contrôle du pointeur', '2.1'),
  c('2.5.2', 'A', 'Pointer Cancellation', 'Annulation de l’action du pointeur', '2.1'),
  c('2.5.3', 'A', 'Label in Name', 'Étiquette dans le nom', '2.1'),
  c('2.5.4', 'A', 'Motion Actuation', 'Activation par le mouvement', '2.1'),
  c('2.5.7', 'AA', 'Dragging Movements', 'Mouvements de glissement', '2.2'),
  c('2.5.8', 'AA', 'Target Size (Minimum)', 'Taille de la cible (minimum)', '2.2'),
  c('3.1.1', 'A', 'Language of Page', 'Langue de la page'),
  c('3.1.2', 'AA', 'Language of Parts', 'Langue d’un passage'),
  c('3.2.1', 'A', 'On Focus', 'Au focus'),
  c('3.2.2', 'A', 'On Input', 'À la saisie'),
  c('3.2.3', 'AA', 'Consistent Navigation', 'Navigation cohérente'),
  c('3.2.4', 'AA', 'Consistent Identification', 'Identification cohérente'),
  c('3.2.6', 'A', 'Consistent Help', 'Aide cohérente', '2.2'),
  c('3.3.1', 'A', 'Error Identification', 'Identification des erreurs'),
  c('3.3.2', 'A', 'Labels or Instructions', 'Étiquettes ou instructions'),
  c('3.3.3', 'AA', 'Error Suggestion', 'Suggestion après une erreur'),
  c('3.3.4', 'AA', 'Error Prevention (Legal, Financial, Data)', 'Prévention des erreurs (juridiques, financières, de données)'),
  c('3.3.7', 'A', 'Redundant Entry', 'Saisie redondante', '2.2'),
  c('3.3.8', 'AA', 'Accessible Authentication (Minimum)', 'Authentification accessible (minimum)', '2.2'),
  c('4.1.2', 'A', 'Name, Role, Value', 'Nom, rôle et valeur'),
  c('4.1.3', 'AA', 'Status Messages', 'Messages d’état', '2.1'),
];

/** Criteria that earlier versions had and WCAG 2.2 removed. */
export const REMOVED_IN_22: readonly string[] = ['4.1.1'];

export const WCAG22_SOURCE = {
  title: 'Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation',
  url: 'https://www.w3.org/TR/WCAG22/',
  date: '2023-10-05',
  licence: 'W3C Document License',
} as const;

const BY_SC: ReadonlyMap<string, AaCriterion> = new Map(WCAG22_AA.map((x) => [x.sc, x]));

export function aaCriterion(sc: string): AaCriterion | null {
  return BY_SC.get(sc) ?? null;
}

/** `1.4.10 Reflow (AA)`, or the number alone for a criterion that is not Level A or AA of WCAG 2.2. */
export function aaLabel(sc: string, lang: Lang): string {
  const found = aaCriterion(sc);
  return found ? `${found.sc} ${found[lang]} (${found.level})` : sc;
}

/** The four principles by their first digit. */
export function principleNumber(sc: string): 1 | 2 | 3 | 4 | null {
  const n = Number(sc.split('.')[0]);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

/** Criteria added by a version, in order. */
export function addedIn(version: '2.1' | '2.2'): AaCriterion[] {
  return WCAG22_AA.filter((x) => x.since === version);
}
