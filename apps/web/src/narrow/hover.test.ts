import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { REVEAL_PROPS, focusTwins, normalSelector, revealsWith, splitSelectors, withoutHover, type HoverFacts, type HoverRule } from './hover-inpage.js';
import { HOVER_STATUSES, buildHover, hoverAdvice, hoverFindingText, hoverNote, hoverStatusOf, hoverSummary, hoverUnreachable } from './hover.js';
import { NBSP, NNBSP } from './types.js';

const rule = (selector: string, extra: Partial<HoverRule> = {}): HoverRule => ({ selector, reveals: ['display'], twin: false, hiddenNow: 0, controlsHidden: 0, controlNames: [], ...extra });
const FACTS: HoverFacts = {
  rules: [
    rule('.card:hover .tip', { hiddenNow: 3 }),
    rule('nav li:hover > ul', { hiddenNow: 2, controlsHidden: 2, controlNames: ['Bus', 'Train'] }),
    rule('a:hover', { reveals: ['transform'] }),
    rule('.menu:hover .sub', { twin: true, hiddenNow: 1 }),
  ],
  sheetsRead: 3,
  sheetsUnread: 1,
  deviceHover: false,
  truncated: false,
};

describe('the selector helpers', () => {
  it('splits a selector list at top-level commas only', () => {
    expect(splitSelectors('a:hover .x, b:is(.c, .d):hover>ul ,  e')).toEqual(['a:hover .x', 'b:is(.c, .d):hover>ul', 'e']);
    expect(splitSelectors('')).toEqual([]);
  });

  it('makes selectors comparable without changing what they reach', () => {
    expect(normalSelector('nav :hover  >  ul')).toBe('nav *:hover>ul');
    expect(normalSelector('nav *:hover>ul')).toBe('nav *:hover>ul');
    expect(normalSelector('a > b ~ c + d')).toBe('a>b~c+d');
    expect(normalSelector(':focus-within')).toBe('*:focus-within');
  });

  it('takes :hover out so the selector reaches the elements whether hovered or not', () => {
    expect(withoutHover('.menu:hover .sub')).toBe('.menu .sub');
    expect(withoutHover('nav :hover > ul')).toBe('nav *>ul');
    expect(withoutHover(':hover')).toBe('*');
  });

  it('gives the focus selectors that would match a hover selector', () => {
    expect(focusTwins('.menu:hover .sub')).toEqual(['.menu:focus .sub', '.menu:focus-within .sub', '.menu:focus-visible .sub']);
    expect(focusTwins('li :hover>ul')[1]).toBe(normalSelector('li :focus-within > ul'));
  });

  it('knows which declarations can show something', () => {
    expect(REVEAL_PROPS).toContain('display');
    for (const [p, v] of [
      ['display', 'block'],
      ['visibility', 'visible'],
      ['opacity', '0.5'],
      ['max-height', '20rem'],
      ['transform', 'none'],
      ['clip-path', 'none'],
    ] as const) {
      expect(revealsWith(p, v), `${p}: ${v}`).toBe(true);
    }
    for (const [p, v] of [
      ['display', 'none'],
      ['visibility', 'hidden'],
      ['opacity', '0'],
      ['height', '0'],
      ['width', '0px'],
      ['display', ''],
    ] as const) {
      expect(revealsWith(p, v), `${p}: ${v}`).toBe(false);
    }
  });
});

describe('buildHover', () => {
  const m = buildHover(FACTS);

  it('sorts hidden controls first, then hidden content, then rules with no focus rule, then those with one', () => {
    expect(HOVER_STATUSES).toEqual(['controls-hidden', 'content-hidden', 'no-twin', 'twin']);
    expect(m.findings.map((f) => [f.rule.selector, f.status])).toEqual([
      ['nav li:hover > ul', 'controls-hidden'],
      ['.card:hover .tip', 'content-hidden'],
      ['a:hover', 'no-twin'],
      ['.menu:hover .sub', 'twin'],
    ]);
    expect(m.counts).toEqual({ 'controls-hidden': 1, 'content-hidden': 1, 'no-twin': 1, twin: 1 });
    expect(hoverUnreachable(m)).toBe(2);
  });

  it('gives a rule with a focus twin no weight, whatever it hides', () => {
    expect(hoverStatusOf(rule('x:hover', { twin: true, controlsHidden: 4, hiddenNow: 4 }))).toBe('twin');
  });

  it('keeps the counts of sheets, the device and a cut reading', () => {
    expect([m.sheetsRead, m.sheetsUnread, m.deviceHover, m.truncated]).toEqual([3, 1, false, false]);
  });
});

