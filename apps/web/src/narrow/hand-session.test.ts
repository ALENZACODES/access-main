import { describe, expect, it } from 'vitest';
import { manualScript } from './coverage.js';
import {
  MAX_NOTE,
  MAX_WHO,
  OPTIONAL_NEEDS,
  RESULT_LABELS,
  answer,
  clearAnswer,
  currentStep,
  earlierLine,
  earlierNote,
  exportLog,
  exportText,
  logFileName,
  move,
  newSession,
  nextOpen,
  progress,
  progressSentence,
  readEarlier,
  setNeeds,
  stepIds,
  stepsOf,
  summaryText,
  validateAnswer,
  validateWho,
  type HandSession,
} from './hand-session.js';
import { frTypographyIssues } from './i18n.js';
import { parseManualLog, sampleManualLog } from './manual-log.js';
import { MANUAL_STEPS } from './manual-steps.js';
import { nov } from './report-fixtures.js';
import { DECISIONS } from './review.js';
import { NBSP } from './types.js';

const NOW = nov(19);
const LANGS = ['en', 'fr'] as const;
const all = (): HandSession => setNeeds(newSession(), OPTIONAL_NEEDS);
/** A session with three saved answers, one of each result. */
const worked = (): HandSession => {
  let s: HandSession = { ...all(), who: '@sam' };
  s = answer(s, '1.3.3', 'problem', '  The form says “click the green button”.  ');
  s = answer(s, '1.4.4', 'no-problem-found', '');
  s = answer(s, '2.4.3', 'not-sure', 'Focus goes to the map first.');
  return s;
};

describe('a new session', () => {
  it('is for someone with a browser and a keyboard, at the first step, with nothing answered', () => {
    const s = newSession();
    expect(s.needs).toEqual(['keyboard']);
    expect(s.who).toBe('');
    expect(s.answers).toEqual({});
    expect(s.earlier).toEqual({ version: 1, notes: [] });
    expect(s.current).toBe(stepIds(s)[0]);
  });

  it('shows only steps that need a browser or a keyboard', () => {
    const steps = stepsOf(newSession(), 'en');
    expect(steps.length).toBeGreaterThan(10);
    expect(new Set(steps.map((x) => x.needs))).toEqual(new Set(['browser', 'keyboard']));
    expect(steps.length).toBe(MANUAL_STEPS.filter((x) => x.needs === 'browser' || x.needs === 'keyboard').length);
  });

  it('has the steps in the order of WCAG, the same in both languages', () => {
    const en = stepsOf(newSession(), 'en').map((x) => x.row.criterion.sc);
    expect(stepsOf(newSession(), 'fr').map((x) => x.row.criterion.sc)).toEqual(en);
    expect(en).toEqual(manualScript({ needs: ['browser', 'keyboard'] }, 'en').map((x) => x.row.criterion.sc));
    expect(stepIds(newSession())).toEqual(en);
  });

  it('gives the step on screen in the language asked for', () => {
    const s = { ...newSession(), current: '1.4.10' };
    expect(currentStep(s, 'en')?.action).toContain('320 CSS pixels');
    expect(currentStep(s, 'fr')?.action).toContain('320 pixels CSS');
    expect(currentStep({ ...s, current: null }, 'en')).toBeNull();
    expect(currentStep({ ...s, current: '1.1.1' }, 'en')).toBeNull();
  });
});

