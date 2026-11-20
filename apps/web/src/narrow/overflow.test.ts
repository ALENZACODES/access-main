import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { frTypographyIssues } from './i18n.js';
import { factsOf, originOf, regionOf } from './overflow-testkit.js';
import { CAUSE_KINDS, CAUSE_LABELS, auditOverflow, causeOf, causeSentence, causesOf, describeCauses, regionKind, regionSentence, withOverflow, type Cause, type CauseKind } from './overflow.js';
import { NBSP } from './types.js';


/** One origin for each kind of cause. */
const SAMPLES: Readonly<Record<CauseKind, ReturnType<typeof originOf>>> = {
  'long-word': originOf({ id: 'p#link[0]', tag: 'p', text: true, word: 'https://example.org/a/very/long/address…', wordChars: 86, widthPx: 320, overPx: 323 }),
  nowrap: originOf({ id: 'p#line[0]', tag: 'p', text: true, whiteSpace: 'nowrap', widthPx: 320, overPx: 566 }),
  preformatted: originOf({ id: 'pre#code[0]', tag: 'pre', text: true, whiteSpace: 'pre', widthPx: 320, overPx: 410 }),
  table: originOf({ id: 'table#hours[0]', tag: 'table', display: 'table', tableLike: true, widthPx: 742, overPx: 422 }),
  media: originOf({ id: 'img#photo[0]', tag: 'img', display: 'inline', replaced: true, widthPx: 800, overPx: 480 }),
  'min-width': originOf({ id: 'div#panel[0]', minWidthPx: 500, widthPx: 500, overPx: 180 }),
  'grid-columns': originOf({ id: 'p[2]', tag: 'p', parentId: 'div#grid[0]', parentGridPx: 620, widthPx: 200, overPx: 300, shifted: true }),
  'flex-nowrap': originOf({ id: 'a[3]', tag: 'a', parentId: 'div#row[0]', parentFlexNoWrap: true, widthPx: 120, overPx: 160, shifted: true }),
  positioned: originOf({ id: 'div#badge[0]', position: 'absolute', widthPx: 100, overPx: 80, shifted: true }),
  offset: originOf({ id: 'div#pushed[0]', widthPx: 320, overPx: 200, shifted: true }),
  'fixed-width': originOf(),
  'wide-box': originOf({ id: 'span#chip[0]', tag: 'span', display: 'inline-block', widthPx: 400, overPx: 80 }),
};
const causeFor = (kind: CauseKind): Cause => {
  const [c] = causesOf([SAMPLES[kind]]);
  if (!c) throw new Error(kind);
  return c;
};

