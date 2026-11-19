import type { AuditReport } from './report.js';
import { CHECK_SC, type CheckId, type Lang } from './types.js';

/**
 * The WCAG 2.2 success criteria the checks of this tool relate to, with their
 * number, short name and conformance level. The numbers, English names and
 * levels are those of the W3C Recommendation of 2023-10-05. The French names
 * are this tool's own wording, kept close to the published French translation
 * of WCAG 2.1 where a criterion exists there; they are not quoted as the
 * authorized translation. A check that relates to a criterion does not test
 * the whole criterion.
 */

export type Level = 'A' | 'AA' | 'AAA';

export interface Criterion {
  /** Number of the criterion, such as 1.4.10. */
  readonly sc: string;
  readonly level: Level;
  readonly en: string;
  readonly fr: string;
}

export const CRITERIA: readonly Criterion[] = [
  { sc: '1.1.1', level: 'A', en: 'Non-text Content', fr: 'Contenu non textuel' },
  { sc: '1.3.1', level: 'A', en: 'Info and Relationships', fr: 'Information et relations' },
  { sc: '1.3.2', level: 'A', en: 'Meaningful Sequence', fr: 'Ordre séquentiel logique' },
  { sc: '1.3.3', level: 'A', en: 'Sensory Characteristics', fr: 'Caractéristiques sensorielles' },
  { sc: '1.3.4', level: 'AA', en: 'Orientation', fr: 'Orientation' },
  { sc: '1.3.5', level: 'AA', en: 'Identify Input Purpose', fr: 'Identifier la finalité de la saisie' },
  { sc: '1.4.1', level: 'A', en: 'Use of Color', fr: 'Utilisation de la couleur' },
  { sc: '1.4.2', level: 'A', en: 'Audio Control', fr: 'Contrôle du son' },
  { sc: '1.4.3', level: 'AA', en: 'Contrast (Minimum)', fr: 'Contraste (minimum)' },
  { sc: '1.4.4', level: 'AA', en: 'Resize Text', fr: 'Redimensionnement du texte' },
  { sc: '1.4.8', level: 'AAA', en: 'Visual Presentation', fr: 'Présentation visuelle' },
  { sc: '1.4.10', level: 'AA', en: 'Reflow', fr: 'Redistribution' },
  { sc: '1.4.11', level: 'AA', en: 'Non-text Contrast', fr: 'Contraste du contenu non textuel' },
  { sc: '1.4.12', level: 'AA', en: 'Text Spacing', fr: 'Espacement du texte' },
  { sc: '2.1.1', level: 'A', en: 'Keyboard', fr: 'Clavier' },
  { sc: '2.1.2', level: 'A', en: 'No Keyboard Trap', fr: 'Pas de piège au clavier' },
  { sc: '2.1.4', level: 'A', en: 'Character Key Shortcuts', fr: 'Raccourcis clavier à caractère unique' },
  { sc: '2.2.2', level: 'A', en: 'Pause, Stop, Hide', fr: 'Mettre en pause, arrêter, masquer' },
  { sc: '2.4.1', level: 'A', en: 'Bypass Blocks', fr: 'Contourner des blocs' },
  { sc: '2.4.2', level: 'A', en: 'Page Titled', fr: 'Titre de page' },
  { sc: '2.4.3', level: 'A', en: 'Focus Order', fr: 'Parcours du focus' },
  { sc: '2.4.4', level: 'A', en: 'Link Purpose (In Context)', fr: 'Fonction du lien (selon le contexte)' },
  { sc: '2.4.6', level: 'AA', en: 'Headings and Labels', fr: 'En-têtes et étiquettes' },
  { sc: '2.4.7', level: 'AA', en: 'Focus Visible', fr: 'Visibilité du focus' },
  { sc: '2.4.11', level: 'AA', en: 'Focus Not Obscured (Minimum)', fr: 'Focus non masqué (minimum)' },
  { sc: '2.5.2', level: 'A', en: 'Pointer Cancellation', fr: 'Annulation de l’action du pointeur' },
  { sc: '2.5.3', level: 'A', en: 'Label in Name', fr: 'Étiquette dans le nom' },
  { sc: '2.5.7', level: 'AA', en: 'Dragging Movements', fr: 'Mouvements de glissement' },
  { sc: '2.5.8', level: 'AA', en: 'Target Size (Minimum)', fr: 'Taille de la cible (minimum)' },
  { sc: '3.1.1', level: 'A', en: 'Language of Page', fr: 'Langue de la page' },
  { sc: '3.1.2', level: 'AA', en: 'Language of Parts', fr: 'Langue d’un passage' },
  { sc: '3.1.5', level: 'AAA', en: 'Reading Level', fr: 'Niveau de lecture' },
  { sc: '3.2.2', level: 'A', en: 'On Input', fr: 'À la saisie' },
  { sc: '3.2.3', level: 'AA', en: 'Consistent Navigation', fr: 'Navigation cohérente' },
  { sc: '3.2.4', level: 'AA', en: 'Consistent Identification', fr: 'Identification cohérente' },
  { sc: '3.3.2', level: 'A', en: 'Labels or Instructions', fr: 'Étiquettes ou instructions' },
  { sc: '3.3.8', level: 'AA', en: 'Accessible Authentication (Minimum)', fr: 'Authentification accessible (minimum)' },
  { sc: '4.1.2', level: 'A', en: 'Name, Role, Value', fr: 'Nom, rôle et valeur' },
  { sc: '4.1.3', level: 'AA', en: 'Status Messages', fr: 'Messages d’état' },
];