describe('setNeeds', () => {
  it('shows every step when the person has everything', () => {
    expect(stepIds(all())).toHaveLength(MANUAL_STEPS.length);
  });

  it('shows only the browser steps when the person has nothing else', () => {
    const s = setNeeds(newSession(), []);
    expect(new Set(stepsOf(s, 'en').map((x) => x.needs))).toEqual(new Set(['browser']));
  });

  it('keeps the needs in a fixed order and drops what it does not know', () => {
    expect(setNeeds(newSession(), ['media', 'keyboard', 'browser', 'nonsense' as never]).needs).toEqual(['keyboard', 'media']);
  });

  it('keeps the step on screen when it still fits', () => {
    const s = setNeeds({ ...newSession(), current: '1.4.10' }, ['screen-reader']);
    expect(s.current).toBe('1.4.10');
  });

  it('moves to the first step with no answer when the step on screen no longer fits', () => {
    const start = { ...newSession(), current: '2.1.1' };
    expect(stepsOf(start, 'en').find((x) => x.row.criterion.sc === '2.1.1')?.needs).toBe('keyboard');
    const s = setNeeds(answer(start, '1.3.3', 'no-problem-found', ''), []);
    expect(s.current).not.toBe('2.1.1');
    expect(s.current).toBe(stepIds(s).find((sc) => sc !== '1.3.3'));
  });

  it('keeps every answer, also for steps that no longer show', () => {
    const s = setNeeds(answer({ ...newSession(), current: '2.1.1' }, '2.1.1', 'problem', 'The menu cannot be opened.'), []);
    expect(s.answers['2.1.1']).toEqual({ result: 'problem', note: 'The menu cannot be opened.' });
    expect(stepIds(s)).not.toContain('2.1.1');
  });
});

describe('move', () => {
  const ids = stepIds(newSession());

  it('goes to the next and the previous step', () => {
    const s = newSession();
    expect(move(s, 'next').current).toBe(ids[1]);
    expect(move(move(s, 'next'), 'previous').current).toBe(ids[0]);
  });

  it('stays at the first step on previous and at the last one on next', () => {
    expect(move(newSession(), 'previous').current).toBe(ids[0]);
    const last = { ...newSession(), current: ids.at(-1) ?? null };
    expect(move(last, 'next').current).toBe(ids.at(-1));
  });

  it('jumps to a step by its criterion, and stays put for one that does not show', () => {
    expect(move(newSession(), { to: '1.4.10' }).current).toBe('1.4.10');
    expect(move(newSession(), { to: '1.1.1' }).current).toBe(ids[0]);
    expect(move(newSession(), { to: '9.9.9' }).current).toBe(ids[0]);
  });

  it('goes to the next step with no answer, past answered ones, and wraps round', () => {
    let s = newSession();
    s = answer(s, ids[1] as string, 'no-problem-found', '');
    expect(move(s, 'next-open').current).toBe(ids[2]);
    const atEnd = { ...s, current: ids.at(-1) ?? null };
    expect(move(atEnd, 'next-open').current).toBe(ids[0]);
  });

  it('stays where it is when every step has an answer', () => {
    let s = newSession();
    for (const sc of ids) s = answer(s, sc, 'no-problem-found', '');
    expect(nextOpen(s)).toBeNull();
    expect(move({ ...s, current: ids[3] ?? null }, 'next-open').current).toBe(ids[3]);
  });

  it('always has a step, because a browser is taken for granted', () => {
    const bare = setNeeds(newSession(), []);
    expect(stepIds(bare).length).toBeGreaterThan(5);
    expect(bare.current).not.toBeNull();
  });

  it('starts from the first step when none is on screen', () => {
    expect(move({ ...newSession(), current: null }, 'next').current).toBe(ids[0]);
    expect(nextOpen(newSession())).toBe(ids[0]);
    expect(nextOpen(newSession(), ids[0] as string)).toBe(ids[1]);
  });
});

