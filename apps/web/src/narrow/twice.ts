import { NBSP, NNBSP, type Lang } from './types.js';
import type { TwiceFacts, TwiceField } from './twice-inpage.js';

/**
 * Things a form asks for twice (WCAG 3.3.7, Redundant Entry). Typing the same
 * answer again costs a lot for someone who types slowly, with a mouth stick,
 * a switch, eye gaze or dictation. 3.3.7 allows it when it is needed for
 * security, so a password typed twice is said, but not counted as a barrier.
 *
 * Only this page is read: something asked on an earlier step stays UNKNOWN.
 */

export type TwiceKind = 'confirm' | 'same-token' | 'two-addresses' | 'same-label' | 'confirm-password';

export interface TwiceFinding {
  readonly kind: TwiceKind;
  /** The field asked first, or null for a pair of address groups. */
  readonly first: TwiceField | null;
  readonly second: TwiceField | null;
}

export interface TwiceModel {
  readonly findings: readonly TwiceFinding[];
  readonly fields: number;
  readonly forms: number;
  /** Findings that count as asking twice: all but a password confirmed for security. */
  readonly twice: number;
  readonly sameAs: readonly string[];
  readonly truncated: boolean;
}

/** Words that say a field asks for something again. */
export const CONFIRM_WORDS = /\b(confirm|re-?enter|again|repeat|retype)\b|confirm(er|ez)|ressaisi(r|ssez)|répét(er|ez)|retap(er|ez)|de nouveau|à nouveau/i;
/** The kinds that are a barrier to the person, in the order they are listed. */
export const TWICE_KINDS: readonly TwiceKind[] = ['confirm', 'same-token', 'two-addresses', 'same-label', 'confirm-password'];

