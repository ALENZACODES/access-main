import { describe, expect, it } from 'vitest';
import {
  abbreviationsIn,
  auditPlain,
  capsRun,
  explained,
  jargonIn,
  MAX_BLOCK_WORDS,
  MAX_SENTENCE,
  PLAIN_RULES,
  reading,
  sentencesOf,
  syllables,
  wordsOf,
} from './plain.js';
import { EMPTY_PROSE, type ProseFacts } from './prose.js';
import { noFrIssues } from './expect-fr.js';

const block = (text: string, lang = '', id = 'p[0]') => ({ id, lang, own: lang !== '', text });
const facts = (texts: string[], over: Partial<ProseFacts> = {}): ProseFacts => ({
  ...EMPTY_PROSE,
  pageLang: 'en',
  blocks: texts.map((x, i) => block(x, '', `p[${i}]`)),
  ...over,
});
const rules = (f: ProseFacts): string[] => auditPlain(f).entries.map((e) => `${e.rule}:${e.status}`);

/** A sentence of exactly n plain words, ending with a full stop. */
const sentence = (n: number, word = 'walk'): string => {
  const w = Array.from({ length: n }, () => word);
  return `${(w[0] ?? '').replace(/^./u, (c) => c.toUpperCase())} ${w.slice(1).join(' ')}.`;
};

describe('wordsOf and sentencesOf', () => {
  it('counts words with accents, apostrophes and hyphens as one word each', () => {
    expect(wordsOf('L’école d’été, c’est bien-être!')).toEqual(['L’école', 'd’été', 'c’est', 'bien-être']);
  });
  it('ignores numbers and punctuation', () => {
    expect(wordsOf('Call 416 555 0100 now.')).toEqual(['Call', 'now']);
  });
  it('splits sentences at a full stop, question mark or exclamation before a capital', () => {
    expect(sentencesOf('First one. Second one? Third one! fourth stays')).toEqual(['First one.', 'Second one?', 'Third one! fourth stays']);
  });
  it('does not split inside a number or an abbreviation followed by lower case', () => {
    expect(sentencesOf('It costs 3.50 today, e.g. for a ramp.')).toEqual(['It costs 3.50 today, e.g. for a ramp.']);
  });
  it('splits at a line break and drops lines with no words', () => {
    expect(sentencesOf('One line\n\n12345\nTwo line')).toEqual(['One line', 'Two line']);
  });
  it('splits before an opening French quotation mark', () => {
    expect(sentencesOf('Il a dit non. «\u202FPeut-être\u202F» a-t-elle répondu.')).toHaveLength(2);
  });
});

describe('syllables', () => {
  it.each([
    ['cat', 'en', 1],
    ['table', 'en', 2],
    ['make', 'en', 1],
    ['accessible', 'en', 4],
    ['walked', 'en', 1],
    ['wanted', 'en', 2],
    ['the', 'en', 1],
    ['rhythm', 'en', 1],
  ] as const)('%s (%s) has %i syllables', (w, lang, n) => {
    expect(syllables(w, lang)).toBe(n);
  });
  it.each([
    ['chat', 1],
    ['maison', 2],
    ['accessible', 3],
    ['école', 2],
    ['fauteuil', 2],
    ['rampe', 1],
  ] as const)('%s (fr) has %i syllables', (w, n) => {
    expect(syllables(w, 'fr')).toBe(n);
  });
  it('is zero for an empty word and at least one for any word', () => {
    expect(syllables('', 'en')).toBe(0);
    expect(syllables('brr', 'en')).toBe(1);
    expect(syllables('’', 'fr')).toBe(0);
  });
});

