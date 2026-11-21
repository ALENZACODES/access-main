import { NBSP, type Lang } from './types.js';

/**
 * Where to start: the person marks what they use to point and type, and the
 * tests of this page are put in the order that matters most for those tools.
 * It names tools only, never a condition or a reason, and nothing is stored.
 *
 * Each tool lists the tests that matter for it, most first. With several
 * tools, a test gets more weight the earlier it comes for each one, and ties
 * keep the order of the page.
 */

export const TOOLS = ['finger', 'stylus', 'mouth-stick', 'head-pointer', 'eye-gaze', 'switch', 'voice', 'keyboard', 'mouse'] as const;
export type ToolId = (typeof TOOLS)[number];

export const TOOL_NAMES: Readonly<Record<ToolId, { readonly en: string; readonly fr: string }>> = {
  finger: { en: 'A finger on a touch screen', fr: 'Un doigt sur un écran tactile' },
  stylus: { en: 'A stylus', fr: 'Un stylet' },
  'mouth-stick': { en: 'A mouth stick', fr: 'Une baguette buccale' },
  'head-pointer': { en: 'A head pointer', fr: 'Un pointeur de tête' },
  'eye-gaze': { en: 'Eye gaze', fr: 'Le regard' },
  switch: { en: 'One or two switches', fr: 'Un ou deux contacteurs' },
  voice: { en: 'My voice', fr: 'Ma voix' },
  keyboard: { en: 'A keyboard only', fr: 'Le clavier seulement' },
  mouse: { en: 'A mouse, trackball or touchpad', fr: 'Une souris, une boule ou un pavé tactile' },
};

/** The same tools in a sentence: "a finger on a touch screen and my voice". */
const TOOL_WORDS: Readonly<Record<ToolId, { readonly en: string; readonly fr: string }>> = {
  finger: { en: 'a finger on a touch screen', fr: 'un doigt sur un écran tactile' },
  stylus: { en: 'a stylus', fr: 'un stylet' },
  'mouth-stick': { en: 'a mouth stick', fr: 'une baguette buccale' },
  'head-pointer': { en: 'a head pointer', fr: 'un pointeur de tête' },
  'eye-gaze': { en: 'eye gaze', fr: 'le regard' },
  switch: { en: 'one or two switches', fr: 'un ou deux contacteurs' },
  voice: { en: 'my voice', fr: 'ma voix' },
  keyboard: { en: 'a keyboard only', fr: 'le clavier seulement' },
  mouse: { en: 'a mouse, trackball or touchpad', fr: 'une souris, une boule ou un pavé tactile' },
};

/** The tests of the page this panel can point to, in the order of the page. */
export const START_PANELS = ['fit', 'tap', 'zones', 'press', 'voice', 'slip', 'travel', 'typing', 'gestures', 'scan', 'moving', 'hover', 'twice', 'hand', 'reach', 'scroll'] as const;
export type StartPanelKey = (typeof START_PANELS)[number];

export interface StartPanelInfo {
  /** The heading the panel starts with, to take focus to. */
  readonly heading: string;
  readonly title: { readonly en: string; readonly fr: string };
  /** A short name for a button that goes to it, with no word for a button in it. */
  readonly go: { readonly en: string; readonly fr: string };
  /** What the test shows, in one sentence. */
  readonly why: { readonly en: string; readonly fr: string };
}

