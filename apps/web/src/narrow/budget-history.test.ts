import { describe, expect, it } from 'vitest';
import { applyBudget, auditBudget, countByCheck, describeBudget, parseBudget, ratchet, type Budget } from './budget.js';
import { appendRun, describeTrend, DEFAULT_HISTORY_MAX, EMPTY_HISTORY, parseHistory, summarise, trend, type History } from './history.js';
import { frTypographyIssues } from './i18n.js';
import { auditParity, controlKey, controlKeys } from './parity.js';
import { buildRouteAudit, makeReport, totals } from './report.js';
import { t, type Entry } from './types.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const e = (check: Entry['check'], id: string, status: Entry['status'] = 'fail'): Entry => ({ check, id, status, message: t('m', 'm') });

function report(fails = 2, unknowns = 1, at = NOW) {
  return makeReport(
    [
      buildRouteAudit('/a', 320, {
        contrast: { checked: 5, entries: [...Array.from({ length: fails }, (_, i) => e('contrast', `p${i}`)), ...Array.from({ length: unknowns }, (_, i) => e('contrast', `u${i}`, 'unknown'))] },
        'target-size': { checked: 3, entries: [e('target-size', 'b0')] },
      }),
      buildRouteAudit('/b', 320, { contrast: { checked: 2, entries: [e('contrast', 'x')] } }),
    ],
    at,
  );
}

describe('countByCheck', () => {
  it('sums failures and unknowns over all routes', () => {
    expect(countByCheck(report())).toEqual({ contrast: { fail: 3, unknown: 1 }, 'target-size': { fail: 1, unknown: 0 } });
  });
});

const B = (checks: Budget['checks']): Budget => ({ version: 1, checks });

describe('auditBudget', () => {
  it('passes when every count is within its limit', () => {
    const r = auditBudget(report(), B({ contrast: { fail: 3, unknown: 1 }, 'target-size': { fail: 1, unknown: 0 } }));
    expect(r.entries).toEqual([]);
    expect(r.checked).toBeGreaterThan(20);
  });
  it('fails a check over its failure limit and names both numbers', () => {
    const r = auditBudget(report(), B({ contrast: { fail: 2, unknown: 1 }, 'target-size': { fail: 1, unknown: 0 } }));
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ check: 'budget', id: 'contrast', status: 'fail', rule: 'over-fail' });
    expect(r.entries[0]?.message.en).toContain('3 failures');
    expect(r.entries[0]?.message.en).toContain('allows 2');
  });
  it('fails when unknowns grew, because something stopped being measured', () => {
    const r = auditBudget(report(), B({ contrast: { fail: 3, unknown: 0 }, 'target-size': { fail: 1, unknown: 0 } }));
    expect(r.entries[0]).toMatchObject({ rule: 'unknown-grew', status: 'fail' });
  });
  it('a check that is not in the budget has a limit of zero', () => {
    const r = auditBudget(report(), B({ contrast: { fail: 3, unknown: 1 } }));
    expect(r.entries.map((x) => x.id)).toEqual(['target-size']);
  });
  it('French messages follow the typography rules', () => {
    for (const x of auditBudget(report(), B({})).entries) expect(frTypographyIssues(x.message.fr), x.message.fr).toEqual([]);
  });
  it('applyBudget adds a budget route and its failures count in the totals', () => {
    const before = totals(report().routes).failed;
    const r = applyBudget(report(), B({}));
    expect(r.routes.at(-1)?.route).toBe('budget');
    expect(totals(r.routes).failed).toBeGreaterThan(before);
    expect(r.generatedAt).toBe(report().generatedAt);
    const ok = applyBudget(report(), B({ contrast: { fail: 3, unknown: 1 }, 'target-size': { fail: 1, unknown: 0 } }));
    expect(totals(ok.routes).failed).toBe(before);
  });
});

