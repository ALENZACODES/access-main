import { clip, t, type CheckResult, type Entry, type Lang } from './types.js';
import { MIN_WORDS, primary, type TextBlock } from './langparts.js';
import type { ProseFacts } from './prose.js';

/**
 * Instructions that point at something only some people can see or hear
 * (WCAG 1.3.3): "press the green button", "use the menu on the right", "when
 * you hear the beep". The words are matched, not understood, so a sentence can
 * be flagged when the control is also named, and one can be missed. Every
 * finding is UNKNOWN. A person decides whether the instruction still works
 * without the colour, shape, place, size or sound.
 */

export type SensoryRule = 'colour' | 'shape' | 'position' | 'size' | 'sound';

export const SENSORY_RULES: readonly SensoryRule[] = ['colour', 'shape', 'position', 'size', 'sound'];

interface Pattern {
  readonly rule: SensoryRule;
  readonly re: RegExp;
}

const COLOURS_EN = 'red|green|blue|yellow|orange|purple|pink|grey|gray|white|black|brown';
const COLOURS_FR = 'rouge|vert|verte|bleu|bleue|jaune|orange|violet|violette|rose|gris|grise|blanc|blanche|noir|noire|brun|brune';
const THINGS_EN = 'button|buttons|link|links|icon|icons|box|boxes|field|fields|text|tab|tabs|banner|badge|dot|label|labels|arrow|section|bar|line|lines|area|item|items|menu|card|cards|message|messages|star|stars|circle';
const THINGS_FR = 'bouton|boutons|lien|liens|icône|icônes|icone|icones|case|cases|champ|champs|texte|onglet|onglets|bannière|pastille|étiquette|étiquettes|flèche|section|barre|ligne|lignes|zone|zones|élément|éléments|menu|carte|cartes|message|messages|étoile|étoiles|cercle';
const SHAPES_EN = 'round|square|circular|triangular|rectangular|oval|star-shaped|heart-shaped|diamond|arrow-shaped';
const SHAPES_FR = 'rond|ronde|carré|carrée|circulaire|triangulaire|rectangulaire|ovale|étoilé|étoilée|en forme de [\\p{L}]+';

const SPACE = '[\\s\\u00A0\\u202F]+';
const b = (s: string): string => `(?<![\\p{L}])(?:${s})(?![\\p{L}])`;

export const PATTERNS: Readonly<Record<Lang, readonly Pattern[]>> = {
  en: [
    { rule: 'colour', re: new RegExp(`${b(`(?:the|a|an|that|this|each|every)${SPACE}(?:${COLOURS_EN})${SPACE}(?:${THINGS_EN})`)}`, 'iu') },
    { rule: 'colour', re: new RegExp(`${b(`(?:${COLOURS_EN})${SPACE}(?:${THINGS_EN})`)}`, 'iu') },
    { rule: 'colour', re: new RegExp(`${b(`(?:marked|shown|highlighted|coloured|colored|outlined|underlined)${SPACE}(?:in|with)${SPACE}(?:${COLOURS_EN})`)}`, 'iu') },
    { rule: 'colour', re: new RegExp(`${b(`(?:${COLOURS_EN})${SPACE}means`)}`, 'iu') },
    { rule: 'shape', re: new RegExp(`${b(`(?:the|a|an)${SPACE}(?:${SHAPES_EN})${SPACE}(?:${THINGS_EN})`)}`, 'iu') },
    { rule: 'shape', re: new RegExp(`${b(`(?:${SHAPES_EN})${SPACE}(?:${THINGS_EN})`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:${THINGS_EN})${SPACE}(?:on|at|in|to)${SPACE}the${SPACE}(?:left|right|top|bottom)(?:${SPACE}(?:side|corner|hand))?`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:the|in the)${SPACE}(?:left|right|top|bottom)(?:-hand)?${SPACE}(?:menu|column|corner|side|panel|button|link|bar|sidebar|navigation|nav|sidebar)`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:the|an?)${SPACE}(?:${THINGS_EN})${SPACE}(?:above|below|beside|next${SPACE}to|under|over)`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:see|use|click|press|tap|select|choose|find)${SPACE}(?:the${SPACE})?(?:${THINGS_EN})${SPACE}(?:above|below)`)}`, 'iu') },
    { rule: 'size', re: new RegExp(`${b(`(?:the|a)${SPACE}(?:large|big|small|tiny|biggest|smallest|larger|smaller|huge)${SPACE}(?:${THINGS_EN})`)}`, 'iu') },
    { rule: 'sound', re: new RegExp(`${b(`(?:when${SPACE}you${SPACE}hear|listen${SPACE}for|after${SPACE}the|until${SPACE}you${SPACE}hear|you${SPACE}will${SPACE}hear|wait${SPACE}for${SPACE}the)${SPACE}(?:a${SPACE}|an${SPACE}|the${SPACE})?(?:beep|chime|tone|ding|buzz|bell|sound|signal)`)}`, 'iu') },
    { rule: 'sound', re: new RegExp(`${b(`(?:beep|chime|ding|buzz)${SPACE}(?:means|tells${SPACE}you|signals)`)}`, 'iu') },
  ],
  fr: [
    { rule: 'colour', re: new RegExp(`${b(`(?:le|la|les|un|une|ce|cette|ces|chaque)${SPACE}(?:${THINGS_FR})${SPACE}(?:${COLOURS_FR})`)}`, 'iu') },
    { rule: 'colour', re: new RegExp(`${b(`(?:le|la|les|un|une|ce|cette|ces)${SPACE}(?:${COLOURS_FR})${SPACE}(?:${THINGS_FR})`)}`, 'iu') },
    { rule: 'colour', re: new RegExp(`${b(`(?:en|de${SPACE}couleur|indiqués?|indiquées?|marqués?|marquées?|surlignés?|surlignées?|soulignés?|soulignées?)${SPACE}(?:en${SPACE})?(?:${COLOURS_FR})`)}`, 'iu') },
    { rule: 'colour', re: new RegExp(`${b(`(?:${COLOURS_FR})${SPACE}signifie`)}`, 'iu') },
    { rule: 'shape', re: new RegExp(`${b(`(?:le|la|les|un|une)${SPACE}(?:${THINGS_FR})${SPACE}(?:${SHAPES_FR})`)}`, 'iu') },
    { rule: 'shape', re: new RegExp(`${b(`(?:le|la|les|un|une)${SPACE}(?:${SHAPES_FR})${SPACE}(?:${THINGS_FR})`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:${THINGS_FR})${SPACE}(?:à|en|dans)${SPACE}(?:la${SPACE})?(?:droite|gauche|haut|bas)`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:le|la|les|un|une)${SPACE}(?:${THINGS_FR})${SPACE}(?:du|de${SPACE}la|en)${SPACE}(?:haut|bas|droite|gauche)`)}`, 'iu') },
    { rule: 'position', re: new RegExp(`${b(`(?:le|la|les|un|une)${SPACE}(?:${THINGS_FR})${SPACE}(?:ci-dessus|ci-dessous|au-dessus|au-dessous|en${SPACE}dessous|en${SPACE}dessus)`)}`, 'iu') },
    { rule: 'size', re: new RegExp(`${b(`(?:le|la|les|un|une)${SPACE}(?:grand|grande|gros|grosse|petit|petite|énorme|plus${SPACE}grand|plus${SPACE}grande|plus${SPACE}petit|plus${SPACE}petite)${SPACE}(?:${THINGS_FR})`)}`, 'iu') },
    { rule: 'sound', re: new RegExp(`${b(`(?:quand${SPACE}vous${SPACE}entendez|écoutez|dès${SPACE}que${SPACE}vous${SPACE}entendez|jusqu’à${SPACE}ce${SPACE}que${SPACE}vous${SPACE}entendiez|après${SPACE}le|attendez${SPACE}le)${SPACE}(?:un${SPACE}|une${SPACE}|le${SPACE}|la${SPACE})?(?:bip|signal${SPACE}sonore|son|sonnerie|tonalité|carillon|cloche)`)}`, 'iu') },
    { rule: 'sound', re: new RegExp(`${b(`(?:le${SPACE})?(?:bip|carillon|signal${SPACE}sonore)${SPACE}(?:signifie|indique)`)}`, 'iu') },
  ],
};