const plain = (s: string): string =>
  s
    .toLowerCase()
    .replace(CONFIRM_WORDS, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\b(your|the|votre|le|la|les|l|de|du|des|d|à|a|again|please|svp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the second field looks like it asks for the first again. */
export function confirms(first: TwiceField, second: TwiceField): boolean {
  if (first.form !== second.form || !CONFIRM_WORDS.test(second.label) || CONFIRM_WORDS.test(first.label)) return false;
  if (first.token !== '' && first.token === second.token) return true;
  if (first.type === second.type && ['email', 'tel', 'password', 'number'].includes(first.type)) return true;
  const a = plain(first.label);
  const b = plain(second.label);
  return a !== '' && b !== '' && (a === b || b.includes(a) || a.includes(b));
}

const ADDRESS = /(street-address|address-line\d|address-level\d|postal-code|country)/;

export function buildTwice(facts: TwiceFacts): TwiceModel {
  const fields = facts.fields;
  const used = new Set<TwiceField>();
  const findings: TwiceFinding[] = [];
  // A field that asks for an earlier one again.
  for (let j = 0; j < fields.length; j++) {
    const second = fields[j] as TwiceField;
    for (let i = j - 1; i >= 0; i--) {
      const first = fields[i] as TwiceField;
      if (used.has(first) || !confirms(first, second)) continue;
      findings.push({ kind: first.type === 'password' ? 'confirm-password' : 'confirm', first, second });
      used.add(first);
      used.add(second);
      break;
    }
  }
  // The same autocomplete token twice in a form.
  for (let j = 0; j < fields.length; j++) {
    const second = fields[j] as TwiceField;
    if (used.has(second) || second.token === '') continue;
    const first = fields.slice(0, j).find((f) => !used.has(f) && f.form === second.form && f.token === second.token);
    if (!first) continue;
    findings.push({ kind: 'same-token', first, second });
    used.add(first);
    used.add(second);
  }
  // A shipping and a billing address with no box to copy one to the other.
  const has = (part: string): boolean => fields.some((f) => f.token.split(' ').includes(part) && ADDRESS.test(f.token));
  if (has('shipping') && has('billing') && facts.sameAs.length === 0) findings.push({ kind: 'two-addresses', first: null, second: null });
  // The same label and type twice in a form, in the same group: maybe the same thing.
  for (let j = 0; j < fields.length; j++) {
    const second = fields[j] as TwiceField;
    if (used.has(second) || plain(second.label) === '') continue;
    // Two fields whose autocomplete tokens differ say they ask for different things.
    const differ = (f: TwiceField): boolean => f.token !== '' && second.token !== '' && f.token !== second.token;
    const first = fields.slice(0, j).find((f) => !used.has(f) && f.form === second.form && f.type === second.type && f.group === second.group && !differ(f) && plain(f.label) === plain(second.label));
    if (!first) continue;
    findings.push({ kind: 'same-label', first, second });
    used.add(first);
    used.add(second);
  }
  findings.sort((a, b) => TWICE_KINDS.indexOf(a.kind) - TWICE_KINDS.indexOf(b.kind));
  return {
    findings,
    fields: fields.length,
    forms: new Set(fields.map((f) => f.form)).size,
    twice: findings.filter((f) => f.kind !== 'confirm-password').length,
    sameAs: facts.sameAs,
    truncated: facts.truncated,
  };
}

const q = (s: string, lang: Lang): string => (s === '' ? 'UNKNOWN' : lang === 'fr' ? `«${NNBSP}${s}${NNBSP}»` : `“${s}”`);

export function twiceFindingText(f: TwiceFinding, lang: Lang): string {
  const fr = lang === 'fr';
  const a = f.first ? q(f.first.label, lang) : '';
  const b = f.second ? q(f.second.label, lang) : '';
  switch (f.kind) {
    case 'confirm':
      return fr ? `${b} redemande ${a}. La même réponse est à taper deux fois.` : `${b} asks for ${a} again. The same answer has to be typed twice.`;
    case 'same-token':
      return fr
        ? `${a} et ${b} demandent la même chose (autocomplete ${q(f.first?.token ?? '', 'fr')}).`
        : `${a} and ${b} ask for the same thing (autocomplete ${q(f.first?.token ?? '', 'en')}).`;
    case 'two-addresses':
      return fr
        ? 'Une adresse de livraison et une adresse de facturation sont demandées, sans case pour reprendre la première.'
        : 'A shipping and a billing address are asked for, with no box to reuse the first.';
    case 'same-label':
      return fr
        ? `${a} est demandé deux fois, au même endroit. C’est peut-être la même chose, ou deux choses différentes.`
        : `${a} is asked for twice, in the same place. It may be the same thing, or two different ones.`;
    case 'confirm-password':
      return fr
        ? `${b} redemande le mot de passe ${a}. Les règles le permettent pour la sécurité, mais c’est une saisie de plus.`
        : `${b} asks for the password ${a} again. The rules allow this for security, but it is one more thing to type.`;
  }
}

/** The page in a few sentences. */
export function twiceSummary(m: TwiceModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (m.fields === 0) {
    return [fr ? 'Aucun champ à remplir n’a été trouvé dans cette page, donc rien n’est demandé deux fois.' : 'No field to fill in was found on this page, so nothing is asked for twice.'];
  }
  const lines = [
    fr
      ? `${m.fields} ${m.fields < 2 ? 'champ' : 'champs'} à remplir${m.truncated ? ' (la lecture s’est arrêtée avant la fin)' : ''}. Demandé deux fois${NBSP}: ${m.twice}.`
      : `${m.fields} ${m.fields === 1 ? 'field' : 'fields'} to fill in${m.truncated ? ' (the reading stopped before the end)' : ''}. Asked for twice: ${m.twice}.`,
  ];
  if (m.sameAs.length > 0) lines.push(fr ? `Cases qui peuvent reprendre une réponse${NBSP}: ${m.sameAs.map((s) => q(s, 'fr')).join(', ')}.` : `Boxes that may reuse an answer: ${m.sameAs.map((s) => q(s, 'en')).join(', ')}.`);
  lines.push(
    fr
      ? 'Seule cette page est lue. Ce qui a été demandé à une étape plus tôt et l’est de nouveau ici est UNKNOWN.'
      : 'Only this page is read. Something asked on an earlier step and asked again here is UNKNOWN.',
  );
  return lines;
}

/** General hints for the team, from what was found. */
export function twiceAdvice(m: TwiceModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const kinds = new Set(m.findings.map((f) => f.kind));
  const out: string[] = [];
  if (kinds.has('confirm')) {
    out.push(
      fr ? 'Demander chaque réponse une fois, et la montrer ensuite pour qu’on puisse la relire et la corriger.' : 'Ask for each answer once, then show it so it can be read back and corrected.',
    );
  }
  if (kinds.has('same-token') || kinds.has('same-label')) {
    out.push(fr ? 'Remplir d’avance un champ déjà répondu, ou le laisser choisir dans les réponses données.' : 'Fill in a field already answered, or let it be picked from the answers given.');
  }
  if (kinds.has('two-addresses')) out.push(fr ? 'Ajouter une case «${NNBSP}Même adresse que la livraison${NNBSP}», cochée d’avance.'.replaceAll('${NNBSP}', NNBSP) : 'Add a “Same as shipping address” box, checked by default.');
  if (kinds.has('confirm-password')) out.push(fr ? 'Pour un mot de passe, un bouton pour l’afficher peut remplacer la deuxième saisie.' : 'For a password, a button to show it can replace typing it twice.');
  return out;
}

/** One line for the barrier text, when the page asks for something twice. */
export function twiceNote(m: TwiceModel | null, lang: Lang): string {
  if (!m || m.twice === 0) return '';
  return lang === 'fr'
    ? `Demandé deux fois${NBSP}: cette page demande ${m.twice}${NBSP}${m.twice < 2 ? 'chose' : 'choses'} deux fois. J’ai besoin de répondre une seule fois.`
    : `Asked twice: this page asks for ${m.twice} ${m.twice === 1 ? 'thing' : 'things'} twice. I need to answer once.`;
}
