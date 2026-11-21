import { describe, expect, it } from 'vitest';
import { ALSO_RELATES, checksOutsideAa, countStates, coverage, coverageForReport, coverageSummary, describeCoverage, describeReportCoverage, manualScript, relates, renderCoverageMarkdown, renderManualScript, sortedAa } from './coverage.js';
import { frTypographyIssues } from './i18n.js';
import { MANUAL_STEPS } from './manual-steps.js';
import { found, reportOf, route, smallSite } from './report-fixtures.js';
import { CHECK_ORDER, CHECK_SC, type CheckId } from './types.js';
import { WCAG22_AA, aaCriterion } from './wcag22.js';

const rowOf = (sc: string) => {
  const row = coverage().find((r) => r.criterion.sc === sc);
  if (!row) throw new Error(`no row for ${sc}`);
  return row;
};

describe('coverage', () => {
  it('has one row per Level A and AA criterion, in order', () => {
    expect(coverage().map((r) => r.criterion.sc)).toEqual(WCAG22_AA.map((c) => c.sc));
  });

  it('lists the checks whose main criterion it is', () => {
    expect(rowOf('2.5.8').checks).toEqual(['target-size', 'target-spacing']);
    expect(rowOf('1.4.10').checks).toEqual(['reflow', 'clipping']);
  });

  it('adds the checks that also look at a criterion', () => {
    expect(rowOf('2.1.2').checks).toEqual(['keyboard']);
    expect(rowOf('2.4.3').checks).toEqual(['order']);
    expect(rowOf('3.2.6').checks).toEqual(['consistency']);
    expect(rowOf('2.4.5').checks).toEqual(['site-links']);
    expect(rowOf('3.2.4').checks).toEqual(['site-links']);
    expect(rowOf('2.4.2').checks).toEqual(expect.arrayContaining(['static-html', 'headings', 'consistency']));
  });

  it('says by hand for a criterion no check relates to', () => {
    for (const sc of ['1.2.1', '1.2.5', '1.4.5', '2.3.1', '2.5.1', '3.3.7']) {
      expect(rowOf(sc), sc).toMatchObject({ kind: 'by-hand', checks: [] });
    }
  });

  it('places every check with a Level A or AA criterion in exactly one main row', () => {
    for (const check of CHECK_ORDER) {
      const sc = CHECK_SC[check];
      if (sc === null || aaCriterion(sc) === null) continue;
      expect(rowOf(sc).checks, check).toContain(check);
    }
  });

  it('keeps the extra relations to known checks and known criteria, never repeating the main one', () => {
    for (const [check, list] of Object.entries(ALSO_RELATES)) {
      expect(CHECK_ORDER, check).toContain(check);
      for (const sc of list ?? []) {
        expect(aaCriterion(sc), `${check} ${sc}`).not.toBeNull();
        expect(CHECK_SC[check as CheckId], `${check} ${sc}`).not.toBe(sc);
      }
    }
  });

  it('answers relates for main and extra criteria', () => {
    expect(relates('keyboard', '2.1.1')).toBe(true);
    expect(relates('keyboard', '2.1.2')).toBe(true);
    expect(relates('keyboard', '2.4.7')).toBe(false);
    expect(relates('offline', '2.1.1')).toBe(false);
  });

  it('names the checks about criteria outside Level A and AA', () => {
    expect(checksOutsideAa()).toEqual([
      { check: 'plain', sc: '3.1.5' },
      { check: 'typography', sc: '1.4.8' },
    ]);
  });
});

describe('coverageSummary', () => {
  it('adds up to the totals of each level', () => {
    const [a, aa] = coverageSummary();
    expect(a).toMatchObject({ level: 'A', total: 31 });
    expect(aa).toMatchObject({ level: 'AA', total: 24 });
    for (const s of [a, aa]) expect((s?.partlyAutomated ?? 0) + (s?.byHand ?? 0)).toBe(s?.total);
  });

  it('counts the rows it is given', () => {
    const rows = coverage().filter((r) => r.criterion.sc.startsWith('1.2.'));
    expect(coverageSummary(rows)).toEqual([
      { level: 'A', total: 3, partlyAutomated: 1, byHand: 2 },
      { level: 'AA', total: 2, partlyAutomated: 0, byHand: 2 },
    ]);
  });

  it('leaves some criteria with no check at each level, so nobody reads the tool as complete', () => {
    for (const s of coverageSummary()) expect(s.byHand, s.level).toBeGreaterThan(0);
  });
});

