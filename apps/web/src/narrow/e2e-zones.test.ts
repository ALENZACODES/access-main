import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { allCells, checkZones, noCells, zoneCounts } from './zones.js';
import { ZONE_ARGS, zonesInPage, type ZoneFacts } from './zones-inpage.js';
import { initialZonesState, renderZonesPanel, zonesStep, type ZonesState } from './zones-panel.js';

/**
 * "Screen zones I can reach" in Chromium, when NARROW_E2E=1 and a Chromium
 * is installed. It shows that:
 *
 * - `zonesInPage` reads the boxes the browser lays out, tells fixed and
 *   sticky controls from those that scroll, and gives the scroll range;
 * - the result does not depend on how far the page is scrolled when it is
 *   read;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show what a person can reach.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

/** A window of 300 by 400 makes columns of 100 and rows of 100. */
const W = 300;
const H = 400;
const B = 'style="position:absolute;width:44px;height:44px;margin:0;padding:0;border:0"';
const LAYOUT =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zones</title>' +
  '<style>body{margin:0;position:relative;height:2000px;overflow-x:hidden}.skip{position:absolute;left:0;top:-60px}.skip:focus{top:0}</style></head><body>' +
  '<a class="skip" href="#c" aria-label="Skip">Skip</a>' +
  `<header style="position:fixed;top:0;left:0;width:300px;height:60px"><button aria-label="Menu" ${B.replace('position:absolute;', 'position:absolute;left:240px;top:8px;')}>M</button></header>` +
  `<button aria-label="Top left" ${B.replace('position:absolute;', 'position:absolute;left:20px;top:120px;')}>A</button>` +
  `<button aria-label="Far right" ${B.replace('position:absolute;', 'position:absolute;left:240px;top:1500px;')}>B</button>` +
  `<button aria-label="Centre" ${B.replace('position:absolute;', 'position:absolute;left:128px;top:900px;')}>C</button>` +
  `<div style="position:sticky;top:0;height:0"><a href="/s" aria-label="Sticky" style="position:absolute;left:20px;top:330px;width:44px;height:44px;display:block">S</a></div>` +
  `<nav style="position:fixed;bottom:0;left:0;width:300px;height:60px"><button aria-label="Bar" ${B.replace('position:absolute;', 'position:absolute;left:128px;top:8px;')}>D</button></nav>` +
  '</body></html>';

const ctl = (name: string, left: number, top: number, pinned = false) => ({ id: `button[${name}]`, name, left, top, width: 44, height: 44, pinned });
const PAGE: ZoneFacts = {
  controls: [ctl('A control with a long name that has to wrap at 320 pixels', 240, 8, true), ctl('', 20, 120), ctl('Far right', 240, 1500)],
  viewportWidth: 320,
  viewportHeight: 640,
  scrollY: 0,
  maxScrollY: 1400,
  offPage: 1,
  truncated: true,
};
const read = () => PAGE;
const bottom = noCells().map((_, i) => i >= 9);
const checked = (lang: 'en' | 'fr'): ZonesState => zonesStep({ ...initialZonesState(), cells: bottom }, 'zones-check', lang, read).state;

const SITE: Record<string, string> = {
  '/layout': LAYOUT,
  '/zones-first-en': pageAround(renderZonesPanel('en', initialZonesState()), 'en'),
  '/zones-first-fr': pageAround(renderZonesPanel('fr', initialZonesState()), 'fr'),
  '/zones-checked-en': pageAround(renderZonesPanel('en', checked('en')), 'en'),
  '/zones-checked-fr': pageAround(renderZonesPanel('fr', checked('fr')), 'fr'),
  '/zones-error-en': pageAround(renderZonesPanel('en', zonesStep(initialZonesState(), 'zones-check', 'en', read).state), 'en'),
  '/zones-all-en': pageAround(renderZonesPanel('en', zonesStep({ ...initialZonesState(), cells: allCells() }, 'zones-check', 'en', read).state), 'en'),
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

/** What these tests use of a Playwright page beyond what the audit needs. */
interface ZonePage extends FullPage {
  goto(url: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
}

interface Launched {
  page: ZonePage;
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
      return { page: (await context.newPage()) as ZonePage, close: () => browser.close() };
    } catch {
      // try the next package
    }
  }
  throw new Error('playwright-core or @playwright/test is needed for NARROW_E2E=1');
}

