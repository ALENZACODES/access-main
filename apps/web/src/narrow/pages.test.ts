import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { appendRun, EMPTY_HISTORY, type History } from './history.js';
import { htmlTextItems, lintHtml, parseHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { INDEX_FILE, OUTPUT_KINDS, indexItems, renderIndexPage } from './outputs-index.js';
import { found, reportOf, route, smallSite } from './report-fixtures.js';
import { markupResults } from './run.js';
import { CHART_HEIGHT, CHART_WIDTH, MAX_CHART_RUNS, TREND_CSS, chartPoints, checkMoves, renderTrendPage } from './trend-page.js';
import type { Entry } from './types.js';

function ownFindings(html: string): Entry[] {
  const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
  return Object.values(results).flatMap((r) => [...(r?.entries ?? [])]);
}

function textOf(html: string): string[] {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .split(/<[^>]+>/)
    .map((s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .filter((s) => s.trim() !== '');
}

/** A report with `fails` failures and `unknowns` UNKNOWN findings on `routes` routes. */
function run(day: number, fails: number, unknowns: number, routes = 2) {
  const entries = [
    ...Array.from({ length: fails }, (_v, i) => found('contrast', 'low', 'fail', `p[${i}]`)),
    ...Array.from({ length: unknowns }, (_v, i) => found('contrast', 'image', 'unknown', `h2[${i}]`)),
  ];
  return reportOf([route('/', { contrast: { checked: 40, entries } }), ...Array.from({ length: routes - 1 }, (_v, i) => route(`/p${i}`, { contrast: { checked: 5, entries: [] } }))], day);
}

function historyOf(...runs: ReturnType<typeof run>[]): History {
  let h = EMPTY_HISTORY;
  for (const r of runs) h = appendRun(h, r);
  return h;
}

const FOUR = historyOf(run(10, 8, 3), run(12, 6, 3), run(15, 6, 5, 3), run(19, 2, 4, 3));

describe('chartPoints', () => {
  it('spreads the runs from left to right and puts zero at the bottom', () => {
    const { points, max } = chartPoints(FOUR.runs);
    expect(max).toBe(8);
    expect(points.map((p) => p.x)).toEqual([48, 240, 432, 624]);
    expect(points[0]?.failed).toBe(28);
    expect(chartPoints(historyOf(run(10, 0, 0)).runs).points[0]).toMatchObject({ failed: 224, unknown: 224 });
  });

  it('stays inside the chart', () => {
    for (const p of chartPoints(FOUR.runs).points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(CHART_WIDTH);
      for (const y of [p.failed, p.unknown]) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(CHART_HEIGHT);
      }
    }
  });

  it('puts a single run in the middle and keeps the newest runs when there are many', () => {
    expect(chartPoints(historyOf(run(10, 1, 1)).runs).points[0]?.x).toBe(336);
    let h = EMPTY_HISTORY;
    for (let d = 1; d <= 28; d++) for (const hour of [1, 2]) h = appendRun(h, { ...run(d, d, 0), generatedAt: new Date(Date.UTC(2026, 10, d, hour)).toISOString() });
    expect(h.runs).toHaveLength(56);
    expect(chartPoints(h.runs).points).toHaveLength(MAX_CHART_RUNS);
  });
});

describe('renderTrendPage', () => {
  for (const lang of ['en', 'fr'] as const) {
    it(`raises nothing under this module's own checks in ${lang}`, () => {
      for (const h of [FOUR, EMPTY_HISTORY, historyOf(run(10, 1, 1))]) expect(ownFindings(renderTrendPage(h, lang)).map((e) => `${e.check}/${e.rule ?? ''} ${e.id}`)).toEqual([]);
    });
  }

  it('follows French typography', () => {
    for (const piece of textOf(renderTrendPage(FOUR, 'fr'))) expect(frTypographyIssues(piece), piece).toEqual([]);
  });

  const html = renderTrendPage(FOUR, 'en');
  const { nodes } = parseHtml(html);

  it('names the chart and describes it in words', () => {
    const svg = nodes.find((n) => n.tag === 'svg');
    expect(svg?.attrs).toMatchObject({ role: 'img', 'aria-labelledby': 'chart-title chart-desc' });
    expect(html).toContain('<title id="chart-title">Findings to fix and UNKNOWN findings by run</title>');
    expect(html).toContain('From 2026-11-10 to 2026-11-19, over 4 runs: findings to fix go from 8 to 2, UNKNOWN findings from 3 to 4.');
  });

  it('tells the two lines apart by more than colour, and says so', () => {
    expect(TREND_CSS).toContain('.chart .unknown{stroke:var(--unknown);fill:none;stroke-width:3;stroke-dasharray:8 6}');
    expect(html).toContain('The solid line is the findings to fix. The dashed line is the UNKNOWN findings.');
    expect(html.match(/<circle class="dot-fail"/g)).toHaveLength(4);
    expect(html.match(/<rect class="dot-unknown"/g)).toHaveLength(4);
  });

  it('gives every point of the chart as a row of the table, the newest first', () => {
    const rows = html.match(/<tr><th scope="row"><time datetime="[^"]+">/g) ?? [];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('2026-11-19');
    expect(html).toContain('<td class="n">3</td><td class="n">2</td><td class="n">4</td><td>-4</td></tr>');
    expect(html).toContain('<td>first run kept</td>');
  });

  it('marks the run where the number of routes changed', () => {
    expect(html).toContain('<td>0, the number of routes changed (2 → 3)</td>');
    expect(renderTrendPage(FOUR, 'fr')).toContain('le nombre de routes a changé (2 → 3)');
  });

  it('signs an increase', () => {
    expect(renderTrendPage(historyOf(run(10, 1, 0), run(11, 4, 0)), 'en')).toContain('<td>+3</td>');
  });

  it('always says what the counts do not mean', () => {
    for (const h of [FOUR, EMPTY_HISTORY]) expect(renderTrendPage(h, 'en')).toContain('A count that goes down is not a statement of conformance.');
    expect(renderTrendPage(FOUR, 'fr')).toContain('Un décompte qui baisse n’est pas une déclaration de conformité.');
  });

  it('draws no chart for one run, and says so', () => {
    const one = renderTrendPage(historyOf(run(10, 1, 1)), 'en');
    expect(one).not.toContain('<svg');
    expect(one).toContain('One run is not a trend.');
    expect(one.match(/<tr><th scope="row"><time/g)).toHaveLength(1);
  });

  it('says so for an empty history, and still has the heading the skip link points to', () => {
    const none = renderTrendPage(EMPTY_HISTORY, 'en');
    expect(none).toContain('The history holds no run yet.');
    expect(none).toContain('<a class="skip" href="#runs-h">');
    expect(none).toContain('<h2 id="runs-h">');
    expect(none).not.toContain('<table');
  });

  it('carries no script and no outside resource', () => {
    expect(html).not.toMatch(/<script|<link|<img|<iframe|@import|url\(|https?:/i);
  });
});

describe('checkMoves and the table of checks', () => {
  const mixed = (day: number, contrast: number, images: number) =>
    reportOf(
      [
        route('/', {
          contrast: { checked: 20, entries: Array.from({ length: contrast }, (_v, i) => found('contrast', 'low', 'fail', `p[${i}]`)) },
          images: { checked: 5, entries: Array.from({ length: images }, (_v, i) => found('images', 'alt-generic', 'unknown', `img[${i}]`)) },
          links: { checked: 5, entries: [] },
        }),
      ],
      day,
    );
  const h = historyOf(mixed(10, 5, 2), mixed(12, 1, 2));

  it('lists the checks with findings, the largest change first', () => {
    expect(checkMoves(h)).toEqual([
      { check: 'contrast', failed: 1, unknown: 0, failedDelta: -4 },
      { check: 'images', failed: 0, unknown: 2, failedDelta: 0 },
    ]);
  });

  it('keeps a check that found something in the run before and nothing now', () => {
    expect(checkMoves(historyOf(mixed(10, 3, 0), mixed(12, 0, 0)))).toEqual([{ check: 'contrast', failed: 0, unknown: 0, failedDelta: -3 }]);
  });

  it('has no change to give for the first run, and nothing for an empty history', () => {
    expect(checkMoves(historyOf(mixed(10, 2, 1))).map((m) => m.failedDelta)).toEqual([null, null]);
    expect(checkMoves(EMPTY_HISTORY)).toEqual([]);
  });

  it('shows the checks in a table with their names', () => {
    const html = renderTrendPage(h, 'en');
    expect(html).toContain('<h2 id="checks-h">Checks in the newest run</h2>');
    expect(html).toContain('(<code>contrast</code>)</th><td class="n">1</td><td class="n">0</td><td>-4</td></tr>');
    expect(renderTrendPage(h, 'fr')).toContain('<caption id="checks-cap">Contrôles avec des anomalies, la plus grande variation depuis l’exécution précédente d’abord</caption>');
  });

  it('says so when no check found anything', () => {
    const quiet = historyOf(mixed(10, 0, 0), mixed(12, 0, 0));
    expect(renderTrendPage(quiet, 'en')).toContain('No check found anything in the newest run or in the run before.');
    expect(ownFindings(renderTrendPage(quiet, 'fr'))).toEqual([]);
  });
});

describe('indexItems', () => {
  it('orders the files the way a person would open them, whatever the order they were written in', () => {
    const items = indexItems(['narrow-audit.json', 'narrow-audit.csv', 'narrow-audit.en.html', 'narrow-audit.detail.en.html', 'narrow-audit.worksheet.en.html'], 'en');
    expect(items.map((i) => i.title)).toEqual(['Detailed report', 'Report', 'By-hand worksheet', 'Findings as CSV', 'Report as JSON']);
  });

  it('tells apart files whose names are close', () => {
    const names = ['narrow-audit.en.html', 'narrow-audit.detail.en.html', 'narrow-audit.en.md', 'narrow-audit.coverage.en.md', 'narrow-audit.compare.en.md', 'narrow-audit.en.txt', 'narrow-audit.review.en.txt'];
    const items = indexItems(names, 'en');
    expect(items).toHaveLength(names.length);
    expect(new Set(items.map((i) => i.title)).size).toBe(names.length);
    expect(items.find((i) => i.file === 'narrow-audit.en.txt')?.title).toBe('Digest');
  });

  it('takes paths, counts a file once and leaves the index itself out', () => {
    const items = indexItems(['o/narrow-audit.json', 'o/narrow-audit.json', 'o/index.en.html', 'index.fr.html'], 'en');
    expect(items.map((i) => i.file)).toEqual(['narrow-audit.json']);
  });

  it('lists a file it has no description for under its own name, last', () => {
    const items = indexItems(['notes.bin', 'narrow-audit.json'], 'fr');
    expect(items.map((i) => i.file)).toEqual(['narrow-audit.json', 'notes.bin']);
    expect(items[1]).toMatchObject({ title: 'notes.bin', what: 'Fichier écrit par cette exécution.' });
  });

  it('has a kind for every file the command line names, in both languages', () => {
    const names = ['narrow-audit.json', 'narrow-audit.fr.html', 'narrow-audit.sarif', 'narrow-audit.junit.xml', 'narrow-audit.fr.md', 'narrow-audit.csv', 'narrow-audit.fr.txt', 'narrow-audit.detail.fr.html', 'narrow-audit.coverage.fr.md', 'narrow-audit.worksheet.fr.html', 'narrow-audit.trend.fr.html', 'narrow-audit.compare.fr.md', 'narrow-audit.review.fr.txt'];
    for (const name of names) expect(OUTPUT_KINDS.filter((k) => k.match.test(name)), name).toHaveLength(1);
    expect(OUTPUT_KINDS).toHaveLength(names.length);
    for (const k of OUTPUT_KINDS) {
      expect(frTypographyIssues(k.what.fr), k.what.fr).toEqual([]);
      expect(k.what.fr).not.toBe(k.what.en);
    }
  });
});

describe('renderIndexPage', () => {
  const files = ['narrow-audit.json', 'narrow-audit.en.html', 'narrow-audit.detail.en.html'];
  const html = renderIndexPage(smallSite(), files, 'en');

  for (const lang of ['en', 'fr'] as const) {
    it(`raises nothing under this module's own checks in ${lang}`, () => {
      expect(ownFindings(renderIndexPage(smallSite(), files.map((f) => f.replace('.en.', `.${lang}.`)), lang))).toEqual([]);
      expect(ownFindings(renderIndexPage(reportOf([]), [], lang))).toEqual([]);
    });
  }

  it('links to each file by its name, with what it is for', () => {
    expect(html).toContain('<dt><a href="narrow-audit.detail.en.html">Detailed report</a> (<code>narrow-audit.detail.en.html</code>)</dt><dd>Start here to plan the work');
    const hrefs = parseHtml(html).nodes.filter((n) => n.tag === 'a').map((n) => n.attrs['href']);
    expect(hrefs).toEqual(['narrow-audit.detail.en.html', 'narrow-audit.en.html', 'narrow-audit.json']);
  });

  it('gives the totals, the date and the scope note', () => {
    expect(html).toContain('<p>2 to fix, 3 UNKNOWN, on 3 routes audited.</p>');
    expect(html).toContain('<time datetime="2026-11-19T10:00:00.000Z">');
    expect(html).toContain('A clean result is not a conformance statement.');
  });

  it('encodes a file name that needs it and escapes it in text', () => {
    const odd = renderIndexPage(smallSite(), ['my notes <1>.txt'], 'en');
    expect(odd).toContain('href="my%20notes%20%3C1%3E.txt"');
    expect(odd).toContain('>my notes &lt;1&gt;.txt</a>');
  });

  it('says so when the run wrote nothing else', () => {
    expect(renderIndexPage(smallSite(), [], 'en')).toContain('This run wrote no other file.');
    expect(renderIndexPage(smallSite(), ['index.fr.html'], 'fr')).toContain('Cette exécution n’a écrit aucun autre fichier.');
  });

  it('follows French typography and names its own file by language', () => {
    for (const piece of textOf(renderIndexPage(smallSite(), files, 'fr'))) expect(frTypographyIssues(piece), piece).toEqual([]);
    expect(INDEX_FILE('fr')).toBe('index.fr.html');
  });
});