describe('coverageForReport', () => {
  const rows = coverageForReport(smallSite());
  const state = (sc: string) => rows.find((r) => r.criterion.sc === sc);

  it('counts the findings of the checks whose main criterion it is', () => {
    expect(state('1.4.3')).toMatchObject({ state: 'found', failed: 2, unknown: 1, ran: ['contrast'] });
    expect(state('1.1.1')).toMatchObject({ state: 'found', failed: 0, unknown: 1, ran: ['images'] });
  });

  it('says not run for a criterion whose checks did not run', () => {
    expect(state('2.5.8')).toMatchObject({ state: 'not-run', ran: [], failed: 0, unknown: 0 });
  });

  it('says by hand for a criterion with no check', () => {
    expect(state('1.2.1')?.state).toBe('by-hand');
  });

  it('says nothing found when the checks ran and reported nothing', () => {
    const clean = coverageForReport(reportOf([route('/', { contrast: { checked: 9, entries: [] } })]));
    expect(clean.find((r) => r.criterion.sc === '1.4.3')).toMatchObject({ state: 'nothing-found', ran: ['contrast'] });
  });

  it('does not count the findings of a check under a criterion it only also looks at', () => {
    const report = reportOf([route('/', { keyboard: { checked: 12, entries: [found('keyboard', 'unreached', 'unknown', 'button[2]')] } })]);
    const out = coverageForReport(report);
    expect(out.find((r) => r.criterion.sc === '2.1.1')).toMatchObject({ state: 'found', unknown: 1 });
    expect(out.find((r) => r.criterion.sc === '2.1.2')).toMatchObject({ state: 'see-checks', failed: 0, unknown: 0, ran: ['keyboard'] });
  });

  it('adds findings across routes', () => {
    const report = reportOf([
      route('/', { contrast: { checked: 3, entries: [found('contrast', 'low', 'fail', 'p[1]')] } }),
      route('/b', { contrast: { checked: 3, entries: [found('contrast', 'low', 'fail', 'p[1]')] } }),
    ]);
    expect(coverageForReport(report).find((r) => r.criterion.sc === '1.4.3')?.failed).toBe(2);
  });

  it('counts every row in exactly one state', () => {
    const n = countStates(rows);
    expect(n.found + n['see-checks'] + n['nothing-found'] + n['not-run'] + n['by-hand']).toBe(55);
    expect(n.found).toBe(3);
    expect(n['by-hand']).toBe(coverage().filter((r) => r.kind === 'by-hand').length);
  });

  it('gives all by hand or not run for a report with no route', () => {
    const n = countStates(coverageForReport(reportOf([])));
    expect(n.found + n['see-checks'] + n['nothing-found']).toBe(0);
  });
});

