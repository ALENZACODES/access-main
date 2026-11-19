import { describe, expect, it } from 'vitest';
import { coverageForReport, renderCoverageMarkdown } from './coverage.js';
import { found, reportOf, route } from './report-fixtures.js';
import { frTypographyIssues } from './i18n.js';
import { EMPTY_MANUAL_LOG, applyManualLog, describeLook, describeManualLog, describeNextLooks, latestNotes, nextLooks, parseManualLog, sampleManualLog, summariseManual, type ManualLog, type ManualNote } from './manual-log.js';
import { nov, smallSite } from './report-fixtures.js';
import { DEFAULT_MAX_AGE_DAYS } from './review.js';
import { renderWorksheet, worksheetItems } from './worksheet.js';

const NOW = nov(19);
const text = (value: unknown): string => JSON.stringify(value);
const note = (sc: string, result: ManualNote['result'], on: string, extra: Partial<ManualNote> = {}): ManualNote => ({ sc, result, on, by: '@sam', ...(result === 'problem' ? { note: 'Seen on the home page.' } : {}), ...extra });
const logOf = (...notes: ManualNote[]): ManualLog => ({ version: 1, notes });
const rows = coverageForReport(smallSite());
const apply = (log: ManualLog, now = NOW, maxAge?: number) => applyManualLog(rows, log, now, maxAge);
const rowFor = (applied: ReturnType<typeof apply>, sc: string) => {
  const m = applied.find((x) => x.row.criterion.sc === sc);
  if (!m) throw new Error(sc);
  return m;
};

describe('parseManualLog', () => {
  it('reads the sample log', () => {
    const parsed = parseManualLog(sampleManualLog(), NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.notes.map((n) => [n.sc, n.result])).toEqual([['2.4.7', 'no-problem-found'], ['1.2.2', 'problem'], ['2.4.3', 'not-sure']]);
  });

  it('trims text and drops an empty note', () => {
    const parsed = parseManualLog(text({ version: 1, notes: [{ sc: ' 2.4.7 ', result: 'no-problem-found', on: '2026-11-12', by: '  @sam ', note: '   ' }] }), NOW);
    expect(parsed).toEqual({ ok: true, value: { version: 1, notes: [{ sc: '2.4.7', result: 'no-problem-found', on: '2026-11-12', by: '@sam' }] } });
  });

  it('accepts an empty list of notes and a note dated today', () => {
    expect(parseManualLog(text(EMPTY_MANUAL_LOG), NOW)).toEqual({ ok: true, value: EMPTY_MANUAL_LOG });
    expect(parseManualLog(text(logOf(note('2.4.7', 'not-sure', '2026-11-19'))), NOW).ok).toBe(true);
  });

  const base = { sc: '2.4.7', result: 'no-problem-found', on: '2026-11-12', by: '@sam' };
  it.each([
    ['nope', 'not valid JSON', 'n’est pas du JSON valide'],
    [text({ version: 2, notes: [] }), 'needs "version": 1 and a "notes" list', 'demande "version": 1 et une liste "notes"'],
    [text({ version: 1 }), 'needs "version": 1 and a "notes" list', 'demande "version": 1'],
    [text({ version: 1, notes: ['x'] }), 'By-hand log, note 1: it must be an object.', 'note 1\u00A0: elle doit être un objet.'],
    [text({ version: 1, notes: [{ ...base, passed: true }] }), 'the key "passed" is not known', 'la clé "passed" n’est pas reconnue'],
    [text({ version: 1, notes: [{ ...base, sc: '4.1.1' }] }), '"sc" must be the number of a Level A or AA criterion', '"sc" doit être le numéro d’un critère'],
    [text({ version: 1, notes: [{ ...base, sc: '1.4.8' }] }), '"sc" must be the number of a Level A or AA criterion', '"sc" doit être le numéro d’un critère'],
    [text({ version: 1, notes: [{ ...base, sc: 247 }] }), '"sc" must be the number', '"sc" doit être le numéro'],
    [text({ version: 1, notes: [{ ...base, result: 'pass' }] }), '"result" must be one of: problem, no-problem-found, not-sure.', '"result" doit valoir l’une de ces valeurs\u00A0: problem, no-problem-found, not-sure.'],
    [text({ version: 1, notes: [{ ...base, on: '12/11/2026' }] }), '"on" must be a real date written YYYY-MM-DD.', '"on" doit être une date réelle écrite AAAA-MM-JJ.'],
    [text({ version: 1, notes: [{ ...base, on: '2026-02-30' }] }), '"on" must be a real date', '"on" doit être une date réelle'],
    [text({ version: 1, notes: [{ ...base, on: '2026-11-20' }] }), '"on" is 2026-11-20, which is after today.', '"on" vaut 2026-11-20, une date postérieure à aujourd’hui.'],
    [text({ version: 1, notes: [{ ...base, by: ' ' }] }), '"by" must say who looked.', '"by" doit dire qui a regardé.'],
    [text({ version: 1, notes: [{ ...base, note: 3 }] }), '"note" must be text.', '"note" doit être du texte.'],
    [text({ version: 1, notes: [base, { ...base, result: 'problem' }] }), 'By-hand log, note 2: a note with the result "problem" needs a "note"', 'note 2\u00A0: une note dont le résultat est "problem" demande un champ "note"'],
  ])('refuses %s', (input, en, fr) => {
    const parsed = parseManualLog(input, NOW);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toContain(en);
    expect(parsed.error.fr).toContain(fr);
    expect(frTypographyIssues(parsed.error.fr), parsed.error.fr).toEqual([]);
  });

  it('has no result that reads as a pass', () => {
    expect(parseManualLog(text({ version: 1, notes: [{ ...base, result: 'ok' }] }), NOW).ok).toBe(false);
    expect(parseManualLog(text({ version: 1, notes: [{ ...base, result: 'conforms' }] }), NOW).ok).toBe(false);
  });
});

