import { describe, expect, it } from 'vitest';
import { applyWaivers } from './ci.js';
import { applyBudget, ratchet, type Budget } from './budget.js';
import { frTypographyIssues } from './i18n.js';
import { buildRouteAudit, makeReport, renderBody, renderHtml, renderText, totals, type AuditReport } from './report.js';
import { describeSkipped, FIXED_CHECKS, parseCheckIds, selectChecks, skippedChecks } from './select.js';
import { lintHtml } from './htmllint.js';
import { CHECK_ORDER, type Entry } from './types.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const e = (check: Entry['check'], status: Entry['status'], id = 'x'): Entry => ({ check, id, status, message: { en: 'm', fr: 'm' } });

function sample(): AuditReport {
  return makeReport(
    [
      buildRouteAudit('/a', 320, {
        contrast: { checked: 5, entries: [e('contrast', 'fail')] },
        forms: { checked: 2, entries: [e('forms', 'unknown')] },
        media: { checked: 1, entries: [] },
      }),
      buildRouteAudit('strings', null, { contrast: { checked: 1, entries: [] } }),
    ],
    NOW,
  );
}

describe('parseCheckIds', () => {
  it('reads a list, ignores blanks and repeats', () => {
    expect(parseCheckIds('forms, auth,,forms')).toEqual({ ok: true, ids: ['forms', 'auth'] });
  });
  it('rejects an unknown name and lists the known ones in both languages', () => {
    const r = parseCheckIds('forms,nope');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.en).toContain('“nope”');
      expect(r.error.en).toContain('contrast');
      expect(r.error.fr).toContain('«\u202Fnope\u202F»');
      expect(frTypographyIssues(r.error.fr)).toEqual([]);
    }
  });
  it('rejects the checks about the run itself', () => {
    for (const id of FIXED_CHECKS) expect(parseCheckIds(id).ok).toBe(false);
  });
  it('rejects an empty list', () => {
    expect(parseCheckIds('').ok).toBe(false);
    expect(parseCheckIds(' , ').ok).toBe(false);
  });
  it('accepts every check that is not about the run itself', () => {
    for (const c of CHECK_ORDER.filter((x) => !FIXED_CHECKS.includes(x))) expect(parseCheckIds(c), c).toEqual({ ok: true, ids: [c] });
  });
});

describe('skippedChecks', () => {
  it('only keeps the named checks, so every other one is skipped', () => {
    const s = skippedChecks({ only: ['forms'], skip: [] });
    expect(s).not.toContain('forms');
    expect(s).toContain('contrast');
    expect(s).not.toContain('waiver');
    expect(s).not.toContain('budget');
    expect(s.length).toBe(CHECK_ORDER.length - 1 - FIXED_CHECKS.length);
  });
  it('skip names the ones to switch off, and skip wins over only', () => {
    expect(skippedChecks({ only: [], skip: ['media', 'auth'] })).toEqual(['auth', 'media'].sort((a, b) => CHECK_ORDER.indexOf(a as never) - CHECK_ORDER.indexOf(b as never)));
    expect(skippedChecks({ only: ['forms', 'auth'], skip: ['auth'] })).not.toContain('forms');
    expect(skippedChecks({ only: ['forms', 'auth'], skip: ['auth'] })).toContain('auth');
  });
  it('nothing selected means nothing skipped', () => {
    expect(skippedChecks({ only: [], skip: [] })).toEqual([]);
  });
});