describe('causeOf', () => {
  it('names the cause of each sample', () => {
    for (const kind of CAUSE_KINDS) expect(causeOf(SAMPLES[kind]), kind).toBe(kind);
  });

  it('has a sample for every kind, and no kind twice', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...CAUSE_KINDS].sort());
    expect(new Set(CAUSE_KINDS).size).toBe(CAUSE_KINDS.length);
  });

  it('calls a box that fills its space and is wider than it a fixed width', () => {
    for (const display of ['block', 'list-item', 'flow-root', 'flex', 'grid']) expect(causeOf(originOf({ display })), display).toBe('fixed-width');
  });

  it('calls a box that takes the width of its content a wide box', () => {
    for (const display of ['inline-block', 'inline-flex', 'inline-grid', 'table-cell']) expect(causeOf(originOf({ display })), display).toBe('wide-box');
    expect(causeOf(originOf({ floated: true }))).toBe('wide-box');
    expect(causeOf(originOf({ position: 'absolute' }))).toBe('wide-box');
    expect(causeOf(originOf({ position: 'fixed' }))).toBe('wide-box');
  });

  it('prefers a min-width that is larger than the space over a fixed width', () => {
    expect(causeOf(originOf({ minWidthPx: 321 }))).toBe('min-width');
    expect(causeOf(originOf({ minWidthPx: 320 }))).toBe('fixed-width');
    expect(causeOf(originOf({ minWidthPx: 100 }))).toBe('fixed-width');
  });

  it('reads text causes from white-space and the tag', () => {
    expect(causeOf(originOf({ text: true }))).toBe('long-word');
    expect(causeOf(originOf({ text: true, whiteSpace: 'nowrap' }))).toBe('nowrap');
    expect(causeOf(originOf({ text: true, whiteSpace: 'pre' }))).toBe('preformatted');
    expect(causeOf(originOf({ text: true, tag: 'pre', whiteSpace: 'pre-wrap' }))).toBe('preformatted');
    expect(causeOf(originOf({ text: true, whiteSpace: 'pre-wrap' }))).toBe('long-word');
    expect(causeOf(originOf({ text: true, whiteSpace: 'pre-line' }))).toBe('long-word');
  });

  it('puts a table and media before any width', () => {
    expect(causeOf(originOf({ tableLike: true, minWidthPx: 900, parentFlexNoWrap: true }))).toBe('table');
    expect(causeOf(originOf({ replaced: true, minWidthPx: 900, shifted: true }))).toBe('media');
  });

  it('blames the row for an item in the flow, and the position for one taken out of it', () => {
    expect(causeOf(originOf({ parentFlexNoWrap: true }))).toBe('flex-nowrap');
    expect(causeOf(originOf({ parentFlexNoWrap: true, shifted: true }))).toBe('flex-nowrap');
    expect(causeOf(originOf({ parentFlexNoWrap: true, shifted: true, position: 'absolute' }))).toBe('positioned');
    expect(causeOf(originOf({ parentFlexNoWrap: true, position: 'absolute' }))).toBe('wide-box');
  });

  it('blames the grid only when its columns add up to more than the space', () => {
    expect(causeOf(originOf({ parentGridPx: 321 }))).toBe('grid-columns');
    expect(causeOf(originOf({ parentGridPx: 320 }))).toBe('fixed-width');
    expect(causeOf(originOf({ parentGridPx: null, shifted: true }))).toBe('offset');
  });

  it('tells a positioned box from one pushed by a margin or an offset', () => {
    expect(causeOf(originOf({ shifted: true, position: 'absolute' }))).toBe('positioned');
    expect(causeOf(originOf({ shifted: true, position: 'fixed' }))).toBe('positioned');
    expect(causeOf(originOf({ shifted: true, position: 'relative' }))).toBe('offset');
    expect(causeOf(originOf({ shifted: true, position: 'sticky' }))).toBe('offset');
  });

  it('calls a pre that is itself too wide preformatted, and an inline block that may not wrap nowrap', () => {
    expect(causeOf(originOf({ tag: 'pre' }))).toBe('preformatted');
    expect(causeOf(originOf({ display: 'inline-block', whiteSpace: 'nowrap' }))).toBe('nowrap');
    expect(causeOf(originOf({ display: 'block', whiteSpace: 'nowrap' }))).toBe('fixed-width');
  });
});

describe('causesOf', () => {
  it('gives one cause per origin, about the origin, in order', () => {
    const causes = causesOf([SAMPLES['fixed-width'], SAMPLES.nowrap, SAMPLES.media]);
    expect(causes.map((c) => [c.kind, c.id, c.siblings])).toEqual([
      ['fixed-width', 'div#card[0]', 0],
      ['nowrap', 'p#line[0]', 0],
      ['media', 'img#photo[0]', 0],
    ]);
  });

  it('makes one cause of the items of a row that stick out, about the row, with the furthest reach', () => {
    const items = [
      originOf({ id: 'a[2]', parentId: 'div#row[0]', parentFlexNoWrap: true, overPx: 40, shifted: true }),
      originOf({ id: 'a[3]', parentId: 'div#row[0]', parentFlexNoWrap: true, overPx: 160, shifted: true }),
      originOf({ id: 'a[4]', parentId: 'div#row[0]', parentFlexNoWrap: true, overPx: 100, shifted: true }),
    ];
    const causes = causesOf(items);
    expect(causes).toHaveLength(1);
    expect(causes[0]).toMatchObject({ kind: 'flex-nowrap', id: 'div#row[0]', siblings: 2 });
    expect(causes[0]?.origin.id).toBe('a[3]');
  });

  it('keeps two rows apart, and a row apart from a grid', () => {
    const causes = causesOf([
      originOf({ id: 'a[1]', parentId: 'div#one[0]', parentFlexNoWrap: true }),
      originOf({ id: 'a[5]', parentId: 'div#two[1]', parentFlexNoWrap: true }),
      originOf({ id: 'p[2]', parentId: 'div#one[0]', parentGridPx: 620 }),
      originOf({ id: 'a[2]', parentId: 'div#one[0]', parentFlexNoWrap: true }),
    ]);
    expect(causes.map((c) => `${c.kind} ${c.id} ${c.siblings}`)).toEqual(['flex-nowrap div#one[0] 1', 'flex-nowrap div#two[1] 0', 'grid-columns div#one[0] 0']);
  });

  it('keeps the place of a group where its first item was', () => {
    const causes = causesOf([SAMPLES['flex-nowrap'], SAMPLES['fixed-width'], { ...SAMPLES['flex-nowrap'], id: 'a[4]' }]);
    expect(causes.map((c) => c.kind)).toEqual(['flex-nowrap', 'fixed-width']);
  });

  it('is about the item itself when the parent has no id to name', () => {
    const [cause] = causesOf([originOf({ id: 'a[0]', parentId: '', parentFlexNoWrap: true })]);
    expect(cause).toMatchObject({ kind: 'flex-nowrap', id: 'a[0]' });
  });

  it('is empty for no origin', () => {
    expect(causesOf([])).toEqual([]);
  });
});