export const START_INFO: Readonly<Record<StartPanelKey, StartPanelInfo>> = {
  fit: {
    heading: '#fit-h',
    title: { en: 'This page on your screen', fr: 'Cette page sur votre écran' },
    go: { en: 'the page on your screen', fr: 'la page sur votre écran' },
    why: { en: 'What fits on your screen, and a text to report a barrier.', fr: 'Ce qui tient sur votre écran, et un texte pour signaler un obstacle.' },
  },
  tap: {
    heading: '#tap-h',
    title: { en: 'Button size for my taps', fr: 'Taille de bouton pour mes appuis' },
    go: { en: 'the tap test', fr: 'le test des appuis' },
    why: { en: 'The smallest button you press well.', fr: 'Le plus petit bouton sur lequel vous appuyez bien.' },
  },
  zones: {
    heading: '#zones-h',
    title: { en: 'Screen zones I can reach', fr: 'Zones de l’écran que j’atteins' },
    go: { en: 'the zones test', fr: 'le test des zones' },
    why: { en: 'The parts of the screen you can reach.', fr: 'Les parties de l’écran que vous atteignez.' },
  },
  press: {
    heading: '#press-h',
    title: { en: 'How I press', fr: 'Ma façon d’appuyer' },
    go: { en: 'the press test', fr: 'le test d’appui' },
    why: { en: 'How long you hold a press, and the time between two.', fr: 'Combien de temps vous tenez un appui, et le temps entre deux.' },
  },
  voice: {
    heading: '#voice-h',
    title: { en: 'Say it to press it', fr: 'Le dire pour appuyer' },
    go: { en: 'saying it to press it', fr: 'le dire pour appuyer' },
    why: { en: 'Whether each control has a name you can say.', fr: 'Si chaque commande a un nom que vous pouvez dire.' },
  },
  slip: {
    heading: '#slip-h',
    title: { en: 'Slips onto risky controls', fr: 'Glissements vers des commandes à risque' },
    go: { en: 'slips onto risky controls', fr: 'les glissements à risque' },
    why: { en: 'Controls so close that a slip may press the wrong one.', fr: 'Des commandes si proches qu’un écart peut appuyer sur la mauvaise.' },
  },
  travel: {
    heading: '#travel-h',
    title: { en: 'Pointer travel', fr: 'Déplacement du pointeur' },
    go: { en: 'pointer travel', fr: 'le déplacement du pointeur' },
    why: { en: 'How far the pointer goes from one control to the next.', fr: 'La distance du pointeur d’une commande à la suivante.' },
  },
  typing: {
    heading: '#typing-h',
    title: { en: 'My typing pace', fr: 'Mon rythme de saisie' },
    go: { en: 'the typing practice', fr: 'l’essai de saisie' },
    why: { en: 'Your typing pace, set against any time limit.', fr: 'Votre rythme de saisie, comparé à une limite de temps.' },
  },
  gestures: {
    heading: '#gest-h',
    title: { en: 'Dragging and gestures', fr: 'Glisser et gestes' },
    go: { en: 'the drag test', fr: 'le test de glissement' },
    why: { en: 'Whether dragging works for you, and controls that need it.', fr: 'Si glisser fonctionne pour vous, et les commandes qui le demandent.' },
  },
  scan: {
    heading: '#scan-h',
    title: { en: 'Switch scanning', fr: 'Balayage par contacteur' },
    go: { en: 'switch scanning', fr: 'le balayage par contacteur' },
    why: { en: 'The steps and time to reach each control as you scan.', fr: 'Les étapes et le temps pour atteindre chaque commande en balayant.' },
  },
  moving: {
    heading: '#moving-h',
    title: { en: 'Things that move', fr: 'Ce qui bouge' },
    go: { en: 'things that move', fr: 'ce qui bouge' },
    why: { en: 'Controls that move while you aim.', fr: 'Les commandes qui bougent pendant que vous visez.' },
  },
  hover: {
    heading: '#hover-h',
    title: { en: 'Shown on hover only', fr: 'Montré au survol seulement' },
    go: { en: 'hover only', fr: 'le survol seulement' },
    why: { en: 'What shows only when a pointer rests on it.', fr: 'Ce qui n’apparaît que quand un pointeur reste dessus.' },
  },
  twice: {
    heading: '#twice-h',
    title: { en: 'Asked twice', fr: 'Demandé deux fois' },
    go: { en: 'asked twice', fr: 'demandé deux fois' },
    why: { en: 'Answers a form makes you type twice.', fr: 'Les réponses qu’un formulaire fait taper deux fois.' },
  },
  hand: {
    heading: '#hand-h',
    title: { en: 'Look by hand', fr: 'Regarder à la main' },
    go: { en: 'looking by hand', fr: 'regarder à la main' },
    why: { en: 'Steps to look by hand at what the tests cannot measure.', fr: 'Des étapes pour regarder à la main ce que les tests ne mesurent pas.' },
  },
  reach: {
    heading: '#reach-h',
    title: { en: 'Reaching controls by keyboard or switch', fr: 'Atteindre les commandes au clavier ou au contacteur' },
    go: { en: 'reaching controls', fr: 'atteindre les commandes' },
    why: { en: 'Whether each control can be reached without a pointer.', fr: 'Si chaque commande s’atteint sans pointeur.' },
  },
  scroll: {
    heading: '#scroll-h',
    title: { en: 'Scroll effort on this page', fr: 'Effort de défilement de cette page' },
    go: { en: 'scroll effort', fr: 'l’effort de défilement' },
    why: { en: 'How much scrolling the page asks for.', fr: 'Combien de défilement la page demande.' },
  },
};