describe('reading', () => {
  it('is null when there are no words', () => {
    expect(reading('12345 !!!', 'en')).toBeNull();
    expect(reading('', 'fr')).toBeNull();
  });
  it('gives a low grade for short plain sentences', () => {
    const r = reading('The ramp is on the left. The door is wide. Push the door to go in.', 'en');
    expect(r?.sentences).toBe(3);
    expect(r?.score).toBeLessThan(3);
  });
  it('gives a high grade for long Latinate sentences', () => {
    const r = reading(
      'Notwithstanding administrative considerations, comprehensive accessibility accommodations necessitate multidisciplinary consultation regarding infrastructural modifications and organizational responsibilities.',
      'en',
    );
    expect(r?.score).toBeGreaterThan(20);
  });
  it('gives a high ease score to short French sentences and a low one to long ones', () => {
    const easy = reading('La porte est large. Poussez la porte. Entrez.', 'fr');
    const hard = reading(
      'Conformément aux dispositions réglementaires applicables, l’établissement concerné doit obligatoirement procéder à l’aménagement des infrastructures préalablement à l’ouverture.',
      'fr',
    );
    expect(easy?.score).toBeGreaterThan(70);
    expect(hard?.score).toBeLessThan(10);
  });
  it('rounds the score to one decimal', () => {
    const r = reading('One two three four five six seven.', 'en');
    expect(Math.round((r?.score ?? 0) * 10) / 10).toBe(r?.score);
  });
});

describe('jargonIn', () => {
  it('finds a word and gives the plain one', () => {
    expect(jargonIn('Please utilize the side door.', 'en')).toEqual([{ term: 'utilize', plain: 'use' }]);
  });
  it('matches a phrase and ignores case', () => {
    expect(jargonIn('In Order To enter, ring the bell.', 'en')).toEqual([{ term: 'in order to', plain: 'to' }]);
  });
  it('does not match inside a longer word', () => {
    expect(jargonIn('The terminal is open. Purchasers wait.', 'en')).toEqual([]);
  });
  it('finds French jargon with an apostrophe in either form', () => {
    expect(jargonIn('À l’heure actuelle, nous devons effectuer le suivi.', 'fr').map((j) => j.term)).toEqual(['à l’heure actuelle', 'effectuer']);
    expect(jargonIn("À l'heure actuelle, rien.", 'fr')).toHaveLength(1);
  });
  it('lists each term once, in the order of the list', () => {
    expect(jargonIn('Utilize it, then utilise it, and commence.', 'en').map((j) => j.term)).toEqual(['utilize', 'utilise', 'commence']);
  });
});

describe('abbreviationsIn and explained', () => {
  it('finds capital words of two to six letters, once each', () => {
    expect(abbreviationsIn('The OT and the PT meet. Ask the OT.')).toEqual(['OT', 'PT']);
  });
  it('ignores single capitals, long capital words and mixed words', () => {
    expect(abbreviationsIn('A I SUPERLONG Ontario iPhone')).toEqual([]);
  });
  it('does not take part of an alphanumeric code', () => {
    expect(abbreviationsIn('Form T2201 and ODSP2')).toEqual([]);
  });
  it('finds accented capitals', () => {
    expect(abbreviationsIn('Le CÉGEP est ouvert.')).toEqual(['CÉGEP']);
  });
  it.each([
    ['Occupational therapy (OT) helps', 'OT'],
    ['OT (occupational therapy) helps', 'OT'],
    ['OT: occupational therapy helps', 'OT'],
    ['OT - occupational therapy helps', 'OT'],
    ['occupational therapy - OT helps', 'OT'],
  ])('sees "%s" as explained', (text, a) => {
    expect(explained(text, a)).toBe(true);
  });
  it('does not see a bare use as explained', () => {
    expect(explained('Ask your OT about it.', 'OT')).toBe(false);
  });
  it('escapes characters that mean something in a pattern', () => {
    expect(explained('Ask the A+B team', 'A+B')).toBe(false);
  });
});