describe('causeSentence', () => {
  it('gives the numbers that were measured', () => {
    expect(causeSentence(causeFor('fixed-width'), 'en')).toBe('This element is 600px wide in a space of 320px, so a width has been set on it. Replace it with max-width: 100%, or with a width in percent.');
    expect(causeSentence(causeFor('media'), 'en')).toBe('This img is 800px wide in a space of 320px. Add max-width: 100% and height: auto so it shrinks with the page.');
    expect(causeSentence(causeFor('min-width'), 'en')).toBe('The min-width of this element (500px) is more than the 320px of space it has. Lower it or take it out at this width.');
    expect(causeSentence(causeFor('grid-columns'), 'en')).toContain('The columns of this grid add up to 620px in a space of 320px.');
    expect(causeSentence(causeFor('positioned'), 'en')).toBe('This element is positioned (position: absolute) 80px past the edge of the page. Keep it inside the page at this width.');
    expect(causeSentence(causeFor('offset'), 'en')).toContain('pushes it 200px past the edge of the page');
    expect(causeSentence(causeFor('wide-box'), 'en')).toContain('400px wide in a space of 320px and reaches 80px past the edge');
    expect(causeSentence(causeFor('nowrap'), 'en')).toBe('This text may not wrap (white-space: nowrap) and runs 566px past the edge of the page. Let it wrap at this width.');
    expect(causeSentence(causeFor('preformatted'), 'en')).toContain('runs 410px past the edge of the page');
  });

  it('quotes the word that cannot break, with its length', () => {
    expect(causeSentence(causeFor('long-word'), 'en')).toBe(
      'A word with no place to break (“https://example.org/a/very/long/address…”, 86 characters) runs 323px past the edge of the page. Add overflow-wrap: anywhere to the block so the word can break.',
    );
    expect(causeSentence(causeFor('long-word'), 'fr')).toContain('(«\u202Fhttps://example.org/a/very/long/address…\u202F», 86 caractères)');
  });

  it('says how many items of a row stick out', () => {
    const one = causeFor('flex-nowrap');
    expect(causeSentence(one, 'en')).toContain('one of them reaches past the edge of the page, by up to 160px');
    expect(causeSentence({ ...one, siblings: 2 }, 'en')).toContain('3 of them reach past the edge of the page, by up to 160px');
    expect(causeSentence(one, 'fr')).toContain('l’un d’eux dépasse le bord de la page, jusqu’à 160');
    expect(causeSentence({ ...one, siblings: 2 }, 'fr')).toContain('3 d’entre eux dépassent le bord de la page');
  });

  it('leaves a wide table to a person', () => {
    const s = causeSentence(causeFor('table'), 'en');
    expect(s).toContain('This table is 742px wide in a space of 320px');
    expect(s).toContain('A person has to decide.');
    expect(causeSentence(causeFor('table'), 'fr')).toContain('Une personne doit en décider.');
  });

  it('says how to put each cause right, apart from the one a person decides', () => {
    const fix: Readonly<Record<CauseKind, RegExp>> = {
      'long-word': /overflow-wrap: anywhere/,
      nowrap: /Let it wrap/,
      preformatted: /overflow-x: auto.*pre-wrap/,
      table: /region of its own/,
      media: /max-width: 100% and height: auto/,
      'min-width': /Lower it or take it out/,
      'grid-columns': /minmax\(0, 1fr\)/,
      'flex-nowrap': /flex-wrap: wrap.*min-width: 0/,
      positioned: /Keep it inside the page/,
      offset: /margin, an offset or a transform/,
      'fixed-width': /max-width: 100%/,
      'wide-box': /does not shrink or wrap/,
    };
    for (const kind of CAUSE_KINDS) expect(causeSentence(causeFor(kind), 'en'), kind).toMatch(fix[kind]);
  });

  it('keeps CSS as it is written in both languages', () => {
    for (const [kind, css] of [['long-word', 'overflow-wrap: anywhere'], ['nowrap', 'white-space: nowrap'], ['media', 'max-width: 100%'], ['grid-columns', 'minmax(0, 1fr)'], ['flex-nowrap', 'flex-wrap: wrap'], ['preformatted', 'white-space: pre-wrap']] as const) {
      expect(causeSentence(causeFor(kind), 'en'), kind).toContain(css);
      // The same declaration, with no space after its colon: see cssInFrench.
      expect(causeSentence(causeFor(kind), 'fr'), kind).toContain(css.replace(': ', ':'));
    }
  });

  it('writes pixels with a no-break space in French', () => {
    expect(causeSentence(causeFor('fixed-width'), 'fr')).toBe(
      `Cet élément fait 600${NBSP}px de large dans un espace de 320${NBSP}px, donc une largeur lui a été fixée. Remplacez-la par max-width:100%, ou par une largeur en pourcentage.`,
    );
  });

  it('is different in French, and ends with a full stop in both languages', () => {
    for (const kind of CAUSE_KINDS) {
      const en = causeSentence(causeFor(kind), 'en');
      const fr = causeSentence(causeFor(kind), 'fr');
      expect(fr, kind).not.toBe(en);
      expect(en.endsWith('.'), kind).toBe(true);
      expect(fr.endsWith('.'), kind).toBe(true);
    }
  });

  it('never words a cause as a certainty about what the author wrote, beyond what follows from the numbers', () => {
    for (const kind of CAUSE_KINDS) expect(causeSentence(causeFor(kind), 'en'), kind).not.toMatch(/\b(you wrote|your stylesheet|definitely|certainly|always)\b/i);
  });
});

