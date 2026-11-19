import { describe, expect, it } from 'vitest';
import { scanCopy } from './copylint.js';
import { frTypographyIssues } from './i18n.js';
import { found, nov, reportOf, route, smallSite } from './report-fixtures.js';
import { totals } from './report.js';
import { applyReview, DECISIONS, DEFAULT_MAX_AGE_DAYS, describeReview, EMPTY_REVIEW, parseReview, worksheet, type ReviewFile, type ReviewNote } from './review.js';

const K = { h1: '/|contrast|image|h1[0]', logo: '/|images|alt-generic|img#logo', help: '/help|links|new-tab-unannounced|a[2]' };
const note = (key: string, decision: ReviewNote['decision'], on = '2026-11-18', extra: Partial<ReviewNote> = {}): ReviewNote => ({ key, decision, by: 'Sam', on, ...extra });
const file = (...notes: ReviewNote[]): ReviewFile => ({ version: 1, notes });

describe('parseReview', () => {
  it('reads a good file back', () => {
    const f = file(note(K.h1, 'problem', '2026-11-18', { note: 'Text sits on a photo.' }), note(K.logo, 'no-problem-found'));
    expect(parseReview(JSON.stringify(f))).toEqual({ ok: true, value: f });
    expect(parseReview(JSON.stringify(EMPTY_REVIEW))).toEqual({ ok: true, value: EMPTY_REVIEW });
  });
  it('knows three decisions and none of them is a pass', () => {
    expect([...DECISIONS]).toEqual(['problem', 'no-problem-found', 'not-sure']);
    expect(parseReview(JSON.stringify(file({ ...note(K.h1, 'problem'), decision: 'pass' as never }))).ok).toBe(false);
    expect(parseReview(JSON.stringify(file({ ...note(K.h1, 'problem'), decision: 'ok' as never }))).ok).toBe(false);
  });
  it.each([
    ['not json', 'not valid JSON', 'JSON valide'],
    ['{"version":2,"notes":[]}', 'needs version 1', 'version 1'],
    ['{"version":1,"notes":[3]}', 'Note 1 of the review file is not an object', 'La note 1'],
    [JSON.stringify(file({ ...note('short', 'problem') })), 'needs the key printed in the worksheet', 'la clé imprimée'],
    [JSON.stringify(file({ ...note(K.h1, 'problem'), by: '  ' })), 'needs the name of the person who looked', 'le nom de la personne'],
    [JSON.stringify(file({ ...note(K.h1, 'problem'), on: '18/11/2026' })), 'as YYYY-MM-DD', 'au format AAAA-MM-JJ'],
    [JSON.stringify(file({ ...note(K.h1, 'problem'), on: '2026-02-30' })), 'as YYYY-MM-DD', 'au format AAAA-MM-JJ'],
    [JSON.stringify(file({ ...note(K.h1, 'problem'), note: 4 as never })), 'must be text', 'doit être du texte'],
    [JSON.stringify(file(note(K.h1, 'problem'), note(K.h1, 'not-sure'))), 'Note 2 repeats the key', 'La note 2 reprend la clé'],
  ])('rejects %s in both languages', (text, en, fr) => {
    const p = parseReview(text);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.error.en).toContain(en);
      expect(p.error.fr).toContain(fr);
      expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
  });
});

