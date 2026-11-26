import { NBSP, NNBSP, type Lang } from './types.js';
import type { HoverFacts, HoverRule } from './hover-inpage.js';

/**
 * What the hover rules of a page mean for a person who cannot hover: a touch
 * screen, a switch, a keyboard, voice control, or a pointer that cannot rest
 * still. Content shown only on hover is out of their reach; WCAG 2.1.1 and
 * 1.4.13 ask for the same content by keyboard focus, and touch has neither.
 *
 * A rule with a focus twin shows its content to the keyboard too. A rule
 * that hides nothing right now may only change a look, so it is said with
 * less weight. Style sheets that could not be read leave the rest UNKNOWN.
 */

export type HoverAbility = 'can' | 'cannot' | 'unsure';
export type HoverStatus = 'controls-hidden' | 'content-hidden' | 'no-twin' | 'twin';

export interface HoverFinding {
  readonly rule: HoverRule;
  readonly status: HoverStatus;
}

export interface HoverModel {
  readonly findings: readonly HoverFinding[];
  readonly counts: Readonly<Record<HoverStatus, number>>;
  readonly sheetsRead: number;
  readonly sheetsUnread: number;
  readonly deviceHover: boolean | null;
  readonly truncated: boolean;
}

export const HOVER_STATUSES: readonly HoverStatus[] = ['controls-hidden', 'content-hidden', 'no-twin', 'twin'];
/** How many rules are listed on screen. */
export const HOVER_LISTED = 15;

export function hoverStatusOf(r: HoverRule): HoverStatus {
  if (r.twin) return 'twin';
  if (r.controlsHidden > 0) return 'controls-hidden';
  if (r.hiddenNow > 0) return 'content-hidden';
  return 'no-twin';
}

export function buildHover(facts: HoverFacts): HoverModel {
  const counts = Object.fromEntries(HOVER_STATUSES.map((s) => [s, 0])) as Record<HoverStatus, number>;
  const findings = facts.rules.map((rule): HoverFinding => {
    const status = hoverStatusOf(rule);
    counts[status] += 1;
    return { rule, status };
  });
  const rank = (s: HoverStatus): number => HOVER_STATUSES.indexOf(s);
  findings.sort((a, b) => rank(a.status) - rank(b.status) || b.rule.hiddenNow - a.rule.hiddenNow);
  return { findings, counts, sheetsRead: facts.sheetsRead, sheetsUnread: facts.sheetsUnread, deviceHover: facts.deviceHover, truncated: facts.truncated };
}

/** The rules that keep something from a person who cannot hover. */
export const hoverUnreachable = (m: HoverModel): number => m.counts['controls-hidden'] + m.counts['content-hidden'];

const q = (s: string, lang: Lang): string => (lang === 'fr' ? `«${NNBSP}${s}${NNBSP}»` : `“${s}”`);

export function hoverFindingText(f: HoverFinding, lang: Lang): string {
  const fr = lang === 'fr';
  const r = f.rule;
  const head = `${fr ? 'Règle' : 'Rule'} ${q(r.selector, lang)} (${r.reveals.join(', ')})${fr ? `${NBSP}: ` : ': '}`;
  switch (f.status) {
    case 'controls-hidden':
      return (
        head +
        (fr
          ? `${r.controlsHidden} ${r.controlsHidden < 2 ? 'élément caché contient' : 'éléments cachés contiennent'} des commandes montrées au survol seulement, comme ${r.controlNames.map((n) => q(n, 'fr')).join(', ')}.`
          : `${r.controlsHidden} hidden ${r.controlsHidden === 1 ? 'element holds' : 'elements hold'} controls shown on hover only, such as ${r.controlNames.map((n) => q(n, 'en')).join(', ')}.`)
      );
    case 'content-hidden':
      return head + (fr ? `${r.hiddenNow} ${r.hiddenNow < 2 ? 'élément caché est montré' : 'éléments cachés sont montrés'} au survol seulement.` : `${r.hiddenNow} hidden ${r.hiddenNow === 1 ? 'element is' : 'elements are'} shown on hover only.`);
    case 'no-twin':
      return head + (fr ? 'rien n’est caché en ce moment, et aucune règle de focus ne fait la même chose. Elle peut ne changer qu’une apparence.' : 'nothing is hidden right now, and no focus rule does the same. It may only change a look.');
    case 'twin':
      return head + (fr ? 'une règle de focus fait la même chose, donc le clavier y a accès aussi.' : 'a focus rule does the same, so the keyboard gets it too.');
  }
}