describe('latestNotes', () => {
  it('keeps the newest note for each criterion, whatever the order of the file', () => {
    const latest = latestNotes(logOf(note('2.4.7', 'problem', '2026-11-10'), note('2.4.7', 'no-problem-found', '2026-11-01'), note('1.2.2', 'not-sure', '2026-10-01')));
    expect(latest.get('2.4.7')?.on).toBe('2026-11-10');
    expect(latest.size).toBe(2);
  });

  it('takes the later one in the file for two notes of the same day', () => {
    const latest = latestNotes(logOf(note('2.4.7', 'problem', '2026-11-10'), note('2.4.7', 'no-problem-found', '2026-11-10')));
    expect(latest.get('2.4.7')?.result).toBe('no-problem-found');
  });
});

describe('applyManualLog', () => {
  it('gives every criterion a row, and never for the ones with no note', () => {
    const applied = apply(EMPTY_MANUAL_LOG);
    expect(applied).toHaveLength(55);
    expect(applied.every((m) => m.state === 'never' && m.note === null && m.days === null)).toBe(true);
  });

  it('counts the days since a note and calls it looked within the limit', () => {
    expect(rowFor(apply(logOf(note('2.4.7', 'no-problem-found', '2026-11-12'))), '2.4.7')).toMatchObject({ state: 'looked', days: 7, note: { by: '@sam' } });
  });

  it('calls a note stale one day after the limit, not on the limit', () => {
    const log = logOf(note('2.4.7', 'no-problem-found', '2026-05-23'), note('1.2.2', 'not-sure', '2026-05-22'));
    const applied = apply(log);
    expect(rowFor(applied, '2.4.7')).toMatchObject({ state: 'looked', days: DEFAULT_MAX_AGE_DAYS });
    expect(rowFor(applied, '1.2.2')).toMatchObject({ state: 'stale', days: DEFAULT_MAX_AGE_DAYS + 1 });
  });

  it('takes the limit from the caller', () => {
    expect(rowFor(apply(logOf(note('2.4.7', 'no-problem-found', '2026-11-12')), NOW, 5), '2.4.7').state).toBe('stale');
  });
});

