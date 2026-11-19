import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Text and symbols that CSS puts on the page with content on ::before and
 * ::after (WCAG 1.3.1, 1.1.1). Screen readers treat this text differently from
 * one browser to the next: some read it, some skip it. Wording that carries
 * meaning (such as "Required") belongs in the markup, and an icon font glyph
 * needs a text alternative or to be hidden. The page cannot say which case it
 * is, so every finding is UNKNOWN.
 */

export interface GeneratedFact {
  readonly id: string;
  readonly pseudo: '::before' | '::after';
  /** The text of the content value, with quotes removed. */
  readonly text: string;
}

export interface GeneratedFacts {
  readonly items: readonly GeneratedFact[];
  readonly checked: number;
  readonly truncated: boolean;
}

export const EMPTY_GENERATED: GeneratedFacts = { items: [], checked: 0, truncated: false };

export type GeneratedRule = 'css-text' | 'icon-glyph';

export const GENERATED_RULES: readonly GeneratedRule[] = ['css-text', 'icon-glyph'];

/** Runs in the page (serialised by evaluate). Reads only. */
export function generatedInPage(args: { readonly maxElements: number; readonly maxItems: number }): GeneratedFacts {
  interface El {
    id: string;
    tagName: string;
  }
  interface G {
    document: { body: { querySelectorAll(s: string): ArrayLike<El> } };
    getComputedStyle(e: El, pseudo?: string): { content: string };
  }
  const g = globalThis as unknown as G;
  const nodes = g.document.body.querySelectorAll('*');
  const counts: Record<string, number> = {};
  const items: GeneratedFact[] = [];
  let truncated = false;
  let checked = 0;
  const LITERAL = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/;
  for (let i = 0; i < nodes.length; i++) {
    if (i >= args.maxElements) {
      truncated = true;
      break;
    }
    const e = nodes[i];
    if (!e) continue;
    const k = e.tagName.toLowerCase();
    const n = counts[k] ?? 0;
    counts[k] = n + 1;
    if (k === 'script' || k === 'style' || k === 'head' || k === 'meta' || k === 'link') continue;
    checked++;
    for (const pseudo of ['::before', '::after'] as const) {
      const raw = (g.getComputedStyle(e, pseudo).content ?? '').trim();
      if (raw === '' || raw === 'none' || raw === 'normal') continue;
      const m = LITERAL.exec(raw);
      if (!m) continue;
      const text = (m[1] ?? m[2] ?? '').replace(/\\(["'\\])/g, '$1');
      if (text.trim() === '') continue;
      if (items.length >= args.maxItems) {
        truncated = true;
        continue;
      }
      items.push({ id: `${k}${e.id ? '#' + e.id : ''}[${n}]${pseudo}`, pseudo, text: text.slice(0, 80) });
    }
  }
  return { items, checked, truncated };
}

const PRIVATE_USE = /[\uE000-\uF8FF]|\\[eEfF][0-9a-fA-F]{3}(?![0-9a-fA-F])/u;
const LETTERS = /\p{L}{2,}/u;

export function auditGenerated(f: GeneratedFacts): CheckResult {
  const entries: Entry[] = [];
  for (const it of f.items) {
    if (PRIVATE_USE.test(it.text)) {
      entries.push({
        check: 'generated',
        id: it.id,
        status: 'unknown',
        rule: 'icon-glyph',
        message: t(
          'CSS adds an icon font glyph here. Some screen readers announce it as an unknown character or read nothing. Hide it from them and name the control in text, or give it a text alternative.',
          'Le CSS ajoute ici un glyphe de police d’icônes. Certains lecteurs d’écran l’annoncent comme un caractère sans nom ou ne lisent rien. Masquez-le pour eux et nommez le contrôle par du texte, ou donnez-lui une alternative textuelle.',
        ),
      });
    } else if (LETTERS.test(it.text)) {
      entries.push({
        check: 'generated',
        id: it.id,
        status: 'unknown',
        rule: 'css-text',
        message: t(
          `CSS adds the words “${clip(it.text, 30)}” here. Screen readers do not all read generated text, and it cannot be translated or selected. Put words that carry meaning in the markup.`,
          `Le CSS ajoute ici les mots «\u202F${clip(it.text, 30)}\u202F». Les lecteurs d’écran ne lisent pas tous le texte généré, et il ne peut ni être traduit ni être sélectionné. Placez les mots qui portent du sens dans le balisage.`,
        ),
      });
    }
  }
  return { checked: f.checked, entries };
}