describe('regions', () => {
  it('fails a region whose running text is too wide, and leaves the others to a person', () => {
    expect(regionKind(regionOf({ textBlock: true }))).toBe('region-text');
    expect(regionKind(regionOf({ textBlock: true, table: true }))).toBe('region-text');
    expect(regionKind(regionOf({ table: true }))).toBe('region-content');
    expect(regionKind(regionOf())).toBe('region-content');
  });

  it('says what the region holds and what was measured', () => {
    expect(regionSentence(regionOf({ table: true }), 'en')).toBe(
      'This region scrolls sideways at this width (600px of content in 320px). It holds a table. Content that needs both directions may scroll like this, and a person has to decide whether this does.',
    );
    expect(regionSentence(regionOf({ table: true, pre: true, media: true }), 'en')).toContain('It holds a table and code or preformatted text and an image or embedded content.');
    expect(regionSentence(regionOf(), 'en')).toContain('What it holds was not recognised.');
    expect(regionSentence(regionOf({ pre: true }), 'fr')).toContain('Elle contient du code ou du texte préformaté.');
    expect(regionSentence(regionOf(), 'fr')).toContain('Ce qu’elle contient n’a pas été reconnu.');
  });

  it('adds a note about the keyboard only when nothing in the region takes focus', () => {
    expect(regionSentence(regionOf({ table: true, keyboard: false }), 'en')).toContain('Nothing in the region takes keyboard focus, so also check that it can be scrolled with the keyboard.');
    expect(regionSentence(regionOf({ table: true, keyboard: true }), 'en')).not.toContain('keyboard');
    expect(regionSentence(regionOf({ keyboard: false }), 'fr')).toContain('vérifiez aussi qu’elle peut défiler au clavier');
  });

  it('says that running text in a region takes scrolling in two directions', () => {
    expect(regionSentence(regionOf({ textBlock: true, contentPx: 700 }), 'en')).toBe(
      'This region scrolls sideways (700px of content in 320px) and holds running text that is wider than it. Reading it takes scrolling in two directions. Let the text wrap.',
    );
    expect(regionSentence(regionOf({ textBlock: true }), 'fr')).toContain('Laissez le texte passer à la ligne.');
  });

  it('follows French typography in every case', () => {
    for (const r of [regionOf(), regionOf({ table: true }), regionOf({ pre: true, media: true, keyboard: false }), regionOf({ textBlock: true })]) {
      expect(frTypographyIssues(regionSentence(r, 'fr')), regionSentence(r, 'fr')).toEqual([]);
    }
  });
});