describe('ratchet', () => {
  it('starts from today when there is no budget', () => {
    expect(ratchet(report(), null)).toEqual(B({ contrast: { fail: 3, unknown: 1 }, 'target-size': { fail: 1, unknown: 0 } }));
  });
  it('lowers a limit that is now higher than the count', () => {
    const r = ratchet(report(0, 0), B({ contrast: { fail: 9, unknown: 4 } }));
    expect(r.checks.contrast).toEqual({ fail: 1, unknown: 0 });
  });
  it('never raises a limit, even when the count went up', () => {
    const r = ratchet(report(5, 3), B({ contrast: { fail: 2, unknown: 1 } }));
    expect(r.checks.contrast).toEqual({ fail: 2, unknown: 1 });
  });
  it('keeps a listed check at zero and does not list checks that were never there', () => {
    const r = ratchet(report(), B({ language: { fail: 0, unknown: 0 } }));
    expect(r.checks.language).toEqual({ fail: 0, unknown: 0 });
    expect(r.checks.reflow).toBeUndefined();
  });
  it('is a fixed point: the new budget passes the same report', () => {
    const rep = report();
    expect(auditBudget(rep, ratchet(rep, null)).entries).toEqual([]);
  });
});

describe('parseBudget', () => {
  it('reads a good file', () => {
    expect(parseBudget(JSON.stringify(B({ contrast: { fail: 1, unknown: 2 } })))).toEqual({ ok: true, value: B({ contrast: { fail: 1, unknown: 2 } }) });
  });
  it.each([
    ['not json', '{'],
    ['wrong version', '{"version":2,"checks":{}}'],
    ['no checks', '{"version":1}'],
    ['checks is a list', '{"version":1,"checks":[]}'],
    ['unknown check', '{"version":1,"checks":{"nope":{"fail":0,"unknown":0}}}'],
    ['negative number', '{"version":1,"checks":{"contrast":{"fail":-1,"unknown":0}}}'],
    ['fraction', '{"version":1,"checks":{"contrast":{"fail":0.5,"unknown":0}}}'],
    ['missing field', '{"version":1,"checks":{"contrast":{"fail":1}}}'],
  ])('rejects %s in both languages', (_n, text) => {
    const p = parseBudget(text);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.error.en.length).toBeGreaterThan(5);
      expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
  });
  it('describeBudget shows used over allowed', () => {
    const txt = describeBudget(report(), B({ contrast: { fail: 4, unknown: 1 } }), 'en');
    expect(txt).toContain('Text contrast: 3/4 failures, 1/1 unknown');
    expect(frTypographyIssues(describeBudget(report(), B({}), 'fr'))).toEqual([]);
  });
});

