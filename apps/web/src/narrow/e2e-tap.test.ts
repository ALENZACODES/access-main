import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { initialTapState, renderTapPanel, tapStep, type TapMeasure, type TapPanelState } from './tap-panel.js';
import { TAPS_PER_SIZE, TAP_SIZES, tapPlan } from './tap-trial.js';

/**
 * "Button size for my taps" under the browser checks of this module. Each
 * state of the panel is served as a page from this process and audited in
 * the profiles (narrow, dark, wide text spacing and the others), including
 * one state for each size of target, at the place the plan puts it. It runs
 * when NARROW_E2E=1 and a Chromium is installed.
 *
 * What it shows is that the measured checks find no failure in these states:
 * no target leaves the page, none is below 44 pixels. It does not show how
 * a screen reader reads the panel.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';
const TOTAL = TAP_SIZES.length * TAPS_PER_SIZE;
const measure: TapMeasure = {
  controls: () => [
    { id: 'a[0]', name: 'A link with a long name that has to wrap at 320 pixels', width: 30, height: 20 },
    { id: `button#${'very-long-identifier-'.repeat(4)}[0]`, name: '', width: 100, height: 40 },
  ],
  width: () => 320,
};

/** The panel at the n-th target. */
function at(n: number, lang: 'en' | 'fr'): TapPanelState {
  let s = tapStep(initialTapState(), 'tap-start', lang, measure).state;
  for (let i = 0; i < n; i += 1) s = tapStep(s, 'tap-hit', lang, measure).state;
  return s;
}

function done(lang: 'en' | 'fr', miss: (i: number) => boolean): TapPanelState {
  let s = at(0, lang);
  for (let i = 0; i < TOTAL; i += 1) s = tapStep(s, miss(i) ? 'tap-miss' : 'tap-hit', lang, measure).state;
  return s;
}

const SITE: Record<string, string> = {
  '/tap-first-en': pageAround(renderTapPanel('en', initialTapState()), 'en'),
  '/tap-first-fr': pageAround(renderTapPanel('fr', initialTapState()), 'fr'),
  '/tap-result-en': pageAround(renderTapPanel('en', done('en', (i) => i === 9)), 'en'),
  '/tap-result-fr': pageAround(renderTapPanel('fr', done('fr', (i) => i === 9)), 'fr'),
  '/tap-unknown-en': pageAround(renderTapPanel('en', done('en', (i) => i === 0)), 'en'),
  ...Object.fromEntries(tapPlan().map((t) => [`/tap-target-${t.index}`, pageAround(renderTapPanel('en', at(t.index, 'en')), 'en')])),
};

interface Served {
  readonly base: string;
  close(): Promise<void>;
}

async function serve(): Promise<Served> {
  const moduleName = 'node:http';
  const http = (await import(/* @vite-ignore */ moduleName)) as unknown as {
    createServer(h: (req: { url?: string }, res: { writeHead(c: number, h: Record<string, string>): void; end(b: string): void }) => void): {
      listen(p: number, h: string, cb: () => void): void;
      address(): { port: number };
      close(cb: () => void): void;
    };
  };
  const server = http.createServer((req, res) => {
    const html = SITE[(req.url ?? '/').split('?')[0] ?? '/'];
    res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html ?? 'not found');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise<void>((ok) => server.close(ok)) };
}

interface Launched {
  page: FullPage;
  close(): Promise<void>;
}

async function launch(): Promise<Launched> {
  for (const name of ['playwright-core', '@playwright/test']) {
    try {
      const mod = (await import(/* @vite-ignore */ name)) as { chromium?: unknown; default?: { chromium?: unknown } };
      const chromium = (mod.chromium ?? mod.default?.chromium) as
        | { launch(): Promise<{ newContext(): Promise<{ addInitScript(s: string): Promise<void>; newPage(): Promise<unknown> }>; close(): Promise<void> }> }
        | undefined;
      if (!chromium) continue;
      const browser = await chromium.launch();
      const context = await browser.newContext();
      await context.addInitScript('globalThis.__name = globalThis.__name || ((f) => f);');
      return { page: (await context.newPage()) as FullPage, close: () => browser.close() };
    } catch {
      // try the next package
    }
  }
  throw new Error('playwright-core or @playwright/test is needed for NARROW_E2E=1');
}

describe.skipIf(!enabled)('"Button size for my taps" in a real browser', () => {
  let b: Launched;
  let s: Served;
  beforeAll(async () => {
    s = await serve();
    b = await launch();
  }, 60_000);
  afterAll(async () => {
    await b?.close();
    await s?.close();
  });

  const run = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-19T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await run(['/tap-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the panel at first has no measured failure in French', async () => {
    expect(failing(await run(['/tap-first-fr'], first)).join('\n')).toBe('');
  }, 120_000);

  it('the result has no measured failure in English, in any profile', async () => {
    expect(failing(await run(['/tap-result-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the result has no measured failure in French, and an UNKNOWN result none either', async () => {
    expect(failing(await run(['/tap-result-fr', '/tap-unknown-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('no target of the plan leaves the page or is below 44 pixels, at 320 pixels wide', async () => {
    const routes = tapPlan().map((t) => `/tap-target-${t.index}`);
    expect(failing(await run(routes, first)).join('\n')).toBe('');
  }, 300_000);

  it('the first target is in the dark and text-spacing profiles as well', async () => {
    expect(failing(await run(['/tap-target-0'])).join('\n')).toBe('');
  }, 180_000);
});
