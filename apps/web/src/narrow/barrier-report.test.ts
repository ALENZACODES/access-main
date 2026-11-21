import { describe, expect, it } from 'vitest';
import { BARRIER_KINDS, EMPTY_DRAFT, KIND_LABELS, MAX_WHAT, MIN_WHAT, barrierDataUrl, barrierFileName, pagePath, personalDetails, personalWarning, renderBarrierText, validateBarrier, type BarrierContext, type BarrierDraft } from './barrier-report.js';
import { readDeviceFacts } from './device-facts.js';
import { PHONE, SILENT } from './fit-testkit.js';
import { frTypographyIssues } from './i18n.js';
import { nov, reportOf, smallSite } from './report-fixtures.js';
import { NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;

const draft = (over: Partial<BarrierDraft> = {}): BarrierDraft => ({ kind: 'cut-off', what: 'The map is cut off on the right side.', includeSettings: true, includeFindings: false, ...over });
const context = (over: Partial<BarrierContext> = {}): BarrierContext => ({ location: '/places/12', facts: readDeviceFacts(PHONE), report: null, now: nov(19), ...over });

describe('kinds of barrier', () => {
  it('has a label in both languages for every kind, and ends with "other"', () => {
    expect(BARRIER_KINDS.at(-1)).toBe('other');
    expect(new Set(BARRIER_KINDS).size).toBe(BARRIER_KINDS.length);
    for (const k of BARRIER_KINDS) {
      expect(KIND_LABELS[k].en, k).not.toBe('');
      expect(KIND_LABELS[k].fr, k).not.toBe(KIND_LABELS[k].en);
      expect(frTypographyIssues(KIND_LABELS[k].fr), k).toEqual([]);
    }
  });

  it('asks about the barrier, never about the person', () => {
    for (const k of BARRIER_KINDS) {
      for (const lang of LANGS) expect(KIND_LABELS[k][lang]).not.toMatch(/disab|handicap|diagnos|condition|blind|aveugle|deaf|sourd/i);
    }
  });
});

describe('the empty draft', () => {
  it('has no kind and no text, adds the settings and leaves the findings out', () => {
    expect(EMPTY_DRAFT).toEqual({ kind: '', what: '', includeSettings: true, includeFindings: false });
  });
});

describe('validateBarrier', () => {
  it('accepts a draft with a kind and a description', () => {
    for (const lang of LANGS) expect(validateBarrier(draft(), lang)).toEqual([]);
  });

  it('asks for a kind and a description on an empty draft, kind first', () => {
    const errors = validateBarrier(EMPTY_DRAFT, 'en');
    expect(errors.map((e) => e.field)).toEqual(['kind', 'what']);
    expect(errors[0]?.message).toBe('Choose the kind of barrier.');
    expect(errors[1]?.message).toBe(`Say what happened, in at least ${MIN_WHAT} characters.`);
  });

  it('does not take a kind it does not know', () => {
    expect(validateBarrier(draft({ kind: 'nope' as never }), 'en').map((e) => e.field)).toEqual(['kind']);
  });

  it('counts the description without the spaces around it', () => {
    expect(validateBarrier(draft({ what: '   quite short   ' }), 'en')).toEqual([]);
    expect(validateBarrier(draft({ what: '   short     ' }), 'en').map((e) => e.field)).toEqual(['what']);
    expect(validateBarrier(draft({ what: 'x'.repeat(MIN_WHAT) }), 'en')).toEqual([]);
    expect(validateBarrier(draft({ what: 'x'.repeat(MIN_WHAT - 1) }), 'en')).toHaveLength(1);
  });

  it('says how long a description is when it is too long', () => {
    expect(validateBarrier(draft({ what: 'x'.repeat(MAX_WHAT) }), 'en')).toEqual([]);
    const [e] = validateBarrier(draft({ what: 'x'.repeat(MAX_WHAT + 7) }), 'en');
    expect(e?.field).toBe('what');
    expect(e?.message).toContain(String(MAX_WHAT + 7));
    expect(e?.message).toContain(`${MAX_WHAT} characters at most`);
  });

  it('says in French what to do, with French typography', () => {
    const all = [...validateBarrier(EMPTY_DRAFT, 'fr'), ...validateBarrier(draft({ what: 'x'.repeat(MAX_WHAT + 1) }), 'fr')];
    expect(all).toHaveLength(3);
    expect(all[0]?.message).toBe('Choisissez le type d’obstacle.');
    for (const e of all) expect(frTypographyIssues(e.message), e.message).toEqual([]);
  });

  it('each message says how to put it right, not only that something is wrong', () => {
    for (const lang of LANGS) {
      for (const e of [...validateBarrier(EMPTY_DRAFT, lang), ...validateBarrier(draft({ what: 'x'.repeat(MAX_WHAT + 1) }), lang)]) {
        expect(e.message).toMatch(/^(Choose|Say|The description is|Choisissez|Décrivez|La description compte)/);
        expect(e.message).not.toMatch(/invalid|invalide|error|erreur/i);
      }
    }
  });
});

describe('personalDetails', () => {
  it.each(['write to me at ana@example.org please', 'ANA.B+tag@Mail.Example.CA'])('sees an email address in %j', (text) => {
    expect(personalDetails(text)).toEqual(['email']);
  });

  it.each(['call 416 555 0199', 'tel: (416) 555-0199', '+1 416.555.0199', '4165550199'])('sees a phone number in %j', (text) => {
    expect(personalDetails(text)).toEqual(['phone']);
  });

  it.each(['The button is 18 by 18 pixels.', 'It happened at 10:30 on page 12.', 'I use 200% zoom at 1280 x 800', 'the @ sign is cut off', ''])('sees nothing personal in %j', (text) => {
    expect(personalDetails(text)).toEqual([]);
  });

  it('sees both', () => {
    expect(personalDetails('ana@example.org or 416 555 0199')).toEqual(['email', 'phone']);
  });
});

describe('personalWarning', () => {
  it('is empty when there is nothing to warn about', () => {
    for (const lang of LANGS) expect(personalWarning('The map is cut off.', lang)).toBe('');
  });

  it('names what it saw and leaves the choice to the person', () => {
    expect(personalWarning('ana@example.org', 'en')).toBe('Your description seems to hold an email address. Take it out unless you mean to share it.');
    expect(personalWarning('416 555 0199', 'en')).toContain('a phone number');
    expect(personalWarning('ana@example.org 416 555 0199', 'en')).toContain('an email address and a phone number');
    expect(personalWarning('ana@example.org 416 555 0199', 'fr')).toContain('une adresse courriel et un numéro de téléphone');
  });

  it('does not repeat the detail it saw', () => {
    expect(personalWarning('ana@example.org 416 555 0199', 'en')).not.toMatch(/ana|416/);
  });

  it('follows French typography', () => {
    expect(frTypographyIssues(personalWarning('ana@example.org 416 555 0199', 'fr'))).toEqual([]);
  });
});

describe('pagePath', () => {
  it.each([
    ['/places/12', '/places/12'],
    ['/places/12?q=ramp', '/places/12'],
    ['/places/12#top', '/places/12'],
    ['/search?q=my+street+address#results', '/search'],
    ['https://app.example/places/12?q=ramp#top', '/places/12'],
    ['https://app.example', '/'],
    ['https://user:secret@app.example:8443/help?x=1', '/help'],
    ['', '/'],
    ['?q=only', '/'],
  ])('reduces %j to %j', (input, want) => {
    expect(pagePath(input)).toBe(want);
  });
});

describe('renderBarrierText', () => {
  it('gives the date, the page, the kind and the description', () => {
    const text = renderBarrierText(draft(), context(), 'en');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Barrier met in the App');
    expect(lines).toContain('Date: 2026-11-19');
    expect(lines).toContain('Page: /places/12');
    expect(lines).toContain('Kind of barrier: Something is cut off or needs sideways scrolling');
    expect(lines).toContain('What happened:');
    expect(lines).toContain('The map is cut off on the right side.');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('leaves the query and the fragment of the address out', () => {
    const text = renderBarrierText(draft(), context({ location: 'https://app.example/search?q=12+main+street#r' }), 'en');
    expect(text).toContain('Page: /search');
    expect(text).not.toMatch(/main|street|app\.example/);
  });

  it('adds the settings only when asked', () => {
    expect(renderBarrierText(draft(), context(), 'en')).toContain('Width of the page area: 320 CSS pixels');
    const without = renderBarrierText(draft({ includeSettings: false }), context(), 'en');
    expect(without).not.toContain('Width of the page area');
    expect(without).not.toContain('My screen and settings');
  });

  it('says UNKNOWN for settings the browser did not report', () => {
    const text = renderBarrierText(draft(), context({ facts: readDeviceFacts(SILENT) }), 'en');
    expect(text.match(/: UNKNOWN$/gm)).toHaveLength(10);
  });

  it('adds the findings only when asked', () => {
    expect(renderBarrierText(draft(), context({ report: smallSite() }), 'en')).not.toContain('checks of the App found');
    const text = renderBarrierText(draft({ includeFindings: true }), context({ report: smallSite() }), 'en');
    expect(text).toContain('What the checks of the App found on this page:');
    expect(text).toContain('2 things to fix and 3 things UNKNOWN');
    expect(text).toContain('- Seeing and hearing the content: 2 to fix, 2 UNKNOWN');
  });

  it('says UNKNOWN when the findings were asked for and the checks did not run', () => {
    expect(renderBarrierText(draft({ includeFindings: true }), context(), 'en')).toContain('UNKNOWN. The checks could not run.');
    expect(renderBarrierText(draft({ includeFindings: true }), context(), 'fr')).toContain('UNKNOWN. Les contrôles n’ont pas pu s’exécuter.');
  });

  it('does not word a report with no finding as a pass', () => {
    const text = renderBarrierText(draft({ includeFindings: true }), context({ report: reportOf([]) }), 'en');
    expect(text).toContain('The checks that ran found nothing on this page at this size.');
    expect(text).not.toMatch(/\b(pass(es|ed)?|conforms?|compliant)\b/i);
  });

  it('trims the description and keeps its line breaks', () => {
    const text = renderBarrierText(draft({ what: '\n  First line.\nSecond line.  \n' }), context(), 'en');
    expect(text).toContain('What happened:\nFirst line.\nSecond line.\n');
  });

  it('writes UNKNOWN for a kind that was not chosen', () => {
    expect(renderBarrierText(draft({ kind: '' }), context(), 'en')).toContain('Kind of barrier: UNKNOWN');
    expect(renderBarrierText(draft({ kind: '' }), context(), 'fr')).toContain(`Type d’obstacle${NBSP}: UNKNOWN`);
  });

  it('is in French with French typography, apart from what the person wrote', () => {
    const text = renderBarrierText(draft({ what: 'La carte est coupée à droite.', includeFindings: true }), context({ report: smallSite() }), 'fr');
    expect(text).toContain('Obstacle rencontré dans l’App');
    expect(text).toContain(`Page${NBSP}: /places/12`);
    expect(text).toContain(`Ce qui s’est passé${NBSP}:`);
    expect(text).toContain(`Largeur de la zone de page${NBSP}: 320${NBSP}pixels CSS`);
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('says what the text holds and where it was made', () => {
    expect(renderBarrierText(draft(), context(), 'en')).toContain('This text was prepared on the device. It holds no name, no email address and no location');
  });

  it('holds nothing about the person beyond what they wrote and the settings they chose to add', () => {
    const text = renderBarrierText(draft({ includeSettings: false }), context(), 'en');
    expect(text.split('\n').filter((l) => l !== '')).toHaveLength(7);
    expect(text).not.toMatch(/user.?agent|mozilla|latitude|longitude|cookie/i);
  });

  it('is the same text for the same input', () => {
    expect(renderBarrierText(draft(), context(), 'fr')).toBe(renderBarrierText(draft(), context(), 'fr'));
  });
});

describe('barrierFileName', () => {
  it('carries the date, in the language of the page', () => {
    expect(barrierFileName(nov(19), 'en')).toBe('barrier-2026-11-19.txt');
    expect(barrierFileName(nov(3), 'fr')).toBe('obstacle-2026-11-03.txt');
  });
});

describe('barrierDataUrl', () => {
  it('holds the whole text and nothing that needs a server', () => {
    const text = renderBarrierText(draft({ what: 'Coupé à 100 % & plus <ici> "là" #1?' }), context(), 'fr');
    const url = barrierDataUrl(text);
    expect(url.startsWith('data:text/plain;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice('data:text/plain;charset=utf-8,'.length))).toBe(text);
    expect(url).not.toMatch(/[\s<>"#]/);
    expect(url).not.toMatch(/https?:/);
  });
});