describe('summariseManual', () => {
  const log = logOf(note('2.4.7', 'no-problem-found', '2026-11-12'), note('1.2.2', 'problem', '2026-11-12'), note('2.4.3', 'not-sure', '2026-11-12'), note('1.2.1', 'no-problem-found', '2025-01-01'));

  it('counts looks by state and recent notes by result', () => {
    expect(summariseManual(apply(log))).toMatchObject({ looked: 3, stale: 1, never: 51, problems: 1, noProblemFound: 1, notSure: 1 });
  });

  it('counts the criteria nothing and nobody has looked at', () => {
    const byHand = rows.filter((r) => r.kind === 'by-hand').length;
    expect(summariseManual(apply(EMPTY_MANUAL_LOG)).unseen).toBe(byHand);
    expect(summariseManual(apply(logOf(note('1.2.5', 'no-problem-found', '2026-11-12')))).unseen).toBe(byHand - 1);
    expect(summariseManual(apply(logOf(note('1.2.5', 'no-problem-found', '2025-01-01')))).unseen).toBe(byHand);
  });
});

describe('describeLook', () => {
  const applied = apply(logOf(note('2.4.7', 'no-problem-found', '2026-11-18', { note: 'Light and dark.' }), note('1.2.2', 'problem', '2026-11-12'), note('1.2.1', 'not-sure', '2025-01-01')));

  it('says who looked, when and what they saw', () => {
    expect(describeLook(rowFor(applied, '2.4.7'), 'en')).toBe('Looked on 2026-11-18 by @sam (1 day ago): no problem was found. Light and dark.');
    expect(describeLook(rowFor(applied, '1.2.2'), 'en')).toBe('Looked on 2026-11-12 by @sam (7 days ago): a problem was seen. Seen on the home page.');
  });

  it('says so when the note is old', () => {
    expect(describeLook(rowFor(applied, '1.2.1'), 'en')).toMatch(/^Looked on 2025-01-01 by @sam \(\d+ days ago\): the person was not sure\. The note is old, and the page may have changed\.$/);
  });

  it('says so when there is no note', () => {
    expect(describeLook(rowFor(applied, '1.1.1'), 'en')).toBe('No by-hand note in the log.');
    expect(describeLook(rowFor(applied, '1.1.1'), 'fr')).toBe('Aucune note à la main dans le journal.');
  });

  it('writes French with French typography', () => {
    const fr = describeLook(rowFor(applied, '2.4.7'), 'fr');
    expect(fr).toBe('Regardé le 2026-11-18 par @sam (il y a 1 jour)\u00A0: aucun problème n’a été trouvé. Light and dark.');
    expect(frTypographyIssues(describeLook(rowFor(applied, '1.2.1'), 'fr'))).toEqual([]);
  });
});

