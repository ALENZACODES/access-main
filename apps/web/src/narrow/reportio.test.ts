import { describe, expect, it } from 'vitest';
import { emptyReport, entry, sampleReport } from './outputs-testkit.js';
import { renderJson, type AuditReport } from './report.js';
import { parseReport, reportProblem } from './reportio.js';

const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(sampleReport())) as Record<string, unknown>;
const routes = (r: Record<string, unknown>): Record<string, unknown>[] => r['routes'] as Record<string, unknown>[];

describe('parseReport', () => {
  it('reads back what renderJson wrote', () => {
    const parsed = parseReport(renderJson(sampleReport()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(sampleReport());
  });
  it('reads an empty report and one with waivers and skipped checks', () => {
    expect(parseReport(renderJson(emptyReport())).ok).toBe(true);
    const full: AuditReport = { ...sampleReport(), waived: [{ route: '/', entry: entry('contrast', 'low', 'fail', 'x'), reason: 'r', expires: '2027-01-31' }], skipped: ['offline'] };
    expect(parseReport(JSON.stringify(full)).ok).toBe(true);
  });
  it('says so in both languages when the text is not JSON', () => {
    const parsed = parseReport('{ not json');
    expect(parsed).toEqual({ ok: false, error: { en: 'The report file is not valid JSON.', fr: 'Le fichier de rapport n’est pas un JSON valide.' } });
  });
  it('names the place of the problem in both languages', () => {
    const r = clone();
    delete routes(r)[1]?.['truncated'];
    const parsed = parseReport(JSON.stringify(r));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.en).toBe('The report file is not a narrow-audit report: $.routes[1].truncated is missing or has the wrong type.');
      expect(parsed.error.fr).toBe('Le fichier de rapport n’est pas un rapport narrow-audit\u00A0: $.routes[1].truncated manque ou a le mauvais type.');
    }
  });
  it('accepts a check id it does not know, which a newer build may have written', () => {
    const r = clone();
    const first = routes(r)[0];
    (first?.['checks'] as Record<string, unknown>[]).push({ check: 'from-the-future', checked: 1, failed: 0, unknown: 1 });
    (first?.['entries'] as Record<string, unknown>[]).push({ check: 'from-the-future', id: 'x', status: 'unknown', message: { en: 'e', fr: 'f' } });
    expect(parseReport(JSON.stringify(r)).ok).toBe(true);
  });
});

describe('reportProblem', () => {
  it('is null for a good report', () => {
    expect(reportProblem(clone())).toBeNull();
  });
  it.each([null, 'text', 12, [], true])('gives $ for %s', (raw) => {
    expect(reportProblem(raw)).toBe('$');
  });
  const broken: ReadonlyArray<readonly [string, (r: Record<string, unknown>) => void, string]> = [
    ['no date', (r) => delete r['generatedAt'], '$.generatedAt'],
    ['a date that is not one', (r) => (r['generatedAt'] = 'yesterday'), '$.generatedAt'],
    ['no tool', (r) => delete r['tool'], '$.tool'],
    ['a tool with no version', (r) => (r['tool'] = { name: 'x' }), '$.tool'],
    ['a scope note in one language', (r) => (r['scopeNote'] = { en: 'x' }), '$.scopeNote'],
    ['references that are not a list', (r) => (r['references'] = {}), '$.references'],
    ['a reference with no url', (r) => (r['references'] = [{ id: 'a', title: 'b', date: 'c' }]), '$.references[0]'],
    ['routes that are not a list', (r) => (r['routes'] = 'none'), '$.routes'],
    ['a route that is not an object', (r) => (routes(r)[0] = 3 as unknown as Record<string, unknown>), '$.routes[0]'],
    ['a route with no name', (r) => delete routes(r)[0]?.['route'], '$.routes[0].route'],
    ['a viewport that is text', (r) => ((routes(r)[0] ?? {})['viewportWidth'] = '320'), '$.routes[0].viewportWidth'],
    ['a negative unmeasured count', (r) => ((routes(r)[0] ?? {})['unmeasured'] = -1), '$.routes[0].unmeasured'],
    ['checks that are not a list', (r) => ((routes(r)[2] ?? {})['checks'] = null), '$.routes[2].checks'],
    ['a check with a fractional count', (r) => (((routes(r)[0] ?? {})['checks'] as Record<string, unknown>[])[1] = { check: 'contrast', checked: 1.5, failed: 0, unknown: 0 }), '$.routes[0].checks[1]'],
    ['a check with no id', (r) => (((routes(r)[0] ?? {})['checks'] as Record<string, unknown>[])[0] = { check: '', checked: 1, failed: 0, unknown: 0 }), '$.routes[0].checks[0]'],
    ['entries that are not a list', (r) => ((routes(r)[0] ?? {})['entries'] = {}), '$.routes[0].entries'],
    ['an entry with another status', (r) => ((((routes(r)[0] ?? {})['entries'] as Record<string, unknown>[])[2] ?? {})['status'] = 'pass'), '$.routes[0].entries[2].status'],
    ['an entry with a message in one language', (r) => ((((routes(r)[0] ?? {})['entries'] as Record<string, unknown>[])[0] ?? {})['message'] = { en: 'x' }), '$.routes[0].entries[0].message'],
    ['an entry with a rule that is a number', (r) => ((((routes(r)[1] ?? {})['entries'] as Record<string, unknown>[])[0] ?? {})['rule'] = 4), '$.routes[1].entries[0].rule'],
    ['an entry with no id', (r) => delete (((routes(r)[0] ?? {})['entries'] as Record<string, unknown>[])[0] ?? {})['id'], '$.routes[0].entries[0].id'],
    ['an entry with no check', (r) => delete (((routes(r)[0] ?? {})['entries'] as Record<string, unknown>[])[0] ?? {})['check'], '$.routes[0].entries[0].check'],
    ['waived that is not a list', (r) => (r['waived'] = 'x'), '$.waived'],
    ['a waiver with no reason', (r) => (r['waived'] = [{ route: '/', expires: '2027-01-01', entry: { check: 'contrast', id: 'x', status: 'fail', message: { en: 'e', fr: 'f' } } }]), '$.waived[0]'],
    ['a waiver with a broken entry', (r) => (r['waived'] = [{ route: '/', reason: 'r', expires: '2027-01-01', entry: { check: 'contrast' } }]), '$.waived[0]'],
    ['skipped with a number in it', (r) => (r['skipped'] = ['offline', 3]), '$.skipped'],
  ];
  it.each(broken)('finds %s', (_name, breakIt, place) => {
    const r = clone();
    breakIt(r);
    expect(reportProblem(r)).toBe(place);
  });
  it('reports the first problem only', () => {
    const r = clone();
    delete r['tool'];
    delete r['routes'];
    expect(reportProblem(r)).toBe('$.tool');
  });
});
