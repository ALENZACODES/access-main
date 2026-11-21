import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { NBSP, NNBSP } from './types.js';
import { PRACTICE, emptyRun, fieldResults, findLimit, paceOf, paceSummary, pageNotes, recordChange, takesBack, typingNote, type FieldRun, type Pace } from './typing-trial.js';

const run = (first: number, last: number, value: string, takenBack = 0): FieldRun => ({ first, last, value, takenBack });
const FULL: FieldRun[] = [run(0, 4_000, 'Alex Martin'), run(10_000, 13_000, 'K1A 0B1', 1), run(20_000, 26_000, 'alex@example.ca', 2)];

describe('the practice', () => {
  it('has three short items, the same in both languages, each with a label in both', () => {
    expect(PRACTICE.map((p) => p.id)).toEqual(['name', 'postal', 'email']);
    for (const p of PRACTICE) {
      expect(p.text.en).toBe(p.text.fr);
      expect(p.text.en.length).toBeLessThanOrEqual(16);
      expect(p.label.en).not.toBe('');
      expect(p.label.fr).not.toBe('');
    }
  });
});

describe('recordChange and takesBack', () => {
  it('keeps the first time, moves the last, counts what was taken back and keeps the value', () => {
    let r = emptyRun();
    r = recordChange(r, 100, false, 'A');
    r = recordChange(r, 250, false, 'Al');
    r = recordChange(r, 400, true, 'A');
    expect(r).toEqual({ first: 100, last: 400, takenBack: 1, value: 'A' });
  });

  it('counts deleting and undoing, and nothing else', () => {
    for (const t of ['deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'historyUndo']) expect(takesBack(t), t).toBe(true);
    for (const t of ['insertText', 'insertFromPaste', 'insertFromDictation', 'historyRedo', '', undefined]) expect(takesBack(t), String(t)).toBe(false);
  });
});

describe('fieldResults', () => {
  it('gives the time from the first change to the last, the characters, and whether it matches', () => {
    const res = fieldResults(FULL, 'en');
    expect(res[0]).toEqual({ id: 'name', ms: 4_000, chars: 11, takenBack: 0, same: true });
    expect(res[1]).toEqual({ id: 'postal', ms: 3_000, chars: 7, takenBack: 1, same: true });
    expect(res[2]?.same).toBe(true);
  });

  it('ignores case and spaces when matching, and says when the text differs', () => {
    const res = fieldResults([run(0, 1, 'alexmartin'), run(0, 1, 'k1a0b1'), run(0, 1, 'alex@example.com')], 'fr');
    expect(res.map((r) => r.same)).toEqual([true, true, false]);
  });

  it('has no time for a field that was not used, or a missing run', () => {
    const res = fieldResults([emptyRun()], 'en');
    expect(res).toHaveLength(3);
    expect(res.every((r) => r.ms === null && r.chars === 0)).toBe(true);
  });
});

describe('paceOf', () => {
  it('gives characters a minute and the middle time per field over the fields used', () => {
    const p = paceOf(fieldResults(FULL, 'en'));
    // 33 characters in 13 seconds.
    expect(p).toEqual({ perMinute: Math.round((33 / 13_000) * 60_000), perField: 4_000, used: 3, takenBack: 3 });
  });

  it('takes the mean of the two middle times when two fields were used', () => {
    const p = paceOf(fieldResults([run(0, 2_000, 'Alex'), run(0, 6_000, 'K1A'), emptyRun()], 'en'));
    expect(p.perField).toBe(4_000);
    expect(p.used).toBe(2);
  });

  it('leaves out a field with one change only, which has no time', () => {
    const p = paceOf(fieldResults([run(5, 5, 'Alex Martin'), emptyRun(), emptyRun()], 'en'));
    expect(p).toEqual({ perMinute: null, perField: null, used: 0, takenBack: 0 });
  });
});

describe('findLimit', () => {
  it('finds minutes next to words about a session or a time-out, in both languages', () => {
    expect(findLimit(['Welcome.', 'Your session will expire after 15 minutes of inactivity.'])).toEqual({ minutes: 15, text: 'Your session will expire after 15 minutes of inactivity.' });
    expect(findLimit(['Pour votre sécurité, vous serez déconnecté après 20 min d’inactivité.'])?.minutes).toBe(20);
    expect(findLimit(['Timed out after 5 mins.'])?.minutes).toBe(5);
  });

  it('ignores minutes that are not about a limit, and a limit with no number', () => {
    expect(findLimit(['The walk takes 10 minutes.', 'Your session may expire.'])).toBeNull();
    expect(findLimit(['Session expires in 0 minutes.'])).toBeNull();
  });

  it('shortens a long sentence so it can be quoted', () => {
    const long = `Your session will expire after 30 minutes ${'and more words '.repeat(20)}`;
    const found = findLimit([long]);
    expect(found?.text.length).toBe(140);
    expect(found?.text.endsWith('…')).toBe(true);
  });
});

const PACE: Pace = { perMinute: 120, perField: 30_000, used: 3, takenBack: 1 };

describe('paceSummary', () => {
  it('says the pace in both languages', () => {
    expect(paceSummary(PACE, 'en')).toEqual(['3 of 3 practice fields filled in. Your pace: about 120 characters a minute, and 30 s a field in the middle of your tries.', '1 correction (deleting or undoing).']);
    const fr = paceSummary(PACE, 'fr');
    expect(fr[0]).toBe(`3 champs d’essai remplis sur 3. Votre rythme${NBSP}: environ 120 caractères par minute, et 30${NBSP}s par champ au milieu de vos essais.`);
    expect(fr[1]).toBe('1 correction (effacement ou annulation).');
  });

  it('writes decimals with a comma in French', () => {
    expect(paceSummary({ ...PACE, perField: 2_450 }, 'fr')[0]).toContain(`2,5${NBSP}s par champ`);
    expect(paceSummary({ ...PACE, perField: 2_450 }, 'en')[0]).toContain('2.5 s a field');
  });

  it('says the pace is UNKNOWN when nothing was measured', () => {
    const none: Pace = { perMinute: null, perField: null, used: 0, takenBack: 0 };
    expect(paceSummary(none, 'en')).toEqual(['No practice field was filled in, so your pace is UNKNOWN.']);
    expect(paceSummary(none, 'fr')[0]).toContain('UNKNOWN');
  });
});

describe('pageNotes', () => {
  it('says when the page has no text field', () => {
    expect(pageNotes(PACE, { fields: 0, limitMinutes: 5, limitText: '' }, 'en').map((n) => n.kind)).toEqual(['no-fields']);
  });

  it('gives an estimate and leaves the limit UNKNOWN when none is stated', () => {
    const [note] = pageNotes(PACE, { fields: 4, limitMinutes: null, limitText: '' }, 'en');
    expect(note?.kind).toBe('no-limit');
    expect(note?.text).toBe(
      'At the pace of your tries, the 4 text fields of this page would take about 2 min. This is an estimate from the practice, not a measure of the page. No time limit was found in the text of the page. One may still apply, so it stays UNKNOWN.',
    );
  });

  it('says a stated limit may not be enough, quoting it, and what the rules ask for', () => {
    const [note] = pageNotes(PACE, { fields: 30, limitMinutes: 10, limitText: 'Session expires after 10 minutes.' }, 'en');
    expect(note?.kind).toBe('over-limit');
    expect(note?.text).toContain('about 15 min');
    expect(note?.text).toContain('The page states a limit of 10 min: “Session expires after 10 minutes”. That may not be enough.');
    const [fr] = pageNotes(PACE, { fields: 30, limitMinutes: 10, limitText: 'La session expire après 10 minutes.' }, 'fr');
    expect(fr?.text).toContain(`une limite de 10${NBSP}min${NBSP}: «${NNBSP}La session expire après 10 minutes${NNBSP}»`);
  });

  it('says when a limit leaves little room, and says nothing when there is plenty', () => {
    expect(pageNotes(PACE, { fields: 12, limitMinutes: 10, limitText: 'x' }, 'en')[0]?.kind).toBe('near-limit');
    expect(pageNotes(PACE, { fields: 2, limitMinutes: 10, limitText: 'x' }, 'en')).toEqual([]);
  });

  it('gives nothing when the pace is UNKNOWN and the page has fields', () => {
    expect(pageNotes({ perMinute: null, perField: null, used: 0, takenBack: 0 }, { fields: 3, limitMinutes: 1, limitText: 'x' }, 'en')).toEqual([]);
  });

  it('uses one field in the singular', () => {
    expect(pageNotes(PACE, { fields: 1, limitMinutes: null, limitText: '' }, 'en')[0]?.text).toContain('the 1 text field of this page');
  });
});

describe('typingNote', () => {
  it('gives one line for the summary, or nothing before the practice', () => {
    expect(typingNote(PACE, 'en')).toBe('My typing pace: about 120 characters a minute, 30 s a short field.');
    expect(typingNote(PACE, 'fr')).toBe(`Mon rythme de saisie${NBSP}: environ 120 caractères par minute, 30${NBSP}s par champ court.`);
    expect(typingNote({ perMinute: null, perField: null, used: 0, takenBack: 0 }, 'en')).toBe('');
  });
});

describe('the French wording of the model', () => {
  it('follows French typography and makes no claim about the person', () => {
    const lines = [
      ...paceSummary(PACE, 'fr'),
      ...paceSummary({ perMinute: null, perField: null, used: 0, takenBack: 0 }, 'fr'),
      ...pageNotes(PACE, { fields: 0, limitMinutes: null, limitText: '' }, 'fr').map((n) => n.text),
      ...pageNotes(PACE, { fields: 4, limitMinutes: null, limitText: '' }, 'fr').map((n) => n.text),
      ...pageNotes(PACE, { fields: 30, limitMinutes: 10, limitText: 'Délai de 10 minutes.' }, 'fr').map((n) => n.text),
      ...pageNotes(PACE, { fields: 12, limitMinutes: 10, limitText: 'Délai de 10 minutes.' }, 'fr').map((n) => n.text),
      typingNote(PACE, 'fr'),
    ];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme/);
    }
  });
});