describe('history', () => {
  it('summarises a run with counts only', () => {
    const s = summarise(report());
    expect(s).toMatchObject({ at: NOW.toISOString(), routes: 2, failed: 4, unknown: 1 });
    expect(s.checks.contrast).toEqual({ failed: 3, unknown: 1 });
    expect(JSON.stringify(s)).not.toContain('p0');
  });
  it('appends runs, replaces one with the same time, and keeps the newest', () => {
    let h: History = EMPTY_HISTORY;
    for (let i = 0; i < 5; i++) h = appendRun(h, report(i, 0, new Date(Date.UTC(2026, 10, 10 + i))), 3);
    expect(h.runs).toHaveLength(3);
    expect(h.runs[0]?.at).toBe('2026-11-12T00:00:00.000Z');
    const again = appendRun(h, report(9, 0, new Date(Date.UTC(2026, 10, 14))), 3);
    expect(again.runs).toHaveLength(3);
    expect(again.runs.at(-1)?.failed).toBe(11);
    expect(DEFAULT_HISTORY_MAX).toBe(100);
  });
  it('a limit under 1 still keeps the latest run', () => {
    expect(appendRun(EMPTY_HISTORY, report(), 0).runs).toHaveLength(1);
  });
  it('trend compares the last two runs and names checks that got worse or better', () => {
    let h = appendRun(EMPTY_HISTORY, report(1, 0, new Date('2026-11-10T00:00:00Z')));
    h = appendRun(h, makeReport([buildRouteAudit('/a', 320, { contrast: { checked: 1, entries: [e('contrast', 'a'), e('contrast', 'b'), e('contrast', 'c')] }, language: { checked: 1, entries: [] } })], NOW));
    const tr = trend(h);
    expect(tr?.failedDelta).toBe(0);
    expect(tr?.worse).toEqual(['contrast']);
    expect(tr?.better).toEqual(['target-size']);
  });
  it('trend of nothing is null and of one run has no previous', () => {
    expect(trend(EMPTY_HISTORY)).toBeNull();
    expect(trend(appendRun(EMPTY_HISTORY, report()))?.previous).toBeNull();
  });
  it('describes the trend in both languages with correct French spacing', () => {
    let h = appendRun(EMPTY_HISTORY, report(1, 0, new Date('2026-11-10T00:00:00Z')));
    expect(describeTrend(trend(h), 'en')).toContain('First run recorded: 3 failures');
    h = appendRun(h, report(4, 2));
    const en = describeTrend(trend(h), 'en');
    expect(en).toContain('Since 2026-11-10: failures 6 (+3), unknown 2 (+2).');
    expect(en).toContain('More failures: Text contrast');
    const fr = describeTrend(trend(h), 'fr');
    expect(fr).toContain('Depuis le 2026-11-10\u00A0:');
    expect(frTypographyIssues(fr), fr).toEqual([]);
    expect(describeTrend(null, 'fr')).toBe('Aucun historique.');
  });
  it('parseHistory round-trips and rejects broken files', () => {
    const h = appendRun(EMPTY_HISTORY, report());
    expect(parseHistory(JSON.stringify(h))).toEqual({ ok: true, value: h });
    for (const text of ['{', '[]', '{"version":1}', '{"version":1,"runs":[{"at":"x"}]}', '{"version":1,"runs":[null]}']) {
      const p = parseHistory(text);
      expect(p.ok, text).toBe(false);
      if (!p.ok) expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
  });
});

describe('parity', () => {
  const c = (tag: string, name: string) => ({ tag, name, text: '' });
  it('builds keys from the tag and the name, once each, skipping unnamed controls', () => {
    expect(controlKeys([c('BUTTON', 'Search'), c('button', ' search '), c('a', ''), { tag: 'a', name: '', text: 'Home' }])).toEqual(['button|search', 'a|home']);
    expect(controlKey(c('A', 'X'))).toBe('a|x');
  });
  const view = (profile: string, ...names: string[]) => ({ profile, keys: names.map((n) => `button|${n}`) });
  it('passes when every view has the same controls, and ignores extra ones', () => {
    expect(auditParity([view('narrow', 'a', 'b'), view('landscape', 'a', 'b', 'c')]).entries).toEqual([]);
  });
  it('is unknown for a control missing in landscape, and says why it matters', () => {
    const r = auditParity([view('narrow', 'a', 'b'), view('landscape', 'a')]);
    expect(r.entries).toEqual([expect.objectContaining({ check: 'parity', id: 'landscape', status: 'unknown', rule: 'landscape-missing' })]);
    expect(r.entries[0]?.message.en).toContain('how the device is held');
    expect(r.checked).toBe(2);
  });
  it('uses a different rule for other views and lists at most three controls', () => {
    const r = auditParity([view('narrow', 'a', 'b', 'c', 'd', 'e'), view('dark')]);
    expect(r.entries[0]?.rule).toBe('view-missing');
    expect(r.entries[0]?.message.en).toContain('5 control(s)');
    expect(r.entries[0]?.message.en).toContain('+2');
    expect(frTypographyIssues(r.entries[0]?.message.fr ?? ''), r.entries[0]?.message.fr).toEqual([]);
  });
  it('compares every later view with the first, one entry each', () => {
    const r = auditParity([view('narrow', 'a'), view('landscape'), view('dark')]);
    expect(r.entries.map((x) => x.id)).toEqual(['landscape', 'dark']);
  });
  it('needs two views', () => {
    expect(auditParity([view('narrow', 'a')])).toEqual({ checked: 1, entries: [] });
    expect(auditParity([])).toEqual({ checked: 0, entries: [] });
  });
});