describe('selectChecks', () => {
  it('returns the same report when nothing is switched off', () => {
    const r = sample();
    expect(selectChecks(r, { only: [], skip: [] })).toBe(r);
  });
  it('removes a skipped check and its entries from every route, and lists it', () => {
    const out = selectChecks(sample(), { only: [], skip: ['contrast'] });
    expect(out.skipped).toEqual(['contrast']);
    expect(out.routes[0]?.checks.map((c) => c.check)).toEqual(['forms', 'media']);
    expect(out.routes[0]?.entries.map((x) => x.check)).toEqual(['forms']);
    expect(out.routes[1]?.checks).toEqual([]);
    expect(totals(out.routes)).toMatchObject({ failed: 0, unknown: 1, checked: 3 });
  });
  it('with only, keeps just the named check', () => {
    const out = selectChecks(sample(), { only: ['media'], skip: [] });
    expect(out.routes[0]?.checks.map((c) => c.check)).toEqual(['media']);
    expect(out.skipped).toContain('contrast');
    expect(out.skipped).not.toContain('media');
  });
  it('keeps the route list, the viewport and the unmeasured count', () => {
    const base = makeReport([buildRouteAudit('/a', 320, { contrast: { checked: 1, entries: [] } }, 4, true)], NOW);
    const out = selectChecks(base, { only: [], skip: ['media'] });
    expect(out.routes[0]).toMatchObject({ route: '/a', viewportWidth: 320, unmeasured: 4, truncated: true });
  });
  it('a clean result for a switched-off check is not claimed: the report says it did not run', () => {
    const out = selectChecks(sample(), { only: [], skip: ['contrast'] });
    expect(renderText(out, 'en')).toContain('Checks not run in this run');
    expect(renderText(out, 'en')).toContain('Text contrast');
    expect(renderText(out, 'fr')).toContain('Contrôles non exécutés');
    expect(renderBody(out, 'en')).toContain('Text contrast');
  });
  it('a report with nothing skipped has no such section', () => {
    expect(renderText(sample(), 'en')).not.toContain('not run');
    expect(renderBody(sample(), 'en')).not.toContain('not run');
  });
  it('the report page with the skipped section has no markup findings', () => {
    const out = selectChecks(sample(), { only: [], skip: ['contrast', 'forms'] });
    for (const lang of ['en', 'fr'] as const) {
      expect(lintHtml(renderHtml(out, lang)).entries, lang).toEqual([]);
      expect(lintHtml(renderBody(out, lang), { fragment: true }).entries, lang).toEqual([]);
    }
  });
});

describe('a budget and skipped checks', () => {
  const budget: Budget = { version: 1, checks: { contrast: { fail: 3, unknown: 2 }, forms: { fail: 0, unknown: 5 } } };
  it('the ratchet keeps the old limit of a check that did not run, instead of cutting it to zero', () => {
    const out = selectChecks(sample(), { only: [], skip: ['contrast'] });
    const next = ratchet(out, budget);
    expect(next.checks.contrast).toEqual({ fail: 3, unknown: 2 });
    expect(next.checks.forms).toEqual({ fail: 0, unknown: 1 });
  });
  it('a check that did not run and has no old limit gets none', () => {
    const out = selectChecks(sample(), { only: [], skip: ['contrast'] });
    expect(ratchet(out, null).checks.contrast).toBeUndefined();
  });
  it('the same ratchet without skipping would have cut the limit to the count', () => {
    expect(ratchet(sample(), budget).checks.contrast).toEqual({ fail: 1, unknown: 0 });
  });
  it('applying a budget to a report with skipped checks does not fail them, and keeps the list', () => {
    const out = applyBudget(selectChecks(sample(), { only: [], skip: ['contrast'] }), budget);
    expect(out.routes.find((r) => r.route === 'budget')?.entries).toEqual([]);
    expect(out.skipped).toEqual(['contrast']);
  });
  it('applying waivers keeps the list of skipped checks', () => {
    const out = applyWaivers(selectChecks(sample(), { only: [], skip: ['contrast'] }), [], NOW, []);
    expect(out.report.skipped).toEqual(['contrast']);
  });
});

describe('describeSkipped', () => {
  it('is empty with nothing skipped and names the checks in both languages', () => {
    expect(describeSkipped([], 'en')).toBe('');
    expect(describeSkipped(['forms', 'media'], 'en')).toBe('Checks not run in this run: Form labels and messages, Audio and video. No result for them should be read as clean.');
    const fr = describeSkipped(['forms'], 'fr');
    expect(fr).toContain('Étiquettes et messages des formulaires');
    expect(frTypographyIssues(fr)).toEqual([]);
  });
});