describe('validateAnswer', () => {
  it('accepts each result, with or without a note, except a problem with none', () => {
    for (const result of DECISIONS) {
      expect(validateAnswer(result, 'Seen on the home page.', 'en'), result).toEqual([]);
      expect(validateAnswer(result, '', 'en').length, result).toBe(result === 'problem' ? 1 : 0);
    }
  });

  it('asks for a choice', () => {
    expect(validateAnswer('', '', 'en')).toEqual([{ field: 'result', message: 'Choose what you found.' }]);
    expect(validateAnswer('maybe', 'x', 'en').map((e) => e.field)).toEqual(['result']);
    expect(validateAnswer('', '', 'fr')[0]?.message).toBe('Choisissez ce que vous avez constaté.');
  });

  it('asks what was seen when the result is a problem', () => {
    expect(validateAnswer('problem', '   ', 'en')).toEqual([{ field: 'note', message: 'Say what you saw, and on which page.' }]);
    expect(validateAnswer('problem', '', 'fr')[0]?.message).toBe('Dites ce que vous avez vu, et sur quelle page.');
  });

  it('says how long a note is when it is too long', () => {
    expect(validateAnswer('not-sure', 'x'.repeat(MAX_NOTE), 'en')).toEqual([]);
    const [e] = validateAnswer('not-sure', 'x'.repeat(MAX_NOTE + 4), 'en');
    expect(e).toEqual({ field: 'note', message: `The note is ${MAX_NOTE + 4} characters long. Shorten it to ${MAX_NOTE} characters at most.` });
  });

  it('counts the note without the spaces around it', () => {
    expect(validateAnswer('not-sure', ` ${'x'.repeat(MAX_NOTE)} `, 'en')).toEqual([]);
  });

  it('reports the choice before the note', () => {
    expect(validateAnswer('', 'x'.repeat(MAX_NOTE + 1), 'en').map((e) => e.field)).toEqual(['result', 'note']);
  });

  it('writes every message in French with French typography', () => {
    for (const [result, note] of [['', ''], ['problem', ''], ['not-sure', 'x'.repeat(MAX_NOTE + 1)]] as const) {
      for (const e of validateAnswer(result, note, 'fr')) expect(frTypographyIssues(e.message), e.message).toEqual([]);
    }
  });
});

describe('answer and clearAnswer', () => {
  it('saves an answer with its note trimmed, and replaces an earlier one', () => {
    let s = answer(newSession(), '1.3.3', 'problem', '  Seen.  ');
    expect(s.answers['1.3.3']).toEqual({ result: 'problem', note: 'Seen.' });
    s = answer(s, '1.3.3', 'no-problem-found', '');
    expect(s.answers['1.3.3']).toEqual({ result: 'no-problem-found', note: '' });
    expect(Object.keys(s.answers)).toEqual(['1.3.3']);
  });

  it('does not change the session it was given', () => {
    const before = newSession();
    answer(before, '1.3.3', 'problem', 'x');
    expect(before.answers).toEqual({});
  });

  it('erases one answer and leaves the others', () => {
    const s = clearAnswer(worked(), '1.4.4');
    expect(Object.keys(s.answers).sort()).toEqual(['1.3.3', '2.4.3']);
    expect(clearAnswer(s, '9.9.9').answers).toEqual(s.answers);
  });
});

