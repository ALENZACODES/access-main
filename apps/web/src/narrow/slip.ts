import { NBSP, NNBSP, type Lang } from './types.js';
import type { SlipControl, SlipFacts } from './slip-inpage.js';

/**
 * Slips onto risky controls. A tap aimed at the centre of a control lands
 * somewhere within a circle around it. The size of that circle is what the
 * person's taps need: the button size from their own tap test when they took
 * it, or the App's 44 pixel minimum when they did not. Where another control
 * reaches into that circle, the tap may land on it instead.
 *
 * That matters most when the control the tap may land on does something hard
 * to take back: delete, remove, cancel, sign out, clear, send, pay. This
 * finds those pairs. It does not say how often a person slips.
 */

/** The size used when the person has not taken the tap test: the App's minimum. */
export const DEFAULT_TAP = 44;

/** Words that make a control risky to press by mistake, in English and French, as whole words. */
export const RISKY_WORDS: readonly string[] = [
  'delete', 'remove', 'cancel', 'discard', 'clear', 'reset', 'erase', 'sign out', 'log out', 'logout', 'send', 'submit', 'pay', 'buy', 'order', 'close account', 'unsubscribe', 'block', 'report',
  'supprimer', 'retirer', 'annuler', 'effacer', 'vider', 'réinitialiser', 'se déconnecter', 'déconnexion', 'envoyer', 'soumettre', 'payer', 'acheter', 'commander', 'désabonner', 'bloquer', 'signaler',
];

const norm = (s: string): string =>
  ` ${s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/** The risky word a name holds, or null. */
export function riskyWord(name: string): string | null {
  const n = norm(name);
  for (const w of RISKY_WORDS) if (n.includes(` ${w} `)) return w;
  return null;
}

/** The distance from a point to the nearest point of a box, in pixels; 0 inside it. */
export function distanceToBox(x: number, y: number, c: SlipControl): number {
  const dx = Math.max(c.left - x, 0, x - (c.left + c.width));
  const dy = Math.max(c.top - y, 0, y - (c.top + c.height));
  return Math.hypot(dx, dy);
}

export interface SlipPair {
  /** The control the tap is aimed at. */
  readonly aimed: SlipControl;
  /** The risky control it may land on. */
  readonly onto: SlipControl;
  readonly word: string;
  /** How far the risky control is from the centre of the aimed one, in pixels, rounded. */
  readonly distance: number;
}

export interface SlipModel {
  /** The size of the tap circle used, in pixels, and where it came from. */
  readonly tap: number;
  readonly fromTest: boolean;
  readonly controls: number;
  readonly risky: number;
  readonly pairs: readonly SlipPair[];
  /** Risky controls smaller than the tap size, each way. */
  readonly smallRisky: readonly SlipControl[];
  readonly truncated: boolean;
}

/**
 * Finds, for each control, the risky controls that reach into the circle a
 * tap aimed at its centre may land in. `tapPx` is the person's measured size,
 * or null to use the App's minimum.
 */
export function buildSlips(f: SlipFacts, tapPx: number | null): SlipModel {
  const tap = tapPx !== null && tapPx > 0 ? tapPx : DEFAULT_TAP;
  const r = tap / 2;
  const words = f.controls.map((c) => riskyWord(c.name));
  const pairs: SlipPair[] = [];
  f.controls.forEach((a, i) => {
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    f.controls.forEach((b, j) => {
      const word = words[j];
      if (i === j || word === null || word === undefined) return;
      const d = distanceToBox(cx, cy, b);
      if (d < r) pairs.push({ aimed: a, onto: b, word, distance: Math.round(d) });
    });
  });
  pairs.sort((x, y) => x.distance - y.distance || x.aimed.top - y.aimed.top);
  return {
    tap,
    fromTest: tapPx !== null && tapPx > 0,
    controls: f.controls.length,
    risky: words.filter((w) => w !== null).length,
    pairs,
    smallRisky: f.controls.filter((c, i) => words[i] !== null && (c.width < tap || c.height < tap)),
    truncated: f.truncated,
  };
}

const q = (s: string, lang: Lang): string => (lang === 'fr' ? `«${NNBSP}${s}${NNBSP}»` : `“${s}”`);
const px = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}px` : `${n} px`);
export const slipName = (c: SlipControl, lang: Lang): string => (c.name !== '' ? c.name : lang === 'fr' ? `sans nom (${c.id})` : `no name (${c.id})`);