describe('applyReview', () => {
  it('lists every unknown as waiting when there are no notes, and never a failure', () => {
    const r = applyReview(smallSite(), EMPTY_REVIEW, nov(19));
    expect(r.pending.map((p) => p.entry.id)).toEqual(['h1[0]', 'img#logo', 'a[2]']);
    expect(r.reviewed).toEqual([]);
    expect(r.pending.some((p) => p.entry.status === 'fail')).toBe(false);
  });
  it('matches notes to findings by key', () => {
    const r = applyReview(smallSite(), file(note(K.h1, 'problem'), note(K.help, 'no-problem-found')), nov(19));
    expect(r.reviewed.map((x) => [x.entry.id, x.note.decision, x.route])).toEqual([['h1[0]', 'problem', '/'], ['a[2]', 'no-problem-found', '/help']]);
    expect(r.pending.map((p) => p.entry.id)).toEqual(['img#logo']);
    expect(r.unmatched).toEqual([]);
  });
  it('does not change the report or its counts', () => {
    const report = smallSite();
    const before = JSON.stringify(report);
    applyReview(report, file(note(K.h1, 'no-problem-found'), note(K.logo, 'no-problem-found'), note(K.help, 'no-problem-found')), nov(19));
    expect(JSON.stringify(report)).toBe(before);
    expect(totals(report.routes)).toMatchObject({ failed: 2, unknown: 3 });
  });
  it('lists a note whose finding is not in the report, or is a failure now', () => {
    const gone = note('/|contrast|image|h9[0]', 'no-problem-found');
    const nowFail = note('/|contrast|low|p[3]', 'no-problem-found');
    const r = applyReview(smallSite(), file(gone, nowFail), nov(19));
    expect(r.unmatched).toEqual([gone, nowFail]);
    expect(r.reviewed).toEqual([]);
  });
  it('puts a finding back in the waiting list when its note is too old', () => {
    const old = note(K.h1, 'no-problem-found', '2026-05-01');
    const r = applyReview(smallSite(), file(old), nov(19));
    expect(r.expired).toEqual([old]);
    expect(r.pending.map((p) => p.entry.id)).toContain('h1[0]');
    expect(r.reviewed).toEqual([]);
    expect(r.unmatched).toEqual([]);
    expect(DEFAULT_MAX_AGE_DAYS).toBe(180);
  });
  it('takes another age limit, and treats a limit under one as one', () => {
    const n = note(K.h1, 'no-problem-found', '2026-11-10');
    expect(applyReview(smallSite(), file(n), nov(19), 30).reviewed).toHaveLength(1);
    expect(applyReview(smallSite(), file(n), nov(19), 5).expired).toEqual([n]);
    expect(applyReview(smallSite(), file(note(K.h1, 'problem', '2026-11-19')), nov(19), 0).reviewed).toHaveLength(1);
  });
  it('does not count a note dated after the run', () => {
    const tomorrow = note(K.h1, 'no-problem-found', '2026-11-20');
    const r = applyReview(smallSite(), file(tomorrow), nov(19));
    expect(r.future).toEqual([tomorrow]);
    expect(r.reviewed).toEqual([]);
    expect(r.pending.map((p) => p.entry.id)).toContain('h1[0]');
  });
  it('lists a finding once when a route was audited in several profiles', () => {
    const report = reportOf([route('/', { images: { checked: 1, entries: [found('images', 'alt-generic', 'unknown', 'img')] } }, 320), route('/', { images: { checked: 1, entries: [found('images', 'alt-generic', 'unknown', 'img')] } }, 640)]);
    expect(applyReview(report, EMPTY_REVIEW, nov(19)).pending).toHaveLength(1);
  });
});

describe('worksheet', () => {
  const en = worksheet(smallSite(), EMPTY_REVIEW, nov(19), 'en');
  const fr = worksheet(smallSite(), EMPTY_REVIEW, nov(19), 'fr');
  it('says what to do, then lists the waiting items by route with the key to copy', () => {
    expect(en.split('\n')[0]).toBe('3 items to check by hand. For each one, look at the page, then add a note to the review file with the key, a decision (problem, no-problem-found, not-sure), your name and the date.');
    expect(en).toContain('\n\n/:\n  [ ] contrast/image h1[0]\n      English text for image.\n      key: /|contrast|image|h1[0]\n  [ ] images/alt-generic img#logo\n');
    expect(en).toContain('\n\n/help:\n  [ ] links/new-tab-unannounced a[2]\n');
    expect(fr.split('\n')[0]).toContain('3 points à contrôler à la main.');
    expect(fr).toContain('      clé\u00A0: /|contrast|image|h1[0]');
  });
  it('gives keys that the review file accepts and that match the finding', () => {
    const keys = [...en.matchAll(/key: (.+)/g)].map((m) => m[1] ?? '');
    expect(keys).toEqual([K.h1, K.logo, K.help]);
    const f = file(...keys.map((k) => note(k, 'not-sure')));
    expect(parseReview(JSON.stringify(f)).ok).toBe(true);
    expect(applyReview(smallSite(), f, nov(19)).pending).toEqual([]);
  });
  it('leaves out items that have a current note', () => {
    const text = worksheet(smallSite(), file(note(K.h1, 'problem'), note(K.logo, 'not-sure')), nov(19), 'en');
    expect(text.split('\n')[0]).toContain('1 item to check by hand.');
    expect(text).not.toContain('h1[0]');
  });
  it('does not word an empty worksheet as a pass', () => {
    const all = file(note(K.h1, 'problem'), note(K.logo, 'not-sure'), note(K.help, 'no-problem-found'));
    expect(worksheet(smallSite(), all, nov(19), 'en')).toBe('Nothing to check by hand: every unknown item has a recent note. This says nothing about what the checks do not look at.\n');
    expect(worksheet(smallSite(), all, nov(19), 'fr')).toContain('Cela ne dit rien de ce que les contrôles ne regardent pas.');
  });
  it('folds a message with line breaks into one line', () => {
    const report = reportOf([route('/', { images: { checked: 1, entries: [found('images', 'alt-generic', 'unknown', 'img', 'Line one\n  line two')] } })]);
    expect(worksheet(report, EMPTY_REVIEW, nov(19), 'en')).toContain('      Line one line two\n');
  });
});

