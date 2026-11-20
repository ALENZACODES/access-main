import { DETAIL_CSS } from './detail.js';
import { describeTrend, trend, type History, type RunSummary } from './history.js';
import { escapeHtml } from './report.js';
import { CHECK_LABELS, NBSP, type CheckId, type Lang } from './types.js';

/**
 * The history of audit runs as one HTML page: a line chart of the findings
 * to fix and the UNKNOWN findings over the runs, and the same numbers in a
 * table. It has no script and no outside resource.
 *
 * The chart never carries anything the table does not: the two lines differ
 * by their dash pattern and are labelled in words, and every point is a row
 * of the table. A count that goes down is not a statement of conformance, and
 * counts are only comparable between runs that audited the same routes; the
 * table marks the runs where the number of routes changed.
 */

const T = {
  title: { en: 'Narrow-screen audit, runs over time', fr: 'Audit écran étroit, exécutions au fil du temps' },
  skip: { en: 'Skip to the table of runs', fr: 'Aller au tableau des exécutions' },
  chart: { en: 'Chart', fr: 'Graphique' },
  table: { en: 'Runs', fr: 'Exécutions' },
  caption: { en: 'One row per run, the newest first', fr: 'Une ligne par exécution, la plus récente d’abord' },
  when: { en: 'Run', fr: 'Exécution' },
  routes: { en: 'Routes', fr: 'Routes' },
  toFix: { en: 'To fix', fr: 'À corriger' },
  change: { en: 'Change in findings to fix', fr: 'Variation des anomalies à corriger' },
  first: { en: 'first run kept', fr: 'première exécution gardée' },
  routesChanged: { en: 'the number of routes changed', fr: 'le nombre de routes a changé' },
  check: { en: 'Check', fr: 'Contrôle' },
  checks: { en: 'Checks in the newest run', fr: 'Contrôles de l’exécution la plus récente' },
  checksCaption: { en: 'Checks with findings, the largest change since the run before first', fr: 'Contrôles avec des anomalies, la plus grande variation depuis l’exécution précédente d’abord' },
  noChecks: { en: 'No check found anything in the newest run or in the run before.', fr: 'Aucun contrôle n’a rien trouvé dans l’exécution la plus récente ni dans la précédente.' },
  none: { en: 'The history holds no run yet.', fr: 'L’historique ne contient encore aucune exécution.' },
  one: { en: 'One run is not a trend. The chart starts with the second run.', fr: 'Une seule exécution ne fait pas une tendance. Le graphique commence à la deuxième exécution.' },
  limits: {
    en: 'Counts are comparable only between runs that audited the same routes with the same checks. A count that goes down is not a statement of conformance.',
    fr: 'Les décomptes ne se comparent qu’entre des exécutions qui ont audité les mêmes routes avec les mêmes contrôles. Un décompte qui baisse n’est pas une déclaration de conformité.',
  },
  chartNote: { en: 'The solid line is the findings to fix. The dashed line is the UNKNOWN findings. Every point is a row of the table below.', fr: 'Le trait plein représente les anomalies à corriger. Le trait en tirets représente les anomalies UNKNOWN. Chaque point est une ligne du tableau ci-dessous.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

export const TREND_CSS =
  DETAIL_CSS +
  'figure{margin:16px 0}svg.chart{display:block;width:100%;height:auto;max-width:48rem;border:1px solid var(--line)}' +
  '.chart .fail{stroke:var(--fail);fill:none;stroke-width:3}.chart .unknown{stroke:var(--unknown);fill:none;stroke-width:3;stroke-dasharray:8 6}' +
  '.chart .axis{stroke:var(--line);stroke-width:1}.chart text{fill:var(--fg);font:14px system-ui,sans-serif}' +
  '.chart .dot-fail{fill:var(--fail)}.chart .dot-unknown{fill:var(--unknown)}' +
  'table.runs td.n,table.runs th.n{width:3.25rem;padding:6px 4px}table.runs th,table.runs td{font-size:.9375rem}';

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 260;
const PAD = { left: 48, right: 16, top: 28, bottom: 36 };

/** Runs shown in the chart. Older runs stay in the table. */
export const MAX_CHART_RUNS = 30;

export interface ChartPoint {
  readonly x: number;
  readonly failed: number;
  readonly unknown: number;
}

/** Where each run sits in the chart: x from left to right in the order of the runs, y from the bottom for a count of zero. */
export function chartPoints(runs: readonly RunSummary[]): { points: ChartPoint[]; max: number } {
  const shown = runs.slice(-MAX_CHART_RUNS);
  const max = Math.max(1, ...shown.map((r) => Math.max(r.failed, r.unknown)));
  const innerW = CHART_WIDTH - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const y = (n: number): number => Math.round((PAD.top + innerH - (n / max) * innerH) * 10) / 10;
  const points = shown.map((r, i) => ({
    x: Math.round((PAD.left + (shown.length === 1 ? innerW / 2 : (i / (shown.length - 1)) * innerW)) * 10) / 10,
    failed: y(r.failed),
    unknown: y(r.unknown),
  }));
  return { points, max };
}

const day = (iso: string): string => iso.slice(0, 10);

function chart(runs: readonly RunSummary[], lang: Lang): string {
  const fr = lang === 'fr';
  const shown = runs.slice(-MAX_CHART_RUNS);
  const { points, max } = chartPoints(runs);
  const first = shown[0] as RunSummary;
  const last = shown[shown.length - 1] as RunSummary;
  const desc = fr
    ? `Du ${day(first.at)} au ${day(last.at)}, sur ${shown.length} exécutions${colon(lang)} les anomalies à corriger vont de ${first.failed} à ${last.failed}, les anomalies UNKNOWN de ${first.unknown} à ${last.unknown}.`
    : `From ${day(first.at)} to ${day(last.at)}, over ${shown.length} runs${colon(lang)} findings to fix go from ${first.failed} to ${last.failed}, UNKNOWN findings from ${first.unknown} to ${last.unknown}.`;
  const bottom = CHART_HEIGHT - PAD.bottom;
  const out: string[] = [];
  out.push(`<figure>`);
  out.push(`<svg class="chart" role="img" aria-labelledby="chart-title chart-desc" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">`);
  out.push(`<title id="chart-title">${escapeHtml(fr ? 'Anomalies à corriger et anomalies UNKNOWN par exécution' : 'Findings to fix and UNKNOWN findings by run')}</title>`);
  out.push(`<desc id="chart-desc">${escapeHtml(desc)}</desc>`);
  out.push(`<line class="axis" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${bottom}"></line>`);
  out.push(`<line class="axis" x1="${PAD.left}" y1="${bottom}" x2="${CHART_WIDTH - PAD.right}" y2="${bottom}"></line>`);
  out.push(`<text x="${PAD.left - 8}" y="${PAD.top + 5}" text-anchor="end">${max}</text>`);
  out.push(`<text x="${PAD.left - 8}" y="${bottom + 5}" text-anchor="end">0</text>`);
  out.push(`<text x="${PAD.left}" y="${CHART_HEIGHT - 10}">${escapeHtml(day(first.at))}</text>`);
  out.push(`<text x="${CHART_WIDTH - PAD.right}" y="${CHART_HEIGHT - 10}" text-anchor="end">${escapeHtml(day(last.at))}</text>`);
  out.push(`<polyline class="fail" points="${points.map((p) => `${p.x},${p.failed}`).join(' ')}"></polyline>`);
  out.push(`<polyline class="unknown" points="${points.map((p) => `${p.x},${p.unknown}`).join(' ')}"></polyline>`);
  for (const p of points) out.push(`<circle class="dot-fail" cx="${p.x}" cy="${p.failed}" r="4"></circle><rect class="dot-unknown" x="${p.x - 4}" y="${p.unknown - 4}" width="8" height="8"></rect>`);
  out.push('</svg>');
  out.push(`<figcaption>${escapeHtml(desc)} ${tx('chartNote', lang)}</figcaption>`);
  out.push('</figure>');
  return out.join('\n');
}

export interface CheckMove {
  readonly check: CheckId;
  readonly failed: number;
  readonly unknown: number;
  /** Change in findings to fix since the run before. Null when there is no run before. */
  readonly failedDelta: number | null;
}

/** The checks of the newest run that found something, or that found something in the run before, the largest change first. */
export function checkMoves(history: History): CheckMove[] {
  const current = history.runs[history.runs.length - 1];
  if (!current) return [];
  const previous = history.runs[history.runs.length - 2] ?? null;
  const ids = new Set<CheckId>([...(Object.keys(current.checks) as CheckId[]), ...(previous ? (Object.keys(previous.checks) as CheckId[]) : [])]);
  const out: CheckMove[] = [];
  for (const check of ids) {
    const now = current.checks[check] ?? { failed: 0, unknown: 0 };
    const before = previous ? (previous.checks[check] ?? { failed: 0, unknown: 0 }) : null;
    if (now.failed + now.unknown === 0 && (!before || before.failed + before.unknown === 0)) continue;
    out.push({ check, failed: now.failed, unknown: now.unknown, failedDelta: before ? now.failed - before.failed : null });
  }
  return out.sort((a, b) => Math.abs(b.failedDelta ?? 0) - Math.abs(a.failedDelta ?? 0) || b.failed - a.failed || a.check.localeCompare(b.check));
}

function checksTable(history: History, lang: Lang): string {
  const moves = checkMoves(history);
  if (moves.length === 0) return `<p>${tx('noChecks', lang)}</p>`;
  const head = [T.check[lang], T.toFix[lang], 'UNKNOWN', T.change[lang]];
  const out: string[] = [`<table class="runs">\n<caption id="checks-cap">${tx('checksCaption', lang)}</caption>`];
  out.push(`<thead><tr>${head.map((h, i) => `<th scope="col"${i === 1 || i === 2 ? ' class="n"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>`, '<tbody>');
  for (const m of moves) {
    const label = (CHECK_LABELS as Readonly<Record<string, { en: string; fr: string } | undefined>>)[m.check]?.[lang] ?? m.check;
    out.push(`<tr><th scope="row">${escapeHtml(label)} (<code>${escapeHtml(m.check)}</code>)</th><td class="n">${m.failed}</td><td class="n">${m.unknown}</td><td>${escapeHtml(m.failedDelta === null ? T.first[lang] : signed(m.failedDelta))}</td></tr>`);
  }
  out.push('</tbody>\n</table>');
  return out.join('\n');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function runsTable(runs: readonly RunSummary[], lang: Lang): string {
  // Three number columns, kept narrow, so the table fits a 320 pixel screen. The count of elements checked is in each report, not here.
  const head = [T.when[lang], T.routes[lang], T.toFix[lang], 'UNKNOWN', T.change[lang]];
  const out: string[] = [`<table class="runs">\n<caption id="runs-cap">${tx('caption', lang)}</caption>`];
  out.push(`<thead><tr>${head.map((h, i) => `<th scope="col"${i > 0 && i < 4 ? ' class="n"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>`, '<tbody>');
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i] as RunSummary;
    const prev = i > 0 ? (runs[i - 1] as RunSummary) : null;
    let change: string = T.first[lang];
    if (prev) change = prev.routes !== r.routes ? `${signed(r.failed - prev.failed)}, ${T.routesChanged[lang]} (${prev.routes} → ${r.routes})` : signed(r.failed - prev.failed);
    out.push(
      `<tr><th scope="row"><time datetime="${escapeHtml(r.at)}">${escapeHtml(r.at)}</time></th><td class="n">${r.routes}</td><td class="n">${r.failed}</td><td class="n">${r.unknown}</td><td>${escapeHtml(change)}</td></tr>`,
    );
  }
  out.push('</tbody>\n</table>');
  return out.join('\n');
}

/** The history as one HTML page. */
export function renderTrendPage(history: History, lang: Lang): string {
  const runs = history.runs;
  const out: string[] = [
    `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      `<title>${tx('title', lang)}</title>\n<style>${TREND_CSS}</style>\n</head>\n<body>`,
  ];
  out.push(`<a class="skip" href="#runs-h">${tx('skip', lang)}</a>`);
  out.push('<header>', `<h1>${tx('title', lang)}</h1>`, '</header>', '<main>');
  out.push(`<p>${tx('limits', lang)}</p>`);
  if (runs.length === 0) {
    out.push(`<h2 id="runs-h">${tx('table', lang)}</h2>`, `<p>${tx('none', lang)}</p>`);
  } else {
    out.push(`<p>${escapeHtml(describeTrend(trend(history), lang).trim().replace(/\s*\n\s*/g, ' '))}</p>`);
    out.push(`<section aria-labelledby="chart-h">\n<h2 id="chart-h">${tx('chart', lang)}</h2>`);
    out.push(runs.length < 2 ? `<p>${tx('one', lang)}</p>` : chart(runs, lang));
    out.push('</section>');
    out.push(`<section aria-labelledby="runs-h">\n<h2 id="runs-h">${tx('table', lang)}</h2>`, runsTable(runs, lang), '</section>');
    out.push(`<section aria-labelledby="checks-h">\n<h2 id="checks-h">${tx('checks', lang)}</h2>`, checksTable(history, lang), '</section>');
  }
  out.push('</main>\n</body>\n</html>\n');
  return out.join('\n');
}