/** What was found, in a few sentences. */
export function slipSummary(m: SlipModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const lines = [
    m.fromTest
      ? fr
        ? `Taille de toucher utilisée${NBSP}: ${px(m.tap, 'fr')}, celle de votre test de toucher.`
        : `Tap size used: ${px(m.tap, 'en')}, from your tap test.`
      : fr
        ? `Taille de toucher utilisée${NBSP}: ${px(m.tap, 'fr')}, le minimum de l’App, car le test de toucher n’a pas été fait. La vôtre reste UNKNOWN.`
        : `Tap size used: ${px(m.tap, 'en')}, the App’s minimum, since the tap test was not taken. Yours stays UNKNOWN.`,
  ];
  if (m.controls === 0) {
    lines.push(fr ? 'Aucune commande visible n’a été trouvée sur cette page.' : 'No visible control was found on this page.');
    return lines;
  }
  lines.push(
    fr
      ? `Sur ${m.controls}${NBSP}${m.controls < 2 ? 'commande' : 'commandes'}, ${m.risky} ${m.risky < 2 ? 'fait' : 'font'} une action difficile à défaire.`
      : `Of ${m.controls} ${m.controls === 1 ? 'control' : 'controls'}, ${m.risky} ${m.risky === 1 ? 'does' : 'do'} something hard to take back.`,
  );
  lines.push(
    m.pairs.length === 0
      ? fr
        ? 'Aucune commande à risque n’est assez proche d’une autre pour qu’un toucher visant l’une tombe sur elle.'
        : 'No risky control is close enough to another for a tap aimed at it to land on the risky one.'
      : fr
        ? `À ${m.pairs.length}${NBSP}${m.pairs.length < 2 ? 'endroit' : 'endroits'}, un toucher visant une commande peut tomber sur une commande à risque.`
        : `In ${m.pairs.length} ${m.pairs.length === 1 ? 'place' : 'places'}, a tap aimed at one control may land on a risky one.`,
  );
  if (m.truncated) lines.push(fr ? 'La page est longue et seule une partie a été lue, donc le reste est UNKNOWN.' : 'The page is long and only part of it was read, so the rest is UNKNOWN.');
  return lines;
}

/** One pair in a sentence. */
export function pairText(p: SlipPair, lang: Lang): string {
  return lang === 'fr'
    ? `Un toucher visant ${q(slipName(p.aimed, 'fr'), 'fr')} peut tomber sur ${q(slipName(p.onto, 'fr'), 'fr')}, à ${px(p.distance, 'fr')} de son centre.`
    : `A tap aimed at ${q(slipName(p.aimed, 'en'), 'en')} may land on ${q(slipName(p.onto, 'en'), 'en')}, ${px(p.distance, 'en')} from its centre.`;
}

/** One small risky control in a sentence. */
export function smallText(c: SlipControl, tap: number, lang: Lang): string {
  return lang === 'fr'
    ? `${q(slipName(c, 'fr'), 'fr')} mesure ${c.width}${NBSP}×${NBSP}${px(c.height, 'fr')}, moins que la taille de toucher de ${px(tap, 'fr')}.`
    : `${q(slipName(c, 'en'), 'en')} is ${c.width} × ${px(c.height, 'en')}, less than the tap size of ${px(tap, 'en')}.`;
}

/** What may help, in general terms, when something was found. */
export function slipAdvice(m: SlipModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (m.pairs.length === 0 && m.smallRisky.length === 0) return [];
  return [
    fr
      ? `Ce qui peut aider l’équipe${NBSP}: plus d’espace autour des commandes à risque, les placer loin des commandes courantes, et une confirmation ou un moyen d’annuler après coup.`
      : 'What may help the team: more space around risky controls, placing them away from everyday controls, and a confirmation or a way to undo afterwards.',
  ];
}

/** The result as plain text, to paste into a message or a ticket. */
export function slipText(m: SlipModel, lang: Lang, max = 40): string {
  const fr = lang === 'fr';
  const lines = [fr ? 'Glissements vers des commandes à risque' : 'Slips onto risky controls', ...slipSummary(m, lang)];
  for (const p of m.pairs.slice(0, max)) lines.push(`- ${pairText(p, lang)}`);
  if (m.pairs.length > max) lines.push(fr ? `… et ${m.pairs.length - max} de plus.` : `… and ${m.pairs.length - max} more.`);
  for (const c of m.smallRisky.slice(0, max)) lines.push(`- ${smallText(c, m.tap, lang)}`);
  lines.push(...slipAdvice(m, lang));
  lines.push(
    fr
      ? 'Ces comptes portent sur la place des commandes à cette taille de fenêtre. Ils ne disent pas à quelle fréquence quelqu’un glisse.'
      : 'These counts are about where the controls sit at this window size. They do not say how often anyone slips.',
  );
  return `${lines.join('\n')}\n`;
}
