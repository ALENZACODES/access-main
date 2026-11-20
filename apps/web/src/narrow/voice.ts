import { NBSP, NNBSP, type Lang } from './types.js';
import type { VoiceControl, VoiceFacts } from './voice-inpage.js';

/**
 * Say it to press it. Voice control tools let a person press a control by
 * saying its name, such as "click Send". They match the words said against
 * the name each control gives to assistive technology. That works in one
 * step only when the control shows words, when its name holds those words
 * (WCAG 2.5.3), and when no other control has the same name. Otherwise the
 * person has to guess the hidden name, or ask the tool to show numbers or a
 * grid and say a number: more steps, and more speaking, each time.
 *
 * This counts which controls of the page need those extra steps. It does not
 * say how a given voice tool behaves: tools differ.
 */

/** A control's name or text as the words a person would say: lower case, no punctuation. */
export function words(s: string): string[] {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '');
}

/** Whether `part` appears, in order and next to each other, in `whole`. An empty part never does. */
export function holds(whole: readonly string[], part: readonly string[]): boolean {
  if (part.length === 0 || part.length > whole.length) return false;
  for (let i = 0; i + part.length <= whole.length; i += 1) {
    if (part.every((w, j) => whole[i + j] === w)) return true;
  }
  return false;
}

export type VoiceIssue = 'no-name' | 'no-words' | 'name-differs' | 'shared-name';

export interface VoiceOutcome {
  readonly control: VoiceControl;
  readonly issues: readonly VoiceIssue[];
  /** How many controls of the page share its name, itself included. 1 when none does. */
  readonly sharedWith: number;
}

export interface VoiceModel {
  readonly outcomes: readonly VoiceOutcome[];
  /** Controls a person can press in one step by saying what they show. */
  readonly direct: number;
  readonly counts: Readonly<Record<VoiceIssue, number>>;
  readonly truncated: boolean;
}

export function buildVoice(f: VoiceFacts): VoiceModel {
  const key = (c: VoiceControl): string => words(c.name).join(' ');
  const byName = new Map<string, number>();
  for (const c of f.controls) {
    const k = key(c);
    if (k !== '') byName.set(k, (byName.get(k) ?? 0) + 1);
  }
  const counts: Record<VoiceIssue, number> = { 'no-name': 0, 'no-words': 0, 'name-differs': 0, 'shared-name': 0 };
  let direct = 0;
  const outcomes = f.controls.map((c) => {
    const name = words(c.name);
    const seen = words(c.visible);
    const issues: VoiceIssue[] = [];
    // With no name, nothing reaches it by voice: that says it all, so "no words" is not added.
    if (name.length === 0) issues.push('no-name');
    else if (seen.length === 0) issues.push('no-words');
    else if (name.length > 0 && !holds(name, seen)) issues.push('name-differs');
    const sharedWith = name.length === 0 ? 1 : (byName.get(key(c)) ?? 1);
    if (sharedWith > 1) issues.push('shared-name');
    for (const i of issues) counts[i] += 1;
    if (issues.length === 0) direct += 1;
    return { control: c, issues, sharedWith };
  });
  return { outcomes, direct, counts, truncated: f.truncated };
}

/** Command words a person may put before the name. They are left out before matching. */
const COMMAND = /^(?:(?:please|s il vous plaît)\s+)?(?:click|tap|press|select|choose|open|go to|cliquer sur|cliquez sur|cliquer|cliquez|appuyer sur|appuyez sur|toucher|touchez|choisir|choisissez|ouvrir|ouvrez|aller à|allez à)\s+/u;

/** The words of a phrase, without a command word in front. */
export function phraseWords(phrase: string): string[] {
  const w = words(phrase).join(' ');
  return words(w.replace(COMMAND, ''));
}

export type SayResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'none'; readonly phrase: string }
  | { readonly kind: 'one'; readonly phrase: string; readonly control: VoiceControl }
  | { readonly kind: 'many'; readonly phrase: string; readonly controls: readonly VoiceControl[] };