describe('auditOverflow', () => {
  it('has no finding for a page that fits, and counts what was looked at', () => {
    expect(auditOverflow(factsOf())).toEqual({ checked: 40, entries: [] });
  });

  it('gives a failure per cause, under the reflow check, with a rule that names the cause', () => {
    const result = auditOverflow(factsOf({ origins: [SAMPLES['fixed-width'], SAMPLES['long-word'], SAMPLES.media] }));
    expect(result.entries.map((e) => [e.check, e.rule, e.id, e.status])).toEqual([
      ['reflow', 'cause-fixed-width', 'div#card[0]', 'fail'],
      ['reflow', 'cause-long-word', 'p#link[0]', 'fail'],
      ['reflow', 'cause-media', 'img#photo[0]', 'fail'],
    ]);
  });

  it('leaves a wide table as UNKNOWN', () => {
    const [entry] = auditOverflow(factsOf({ origins: [SAMPLES.table] })).entries;
    expect(entry).toMatchObject({ rule: 'cause-table', status: 'unknown', id: 'table#hours[0]' });
  });

  it('every other cause is a failure', () => {
    for (const kind of CAUSE_KINDS.filter((k) => k !== 'table')) {
      expect(auditOverflow(factsOf({ origins: [SAMPLES[kind]] })).entries[0]?.status, kind).toBe('fail');
    }
  });

  it('puts a row or a grid in the id, not the item', () => {
    const result = auditOverflow(factsOf({ origins: [SAMPLES['flex-nowrap'], SAMPLES['grid-columns']] }));
    expect(result.entries.map((e) => e.id)).toEqual(['div#row[0]', 'div#grid[0]']);
  });

  it('says how many origins were found and not listed', () => {
    const one = auditOverflow(factsOf({ origins: [SAMPLES['fixed-width']], originCount: 2 })).entries.at(-1);
    expect(one).toMatchObject({ rule: 'cause-more', status: 'unknown', id: 'page' });
    expect(one?.message.en).toBe('1 more element reaches past the edge of the page and is not listed. Put the causes above right and run the audit again.');
    const many = auditOverflow(factsOf({ origins: [SAMPLES['fixed-width']], originCount: 8 })).entries.at(-1);
    expect(many?.message.en).toContain('7 more elements reach past the edge of the page and are not listed.');
    expect(many?.message.fr).toContain('7 autres éléments dépassent le bord de la page');
  });

  it('says UNKNOWN when the page scrolls and no origin was found', () => {
    const [entry] = auditOverflow(factsOf({ pageScrolls: true })).entries;
    expect(entry).toMatchObject({ rule: 'cause-not-found', status: 'unknown', id: 'page' });
    expect(entry?.message.en).toBe('The page scrolls sideways and the element that causes it was not found. It may sit in a frame or in a shadow tree. A person has to look.');
    expect(auditOverflow(factsOf({ pageScrolls: true, truncated: true })).entries[0]?.message.en).toContain('was not found among the elements that were looked at');
  });

  it('does not say the cause was not found when the page does not scroll', () => {
    expect(auditOverflow(factsOf({ pageScrolls: false })).entries).toEqual([]);
  });

  it('reports a region with running text as a failure and any other region as UNKNOWN', () => {
    const result = auditOverflow(factsOf({ regions: [regionOf({ id: 'div#a[0]', textBlock: true }), regionOf({ id: 'div#b[1]', table: true })] }));
    expect(result.entries.map((e) => [e.rule, e.id, e.status])).toEqual([
      ['region-text', 'div#a[0]', 'fail'],
      ['region-content', 'div#b[1]', 'unknown'],
    ]);
  });

  it('says how many regions were found and not listed', () => {
    const last = auditOverflow(factsOf({ regions: [regionOf()], regionCount: 3 })).entries.at(-1);
    expect(last).toMatchObject({ rule: 'region-more', status: 'unknown' });
    expect(last?.message.en).toBe('2 more regions scroll sideways and are not listed.');
    expect(auditOverflow(factsOf({ regions: [regionOf()], regionCount: 2 })).entries.at(-1)?.message.en).toBe('1 more region scrolls sideways and is not listed.');
  });

  it('lists causes first, then regions', () => {
    const result = auditOverflow(factsOf({ origins: [SAMPLES.nowrap], originCount: 3, regions: [regionOf()], regionCount: 2 }));
    expect(result.entries.map((e) => e.rule)).toEqual(['cause-nowrap', 'cause-more', 'region-content', 'region-more']);
  });

  it('has both languages, different, with French typography, for every kind of finding', () => {
    const everything = factsOf({ origins: CAUSE_KINDS.map((k) => SAMPLES[k]), originCount: 20, regions: [regionOf({ textBlock: true }), regionOf({ pre: true, keyboard: false }), regionOf()], regionCount: 9 });
    const entries = [...auditOverflow(everything).entries, ...auditOverflow(factsOf({ pageScrolls: true, truncated: true })).entries, ...auditOverflow(factsOf({ origins: [SAMPLES.media], originCount: 2, regions: [regionOf()], regionCount: 2 })).entries];
    expect(new Set(entries.map((e) => e.rule)).size).toBe(CAUSE_KINDS.length + 5);
    noFrIssues(entries);
  });

  it('never words anything as a pass, and uses the token UNKNOWN nowhere in a failure', () => {
    const everything = factsOf({ origins: CAUSE_KINDS.map((k) => SAMPLES[k]), regions: [regionOf({ textBlock: true }), regionOf()] });
    for (const e of auditOverflow(everything).entries) {
      expect(e.message.en).not.toMatch(/\b(pass(es|ed)?|compliant|conforms?)\b/i);
      expect(e.message.fr).not.toMatch(/conforme|a réussi/i);
    }
  });
});