describe('capsRun', () => {
  it('finds the longest run of capital words', () => {
    expect(capsRun('Please DO NOT ENTER THIS ROOM at night')).toEqual({ length: 5, sample: 'DO NOT ENTER THIS ROOM' });
  });
  it('is zero when there is none', () => {
    expect(capsRun('A plain sentence.').length).toBe(0);
  });
  it('does not count single capital letters', () => {
    expect(capsRun('A B C D E F').length).toBe(0);
  });
  it('breaks the run at a lower case word', () => {
    expect(capsRun('STOP now STOP now').length).toBe(1);
  });
});

describe('auditPlain', () => {
  it('has a message in both languages for every rule', () => {
    expect([...PLAIN_RULES].sort()).toEqual(['abbreviation', 'all-caps', 'dense-block', 'hard-to-read', 'jargon', 'long-sentence']);
  });
  it('finds nothing in short plain text', () => {
    const f = facts(['The ramp is on the left side of the main door.']);
    const r = auditPlain(f);
    expect(r.entries).toEqual([]);
    expect(r.checked).toBe(1);
  });
  it('skips blocks that are too short to judge, and other languages', () => {
    const r = auditPlain(facts(['Too short here.', 'Dies ist ein langer deutscher Satz über die Rampe am Haupteingang.'], { pageLang: 'de' }));
    expect(r.checked).toBe(0);
    expect(r.entries).toEqual([]);
  });
  it('asks about a sentence over the English limit but not at the limit', () => {
    expect(rules(facts([sentence(MAX_SENTENCE.en)]))).toEqual([]);
    expect(rules(facts([sentence(MAX_SENTENCE.en + 1)]))).toEqual(['long-sentence:unknown']);
  });
  it('uses a higher sentence limit for French', () => {
    const fr = (n: number): string => sentence(n, 'marche');
    expect(rules(facts([fr(MAX_SENTENCE.fr)], { pageLang: 'fr' }))).toEqual([]);
    expect(rules(facts([fr(MAX_SENTENCE.fr + 1)], { pageLang: 'fr' }))).toEqual(['long-sentence:unknown']);
  });
  it('reports the length and a clipped copy of the sentence', () => {
    const e = auditPlain(facts([sentence(40)])).entries[0];
    expect(e?.message.en).toContain('40 words');
    expect(e?.message.fr).toContain('40 mots');
  });
  it('asks about a block over the word limit, and says so only once for that block', () => {
    const text = Array.from({ length: 13 }, () => sentence(10, 'go')).join(' ');
    const es = auditPlain(facts([text])).entries.filter((e) => e.rule === 'dense-block');
    expect(es).toHaveLength(1);
    expect(es[0]?.message.en).toContain('130 words');
    expect(MAX_BLOCK_WORDS).toBe(120);
  });
  it('does not call a block of exactly the limit dense', () => {
    const text = Array.from({ length: 12 }, () => sentence(10, 'go')).join(' ');
    expect(rules(facts([text]))).toEqual([]);
  });
  it('scores reading level only for blocks of 40 words or more', () => {
    const hard = 'Notwithstanding administrative considerations, comprehensive accessibility accommodations necessitate multidisciplinary consultation.';
    expect(rules(facts([hard]))).toEqual([]);
    const long = Array.from({ length: 5 }, () => hard).join(' ');
    expect(rules(facts([long]))).toEqual(['hard-to-read:unknown']);
  });
  it('flags hard French text by ease score', () => {
    const hard =
      'Conformément aux dispositions réglementaires applicables, l’établissement concerné doit obligatoirement procéder à l’aménagement des infrastructures préalablement à l’ouverture. ';
    const es = auditPlain(facts([hard.repeat(3)], { pageLang: 'fr' })).entries.filter((e) => e.rule === 'hard-to-read');
    expect(es).toHaveLength(1);
    expect(es[0]?.message.fr).toContain('Kandel');
  });
  it('flags a run of capital words', () => {
    expect(rules(facts(['Please DO NOT ENTER THIS ROOM when it is closed.']))).toContain('all-caps:unknown');
  });
  it('does not flag three capital words in a row', () => {
    expect(rules(facts(['Please DO NOT enter this room when it is closed.']))).toEqual([]);
  });
  it('flags an abbreviation that is not explained and skips common ones', () => {
    expect(rules(facts(['Ask your OT about the grab bars in the bathroom.']))).toEqual(['abbreviation:unknown']);
    expect(rules(facts(['Send the PDF to the office with your ID and photo.']))).toEqual([]);
  });
  it('skips an abbreviation explained in the text or by an abbr element', () => {
    expect(rules(facts(['Ask your occupational therapist (OT) about the grab bars here.']))).toEqual([]);
    expect(rules(facts(['Ask your OT about the grab bars in the bathroom.'], { abbrs: ['ot'] }))).toEqual([]);
  });
  it('asks about an abbreviation once for the page', () => {
    const f = facts(['Ask your OT about the grab bars in the bathroom.', 'Your OT can also check the bed height and the chair.']);
    expect(rules(f)).toEqual(['abbreviation:unknown']);
  });
  it('lists up to three abbreviations and counts them all', () => {
    const e = auditPlain(facts(['Ask the OT, the PT, the SLP and the RN about the rails.'])).entries[0];
    expect(e?.message.en).toContain('abbreviations');
    expect(e?.message.en).toContain('OT, PT, SLP');
    expect(e?.message.en).not.toContain('RN');
  });
  it('uses the singular for one abbreviation', () => {
    const e = auditPlain(facts(['Ask your OT about the grab bars in the bathroom.'])).entries[0];
    expect(e?.message.en).toContain('an abbreviation that is not');
    expect(e?.message.fr).toContain('une abréviation non expliquée');
  });
  it('flags jargon and offers the plain word', () => {
    const e = auditPlain(facts(['Please utilize the side door in order to enter the building.'])).entries[0];
    expect(e?.rule).toBe('jargon');
    expect(e?.message.en).toContain('“utilize” → “use”');
    expect(e?.message.fr).toContain('«\u202Futilize\u202F» → «\u202Fuse\u202F»');
  });
  it('uses the language of the block, not the page', () => {
    const f: ProseFacts = { ...EMPTY_PROSE, pageLang: 'en', blocks: [block('Veuillez effectuer la demande afin de recevoir votre aide à temps.', 'fr-CA')] };
    expect(rules(f)).toEqual(['jargon:unknown']);
  });
  it('gives every entry the plain check, an unknown status and a block id', () => {
    const f = facts(['Please DO NOT ENTER THIS ROOM when utilize applies.', sentence(40)]);
    for (const e of auditPlain(f).entries) {
      expect(e.check).toBe('plain');
      expect(e.status).toBe('unknown');
      expect(e.id).toMatch(/^p\[\d\]$/);
    }
  });
  it('writes French that follows the typography rules, for every rule', () => {
    const text =
      'Please DO NOT ENTER THIS ROOM, ask your OT, and utilize the door. ' +
      Array.from({ length: 11 }, () => sentence(11, 'walk')).join(' ');
    const es = auditPlain(facts([text, text.replace('DO NOT', 'DO NOT')])).entries;
    expect(new Set(es.map((e) => e.rule))).toEqual(new Set(['all-caps', 'abbreviation', 'jargon', 'dense-block']));
    noFrIssues(es);
    const hard = Array.from({ length: 5 }, () => 'Notwithstanding administrative considerations, comprehensive accessibility accommodations necessitate multidisciplinary consultation.').join(' ');
    noFrIssues([...auditPlain(facts([hard + ' ' + sentence(40)])).entries]);
    const frHard =
      'Conformément aux dispositions réglementaires applicables, l’établissement concerné doit obligatoirement procéder à l’aménagement des infrastructures préalablement à l’ouverture. '.repeat(3);
    noFrIssues(auditPlain(facts([frHard], { pageLang: 'fr' })).entries);
  });
});