/** Which controls a phrase would reach, by the words of their names. */
export function say(phrase: string, f: VoiceFacts): SayResult {
  const p = phraseWords(phrase);
  if (p.length === 0) return { kind: 'empty' };
  const text = p.join(' ');
  const hits = f.controls.filter((c) => holds(words(c.name), p));
  if (hits.length === 0) return { kind: 'none', phrase: text };
  if (hits.length === 1 && hits[0]) return { kind: 'one', phrase: text, control: hits[0] };
  return { kind: 'many', phrase: text, controls: hits };
}

const q = (s: string, lang: Lang): string => (lang === 'fr' ? `«${NNBSP}${s}${NNBSP}»` : `“${s}”`);

const ROLE_NAMES: Readonly<Record<VoiceControl['role'], { readonly en: string; readonly fr: string }>> = {
  button: { en: 'button', fr: 'bouton' },
  link: { en: 'link', fr: 'lien' },
  field: { en: 'field', fr: 'champ' },
  choice: { en: 'choice', fr: 'choix' },
  other: { en: 'control', fr: 'commande' },
};

/** A control in words: its role and what it shows, or its id when it shows nothing. */
export function controlText(c: VoiceControl, lang: Lang): string {
  const role = ROLE_NAMES[c.role][lang];
  const shown = c.visible !== '' ? c.visible : c.name;
  if (shown !== '') return `${role} ${q(shown, lang)}`;
  return lang === 'fr' ? `${role} sans texte (${c.id})` : `${role} with no text (${c.id})`;
}

/** Why one control takes extra steps, one sentence per issue. */
export function issueText(o: VoiceOutcome, issue: VoiceIssue, lang: Lang): string {
  const fr = lang === 'fr';
  const c = o.control;
  switch (issue) {
    case 'no-name':
      return fr ? 'Il n’a aucun nom, donc aucune parole ne l’atteint. Il faut passer par des numéros ou une grille.' : 'It has no name, so no words reach it. It takes numbers or a grid.';
    case 'no-words':
      return fr
        ? `Il ne montre aucun mot. Pour l’atteindre, il faut deviner son nom caché${c.name !== '' ? `, ${q(c.name, 'fr')},` : ''} ou passer par des numéros.`
        : `It shows no words. To reach it, a person has to guess its hidden name${c.name !== '' ? `, ${q(c.name, 'en')},` : ''} or use numbers.`;
    case 'name-differs':
      return fr
        ? `Il montre ${q(c.visible, 'fr')}, mais son nom est ${q(c.name, 'fr')}. Dire ce qu’il montre peut ne pas fonctionner.`
        : `It shows ${q(c.visible, 'en')}, but its name is ${q(c.name, 'en')}. Saying what it shows may not work.`;
    case 'shared-name':
      return fr
        ? `${o.sharedWith}${NBSP}commandes portent le nom ${q(c.name, 'fr')}. L’outil vocal demandera laquelle, souvent avec des numéros.`
        : `${o.sharedWith} controls are named ${q(c.name, 'en')}. The voice tool will ask which one, often with numbers.`;
    default:
      return '';
  }
}