describe('progress', () => {
  it('counts the steps and the answers by result', () => {
    expect(progress(worked())).toEqual({ total: MANUAL_STEPS.length, answered: 3, problem: 1, noProblem: 1, notSure: 1, hidden: 0 });
    expect(progress(newSession())).toMatchObject({ answered: 0, problem: 0, hidden: 0 });
  });

  it('counts apart the answers for steps that no longer show', () => {
    const s = setNeeds(answer(worked(), '1.1.1', 'no-problem-found', ''), []);
    const p = progress(s);
    expect(p.hidden).toBeGreaterThanOrEqual(1);
    expect(p.answered + p.hidden).toBe(4);
  });

  it('says where the session stands in one sentence', () => {
    expect(progressSentence(progress(worked()), 'en')).toBe(`3 of ${MANUAL_STEPS.length} steps looked at: 1 with a problem, 1 with no problem found, 1 not sure.`);
    expect(progressSentence(progress(worked()), 'fr')).toBe(`3 sur ${MANUAL_STEPS.length} étapes regardées${NBSP}: 1 avec un problème, 1 sans problème trouvé, 1 sans certitude.`);
    expect(progressSentence(progress(all()), 'en')).toBe(`0 of ${MANUAL_STEPS.length} steps looked at.`);
    expect(progressSentence({ total: 1, answered: 0, problem: 0, noProblem: 0, notSure: 0, hidden: 0 }, 'en')).toBe('0 of 1 step looked at.');
    expect(progressSentence({ total: 1, answered: 0, problem: 0, noProblem: 0, notSure: 0, hidden: 0 }, 'fr')).toBe('0 sur 1 étape regardée.');
    expect(progressSentence({ total: 0, answered: 0, problem: 0, noProblem: 0, notSure: 0, hidden: 0 }, 'en')).toBe('No step fits what you have at hand.');
  });

  it('counts looks and does not rate the page', () => {
    for (const lang of LANGS) {
      const done = { total: 5, answered: 5, problem: 0, noProblem: 5, notSure: 0, hidden: 0 };
      expect(progressSentence(done, lang)).not.toMatch(/\b(pass(es|ed)?|conforms?|compliant|accessible)\b|conforme|a réussi/i);
      expect(frTypographyIssues(progressSentence(done, 'fr'))).toEqual([]);
    }
  });
});

describe('validateWho', () => {
  it('accepts a handle, initials or a first name', () => {
    for (const who of ['@sam', 'S.K.', 'Sam', '  design lead  ', 'x'.repeat(MAX_WHO)]) expect(validateWho(who, 'en'), who).toBe('');
  });

  it('asks who looked', () => {
    expect(validateWho('', 'en')).toBe('Say who looked. A handle or initials is enough.');
    expect(validateWho('   ', 'fr')).toBe('Indiquez qui a regardé. Un pseudonyme ou des initiales suffisent.');
  });

  it('says how long a name is when it is too long', () => {
    expect(validateWho('x'.repeat(MAX_WHO + 3), 'en')).toBe(`This name is ${MAX_WHO + 3} characters long. Keep it to ${MAX_WHO} at most.`);
  });

  it('turns away an email address or a phone number, and says why', () => {
    expect(validateWho('sam@example.org', 'en')).toContain('looks like an email address or a phone number');
    expect(validateWho('416 555 0199', 'en')).toContain('use a handle or initials');
    expect(validateWho('sam@example.org', 'fr')).toContain('utilisez un pseudonyme ou des initiales');
  });

  it('follows French typography', () => {
    for (const who of ['', 'x'.repeat(MAX_WHO + 1), 'sam@example.org']) expect(frTypographyIssues(validateWho(who, 'fr')), who).toEqual([]);
  });
});