describe('describeReview', () => {
  const result = applyReview(
    smallSite(),
    file(note(K.h1, 'problem', '2026-11-18', { note: 'Text sits\non a photo.' }), note(K.logo, 'no-problem-found'), note('/|x|y|z', 'not-sure'), note(K.help, 'not-sure', '2026-01-05')),
    nov(19),
  );
  const en = describeReview(result, 'en');
  const fr = describeReview(result, 'fr');
  it('counts notes by decision and what is still waiting', () => {
    expect(en.split('\n')[0]).toBe('Hand review: 2 unknown items have a recent note, 1 waiting.');
    expect(en).toContain('  1 with a problem found, 1 with no problem found, 0 not sure.');
    expect(fr.split('\n')[0]).toBe('Revue à la main\u00A0: 2 points UNKNOWN ont une note récente, 1 en attente.');
    expect(fr).toContain('  1 avec un problème constaté, 1 sans problème constaté, 0 sans certitude.');
  });
  it('says that no problem found is not a pass', () => {
    expect(en).toContain('“No problem found” records one look on one date. It is not a pass, and the counts of the report do not change.');
    expect(fr).toContain('Ce n’est pas une réussite, et les décomptes du rapport ne changent pas.');
  });
  it('lists the problems people found, with who and when', () => {
    expect(en).toContain('  Problem found by Sam on 2026-11-18: contrast/image h1[0] (/) – Text sits on a photo.');
    expect(fr).toContain('  Problème constaté par Sam le 2026-11-18\u00A0: contrast/image h1[0] (/) – Text sits on a photo.');
  });
  it('mentions notes that are too old or match nothing', () => {
    expect(en).toContain('  1 note is too old: the item is waiting again.');
    expect(en).toContain('  1 note matches no unknown item of this report: the finding may be gone, or have changed status or element.');
    expect(fr).toContain('  1 note est trop ancienne\u00A0: le point est de nouveau en attente.');
    expect(fr).toContain('  1 note ne correspond à aucun point UNKNOWN de ce rapport\u00A0:');
  });
  it('mentions notes dated in the future', () => {
    const future = describeReview(applyReview(smallSite(), file(note(K.h1, 'problem', '2027-01-01')), nov(19)), 'en');
    expect(future).toContain('  1 note is dated in the future and is not counted.');
  });
  it('is short when nobody has looked yet', () => {
    expect(describeReview(applyReview(smallSite(), EMPTY_REVIEW, nov(19)), 'en')).toBe('Hand review: 0 unknown items have a recent note, 3 waiting.\n');
    expect(describeReview(applyReview(smallSite(), EMPTY_REVIEW, nov(19)), 'fr')).toBe('Revue à la main\u00A0: 0 point UNKNOWN a une note récente, 3 en attente.\n');
  });
  it('follows French typography and the copy rules in its own words', () => {
    const own = fr.split('\n').filter((l) => !l.includes('Sam'));
    for (const line of own) expect(frTypographyIssues(line), line).toEqual([]);
    expect(scanCopy(en.split('\n').filter((l) => !l.includes('Sam')).join('\n')).map((h) => h.rule.id)).toEqual([]);
    expect(scanCopy(own.join('\n')).map((h) => h.rule.id)).toEqual([]);
    expect(`${en}${fr}`).not.toMatch(/verif|vérif/iu);
  });
});
