import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { MOVING_ARGS, movingLookInPage, type MovingControl, type MovingLook } from './moving-inpage.js';
import { compareLooks } from './moving.js';
import { initialMovingState, movingFinish, movingStart, renderMovingPanel, type MovingPanelState } from './moving-panel.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Things that move" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - two looks with `movingLookInPage` find a control pushed down by a banner
 *   inserted above it, a control that appeared, an endless animation on a
 *   button and a finite one elsewhere, a pause button, and the reduced motion
 *   setting as Chromium emulates it;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how anyone aims.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const SHIFTY =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shifty</title>' +
  '<style>body{margin:0;font:16px sans-serif}button{min-height:44px;min-width:44px}@keyframes wobble{from{transform:translateX(0)}to{transform:translateX(20px)}}' +
  '#spin{animation:wobble 1s infinite alternate}#once{animation:wobble 5s 1}.banner{height:120px}</style></head><body><main>' +
  '<div id="top"></div><button id="send">Send</button><p id="once">Note</p><button id="spin">Offer</button><button>Pause the offers</button>' +
  '<section class="moving"><button>Mine</button></section>' +
  '<script>setTimeout(function(){var d=document.createElement("div");d.className="banner";d.innerHTML="<button>Accept cookies</button>";document.getElementById("top").appendChild(d)},300)</script>' +
  '</main></body></html>';

const c = (name: string, top: number): MovingControl => ({ id: `button[${name}]`, name, left: 0, top, width: 80, height: 44 });
const look = (at: number, controls: MovingControl[], extra: Partial<MovingLook> = {}): MovingLook => ({ at, controls, animations: [], pauseControls: [], reduceMotion: false, truncated: false, ...extra });
const BEFORE = look(0, Array.from({ length: 14 }, (_, i) => c(`A control with a long name to wrap ${i}`, i * 50)));
const AFTER = look(
  5_000,
  Array.from({ length: 14 }, (_, i) => c(`A control with a long name to wrap ${i}`, i * 50 + 120)),
  { animations: [{ target: 'div#carousel', name: 'slide', endless: true, control: true }], reduceMotion: true, truncated: true },
);
const done = (lang: 'en' | 'fr'): MovingPanelState => movingFinish(movingStart(initialMovingState(), BEFORE, lang), AFTER, lang);

const SITE: Record<string, string> = {
  '/shifty': SHIFTY,
  '/moving-first-en': pageAround(renderMovingPanel('en', initialMovingState()), 'en'),
  '/moving-first-fr': pageAround(renderMovingPanel('fr', initialMovingState()), 'fr'),
  '/moving-watch-en': pageAround(renderMovingPanel('en', movingStart(initialMovingState(), BEFORE, 'en')), 'en'),
  '/moving-done-en': pageAround(renderMovingPanel('en', done('en')), 'en'),
  '/moving-done-fr': pageAround(renderMovingPanel('fr', done('fr')), 'fr'),
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

interface MovingPage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  emulateMedia(o: { reducedMotion: "reduce" | "no-preference" | null }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
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

describe.skipIf(!enabled)('"Things that move" in a real browser', () => {
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

  const page = (): MovingPage => b.page as unknown as MovingPage;

  it('finds what moved, appeared and animates between two looks, and the reduced motion setting', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().emulateMedia({ reducedMotion: 'reduce' });
    await page().goto(`${s.base}/shifty`);
    const first = await page().evaluate(movingLookInPage, { ...MOVING_ARGS, exclude: '.moving' });
    await page().waitForTimeout(900);
    const second = await page().evaluate(movingLookInPage, { ...MOVING_ARGS, exclude: '.moving' });
    const m = compareLooks(first, second);
    expect(m.moved.filter((x) => x.left).map((x) => x.control.name)).toEqual(expect.arrayContaining(['Send']));
    expect(m.appeared.map((x) => x.name)).toEqual(['Accept cookies']);
    expect(m.gone).toEqual([]);
    expect(m.animations?.map((a) => [a.target, a.endless, a.control])).toEqual(
      expect.arrayContaining([
        ['button#spin', true, true],
        ['p#once', false, false],
      ]),
    );
    expect(m.pauseControls).toEqual(['Pause the offers']);
    expect(m.reduceMotion).toBe(true);
    expect(m.seconds).toBeGreaterThanOrEqual(0.8);
    expect(second.controls.map((x) => x.name)).not.toContain('Mine');
    await page().emulateMedia({ reducedMotion: null });
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-21T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first, while watching and with a result has no measured failure in English, in any profile', async () => {
    const report = await audit(['/moving-first-en', '/moving-watch-en', '/moving-done-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 300_000);

  it('the panel has no measured failure in French', async () => {
    expect(failing(await audit(['/moving-first-fr', '/moving-done-fr'], first)).join('\n')).toBe('');
  }, 240_000);
});