const ctl = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}${n < 2 ? 'commande' : 'commandes'}` : `${n} ${n === 1 ? 'control' : 'controls'}`);

/** What was found, in a few sentences. */
export function voiceSummary(m: VoiceModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const total = m.outcomes.length;
  if (total === 0) return [fr ? 'Aucune commande visible n’a été trouvée sur cette page.' : 'No visible control was found on this page.'];
  const lines = [
    fr
      ? `Sur ${ctl(total, 'fr')}, ${m.direct} ${m.direct < 2 ? 'peut' : 'peuvent'} être ${m.direct < 2 ? 'atteinte' : 'atteintes'} en une étape en disant ce qu’elle${m.direct < 2 ? '' : 's'} montre${m.direct < 2 ? '' : 'nt'}.`
      : `Of ${ctl(total, 'en')}, ${m.direct} can be reached in one step by saying what ${m.direct === 1 ? 'it shows' : 'they show'}.`,
  ];
  const parts: string[] = [];
  const add = (n: number, en: string, frText: string): void => {
    if (n > 0) parts.push(fr ? `${ctl(n, 'fr')} ${frText}` : `${ctl(n, 'en')} ${en}`);
  };
  add(m.counts['no-words'], m.counts['no-words'] === 1 ? 'shows no words' : 'show no words', m.counts['no-words'] < 2 ? 'ne montre aucun mot' : 'ne montrent aucun mot');
  add(m.counts['name-differs'], m.counts['name-differs'] === 1 ? 'has a name that differs from what it shows' : 'have a name that differs from what they show', m.counts['name-differs'] < 2 ? 'porte un nom différent de ce qu’elle montre' : 'portent un nom différent de ce qu’elles montrent');
  add(m.counts['shared-name'], m.counts['shared-name'] === 1 ? 'shares its name' : 'share a name with another control', m.counts['shared-name'] < 2 ? 'partage son nom' : 'partagent un nom avec une autre commande');
  add(m.counts['no-name'], m.counts['no-name'] === 1 ? 'has no name' : 'have no name', m.counts['no-name'] < 2 ? 'n’a aucun nom' : 'n’ont aucun nom');
  if (parts.length > 0) lines.push(`${parts.join(fr ? `${NNBSP}; ` : '; ')}.`.replace(/^./, (ch) => ch.toUpperCase()));
  if (m.truncated) lines.push(fr ? 'La page est longue et seule une partie a été lue, donc le reste est UNKNOWN.' : 'The page is long and only part of it was read, so the rest is UNKNOWN.');
  return lines;
}

/** The result of a phrase in one sentence. */
export function sayText(r: SayResult, lang: Lang): string {
  const fr = lang === 'fr';
  switch (r.kind) {
    case 'empty':
      return fr ? 'Écrivez ce que vous diriez, par exemple Envoyer.' : 'Write what you would say, such as Send.';
    case 'none':
      return fr
        ? `Aucune commande de cette page n’a ${q(r.phrase, 'fr')} dans son nom. L’outil vocal ne trouvera sans doute rien.`
        : `No control of this page has ${q(r.phrase, 'en')} in its name. The voice tool will likely find nothing.`;
    case 'one':
      return fr ? `Une seule commande répond à ${q(r.phrase, 'fr')}${NBSP}: ${controlText(r.control, 'fr')}.` : `One control answers to ${q(r.phrase, 'en')}: ${controlText(r.control, 'en')}.`;
    case 'many':
      return fr
        ? `${r.controls.length}${NBSP}commandes répondent à ${q(r.phrase, 'fr')}. L’outil vocal demandera laquelle, souvent avec des numéros.`
        : `${r.controls.length} controls answer to ${q(r.phrase, 'en')}. The voice tool will ask which one, often with numbers.`;
    default:
      return '';
  }
}

/** The result as plain text, to paste into a message or a ticket. */
export function voiceText(m: VoiceModel, lang: Lang, max = 40): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const lines = [fr ? 'Le dire pour appuyer' : 'Say it to press it', ...voiceSummary(m, lang)];
  const hard = m.outcomes.filter((o) => o.issues.length > 0);
  for (const o of hard.slice(0, max)) lines.push(`${controlText(o.control, lang)}${colon} ${o.issues.map((i) => issueText(o, i, lang)).join(' ')}`);
  if (hard.length > max) lines.push(fr ? `… et ${hard.length - max} de plus.` : `… and ${hard.length - max} more.`);
  lines.push(
    fr
      ? 'Les outils vocaux diffèrent. Ces comptes portent sur les noms de la page, pas sur un outil en particulier.'
      : 'Voice tools differ. These counts are about the names on the page, not about any one tool.',
  );
  return `${lines.join('\n')}\n`;
}