describe('the words', () => {
  const m = buildHover(FACTS);

  it('says each rule in both languages', () => {
    expect(hoverFindingText(m.findings[0]!, 'en')).toBe('Rule “nav li:hover > ul” (display): 2 hidden elements hold controls shown on hover only, such as “Bus”, “Train”.');
    expect(hoverFindingText(m.findings[1]!, 'fr')).toBe(`Règle «${NNBSP}.card:hover .tip${NNBSP}» (display)${NBSP}: 3 éléments cachés sont montrés au survol seulement.`);
    expect(hoverFindingText(m.findings[2]!, 'en')).toBe('Rule “a:hover” (transform): nothing is hidden right now, and no focus rule does the same. It may only change a look.');
    expect(hoverFindingText(m.findings[3]!, 'en')).toBe('Rule “.menu:hover .sub” (display): a focus rule does the same, so the keyboard gets it too.');
  });

  it('sums up the page, the sheets not read and the device', () => {
    expect(hoverSummary(m, 'cannot', 'en')).toEqual([
      '4 hover rules show something. Controls hidden unless hovered: 1. Content hidden unless hovered: 1. With no focus rule and nothing hidden: 1. With a focus rule: 1.',
      '1 style sheet could not be read (from another origin), so its rules are UNKNOWN.',
      'Your device says its main pointer cannot hover.',
      'You said you cannot hover: what these 2 rules show stays hidden from you.',
    ]);
  });

  it('says what it means for a person who can hover, or UNKNOWN when they did not say', () => {
    expect(hoverSummary(m, 'can', 'en').at(-1)).toBe('You said you can hover. What shows only on hover still asks you to hold the pointer still.');
    expect(hoverSummary(m, 'unsure', 'en').at(-1)).toBe('You did not say whether you can hover, so what this means for you is UNKNOWN.');
  });

  it('says when nothing was found, when the reading stopped, and when the device cannot be told', () => {
    const none = buildHover({ rules: [], sheetsRead: 1, sheetsUnread: 0, deviceHover: null, truncated: false });
    expect(hoverSummary(none, 'cannot', 'en')).toEqual(['No hover rule that shows something was found in the 1 style sheet read.', 'Whether your device can hover is UNKNOWN.']);
    expect(hoverSummary(buildHover({ ...FACTS, truncated: true, deviceHover: true }), 'unsure', 'en')[0]).toContain('(the reading stopped before the end)');
    expect(hoverSummary(buildHover({ ...FACTS, deviceHover: true }), 'unsure', 'en')[2]).toBe('Your device says its main pointer can hover.');
  });

  it('gives hints for the team only for what hides something', () => {
    expect(hoverAdvice(m, 'en')).toEqual([
      'Show these controls on focus too (:focus-within), or keep them visible, for keyboard, touch and switch users.',
      'For content shown on hover, give a button that opens and closes it, and show it on focus.',
    ]);
    expect(hoverAdvice(buildHover({ ...FACTS, rules: [rule('a:hover')] }), 'en')).toEqual([]);
  });
});

describe('hoverNote', () => {
  it('says whether the person can hover, and how many rules hide something here', () => {
    const m = buildHover(FACTS);
    expect(hoverNote(m, 'cannot', 'en')).toBe('Hover: I cannot hover. Content shown only on hover is out of my reach. Here, 2 rules hide something unless hovered.');
    expect(hoverNote(null, 'cannot', 'fr')).toBe(`Survol${NBSP}: je ne peux pas survoler. Ce qui n’apparaît qu’au survol m’est inaccessible.`);
    expect(hoverNote(m, 'can', 'en')).toBe('Hover: I can hover.');
    expect(hoverNote(m, 'unsure', 'en')).toBe('');
  });
});

describe('the French wording of the model', () => {
  it('follows French typography and makes no claim', () => {
    const all = buildHover({ ...FACTS, rules: [...FACTS.rules, rule('b:hover', { hiddenNow: 1, controlsHidden: 1, controlNames: ['Un'] })], truncated: true });
    const lines = [
      ...all.findings.map((f) => hoverFindingText(f, 'fr')),
      ...hoverSummary(all, 'cannot', 'fr'),
      ...hoverSummary(all, 'can', 'fr'),
      ...hoverSummary(all, 'unsure', 'fr'),
      ...hoverSummary(buildHover({ rules: [], sheetsRead: 2, sheetsUnread: 3, deviceHover: null, truncated: false }), 'cannot', 'fr'),
      ...hoverAdvice(all, 'fr'),
      hoverNote(all, 'cannot', 'fr'),
      hoverNote(all, 'can', 'fr'),
    ];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}|\$\{/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme|admissib/);
    }
  });
});
