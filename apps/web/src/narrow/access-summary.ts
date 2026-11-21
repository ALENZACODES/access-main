import { NBSP, NNBSP, type Lang } from './types.js';

/**
 * My access summary: one place that brings together what the person measured
 * in the panels of this page (the button size their taps need, the screen
 * zones they can reach, how they press), so they can share it with a site or
 * a service when they ask for a change.
 *
 * It holds only what was measured, in the person's words of the moment. A
 * part not done yet is UNKNOWN, never guessed. It says nothing about health,
 * and nothing is stored or sent.
 */

export const SUMMARY_PARTS = ['tap', 'zones', 'press'] as const;
export type SummaryPart = (typeof SUMMARY_PARTS)[number];

/** The line each panel gives for the barrier text, or '' when it has nothing yet. */
export type SummaryLines = Readonly<Record<SummaryPart, string>>;

export const PART_TITLES: Readonly<Record<SummaryPart, { readonly en: string; readonly fr: string }>> = {
  tap: { en: 'Button size for my taps', fr: 'Taille des boutons pour mes touchers' },
  zones: { en: 'Screen zones I can reach', fr: 'Zones de l’écran que j’atteins' },
  press: { en: 'How I press', fr: 'Ma façon d’appuyer' },
};

export interface SummaryItem {
  readonly part: SummaryPart;
  readonly title: string;
  /** The measured line, or null when the part is not done yet. */
  readonly line: string | null;
}

export function summaryItems(lines: SummaryLines, lang: Lang): SummaryItem[] {
  return SUMMARY_PARTS.map((part) => {
    const line = (lines[part] ?? '').trim();
    return { part, title: PART_TITLES[part][lang], line: line === '' ? null : line };
  });
}

export const doneCount = (items: readonly SummaryItem[]): number => items.filter((i) => i.line !== null).length;

/** What a part not done yet says. */
export function notDoneText(lang: Lang): string {
  return lang === 'fr' ? 'UNKNOWN, pas encore fait.' : 'UNKNOWN, not done yet.';
}

/** How much is in the summary, in one sentence. */
export function summaryStatus(items: readonly SummaryItem[], lang: Lang): string {
  const fr = lang === 'fr';
  const done = doneCount(items);
  const all = items.length;
  if (done === 0) {
    return fr
      ? 'Aucune partie n’est encore faite. Faites un des tests plus haut, puis revenez ici.'
      : 'No part is done yet. Take one of the tests above, then come back here.';
  }
  if (done === all) return fr ? `Les ${all} parties sont faites.` : `All ${all} parts are done.`;
  return fr ? `${done} ${done < 2 ? 'partie faite' : 'parties faites'} sur ${all}. Les autres restent UNKNOWN.` : `${done} of ${all} parts done. The others stay UNKNOWN.`;
}

/** A date as the person reads it: 20 November 2026, or 20 novembre 2026. */
export function summaryDate(d: Date, lang: Lang): string {
  const months =
    lang === 'fr'
      ? ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()} ${months[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

/**
 * The summary as plain text, to paste into a message or a form. Each part
 * not done says UNKNOWN. The closing lines say what the text is and is not.
 */
export function accessSummaryText(items: readonly SummaryItem[], lang: Lang, when: Date | null = null): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const lines = [fr ? 'Mon résumé d’accès' : 'My access summary'];
  if (when) lines.push(fr ? `Mesuré le ${summaryDate(when, 'fr')}, sur cet écran.` : `Measured on ${summaryDate(when, 'en')}, on this screen.`);
  // Each measured line already says what it is about; a part not done is named by its title.
  for (const i of items) lines.push(i.line ?? `${i.title}${colon} ${notDoneText(lang)}`);
  lines.push(
    fr
      ? 'Ces mesures viennent de tests faits sur cet écran, de cette façon d’appuyer, ce jour-là. Elles ne disent rien de ma santé.'
      : 'These come from tests taken on this screen, in this way of pressing, on that day. They say nothing about my health.',
  );
  return `${lines.join('\n')}\n`;
}

/**
 * A short request a person may send with the summary. It asks, it does not
 * demand, it names only parts that were measured, and it says nothing about
 * the person: what to share is theirs to choose.
 */
export function requestText(items: readonly SummaryItem[], lang: Lang): string {
  const fr = lang === 'fr';
  const done = items.filter((i) => i.line !== null);
  if (done.length === 0) return '';
  const wants: string[] = [];
  for (const i of done) {
    if (i.part === 'tap') wants.push(fr ? 'des boutons assez grands pour mes touchers' : 'buttons large enough for my taps');
    if (i.part === 'zones') wants.push(fr ? 'les commandes à portée des zones que j’atteins' : 'controls within the screen zones I can reach');
    if (i.part === 'press') wants.push(fr ? 'des commandes qui tiennent compte de ma façon d’appuyer' : 'controls that allow for the way I press');
  }
  const list = wants.length === 1 ? (wants[0] ?? '') : `${wants.slice(0, -1).join(', ')}${fr ? ' et ' : ' and '}${wants.at(-1) ?? ''}`;
  return fr
    ? `Bonjour, votre site me serait plus facile à utiliser avec ${list}. Pourriez-vous en tenir compte${NNBSP}? Mes mesures sont jointes. Merci.`
    : `Hello, your site would be easier for me to use with ${list}. Could you allow for this? My measures are attached. Thank you.`;
}