describe('describeCoverage', () => {
  it('gives the counts by level and the limits, in English', () => {
    const [a, aa] = coverageSummary();
    const text = describeCoverage('en');
    expect(text).toContain(`Level A: ${a?.partlyAutomated} of 31 criteria have at least one automated check, ${a?.byHand} have none.`);
    expect(text).toContain(`Level AA: ${aa?.partlyAutomated} of 24 criteria have at least one automated check, ${aa?.byHand} have none.`);
    expect(text).toContain('looks at part of it, never at the whole');
    expect(text).toContain('  1.2.1 Audio-only and Video-only (Prerecorded) (A)');
  });

  it('says the same in French, with French typography', () => {
    const text = describeCoverage('fr');
    expect(text).toContain('Niveau A\u00A0: ');
    expect(text).toContain('Critères sans aucun contrôle, à regarder à la main\u00A0:');
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('never words coverage as a result', () => {
    for (const lang of ['en', 'fr'] as const) {
      expect(describeCoverage(lang)).not.toMatch(/\bpass(es|ed)?\b|compliant|réussi|\bverif|\bvérif/i);
    }
  });
});

describe('describeReportCoverage', () => {
  it('counts the criteria by what the report says about them', () => {
    const text = describeReportCoverage(smallSite(), 'en');
    expect(text).toContain('This report and the 55 WCAG 2.2 Level A and AA criteria:');
    expect(text).toContain('3 with something found, ');
    expect(text).toContain('  1.4.3 Contrast (Minimum): 2 to fix, 1 UNKNOWN (contrast)');
  });

  it('uses the UNKNOWN token in French too', () => {
    const text = describeReportCoverage(smallSite(), 'fr');
    expect(text).toContain('  1.4.3 Contraste (minimum)\u00A0: 2 à corriger, 1 UNKNOWN (contrast)');
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('explains nothing found only when it applies', () => {
    expect(describeReportCoverage(smallSite(), 'en')).not.toContain('“Nothing found” means');
    const clean = reportOf([route('/', { contrast: { checked: 9, entries: [] } })]);
    expect(describeReportCoverage(clean, 'en')).toContain('“Nothing found” means the checks reported nothing on the pages audited. It is not a result for the criterion.');
    expect(describeReportCoverage(clean, 'fr')).toContain('Ce n’est pas un résultat pour le critère.');
  });

  it('points to the check for a criterion it only also looks at', () => {
    const report = reportOf([route('/', { keyboard: { checked: 12, entries: [] } })]);
    expect(describeReportCoverage(report, 'en')).toContain('  2.1.2 No Keyboard Trap: see keyboard');
    expect(describeReportCoverage(report, 'fr')).toContain('  2.1.2 Pas de piège au clavier\u00A0: voir keyboard');
  });
});

describe('renderCoverageMarkdown', () => {
  it('has one table row per criterion', () => {
    const md = renderCoverageMarkdown('en');
    expect(md.split('\n').filter((l) => /^\| \d/.test(l))).toHaveLength(55);
    expect(md).toContain('| Criterion | Level | Related checks |');
    expect(md).toContain('| 2.5.8 Target Size (Minimum) | AA | `target-size`, `target-spacing` |');
    expect(md).toContain('| 3.3.7 Redundant Entry | A | none, look by hand |');
    expect(md).toContain('| 3.2.6 Consistent Help | A | `consistency` |');
    expect(md).toContain('| 3.2.4 Consistent Identification | AA | `site-links` |');
  });

  it('adds a column for a report', () => {
    const md = renderCoverageMarkdown('en', smallSite());
    expect(md).toContain('| Criterion | Level | Related checks | In this report |');
    expect(md).toContain('| 1.4.3 Contrast (Minimum) | AA | `contrast` | something found: 2 to fix, 1 UNKNOWN |');
    expect(md).toContain('| by hand only |');
    expect(md).toContain('| checks not run |');
  });

  it('writes French headings and states', () => {
    const md = renderCoverageMarkdown('fr', smallSite());
    expect(md).toContain('| Critère | Niveau | Contrôles liés | Dans ce rapport |');
    expect(md).toContain('anomalies trouvées\u00A0: 2 à corriger, 1 UNKNOWN |');
  });

  it('gives every row the same number of cells', () => {
    for (const md of [renderCoverageMarkdown('en'), renderCoverageMarkdown('fr', smallSite())]) {
      const rows = md.split('\n').filter((l) => l.startsWith('|'));
      const cells = new Set(rows.map((l) => l.split(/(?<!\\)\|/).length));
      expect(cells.size).toBe(1);
    }
  });
});

describe('manualScript', () => {
  it('gives every step with no option', () => {
    expect(manualScript({}, 'en')).toHaveLength(MANUAL_STEPS.length);
  });

  it('keeps only the criteria no check relates to', () => {
    const items = manualScript({ onlyByHand: true }, 'en');
    expect(items.length).toBe(coverage().filter((r) => r.kind === 'by-hand').length);
    for (const item of items) expect(item.row.checks).toEqual([]);
  });

  it('filters by level, by what a step needs and by version', () => {
    expect(manualScript({ level: 'A' }, 'en')).toHaveLength(31);
    expect(manualScript({ level: 'AA' }, 'en')).toHaveLength(24);
    for (const item of manualScript({ needs: ['keyboard'] }, 'en')) expect(item.needs).toBe('keyboard');
    expect(manualScript({ since: '2.2' }, 'en').map((i) => i.row.criterion.sc)).toEqual(['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']);
    expect(manualScript({ since: '2.2', level: 'A', needs: ['browser'] }, 'en').map((i) => i.row.criterion.sc)).toEqual(['3.2.6', '3.3.7']);
  });

  it('gives the text in the language asked', () => {
    expect(manualScript({ since: '2.2' }, 'fr')[0]?.action).toContain('Parcourez la page avec Tab');
  });
});

describe('renderManualScript', () => {
  it('writes a checklist grouped by principle', () => {
    const md = renderManualScript({}, 'en');
    expect(md.split('\n').filter((l) => l.startsWith('- [ ] '))).toHaveLength(55);
    expect(md.split('\n').filter((l) => l.startsWith('## '))).toEqual(['## 1. Perceivable', '## 2. Operable', '## 3. Understandable', '## 4. Robust']);
    expect(md).toContain('- [ ] **2.4.7 Focus Visible** (AA)');
    expect(md).toContain('  - Needs: a keyboard. Related checks: focus-visible, css.');
  });

  it('says what a ticked box records', () => {
    expect(renderManualScript({}, 'en')).toContain('Ticking a box records that someone looked, not that the criterion is met.');
    expect(renderManualScript({}, 'fr')).toContain('Cocher une case note que quelqu’un a regardé, pas que le critère est respecté.');
  });

  it('skips the headings of principles with no step', () => {
    const md = renderManualScript({ since: '2.2' }, 'fr');
    expect(md.split('\n').filter((l) => l.startsWith('## '))).toEqual(['## 2. Utilisable', '## 3. Compréhensible']);
    expect(md).toContain('6 étapes sur 55.');
  });

  it('follows French typography outside the criterion names', () => {
    for (const line of renderManualScript({}, 'fr').split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('says so when no step matches', () => {
    expect(renderManualScript({ since: '2.2', needs: ['media'] }, 'en')).toBe('# By-hand checks, WCAG 2.2 (A and AA)\n\nNo step matches these options.\n');
    expect(renderManualScript({ since: '2.2', needs: ['media'] }, 'fr')).toContain('Aucune étape ne correspond à ces options.');
  });
});

describe('sortedAa', () => {
  it('sorts numbers as WCAG does, once each, and drops the ones outside the list', () => {
    expect(sortedAa(['1.4.10', '1.4.3', '4.1.1', '1.4.3', '1.4.8', 'x']).map((c) => c.sc)).toEqual(['1.4.3', '1.4.10']);
  });
});
