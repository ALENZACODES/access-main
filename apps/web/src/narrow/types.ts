import type { LocalizedText } from './audit.js';

export const NBSP = '\u00A0';
export const NNBSP = '\u202F';

export type Lang = 'en' | 'fr';

export type CheckId =
  | 'target-size'
  | 'reflow'
  | 'target-spacing'
  | 'contrast'
  | 'name'
  | 'label-in-name'
  | 'language'
  | 'focus-obscured'
  | 'text-spacing'
  | 'i18n'
  | 'offline'
  | 'keyboard'
  | 'focus-visible'
  | 'motion'
  | 'static-html'
  | 'copy'
  | 'provenance'
  | 'link-cue'
  | 'non-text-contrast'
  | 'dragging'
  | 'consistency'
  | 'waiver'
  | 'external'
  | 'manifest'
  | 'service-worker'
  | 'parity'
  | 'budget'
  | 'weight'
  | 'forms'
  | 'auth'
  | 'status'
  | 'media'
  | 'fixed-space'
  | 'clipping'
  | 'lang-parts'
  | 'timing'
  | 'purpose'
  | 'tables'
  | 'frames'
  | 'bypass'
  | 'links'
  | 'images'
  | 'plain'
  | 'locale'
  | 'sensory'
  | 'text-zoom'
  | 'headings'
  | 'handlers'
  | 'typography'
  | 'order'
  | 'generated'
  | 'lookalike'
  | 'regions'
  | 'aria'
  | 'references'
  | 'hrefs'
  | 'css'
  | 'obsolete'
  | 'states'
  | 'lists'
  | 'sectioning'
  | 'constraints'
  | 'symbols';

/** WCAG 2.2 success criterion each check relates to, or null when it is not a WCAG check. */
export const CHECK_SC: Readonly<Record<CheckId, string | null>> = {
  'target-size': '2.5.8',
  reflow: '1.4.10',
  'target-spacing': '2.5.8',
  contrast: '1.4.3',
  name: '4.1.2',
  'label-in-name': '2.5.3',
  language: '3.1.1',
  'focus-obscured': '2.4.11',
  'text-spacing': '1.4.12',
  i18n: null,
  offline: null,
  keyboard: '2.1.1',
  'focus-visible': '2.4.7',
  motion: null,
  'static-html': null,
  copy: null,
  provenance: null,
  'link-cue': '1.4.1',
  'non-text-contrast': '1.4.11',
  dragging: '2.5.7',
  consistency: '3.2.3',
  waiver: null,
  external: null,
  manifest: null,
  'service-worker': null,
  parity: '1.3.4',
  budget: null,
  weight: null,
  'forms': '3.3.2',
  'auth': '3.3.8',
  'status': '4.1.3',
  'media': '1.4.2',
  'fixed-space': null,
  'clipping': '1.4.10',
  'lang-parts': '3.1.2',
  timing: '2.2.2',
  purpose: '1.3.5',
  tables: '1.3.1',
  frames: '4.1.2',
  bypass: '2.4.1',
  links: '2.4.4',
  images: '1.1.1',
  plain: '3.1.5',
  locale: null,
  sensory: '1.3.3',
  'text-zoom': '1.4.4',
  headings: '2.4.6',
  handlers: '2.1.1',
  typography: '1.4.8',
  order: '1.3.2',
  generated: '1.3.1',
  lookalike: '1.3.1',
  aria: '4.1.2',
  references: '1.3.1',
  hrefs: '2.4.4',
  css: '2.4.7',
  obsolete: '1.3.1',
  states: '4.1.2',
  lists: '1.3.1',
  sectioning: '1.3.1',
  constraints: '3.3.2',
  symbols: '1.1.1',
  regions: '1.3.1',
};

export const CHECK_ORDER: readonly CheckId[] = [
  'reflow',
  'target-size',
  'target-spacing',
  'contrast',
  'name',
  'label-in-name',
  'language',
  'focus-obscured',
  'text-spacing',
  'i18n',
  'offline',
  'keyboard',
  'focus-visible',
  'motion',
  'static-html',
  'copy',
  'provenance',
  'link-cue',
  'non-text-contrast',
  'dragging',
  'consistency',
  'waiver',
  'external',
  'manifest',
  'service-worker',
  'parity',
  'budget',
  'weight',
  'forms',
  'auth',
  'status',
  'media',
  'fixed-space',
  'clipping',
  'lang-parts',
  'timing',
  'purpose',
  'tables',
  'frames',
  'bypass',
  'links',
  'images',
  'plain',
  'locale',
  'sensory',
  'text-zoom',
  'headings',
  'handlers',
  'typography',
  'order',
  'generated',
  'lookalike',
  'regions',
  'aria',
  'references',
  'hrefs',
  'css',
  'obsolete',
  'states',
  'lists',
  'sectioning',
  'constraints',
  'symbols',
];