describe('describeManualLog', () => {
  const applied = apply(logOf(note('2.4.7', 'no-problem-found', '2026-11-12'), note('1.2.2', 'problem', '2026-11-12'), note('2.4.3', 'not-sure', '2026-11-12')));

  it('counts the looks and lists the problems seen', () => {
    const out = describeManualLog(applied, 'en');
    expect(out).toContain('By-hand looks: 3 of 55 criteria have a recent note, 0 an old note, 52 no note.');
    expect(out).toContain('  Among the recent notes: 1 with a problem seen, 1 with no problem found, 1 not sure.');
    expect(out).toContain('  1.2.2 Captions (Prerecorded): Looked on 2026-11-12 by @sam (7 days ago): a problem was seen. Seen on the home page.');
  });

  it('names the criteria nothing and nobody has looked at', () => {
    const out = describeManualLog(applied, 'en');
    expect(out).toMatch(/ {2}\d+ criteria have neither an automated check nor a recent note: 1\.2\.1, /);
    expect(out).not.toMatch(/recent note: [^\n]*1\.2\.2[,\n]/);
  });

  it('always says what no problem found does not mean', () => {
    expect(describeManualLog(applied, 'en')).toContain('“No problem found” is what one person saw that day on the pages they looked at. It is not a conformance statement.');
    expect(describeManualLog(apply(EMPTY_MANUAL_LOG), 'fr')).toContain('Ce n’est pas une déclaration de conformité.');
  });

  it('cuts a long list of problems', () => {
    const many = apply(logOf(...['1.1.1', '1.2.1', '1.2.2', '1.2.3'].map((sc) => note(sc, 'problem', '2026-11-12'))));
    expect(describeManualLog(many, 'en', 3)).toContain('  … and 1 more.');
  });

  it('writes French with French typography', () => {
    const out = describeManualLog(applied, 'fr');
    expect(out).toContain('Contrôles à la main\u00A0: 3 critères sur 55 ont une note récente, 0 une note ancienne, 52 aucune note.');
    for (const line of out.split('\n').filter((l) => !l.includes('Seen on'))) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('never words a look as a pass', () => {
    for (const lang of ['en', 'fr'] as const) expect(describeManualLog(applied, lang)).not.toMatch(/\bpass(es|ed)?\b|compliant|\bverif|vérif|a réussi/i);
  });
});

describe('the worksheet with a by-hand log', () => {
  const log = logOf(note('2.4.7', 'no-problem-found', '2026-11-12'), note('1.2.2', 'problem', '2026-11-12'));

  it('adds the newest note to each block', () => {
    const items = worksheetItems(smallSite(), 'en', { manual: { log, now: NOW } });
    expect(items.find((i) => i.sc === '2.4.7')?.manual).toMatchObject({ state: 'looked', days: 7 });
    expect(items.find((i) => i.sc === '1.1.1')?.manual).toMatchObject({ state: 'never' });
    const html = renderWorksheet(smallSite(), 'en', { manual: { log, now: NOW } });
    expect(html).toContain('<dt>By hand, from the log</dt><dd>Looked on 2026-11-12 by @sam (7 days ago): no problem was found.</dd>');
    expect(html).toContain('<dt>By hand, from the log</dt><dd>No by-hand note in the log.</dd>');
    expect(html.match(/<dt>By hand, from the log<\/dt>/g)).toHaveLength(55);
  });

  it('leaves the line out without a log', () => {
    expect(renderWorksheet(smallSite(), 'en')).not.toContain('By hand, from the log');
    expect(worksheetItems(smallSite(), 'en')[0]?.manual).toBeUndefined();
  });

  it('escapes what a person wrote in a note', () => {
    const nasty = logOf(note('2.4.7', 'problem', '2026-11-12', { note: '<script>alert(1)</script>', by: '<b>sam</b>' }));
    const html = renderWorksheet(smallSite(), 'fr', { manual: { log: nasty, now: NOW } });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>sam</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('nextLooks', () => {
  it('leaves out the criteria with a recent note', () => {
    const todo = nextLooks(apply(logOf(note('1.2.1', 'no-problem-found', '2026-11-12'), note('1.4.3', 'not-sure', '2026-11-12'))));
    expect(todo).toHaveLength(53);
    expect(todo.map((m) => m.row.criterion.sc)).not.toContain('1.2.1');
    expect(todo.map((m) => m.row.criterion.sc)).not.toContain('1.4.3');
  });

  it('puts the criteria with no check first, then those whose checks did not run, then the rest', () => {
    const todo = nextLooks(apply(EMPTY_MANUAL_LOG));
    const kinds = todo.map((m) => (m.row.kind === 'by-hand' ? 0 : m.row.state === 'not-run' ? 1 : 2));
    expect([...kinds].sort((a, b) => a - b)).toEqual(kinds);
    expect(todo[0]?.row.criterion.sc).toBe('1.2.1');
    expect(todo[todo.length - 1]?.row.state).not.toBe('not-run');
  });

  it('puts a criterion never looked at before one with an old note, within a group', () => {
    const todo = nextLooks(apply(logOf(note('1.2.1', 'no-problem-found', '2025-01-01'))));
    const byHand = todo.filter((m) => m.row.kind === 'by-hand').map((m) => m.row.criterion.sc);
    expect(byHand[0]).toBe('1.2.3');
    expect(byHand[byHand.length - 1]).toBe('1.2.1');
  });

  it('keeps the order of WCAG otherwise, and gives nothing when every criterion has a recent note', () => {
    const everything = logOf(...rows.map((r) => note(r.criterion.sc, 'not-sure', '2026-11-12')));
    expect(nextLooks(apply(everything))).toEqual([]);
    expect(describeNextLooks(apply(everything), 'en')).toBe('');
  });
});

describe('describeNextLooks', () => {
  it('lists the first criteria with the reason and the by-hand step', () => {
    const out = describeNextLooks(apply(EMPTY_MANUAL_LOG), 'en', 2);
    expect(out).toBe(
      'To look at by hand next: 2 of 55 criteria with no recent note\n' +
        '  1.2.1 Audio-only and Video-only (Prerecorded) (no automated check)\n    Find each recording that is only sound or only picture.\n' +
        '  1.2.3 Audio Description or Media Alternative (Prerecorded) (no automated check)\n    Play each recorded video without looking at the picture.\n',
    );
  });

  it('says why for a criterion whose checks did not run, and for one whose checks ran', () => {
    const out = describeNextLooks(apply(EMPTY_MANUAL_LOG), 'en', 55);
    expect(out).toContain('  2.5.8 Target Size (Minimum) (checks not run in this report)');
    expect(out).toContain('  1.4.3 Contrast (Minimum) (the checks look at part of it only)');
  });

  it('gives the date of an old note', () => {
    const out = describeNextLooks(apply(logOf(note('1.2.1', 'no-problem-found', '2025-01-01'))), 'en', 55);
    expect(out).toContain('  1.2.1 Audio-only and Video-only (Prerecorded) (no automated check, last note on 2025-01-01)');
  });

  it('writes French with French typography', () => {
    const out = describeNextLooks(apply(logOf(note('1.2.1', 'no-problem-found', '2025-01-01'))), 'fr', 55);
    expect(out).toContain('À regarder à la main ensuite\u00A0: 55 sur 55 critères sans note récente');
    expect(out).toContain('(aucun contrôle automatisé, dernière note le 2025-01-01)');
    expect(out).toContain('(contrôles non exécutés dans ce rapport)');
    for (const line of out.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('shows at least one criterion', () => {
    expect(describeNextLooks(apply(EMPTY_MANUAL_LOG), 'en', 0).split('\n')).toHaveLength(4);
  });
});

describe('the coverage table with a by-hand column', () => {
  const applied = apply(logOf(note('2.4.7', 'no-problem-found', '2026-11-12', { note: 'Light | dark' })));
  const byHand = new Map(applied.map((m) => [m.row.criterion.sc, describeLook(m, 'en')]));

  it('adds a last column with the newest note for each criterion', () => {
    const md = renderCoverageMarkdown('en', smallSite(), byHand);
    expect(md).toContain('| Criterion | Level | Related checks | In this report | By hand |');
    expect(md).toContain('| checks not run | Looked on 2026-11-12 by @sam (7 days ago): no problem was found. Light \\| dark |');
    expect(md).toContain('| by hand only | No by-hand note in the log. |');
  });

  it('keeps every row at the same number of cells', () => {
    const md = renderCoverageMarkdown('fr', smallSite(), byHand);
    expect(md).toContain('| À la main |');
    const tableRows = md.split('\n').filter((l) => l.startsWith('|'));
    expect(tableRows).toHaveLength(57);
    expect(new Set(tableRows.map((l) => l.split(/(?<!\\)\|/).length)).size).toBe(1);
  });

  it('leaves the column out without a log, and an empty cell for a criterion the map does not hold', () => {
    expect(renderCoverageMarkdown('en', smallSite())).not.toContain('By hand |');
    const md = renderCoverageMarkdown('en', reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', 'p')] } })]), new Map([['1.4.3', 'Seen.']]));
    expect(md).toContain('| something found: 1 to fix, 0 UNKNOWN | Seen. |');
    expect(md).toContain('| by hand only |  |');
  });
});