describe('withOverflow', () => {
  const reflow = { checked: 13, entries: [{ check: 'reflow' as const, id: 'page', status: 'fail' as const, message: { en: 'The page scrolls sideways at 320px wide.', fr: 'x' } }] };

  it('gives the reflow result back when there are no facts', () => {
    expect(withOverflow(reflow, undefined)).toBe(reflow);
  });

  it('adds the causes after the findings of the reflow check, and the counts together', () => {
    const out = withOverflow(reflow, factsOf({ origins: [SAMPLES['fixed-width']] }));
    expect(out.checked).toBe(53);
    expect(out.entries.map((e) => e.rule ?? 'page')).toEqual(['page', 'cause-fixed-width']);
    expect(out.entries[0]).toBe(reflow.entries[0]);
  });

  it('changes nothing but the count for a page that fits', () => {
    expect(withOverflow({ checked: 13, entries: [] }, factsOf())).toEqual({ checked: 53, entries: [] });
  });
});

describe('labels and summary', () => {
  it('has a short label for every cause in both languages', () => {
    for (const kind of CAUSE_KINDS) {
      expect(CAUSE_LABELS[kind].en, kind).not.toBe('');
      expect(CAUSE_LABELS[kind].fr, kind).not.toBe(CAUSE_LABELS[kind].en);
      expect(frTypographyIssues(CAUSE_LABELS[kind].fr), kind).toEqual([]);
    }
    expect(new Set(CAUSE_KINDS.map((k) => CAUSE_LABELS[k].en)).size).toBe(CAUSE_KINDS.length);
  });

  it('is empty for a page with no cause', () => {
    expect(describeCauses(factsOf(), 'en')).toBe('');
    expect(describeCauses(factsOf({ regions: [regionOf()] }), 'en')).toBe('');
  });

  it('counts the causes by kind, most frequent first, with the first element of each', () => {
    const facts = factsOf({ origins: [SAMPLES.media, SAMPLES['fixed-width'], { ...SAMPLES['fixed-width'], id: 'div#other[1]' }, SAMPLES.nowrap] });
    expect(describeCauses(facts, 'en')).toBe(
      ['Why the page scrolls sideways at 320px:', '  2 × A fixed width: div#card[0]', '  1 × Text that may not wrap: p#line[0]', '  1 × An image or embedded content that does not shrink: img#photo[0]', ''].join('\n'),
    );
  });

  it('is in French with French typography', () => {
    const text = describeCauses(factsOf({ origins: [SAMPLES.media, SAMPLES['flex-nowrap']] }), 'fr');
    expect(text.split('\n')[0]).toBe(`Pourquoi la page défile de côté à 320${NBSP}px${NBSP}:`);
    expect(text).toContain(`1 × Une rangée qui ne peut pas passer à la ligne${NBSP}: div#row[0]`);
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('shortens a very long id', () => {
    const text = describeCauses(factsOf({ origins: [originOf({ id: `div#${'x'.repeat(200)}[0]` })] }), 'en');
    expect((text.split('\n')[1] ?? '').length).toBeLessThan(100);
  });
});