describe.skipIf(!enabled)('"Screen zones I can reach" in a real browser', () => {
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

  const readAt = async (scroll: number): Promise<ZoneFacts> => {
    await b.page.evaluate((y: number) => (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, y), scroll);
    return b.page.evaluate(zonesInPage, ZONE_ARGS);
  };

  it('reads the boxes, the window and the scroll range the browser lays out, and which controls stay in place', async () => {
    await b.page.setViewportSize({ width: W, height: H });
    await b.page.goto(`${s.base}/layout`);
    const f = await readAt(0);
    expect([f.viewportWidth, f.viewportHeight, f.scrollY, f.maxScrollY, f.offPage, f.truncated]).toEqual([W, H, 0, 2000 - H, 1, false]);
    expect(f.controls.map((c) => [c.name, Math.round(c.left), Math.round(c.top), c.pinned])).toEqual([
      ['Menu', 240, 8, true],
      ['Top left', 20, 120, false],
      ['Far right', 240, 1500, false],
      ['Centre', 128, 900, false],
      ['Sticky', 20, 330, true],
      ['Bar', 128, 348, true],
    ]);
  }, 60_000);

  it('moves the boxes of controls that scroll, and not of those that stay in place', async () => {
    await b.page.setViewportSize({ width: W, height: H });
    await b.page.goto(`${s.base}/layout`);
    const top = await readAt(0);
    const down = await readAt(500);
    expect(down.scrollY).toBe(500);
    for (let i = 0; i < top.controls.length; i += 1) {
      const a = top.controls[i];
      const z = down.controls[i];
      if (!a || !z) throw new Error('missing control');
      expect(Math.round(a.top - z.top), a.name).toBe(a.pinned ? 0 : 500);
    }
  }, 60_000);

  it('gives the same result however far the page is scrolled when it is read', async () => {
    await b.page.setViewportSize({ width: W, height: H });
    await b.page.goto(`${s.base}/layout`);
    const cells = noCells().map((_, i) => i === 9 || i === 10);
    const outAt = async (y: number) => {
      const c = checkZones(await readAt(y), cells);
      if (c.kind !== 'result') throw new Error(c.kind);
      return c.result.out.map((o) => `${o.control.name}:${o.why ?? ''}`);
    };
    const first = await outAt(0);
    // Top left is near the top of the page, so scrolling can only bring it up, never into the bottom row.
    expect(first).toEqual(['Menu:pinned', 'Top left:scroll-range', 'Far right:column']);
    expect(await outAt(700)).toEqual(first);
    expect(await outAt(2000)).toEqual(first);
  }, 60_000);

  it('counts the controls each zone can take the same way at any scroll', async () => {
    await b.page.setViewportSize({ width: W, height: H });
    await b.page.goto(`${s.base}/layout`);
    const counts = zoneCounts(await readAt(0));
    // Menu at the top right; Top left only in the top two rows of the left column; Far right in its whole column;
    // Centre in its whole column; Sticky and Bar where they stay.
    expect(counts).toEqual([1, 1, 2, 1, 1, 1, 0, 1, 1, 1, 2, 1]);
    expect(zoneCounts(await readAt(900))).toEqual(counts);
  }, 60_000);

  const run = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await run(['/zones-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the checked panel has no measured failure in English, in any profile', async () => {
    expect(failing(await run(['/zones-checked-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, with an error by the grid, nor with every zone marked', async () => {
    expect(failing(await run(['/zones-first-fr', '/zones-checked-fr', '/zones-error-en', '/zones-all-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