/** The page in a few sentences, set against whether the person can hover. */
export function hoverSummary(m: HoverModel, ability: HoverAbility, lang: Lang): string[] {
  const fr = lang === 'fr';
  const n = m.findings.length;
  const lines: string[] = [];
  lines.push(
    n === 0
      ? fr
        ? `Aucune règle de survol qui montre quelque chose n’a été trouvée dans les ${m.sheetsRead}${NBSP}feuilles de style lues.`
        : `No hover rule that shows something was found in the ${m.sheetsRead} style ${m.sheetsRead === 1 ? 'sheet' : 'sheets'} read.`
      : fr
        ? `${n} ${n < 2 ? 'règle de survol montre' : 'règles de survol montrent'} quelque chose${m.truncated ? ' (la lecture s’est arrêtée avant la fin)' : ''}. Commandes cachées hors survol${NBSP}: ${m.counts['controls-hidden']}. Contenu caché hors survol${NBSP}: ${m.counts['content-hidden']}. Sans règle de focus, sans rien de caché${NBSP}: ${m.counts['no-twin']}. Avec règle de focus${NBSP}: ${m.counts.twin}.`
        : `${n} hover ${n === 1 ? 'rule shows' : 'rules show'} something${m.truncated ? ' (the reading stopped before the end)' : ''}. Controls hidden unless hovered: ${m.counts['controls-hidden']}. Content hidden unless hovered: ${m.counts['content-hidden']}. With no focus rule and nothing hidden: ${m.counts['no-twin']}. With a focus rule: ${m.counts.twin}.`,
  );
  if (m.sheetsUnread > 0) {
    lines.push(
      fr
        ? `${m.sheetsUnread} ${m.sheetsUnread < 2 ? 'feuille de style n’a pas pu être lue' : 'feuilles de style n’ont pas pu être lues'} (d’une autre origine), donc leurs règles sont UNKNOWN.`
        : `${m.sheetsUnread} style ${m.sheetsUnread === 1 ? 'sheet' : 'sheets'} could not be read (from another origin), so ${m.sheetsUnread === 1 ? 'its' : 'their'} rules are UNKNOWN.`,
    );
  }
  const device =
    m.deviceHover === null
      ? fr
        ? 'Ce que votre appareil permet pour le survol est UNKNOWN.'
        : 'Whether your device can hover is UNKNOWN.'
      : m.deviceHover
        ? fr
          ? 'Votre appareil dit que son pointeur principal peut survoler.'
          : 'Your device says its main pointer can hover.'
        : fr
          ? 'Votre appareil dit que son pointeur principal ne peut pas survoler.'
          : 'Your device says its main pointer cannot hover.';
  lines.push(device);
  const hidden = hoverUnreachable(m);
  if (ability === 'cannot' && hidden > 0) {
    lines.push(fr ? `Vous avez dit ne pas pouvoir survoler${NBSP}: ce que montrent ces ${hidden}${NBSP}règles vous reste caché.` : `You said you cannot hover: what ${hidden === 1 ? 'that rule shows stays' : `these ${hidden} rules show stays`} hidden from you.`);
  } else if (ability === 'can' && hidden > 0) {
    lines.push(
      fr
        ? 'Vous avez dit pouvoir survoler. Ce qui n’apparaît qu’au survol demande tout de même de tenir le pointeur immobile.'
        : 'You said you can hover. What shows only on hover still asks you to hold the pointer still.',
    );
  } else if (ability === 'unsure' && hidden > 0) {
    lines.push(fr ? 'Vous n’avez pas dit si vous pouvez survoler, donc ce que cela veut dire pour vous est UNKNOWN.' : 'You did not say whether you can hover, so what this means for you is UNKNOWN.');
  }
  return lines;
}

/** General hints for the team, from what was found. */
export function hoverAdvice(m: HoverModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const out: string[] = [];
  if (m.counts['controls-hidden'] > 0) {
    out.push(
      fr
        ? 'Montrer aussi ces commandes au focus (:focus-within), ou les laisser visibles, pour le clavier, le toucher et les contacteurs.'
        : 'Show these controls on focus too (:focus-within), or keep them visible, for keyboard, touch and switch users.',
    );
  }
  if (m.counts['content-hidden'] > 0) {
    out.push(
      fr
        ? 'Pour un contenu montré au survol, donner un bouton qui l’ouvre et le ferme, et le montrer au focus.'
        : 'For content shown on hover, give a button that opens and closes it, and show it on focus.',
    );
  }
  return out;
}

const ABILITY: Record<HoverAbility, { en: string; fr: string }> = {
  can: { en: 'I can hover.', fr: 'je peux survoler.' },
  cannot: { en: 'I cannot hover. Content shown only on hover is out of my reach.', fr: 'je ne peux pas survoler. Ce qui n’apparaît qu’au survol m’est inaccessible.' },
  unsure: { en: '', fr: '' },
};

/** One line for the barrier text, once the person said whether they can hover. */
export function hoverNote(m: HoverModel | null, ability: HoverAbility, lang: Lang): string {
  if (ability === 'unsure') return '';
  const fr = lang === 'fr';
  const head = fr ? `Survol${NBSP}: ${ABILITY[ability].fr}` : `Hover: ${ABILITY[ability].en}`;
  if (!m || ability === 'can') return head;
  const hidden = hoverUnreachable(m);
  return hidden === 0 ? head : `${head} ${fr ? `Ici, ${hidden}${NBSP}${hidden < 2 ? 'règle cache' : 'règles cachent'} quelque chose hors survol.` : `Here, ${hidden} ${hidden === 1 ? 'rule hides' : 'rules hide'} something unless hovered.`}`;
}