export const PRINCIPLES: Readonly<Record<1 | 2 | 3 | 4, { readonly en: string; readonly fr: string }>> = {
  1: { en: 'Perceivable', fr: 'Perceptible' },
  2: { en: 'Operable', fr: 'Utilisable' },
  3: { en: 'Understandable', fr: 'Compréhensible' },
  4: { en: 'Robust', fr: 'Robuste' },
};

const BY_SC: ReadonlyMap<string, Criterion> = new Map(CRITERIA.map((c) => [c.sc, c]));

/** True for text shaped like a criterion number: three whole numbers joined by dots. */
export function isScNumber(text: string): boolean {
  return /^[1-4]\.\d{1,2}\.\d{1,2}$/.test(text);
}

export function criterionOf(sc: string): Criterion | null {
  return BY_SC.get(sc.trim()) ?? null;
}

/** The principle a criterion number belongs to, or null when the text is not a criterion number. */
export function principleOf(sc: string): 1 | 2 | 3 | 4 | null {
  if (!isScNumber(sc.trim())) return null;
  const first = Number(sc.trim()[0]);
  return first === 1 || first === 2 || first === 3 || first === 4 ? first : null;
}

/** Orders criterion numbers as numbers, so 1.4.10 comes after 1.4.3. Text that is not a number sorts last. */
export function compareSc(a: string, b: string): number {
  const pa = isScNumber(a) ? a.split('.').map(Number) : null;
  const pb = isScNumber(b) ? b.split('.').map(Number) : null;
  if (!pa || !pb) return pa ? -1 : pb ? 1 : a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** `1.4.10 Reflow (AA)`, or the bare number when the criterion is not in the table. */
export function criterionLabel(sc: string, lang: Lang): string {
  const c = criterionOf(sc);
  return c ? `${c.sc} ${c[lang]} (${c.level})` : sc.trim();
}

/** The criterion a check relates to. Null for a check that is not about a WCAG criterion, and for a check id this build does not know. */
export function criterionOfCheck(check: CheckId): Criterion | null {
  const sc = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[check];
  return typeof sc === 'string' ? criterionOf(sc) : null;
}

export interface CriterionRow {
  /** Criterion number, or null for the checks that are not about a WCAG criterion. */
  readonly sc: string | null;
  readonly level: Level | null;
  readonly checks: readonly CheckId[];
  readonly checked: number;
  readonly failed: number;
  readonly unknown: number;
}

/** Sums the check results of a report by the criterion each check relates to, in criterion order, with the checks outside WCAG last. */
export function byCriterion(report: AuditReport): CriterionRow[] {
  const rows = new Map<string, { sc: string | null; checks: Set<CheckId>; checked: number; failed: number; unknown: number }>();
  for (const route of report.routes) {
    for (const c of route.checks) {
      const raw = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[c.check];
      const sc = typeof raw === 'string' ? raw : null;
      const key = sc ?? '';
      const row = rows.get(key) ?? { sc, checks: new Set<CheckId>(), checked: 0, failed: 0, unknown: 0 };
      row.checks.add(c.check);
      row.checked += c.checked;
      row.failed += c.failed;
      row.unknown += c.unknown;
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .sort((a, b) => (a.sc === null ? 1 : b.sc === null ? -1 : compareSc(a.sc, b.sc)))
    .map((r) => ({ sc: r.sc, level: r.sc ? (criterionOf(r.sc)?.level ?? null) : null, checks: [...r.checks], checked: r.checked, failed: r.failed, unknown: r.unknown }));
}

export interface LevelTotals {
  readonly level: Level | 'none';
  readonly failed: number;
  readonly unknown: number;
}

/** Findings by conformance level. `none` holds the checks that are not about a WCAG criterion. Level AAA rows are good practice for an AA target. */
export function byLevel(report: AuditReport): LevelTotals[] {
  const order: readonly (Level | 'none')[] = ['A', 'AA', 'AAA', 'none'];
  const sums = new Map<Level | 'none', { failed: number; unknown: number }>(order.map((l) => [l, { failed: 0, unknown: 0 }]));
  for (const row of byCriterion(report)) {
    const sum = sums.get(row.level ?? 'none');
    if (!sum) continue;
    sum.failed += row.failed;
    sum.unknown += row.unknown;
  }
  return order.map((level) => ({ level, failed: sums.get(level)?.failed ?? 0, unknown: sums.get(level)?.unknown ?? 0 }));
}
