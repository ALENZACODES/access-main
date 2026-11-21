/** Coverage is an inventory of what was recorded, not a certification. */
import { inspectTrace } from './assistive-trace-contract.mjs';
import { replayTrace } from './assistive-trace-replay.mjs';

export const COVERAGE_DIMENSIONS = Object.freeze({
  locales: ['en', 'fr'], networks: ['offline', 'online', 'limited'],
  channels: ['keyboard', 'focus', 'announcement', 'offline', 'storage'],
});

export function emptyCoverage() {
  return { total: 0, PASS: 0, FAIL: 0, UNKNOWN: 0 };
}
export function coverageCells(value, options = {}) {
  const check = inspectTrace(value, options);
  if (!check.ok) return { ok: false, problems: check.problems, cells: null };
  const replay = replayTrace(value, options);
  const cells = [];
  for (const locale of COVERAGE_DIMENSIONS.locales) {
    for (const network of COVERAGE_DIMENSIONS.networks) {
      for (const channel of COVERAGE_DIMENSIONS.channels) {
        const matching = replay.result.journeys.filter((journey) => journey.locale === locale && journey.network === network);
        const states = matching.flatMap((journey) => journey.steps.filter((step) => step.channel === channel).map((step) => step.state));
        const counts = emptyCoverage();
        for (const state of states) counts[state] += 1;
        counts.total = states.length;
        cells.push({ locale, network, channel, counts,
          state: counts.FAIL ? 'FAIL' : !states.length || counts.UNKNOWN ? 'UNKNOWN' : 'PASS' });
      }
    }
  }
  return { ok: true, problems: [], cells };
}
export function coverageGaps(value, options = {}) {
  const coverage = coverageCells(value, options);
  if (!coverage.ok) return { ok: false, problems: coverage.problems, gaps: null };
  const gaps = coverage.cells.filter((cell) => cell.state !== 'PASS').map((cell) => ({
    locale: cell.locale, network: cell.network, channel: cell.channel,
    state: cell.state, reason: cell.counts.total ? 'RECORDED_GAP' : 'MISSING_TRACE',
  }));
  return { ok: true, problems: [], gaps };
}
export function coverageSummary(value, options = {}) {
  const coverage = coverageCells(value, options);
  if (!coverage.ok) return { ok: false, problems: coverage.problems, summary: null };
  const summary = { total: coverage.cells.length, PASS: 0, FAIL: 0, UNKNOWN: 0 };
  for (const cell of coverage.cells) summary[cell.state] += 1;
  return { ok: true, problems: [], summary };
}
export function compareCoverage(before, after, options = {}) {
  const left = coverageCells(before, options);
  const right = coverageCells(after, options);
  if (!left.ok || !right.ok) return {
    ok: false, problems: [
      ...left.problems.map((p) => ({ ...p, snapshot: 'before' })),
      ...right.problems.map((p) => ({ ...p, snapshot: 'after' })),
    ], changes: null,
  };
  const changes = left.cells.flatMap((cell, index) => {
    const next = right.cells[index];
    if (cell.state === next.state && cell.counts.total === next.counts.total) return [];
    return [{ locale: cell.locale, network: cell.network, channel: cell.channel,
      before: cell.state, after: next.state, beforeCount: cell.counts.total, afterCount: next.counts.total }];
  });
  return { ok: true, problems: [], changes };
}
export function traceWorklist(value, options = {}) {
  const gaps = coverageGaps(value, options);
  if (!gaps.ok) return { ok: false, problems: gaps.problems, tasks: null };
  return { ok: true, problems: [], tasks: gaps.gaps.map((gap, index) => ({
    id: `review-${String(index + 1).padStart(3, '0')}`,
    locale: gap.locale, network: gap.network, channel: gap.channel,
    reason: gap.reason, status: 'UNKNOWN',
  })) };
}
