import { describe, expect, it } from 'vitest';
import { auditSensory, PATTERNS, SENSORY_RULES, sensoryHits } from './sensory.js';
import { EMPTY_PROSE, type ProseFacts } from './prose.js';
import { noFrIssues } from './expect-fr.js';

const facts = (texts: string[], pageLang = 'en'): ProseFacts => ({
  ...EMPTY_PROSE,
  pageLang,
  blocks: texts.map((text, i) => ({ id: `p[${i}]`, lang: '', own: false, text })),
});
const hits = (text: string, lang: 'en' | 'fr' = 'en'): string[] => sensoryHits(text, lang).map((h) => `${h.rule}:${h.text.toLowerCase()}`);

describe('sensoryHits in English', () => {
  it.each([
    ['Press the green button to continue.', 'colour:the green button'],
    ['Click the red link below.', 'colour:the red link'],
    ['Fields marked in red are required.', 'colour:marked in red'],
    ['Blue means the form is saved.', 'colour:blue means'],
    ['Use the round icon to go back.', 'shape:the round icon'],
    ['Tap the square button to start.', 'shape:the square button'],
    ['Use the menu on the left to find help.', 'position:menu on the left'],
    ['Open the left-hand menu to find help.', 'position:the left-hand menu'],
    ['Pick the button above to start.', 'position:the button above'],
    ['Press the large button to start.', 'size:the large button'],
    ['Wait until you hear the beep to speak.', 'sound:until you hear the beep'],
    ['When you hear a chime, press start.', 'sound:when you hear a chime'],
    ['The beep means the call has ended.', 'sound:beep means'],
  ])('finds the phrase in "%s"', (text, expected) => {
    expect(hits(text)).toContain(expected);
  });
  it.each([
    'Press the Save button to continue.',
    'Fields marked with an asterisk are required.',
    'The page has a menu with help links.',
    'We use a soft grey tone for the background of the page.',
    'Your answers are saved when you press Continue.',
    'Use the search box near the top of the page.',
  ])('finds nothing in "%s"', (text) => {
    expect(hits(text)).toEqual([]);
  });
  it('skips a sentence that also names the control in quotation marks', () => {
    expect(hits('Press the green button labelled “Continue” to go on.')).toEqual([]);
    expect(hits('Press the green button labelled "Continue" to go on.')).toEqual([]);
  });
  it('still reads the other sentences of the same block', () => {
    expect(hits('Press the green button “Next”. Then use the menu on the left.')).toEqual(['position:menu on the left']);
  });
  it('reports each rule once per block', () => {
    expect(hits('Press the red button. Then press the green button. Then the blue link.')).toEqual(['colour:the red button']);
  });
  it('ignores case and a non-breaking space in a phrase', () => {
    expect(hits('Press THE\u00A0GREEN\u00A0BUTTON now.')).toEqual(['colour:the\u00A0green\u00A0button']);
  });
  it('does not match inside a longer word', () => {
    expect(hits('The shredded blueberry bar is on the menu.')).toEqual([]);
  });
});

describe('sensoryHits in French', () => {
  it.each([
    ['Appuyez sur le bouton vert pour continuer.', 'colour:le bouton vert'],
    ['Cliquez sur le lien rouge ci-dessous.', 'colour:le lien rouge'],
    ['Les champs marqués en rouge sont obligatoires.', 'colour:marqués en rouge'],
    ['Le bleu signifie que le formulaire est enregistré.', 'colour:bleu signifie'],
    ['Appuyez sur la case ronde pour revenir.', 'shape:la case ronde'],
    ['Utilisez le menu à droite pour trouver de l’aide.', 'position:menu à droite'],
    ['Utilisez le bouton ci-dessus pour commencer.', 'position:le bouton ci-dessus'],
    ['Appuyez sur le grand bouton pour commencer.', 'size:le grand bouton'],
    ['Quand vous entendez un bip, appuyez sur démarrer.', 'sound:quand vous entendez un bip'],
    ['Le bip signifie que l’appel est terminé.', 'sound:le bip signifie'],
  ])('finds the phrase in "%s"', (text, expected) => {
    expect(hits(text, 'fr')).toContain(expected);
  });
  it.each([
    'Appuyez sur le bouton Continuer pour poursuivre.',
    'Les champs marqués d’un astérisque sont obligatoires.',
    'La page comporte un menu et des liens d’aide.',
  ])('finds nothing in "%s"', (text) => {
    expect(hits(text, 'fr')).toEqual([]);
  });
  it('skips a sentence that names the control in French quotation marks', () => {
    expect(hits('Appuyez sur le bouton vert «\u202FContinuer\u202F» pour poursuivre.', 'fr')).toEqual([]);
  });
});

describe('PATTERNS', () => {
  it('has at least one pattern for every rule in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const rule of SENSORY_RULES) expect(PATTERNS[lang].some((p) => p.rule === rule), `${lang} ${rule}`).toBe(true);
    }
  });
});

describe('auditSensory', () => {
  it('finds nothing in plain instructions', () => {
    const r = auditSensory(facts(['Press the Save button when you have checked your answers.']));
    expect(r.checked).toBe(1);
    expect(r.entries).toEqual([]);
  });
  it('flags a colour instruction as unknown with both languages', () => {
    const [e] = auditSensory(facts(['Press the green button when you have checked your answers.'])).entries;
    expect(e).toMatchObject({ check: 'sensory', id: 'p[0]', status: 'unknown', rule: 'colour' });
    expect(e?.message.en).toContain('points at a colour');
    expect(e?.message.fr).toContain('renvoie à une couleur');
  });
  it('flags a sound instruction and asks for a visible message too', () => {
    const [e] = auditSensory(facts(['Wait until you hear the beep before you start speaking please.'])).entries;
    expect(e?.rule).toBe('sound');
    expect(e?.message.en).toContain('a visible message as well');
  });
  it('uses the language of the block and skips other languages and short blocks', () => {
    const f: ProseFacts = {
      ...EMPTY_PROSE,
      pageLang: 'en',
      blocks: [
        { id: 'p[0]', lang: 'fr', own: true, text: 'Appuyez sur le bouton vert quand vous avez terminé votre demande.' },
        { id: 'p[1]', lang: 'de', own: true, text: 'Drücken Sie den grünen Knopf wenn Sie fertig sind mit allem.' },
        { id: 'p[2]', lang: '', own: false, text: 'Press the green button.' },
      ],
    };
    const r = auditSensory(f);
    expect(r.checked).toBe(1);
    expect(r.entries.map((e) => e.id)).toEqual(['p[0]']);
  });
  it('writes clean French for every rule', () => {
    const texts = [
      'Press the green button when you are done with the form today.',
      'Use the round icon when you are done with the form today.',
      'Use the menu on the left when you are done with the form today.',
      'Press the large button when you are done with the form today.',
      'Wait until you hear the beep when you are done with the form today.',
    ];
    const es = auditSensory(facts(texts)).entries;
    expect(es.map((e) => e.rule)).toEqual(['colour', 'shape', 'position', 'size', 'sound']);
    noFrIssues(es);
  });
});