export const CHECK_LABELS: Readonly<Record<CheckId, LocalizedText>> = {
  'target-size': { en: 'Touch target size', fr: 'Taille des cibles tactiles' },
  reflow: { en: 'Reflow at 320px', fr: `Réorganisation à 320${NBSP}px` },
  'target-spacing': { en: 'Target spacing', fr: 'Espacement des cibles' },
  contrast: { en: 'Text contrast', fr: 'Contraste du texte' },
  name: { en: 'Accessible names', fr: 'Noms accessibles' },
  'label-in-name': { en: 'Label in name', fr: 'Étiquette dans le nom' },
  language: { en: 'Page language', fr: 'Langue de la page' },
  'focus-obscured': { en: 'Focus not obscured', fr: 'Focus non masqué' },
  'text-spacing': { en: 'Text spacing', fr: 'Espacement du texte' },
  i18n: { en: 'EN and FR strings', fr: 'Chaînes EN et FR' },
  offline: { en: 'Offline reload', fr: 'Rechargement hors ligne' },
  keyboard: { en: 'Keyboard access', fr: 'Accès au clavier' },
  'focus-visible': { en: 'Focus visible', fr: 'Focus visible' },
  motion: { en: 'Motion', fr: 'Animations' },
  'static-html': { en: 'Page markup', fr: 'Balisage de la page' },
  copy: { en: 'Wording rules', fr: 'Règles de rédaction' },
  provenance: { en: 'Data sources and licences', fr: 'Sources et licences des données' },
  'link-cue': { en: 'Links not shown by colour alone', fr: 'Liens non signalés par la couleur seule' },
  'non-text-contrast': { en: 'Control boundary contrast', fr: 'Contraste des bordures de contrôles' },
  dragging: { en: 'Dragging alternatives', fr: 'Alternatives au glisser-déposer' },
  consistency: { en: 'Consistency across pages', fr: 'Cohérence entre les pages' },
  waiver: { en: 'Waivers', fr: 'Dérogations' },
  external: { en: 'External hosts', fr: 'Hôtes externes' },
  manifest: { en: 'Web app manifest', fr: 'Manifeste de l’application web' },
  'service-worker': { en: 'Service worker', fr: 'Service worker' },
  parity: { en: 'Same content in every view', fr: 'Même contenu dans chaque affichage' },
  budget: { en: 'Failure budget', fr: 'Budget d’anomalies' },
  weight: { en: 'Page weight and images', fr: 'Poids de la page et images' },
  'forms': { en: 'Form labels and messages', fr: 'Étiquettes et messages des formulaires' },
  'auth': { en: 'Signing in without tests', fr: 'Connexion sans épreuve' },
  'status': { en: 'Status messages', fr: 'Messages d’état' },
  'media': { en: 'Audio and video', fr: 'Audio et vidéo' },
  'fixed-space': { en: 'Room left by fixed bars', fr: 'Place laissée par les barres fixes' },
  'clipping': { en: 'Text cut off by its box', fr: 'Texte coupé par son bloc' },
  'lang-parts': { en: 'Language of parts', fr: 'Langue des passages' },
  timing: { en: 'Time limits and moving content', fr: 'Limites de temps et contenu en mouvement' },
  purpose: { en: 'Autofill purpose of fields', fr: 'Finalité de saisie automatique des champs' },
  tables: { en: 'Data table headers', fr: 'En-têtes des tableaux de données' },
  frames: { en: 'Frames and graphics', fr: 'Cadres et graphiques' },
  bypass: { en: 'Skip link and top heading', fr: 'Lien d’évitement et titre principal' },
  links: { en: 'Link text and destinations', fr: 'Texte et destinations des liens' },
  images: { en: 'Images and alt text', fr: 'Images et textes alternatifs' },
  plain: { en: 'Plain language', fr: 'Langage clair' },
  locale: { en: 'Dates, numbers and money by language', fr: 'Dates, nombres et montants selon la langue' },
  sensory: { en: 'Instructions that need sight or hearing', fr: 'Consignes qui exigent la vue ou l’ouïe' },
  'text-zoom': { en: 'Text at double size', fr: 'Texte au double de la taille' },
  headings: { en: 'Headings and page title', fr: 'Titres et titre de la page' },
  handlers: { en: 'Mouse-only handlers in markup', fr: 'Gestionnaires réservés à la souris dans le balisage' },
  typography: { en: 'Text layout for reading', fr: 'Mise en page du texte pour la lecture' },
  order: { en: 'Visual order and reading order', fr: 'Ordre visuel et ordre de lecture' },
  generated: { en: 'Text made by CSS', fr: 'Texte produit par le CSS' },
  lookalike: { en: 'Fake headings and lists', fr: 'Faux titres et fausses listes' },
  regions: { en: 'Content outside landmarks', fr: 'Contenu hors des repères' },
  aria: { en: 'ARIA roles and states', fr: 'Rôles et états ARIA' },
  references: { en: 'References between elements', fr: 'Références entre éléments' },
  hrefs: { en: 'Link destinations', fr: 'Destinations des liens' },
  css: { en: 'Style rules in the page', fr: 'Règles de style dans la page' },
  obsolete: { en: 'Old presentational markup', fr: 'Ancien balisage de présentation' },
  states: { en: 'States written twice or misplaced', fr: 'États en double ou mal placés' },
  lists: { en: 'List structure', fr: 'Structure des listes' },
  sectioning: { en: 'Page parts and landmarks', fr: 'Parties de page et repères' },
  constraints: { en: 'Limits on form entries', fr: 'Limites de saisie des formulaires' },
  symbols: { en: 'Symbols, emoji and icon fonts', fr: 'Symboles, émojis et polices d’icônes' },
};

/** A fail is a measured problem. Unknown means the check could not measure, never a pass. */
export type EntryStatus = 'fail' | 'unknown';

export interface Entry {
  readonly check: CheckId;
  readonly id: string;
  readonly status: EntryStatus;
  readonly message: LocalizedText;
  /** Short code of the rule that produced the entry, for filtering in CI. */
  readonly rule?: string;
}

export interface CheckResult {
  /** Number of items the check looked at (including the ones that passed). */
  readonly checked: number;
  readonly entries: readonly Entry[];
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function t(en: string, fr: string): LocalizedText {
  return { en, fr };
}

/** Number with a decimal comma for French. */
export function num(n: number, lang: Lang, digits = 2): string {
  const s = n.toFixed(digits);
  return lang === 'fr' ? s.replace('.', ',') : s;
}

export function clip(s: string, max = 40): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : one.slice(0, max - 1) + '…';
}