describe('an earlier log', () => {
  it('is read into the session, with the number of notes', () => {
    const read = readEarlier(newSession(), sampleManualLog(), NOW, 'en');
    expect(read.ok && read.count).toBe(3);
    expect(read.ok && read.session.earlier.notes.map((n) => n.sc)).toEqual(['2.4.7', '1.2.2', '2.4.3']);
  });

  it('changes nothing else in the session', () => {
    const before = worked();
    const read = readEarlier(before, sampleManualLog(), NOW, 'en');
    expect(read.ok && read.session.answers).toBe(before.answers);
    expect(read.ok && read.session.current).toBe(before.current);
  });

  it('gives the reason, in the language asked for, when the log cannot be read', () => {
    expect(readEarlier(newSession(), 'not json', NOW, 'en')).toEqual({ ok: false, error: 'The by-hand log is not valid JSON.' });
    expect(readEarlier(newSession(), '{"version":2}', NOW, 'fr')).toMatchObject({ ok: false });
    const future = JSON.stringify({ version: 1, notes: [{ sc: '2.4.7', result: 'not-sure', on: '2027-01-01', by: '@a' }] });
    const read = readEarlier(newSession(), future, NOW, 'en');
    expect(!read.ok && read.error).toContain('after today');
  });

  it('asks for a log when nothing was pasted', () => {
    expect(readEarlier(newSession(), '  \n ', NOW, 'en')).toEqual({ ok: false, error: 'Paste the content of a log first.' });
    expect(readEarlier(newSession(), '', NOW, 'fr')).toEqual({ ok: false, error: 'Collez d’abord le contenu d’un journal.' });
  });

  it('gives the newest earlier note of a criterion', () => {
    const log = JSON.stringify({
      version: 1,
      notes: [
        { sc: '2.4.7', result: 'problem', on: '2026-10-01', by: '@a', note: 'No ring on the search button.' },
        { sc: '2.4.7', result: 'no-problem-found', on: '2026-11-10', by: '@b' },
      ],
    });
    const read = readEarlier(newSession(), log, NOW, 'en');
    if (!read.ok) throw new Error(read.error);
    expect(earlierNote(read.session, '2.4.7')).toMatchObject({ on: '2026-11-10', by: '@b' });
    expect(earlierNote(read.session, '1.4.10')).toBeNull();
  });

  it('describes the earlier look in one line, and says when it is old', () => {
    const log = JSON.stringify({
      version: 1,
      notes: [
        { sc: '2.4.7', result: 'no-problem-found', on: '2026-11-12', by: '@sam', note: 'Light and dark mode.' },
        { sc: '1.4.10', result: 'problem', on: '2026-03-01', by: '@lee', note: 'The table is cut off.' },
      ],
    });
    const read = readEarlier(newSession(), log, NOW, 'en');
    if (!read.ok) throw new Error(read.error);
    expect(earlierLine(read.session, '2.4.7', NOW, 'en')).toBe('Looked on 2026-11-12 by @sam (7 days ago): no problem was found. Light and dark mode.');
    expect(earlierLine(read.session, '1.4.10', NOW, 'en')).toContain('The note is old, and the page may have changed.');
    expect(earlierLine(read.session, '1.4.10', NOW, 'fr')).toContain('Regardé le 2026-03-01 par @lee');
    expect(earlierLine(read.session, '1.3.3', NOW, 'en')).toBe('');
    expect(earlierLine(newSession(), '2.4.7', NOW, 'en')).toBe('');
  });
});

describe('the log of a session', () => {
  it('has one note per saved answer, dated today, by the person, in the order of WCAG', () => {
    const log = exportLog(worked(), NOW);
    expect(log).toEqual({
      version: 1,
      notes: [
        { sc: '1.3.3', result: 'problem', on: '2026-11-19', by: '@sam', note: 'The form says “click the green button”.' },
        { sc: '1.4.4', result: 'no-problem-found', on: '2026-11-19', by: '@sam' },
        { sc: '2.4.3', result: 'not-sure', on: '2026-11-19', by: '@sam', note: 'Focus goes to the map first.' },
      ],
    });
  });

  it('is in the order of WCAG whatever the order of the answers', () => {
    let s: HandSession = { ...all(), who: '@sam' };
    s = answer(s, '4.1.2', 'not-sure', '');
    s = answer(s, '1.1.1', 'not-sure', '');
    s = answer(s, '2.5.8', 'not-sure', '');
    expect(exportLog(s, NOW).notes.map((n) => n.sc)).toEqual(['1.1.1', '2.5.8', '4.1.2']);
  });

  it('keeps the earlier notes as they were, before the new ones', () => {
    const read = readEarlier(worked(), sampleManualLog(), NOW, 'en');
    if (!read.ok) throw new Error(read.error);
    const log = exportLog(read.session, NOW);
    expect(log.notes).toHaveLength(6);
    expect(log.notes.slice(0, 3)).toEqual(read.session.earlier.notes);
    expect(log.notes.slice(3).every((n) => n.on === '2026-11-19' && n.by === '@sam')).toBe(true);
  });

  it('includes answers for steps that no longer show', () => {
    const s = setNeeds(answer(worked(), '1.1.1', 'no-problem-found', ''), []);
    expect(exportLog(s, NOW).notes.map((n) => n.sc)).toContain('1.1.1');
    expect(exportLog(s, NOW).notes).toHaveLength(4);
  });

  it('trims the name', () => {
    expect(exportLog({ ...worked(), who: '  @sam  ' }, NOW).notes[0]?.by).toBe('@sam');
  });

  it('is a file the tool reads back to the same notes', () => {
    const read = readEarlier(worked(), sampleManualLog(), NOW, 'en');
    if (!read.ok) throw new Error(read.error);
    for (const session of [worked(), read.session]) {
      const text = exportText(session, NOW);
      expect(text.endsWith('}\n')).toBe(true);
      const parsed = parseManualLog(text, NOW);
      expect(parsed.ok && parsed.value).toEqual(exportLog(session, NOW));
    }
  });

  it('can be read in again to carry on another day', () => {
    const text = exportText(worked(), NOW);
    const later = readEarlier(newSession(), text, nov(25), 'en');
    expect(later.ok && later.count).toBe(3);
    expect(later.ok && earlierLine(later.session, '1.3.3', nov(25), 'en')).toContain('Looked on 2026-11-19 by @sam (6 days ago): a problem was seen.');
  });

  it('is empty for a session with nothing saved', () => {
    expect(exportLog(newSession(), NOW)).toEqual({ version: 1, notes: [] });
  });

  it('is named after the tool and the day', () => {
    expect(logFileName(NOW)).toBe('narrow-audit.manual-log.2026-11-19.json');
  });
});

