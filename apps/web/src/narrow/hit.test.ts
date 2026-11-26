import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { HIT_POINTS, type HitControl, type HitCover, type HitFacts } from './hit-inpage.js';
import { buildHit, coverText, hitAdvice, hitFindingText, hitNote, hitStatusOf, hitSummary } from './hit.js';
import { NBSP, NNBSP } from './types.js';

const cover = (extra: Partial<HitCover> = {}): HitCover => ({ what: 'div#banner', name: 'We use cookies', pinned: true, invisible: false, ...extra });
const c = (name: string, reached: number, cv: HitCover | null = reached === 5 ? null : cover()): HitControl => ({ id: `button[${name}]`, name, reached, cover: cv });
const FACTS: HitFacts = {
  controls: [c('Next', 5), c('Send', 0), c('Menu', 3, cover({ what: 'div.overlay', name: '', pinned: false, invisible: true })), c('Help', 1), c('Back', 5)],
  offScreen: 4,
  truncated: false,
};

describe('hitStatusOf', () => {
  it('is covered when no point reaches the control, partly when some do, clear when all do', () => {
    expect(HIT_POINTS).toHaveLength(5);
    expect([0, 1, 4, 5].map((n) => hitStatusOf(c('x', n)))).toEqual(['covered', 'partly', 'partly', 'clear']);
  });
});

describe('buildHit', () => {
  const m = buildHit(FACTS);

  it('keeps only the covered controls, fully covered first, then the fewest points reached', () => {
    expect(m.findings.map((f) => [f.control.name, f.status])).toEqual([
      ['Send', 'covered'],
      ['Help', 'partly'],
      ['Menu', 'partly'],
    ]);
  });

  it('counts the controls and the kinds of cover', () => {
    expect([m.covered, m.partly, m.clear, m.invisibleCovers, m.pinnedCovers, m.offScreen, m.truncated]).toEqual([1, 2, 2, 1, 2, 4, false]);
  });

  it('has nothing for a page with no control on the screen', () => {
    const none = buildHit({ controls: [], offScreen: 0, truncated: false });
    expect([none.findings.length, none.covered, none.clear]).toEqual([0, 0, 0]);
  });
});

describe('the words', () => {
  const m = buildHit(FACTS);

  it('names what is on top, in both languages', () => {
    expect(coverText(m.findings[0]!, 'en')).toBe('something stuck to the screen “We use cookies” (div#banner)');
    expect(coverText(m.findings[2]!, 'fr')).toBe('une couche qui ne montre rien (div.overlay)');
    expect(coverText(buildHit({ controls: [c('A', 0, cover({ pinned: false, name: '' }))], offScreen: 0, truncated: false }).findings[0]!, 'en')).toBe('another element (div#banner)');
    expect(coverText({ control: c('A', 0, null), status: 'covered' }, 'en')).toBe('UNKNOWN');
  });

  it('says each covered control', () => {
    expect(hitFindingText(m.findings[0]!, 'en')).toBe('“Send” is fully covered by something stuck to the screen “We use cookies” (div#banner). A press there lands on something else.');
    expect(hitFindingText(m.findings[1]!, 'fr')).toBe(
      `«${NNBSP}Help${NNBSP}» est couvert en partie par un élément fixé à l’écran «${NNBSP}We use cookies${NNBSP}» (div#banner)${NBSP}: 1 points sur 5 l’atteignent. Un appui près du bord peut tomber à côté.`,
    );
    expect(hitFindingText({ control: c('', 0), status: 'covered' }, 'en')).toMatch(/^UNKNOWN is fully covered/);
  });

  it('sums up the page, what was not tested, and the kinds of cover', () => {
    expect(hitSummary(m, 'en')).toEqual([
      '5 controls tested. Fully covered: 1. Partly: 2. Clear: 2.',
      '4 controls could not be brought fully onto the screen, so they stay UNKNOWN.',
      '1 cover shows nothing: you cannot see what gets the press.',
      '2 covers are stuck to the screen: they stay over whatever scrolls under.',
    ]);
    expect(hitSummary(buildHit({ controls: [], offScreen: 1, truncated: false }), 'en')).toEqual([
      'No control could be tested.',
      '1 control could not be brought fully onto the screen, so it stays UNKNOWN.',
    ]);
    expect(hitSummary(buildHit({ ...FACTS, truncated: true }), 'en')[0]).toContain('(the reading stopped before the end)');
  });

  it('gives a hint for each kind of cover found', () => {
    expect(hitAdvice(m, 'en')).toEqual([
      'Leave room under a bar stuck to the screen (a banner, a toolbar) so it covers no control, and let it be closed.',
      'Remove invisible layers over controls, or give them pointer-events: none.',
    ]);
    expect(hitAdvice(buildHit({ controls: [c('A', 0, cover({ pinned: false }))], offScreen: 0, truncated: false }), 'en')).toEqual(['Keep other elements from overlapping controls.']);
    expect(hitAdvice(buildHit({ controls: [c('A', 5)], offScreen: 0, truncated: false }), 'en')).toEqual([]);
  });

  it('gives a line for the barrier text only when a control is covered', () => {
    expect(hitNote(m, 'en')).toBe('Covered controls: 3 controls are covered by something else, fully or partly, so a press may not reach them.');
    expect(hitNote(buildHit({ controls: [c('A', 0)], offScreen: 0, truncated: false }), 'fr')).toBe(
      `Commandes couvertes${NBSP}: 1${NBSP}commande est couverte par autre chose, en tout ou en partie, et un appui peut ne pas l’atteindre.`,
    );
    expect(hitNote(buildHit({ controls: [c('A', 5)], offScreen: 3, truncated: false }), 'en')).toBe('');
    expect(hitNote(null, 'en')).toBe('');
  });

  it('follows French typography and makes no claim', () => {
    const lines = [...m.findings.map((f) => hitFindingText(f, 'fr')), ...hitSummary(m, 'fr'), ...hitSummary(buildHit({ controls: [], offScreen: 2, truncated: true }), 'fr'), ...hitAdvice(m, 'fr'), hitNote(m, 'fr')];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}|\$\{/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme|admissib/);
    }
  });
});