/** Words that name the control by what it is called. When the sentence quotes a label, it is not flagged as pointing only at a look. */
const QUOTED = /[“"«][^”"»]{2,40}[”"»]/u;

export interface Hit {
  readonly rule: SensoryRule;
  readonly text: string;
}

/** The sensory phrases of a text, one per rule, and none in a sentence that also names the control in quotation marks. */
export function sensoryHits(text: string, lang: Lang): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<SensoryRule>();
  const sentences = text.split(/(?<=[.!?…])\s+/u);
  for (const s of sentences) {
    if (QUOTED.test(s)) continue;
    for (const p of PATTERNS[lang]) {
      if (seen.has(p.rule)) continue;
      const m = p.re.exec(s);
      if (m) {
        seen.add(p.rule);
        hits.push({ rule: p.rule, text: m[0] });
      }
    }
  }
  return hits;
}

const WHAT: Readonly<Record<SensoryRule, { en: string; fr: string; enAlt: string; frAlt: string }>> = {
  colour: { en: 'a colour', fr: 'une couleur', enAlt: 'the name of the control', frAlt: 'le nom du contrôle' },
  shape: { en: 'a shape', fr: 'une forme', enAlt: 'the name of the control', frAlt: 'le nom du contrôle' },
  position: { en: 'a place on the screen', fr: 'un emplacement à l’écran', enAlt: 'the name of the control', frAlt: 'le nom du contrôle' },
  size: { en: 'a size', fr: 'une taille', enAlt: 'the name of the control', frAlt: 'le nom du contrôle' },
  sound: { en: 'a sound', fr: 'un son', enAlt: 'a visible message as well', frAlt: 'aussi un message visible' },
};

export function auditSensory(f: ProseFacts): CheckResult {
  const entries: Entry[] = [];
  let checked = 0;
  for (const bl of f.blocks as readonly TextBlock[]) {
    const lang = primary(bl.lang || f.pageLang);
    if (lang !== 'en' && lang !== 'fr') continue;
    if (bl.text.split(/\s+/).length < MIN_WORDS) continue;
    checked++;
    for (const h of sensoryHits(bl.text, lang)) {
      const w = WHAT[h.rule];
      entries.push({
        check: 'sensory',
        id: bl.id,
        status: 'unknown',
        rule: h.rule,
        message: t(
          `“${clip(h.text, 40)}” points at ${w.en}. People who cannot see or hear it need ${w.enAlt}. Check that the instruction still works without it.`,
          `«\u202F${clip(h.text, 40)}\u202F» renvoie à ${w.fr}. Les personnes qui ne peuvent pas le voir ou l’entendre ont besoin de ${w.frAlt}. Contrôlez que la consigne reste utilisable sans cela.`,
        ),
      });
    }
  }
  return { checked, entries };
}