describe('summaryText', () => {
  it('lists the answers, problems first, then what the person was not sure of', () => {
    const lines = summaryText(worked(), NOW, 'en').split('\n');
    expect(lines[0]).toBe('Look by hand on 2026-11-19, by @sam');
    expect(lines[1]).toContain('3 of ');
    expect(lines.slice(2, 5)).toEqual([
      '- 1.3.3 Sensory Characteristics (A): I saw a problem. The form says “click the green button”.',
      '- 2.4.3 Focus Order (A): I am not sure. Focus goes to the map first.',
      '- 1.4.4 Resize Text (AA): I found no problem.',
    ]);
  });

  it('always ends by saying what the lines do not say', () => {
    for (const s of [worked(), newSession()]) {
      expect(summaryText(s, NOW, 'en').trimEnd().split('\n').at(-1)).toBe('These lines say what a person looked at and saw. They do not say that the pages conform.');
      expect(summaryText(s, NOW, 'fr')).toContain('Elles ne disent pas que les pages sont conformes.');
    }
  });

  it('says so when nothing has been looked at, and writes UNKNOWN for a missing name', () => {
    const text = summaryText(newSession(), NOW, 'en');
    expect(text).toContain('Look by hand on 2026-11-19, by UNKNOWN');
    expect(text).toContain('No step has been looked at yet.');
    expect(summaryText(newSession(), NOW, 'fr')).toContain('par UNKNOWN');
  });

  it('is in French with French typography, apart from the notes the person wrote', () => {
    const s = answer(answer({ ...all(), who: '@sam' }, '1.3.3', 'problem', 'Le formulaire dit «\u202Fcliquez sur le bouton vert\u202F».'), '1.4.4', 'no-problem-found', '');
    const text = summaryText(s, NOW, 'fr');
    expect(text).toContain(`- 1.4.4 Redimensionnement du texte (AA)${NBSP}: Je n’ai trouvé aucun problème.`);
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('has a label for each result in both languages', () => {
    for (const d of DECISIONS) {
      expect(RESULT_LABELS[d].en).not.toBe('');
      expect(RESULT_LABELS[d].fr).not.toBe(RESULT_LABELS[d].en);
      expect(frTypographyIssues(RESULT_LABELS[d].fr)).toEqual([]);
    }
  });
});