/** For each tool, the tests that matter, most first. */
export const TOOL_TESTS: Readonly<Record<ToolId, readonly StartPanelKey[]>> = {
  finger: ['tap', 'zones', 'slip', 'press', 'gestures', 'hover', 'fit'],
  stylus: ['tap', 'slip', 'press', 'gestures', 'hover', 'moving'],
  'mouth-stick': ['typing', 'tap', 'slip', 'twice', 'press', 'gestures', 'hover'],
  'head-pointer': ['moving', 'tap', 'travel', 'press', 'gestures', 'hover', 'slip'],
  'eye-gaze': ['moving', 'tap', 'slip', 'hover', 'travel', 'gestures', 'twice'],
  switch: ['scan', 'reach', 'typing', 'twice', 'moving', 'hover', 'scroll'],
  voice: ['voice', 'typing', 'twice', 'hover', 'gestures'],
  keyboard: ['reach', 'scan', 'hover', 'gestures', 'scroll', 'twice'],
  mouse: ['travel', 'tap', 'gestures', 'moving', 'press', 'slip'],
};

/** How many tests are put first. */
export const START_FIRST = 6;

export interface StartTest {
  readonly key: StartPanelKey;
  readonly score: number;
  /** The tools this test matters for, in the order they were marked. */
  readonly forTools: readonly ToolId[];
}

/**
 * The tests in the order that matters for the tools: a test earlier in a
 * tool's list weighs more, the weights add up over the tools, ties keep the
 * order of the page. Tests that matter for none come after, in page order.
 */
export function startOrder(tools: readonly ToolId[]): StartTest[] {
  const scored = START_PANELS.map((key, at) => {
    let score = 0;
    const forTools: ToolId[] = [];
    for (const t of tools) {
      const list = TOOL_TESTS[t];
      const i = list.indexOf(key);
      if (i >= 0) {
        score += list.length - i;
        forTools.push(t);
      }
    }
    return { key, score, forTools, at };
  });
  scored.sort((a, b) => b.score - a.score || a.at - b.at);
  return scored.map(({ key, score, forTools }) => ({ key, score, forTools }));
}

/** The marked tools in a list that reads well, in the order of TOOLS. */
export function toolsText(tools: readonly ToolId[], lang: Lang): string {
  const words = TOOLS.filter((t) => tools.includes(t)).map((t) => TOOL_WORDS[t][lang]);
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')}${lang === 'fr' ? ' et ' : ' and '}${words.at(-1) ?? ''}`;
}

/** Why a test is put first, for the tools it matters for. */
export function forText(t: StartTest, lang: Lang): string {
  const tools = toolsText(t.forTools, lang);
  return lang === 'fr' ? `Utile avec ${tools}.` : `Useful with ${tools}.`;
}

/** One line for the access summary: what the person uses, tools only. */
export function toolsNote(tools: readonly ToolId[], lang: Lang): string {
  if (tools.length === 0) return '';
  const list = toolsText(tools, lang);
  return lang === 'fr' ? `Ce que j’utilise${NBSP}: ${list}.` : `What I use: ${list}.`;
}

export function isTool(x: string | null): x is ToolId {
  return x !== null && (TOOLS as readonly string[]).includes(x);
}
