import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { HIT_ARGS, hitInPage, type HitControl, type HitFacts } from './hit-inpage.js';
import { buildHit } from './hit.js';
import { hitStep, initialHitState, renderHitPanel, type HitPanelState } from './hit-panel.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Covered controls" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - `hitInPage` finds, at 320 by 640 pixels, a button under a cookie bar fixed
 *   to the bottom of the screen and a button half under a layer that shows
 *   nothing; it scrolls a control below the screen up to test it, and puts
 *   the page back; the last control of the page, which cannot scroll clear of
 *   the bar, is found covered; a button with a span inside and a check box
 *   reached through its label count as clear;
 * - a real click at the middle of the covered button reaches the bar, not the
 *   button, so what is found is what a press does;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const COVERED =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Covered</title>' +
  '<style>body{margin:0;font:16px sans-serif}button{display:block;min-height:44px;min-width:120px;margin:8px}' +
  '#bar{position:fixed;left:0;right:0;bottom:0;height:120px;background:#fff;border-top:1px solid}' +
  '#veil{position:absolute;left:0;top:120px;width:60px;height:60px}.spacer{height:400px}</style></head><body><main>' +
  '<button id="clear"><span>Clear</span></button>' +
  '<label><input type="checkbox" id="agree"> I agree</label>' +
  '<button id="menu" style="margin-top:40px">Menu</button><div id="veil"></div>' +
  '<div class="spacer"></div><button id="send">Send</button>' +
  '<div class="spacer"></div><button>Mid below</button>' +
  '<div class="spacer"></div><button>Far below</button>' +
  '<div id="bar">We use cookies <button>OK</button></div>' +
  '<section class="hittest"><button>Mine</button></section>' +
  '<script>window.__clicked=[];document.addEventListener("click",function(e){window.__clicked.push(e.target.id||e.target.tagName)},true)</script>' +
  '</main></body></html>';

const c = (name: string, reached: number): HitControl => ({ id: `button[${name}]`, name, reached, cover: reached === 5 ? null : { what: 'div#a-banner-with-a-long-name.cookie-consent', name: 'We use cookies to make this site work', pinned: true, invisible: false } });
const FACTS: HitFacts = { controls: [...Array.from({ length: 18 }, (_, i) => c(`A control with a long name ${i}`, i % 3 === 0 ? 0 : 2)), c('Clear', 5)], offScreen: 7, truncated: true };
const read = (lang: 'en' | 'fr', facts: HitFacts = FACTS): HitPanelState => hitStep(initialHitState(), lang, () => facts).state;

const SITE: Record<string, string> = {
  '/covered': COVERED,
  '/hit-first-en': pageAround(renderHitPanel('en', initialHitState()), 'en'),
  '/hit-first-fr': pageAround(renderHitPanel('fr', initialHitState()), 'fr'),
  '/hit-read-en': pageAround(renderHitPanel('en', read('en')), 'en'),
  '/hit-read-fr': pageAround(renderHitPanel('fr', read('fr')), 'fr'),
  '/hit-clear-en': pageAround(renderHitPanel('en', read('en', { controls: [c('A', 5)], offScreen: 0, truncated: false })), 'en'),
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

interface HitPage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  evaluate<R>(fn: () => R): Promise<R>;
  mouse: { click(x: number, y: number): Promise<void> };
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

describe.skipIf(!enabled)('"Covered controls" in a real browser', () => {
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

  const page = (): HitPage => b.page as unknown as HitPage;

  it('finds the button under the fixed bar and the one under an invisible layer, scrolling to what is below and back', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/covered`);
    const f = await page().evaluate(hitInPage, { ...HIT_ARGS, exclude: '.hittest' });
    const by = (name: string) => f.controls.find((x) => x.name === name);
    expect(by('Clear')?.reached).toBe(5);
    expect(by('I agree')?.reached).toBe(5);
    expect(by('Menu')?.reached).toBeGreaterThan(0);
    expect(by('Menu')?.reached).toBeLessThan(5);
    expect(by('Menu')?.cover).toMatchObject({ what: 'div#veil', invisible: true, pinned: false });
    expect(by('Send')?.reached).toBe(0);
    expect(by('Send')?.cover).toMatchObject({ what: 'div#bar', pinned: true, invisible: false });
    expect(by('OK')?.reached).toBe(5);
    // Below the screen, a control is scrolled up as far as the page allows. "Mid below" reaches the middle and is clear;
    // "Far below" ends the page, which cannot scroll further, so it stays under the bar: the page leaves no room under it.
    expect(by('Mid below')?.reached).toBe(5);
    expect(by('Far below')?.reached).toBe(0);
    expect(by('Far below')?.cover?.pinned).toBe(true);
    expect(f.offScreen).toBe(0);
    // The page is put back where it was.
    expect(await page().evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY)).toBe(0);
    expect(f.controls.map((x) => x.name)).not.toContain('Mine');
    const m = buildHit(f);
    expect([m.covered, m.partly, m.pinnedCovers, m.invisibleCovers]).toEqual([2, 1, 2, 1]);
  }, 60_000);

  it('a real click at the middle of the covered button reaches the bar, not the button', async () => {
    await page().goto(`${s.base}/covered`);
    const mid = await page().evaluate(() => {
      const r = (globalThis as unknown as { document: { getElementById(id: string): { getBoundingClientRect(): { left: number; top: number; width: number; height: number } } | null } }).document.getElementById('send')?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
    });
    await page().mouse.click(mid.x, mid.y);
    const clicked = await page().evaluate(() => (globalThis as unknown as { __clicked: string[] }).__clicked);
    expect(clicked).toEqual(['bar']);
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-21T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and with a result has no measured failure in English, in any profile', async () => {
    const report = await audit(['/hit-first-en', '/hit-read-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 300_000);

  it('the panel has no measured failure in French, nor with every control clear', async () => {
    expect(failing(await audit(['/hit-first-fr', '/hit-read-fr', '/hit-clear-en'], first)).join('\n')).toBe('');
  }, 240_000);
});
