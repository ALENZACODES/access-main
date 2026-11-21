import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyDragTrial, giveUpDrag, type DragTry } from './drag-trial.js';
import { pageAround } from './fit-testkit.js';
import { GESTURE_ARGS, gestureInPage, type GestureFacts } from './gesture-inpage.js';
import { gesturesStep, initialGesturesState, renderGesturesPanel, type GesturesPanelState } from './gestures-panel.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Dragging and gestures" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - `gestureInPage` finds, as laid out, a slider with its plus and minus
 *   buttons, an area that takes touch for itself and a strip that scrolls
 *   sideways and snaps (jsdom knows neither touch-action nor
 *   scroll-snap-type), and leaves out the excluded part;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how anyone drags. Real dragging of the handle is in
 * e2e/narrow-gestures.spec.ts, on the built app.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const CONTROLS =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Controls</title>' +
  '<style>.strip{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;width:300px}.strip div{flex:0 0 280px;height:100px;scroll-snap-align:start}' +
  '.pad{touch-action:none;width:200px;height:120px;border:1px solid}.tiny{touch-action:none;width:20px;height:20px}</style></head><body><main>' +
  '<div><label for="v">Volume</label><input id="v" type="range"><button>-</button><button>+</button></div>' +
  '<div class="pad" aria-label="Signature pad"></div><div class="tiny"></div>' +
  '<div class="pad" aria-label="Sketch"><button>Clear</button></div>' +
  '<div class="strip" aria-label="Places"><div>One</div><div>Two</div><div>Three</div></div>' +
  '<section class="gest"><input type="range" aria-label="Mine"></section>' +
  '</main></body></html>';

const item = (kind: GestureFacts['items'][number]['kind'], name: string, alternatives: string[] = []) => ({ id: `${kind}[${name}]`, kind, name, alternatives, keyboard: null });
const PAGE: GestureFacts = {
  items: [item('slider', 'A slider with a long name that has to wrap at 320 pixels', ['+']), item('draggable', 'Stop 2'), item('canvas', 'Map'), item('sideways', 'Places')],
  truncated: true,
};
const tr = (reached: boolean, ms: number): DragTry => ({ start: 0, end: ms, reached, furthest: reached ? 1 : 0.5, pointerType: 'mouse' });
const done = (lang: 'en' | 'fr'): GesturesPanelState => gesturesStep({ ...initialGesturesState(), trial: { tries: [tr(true, 900), tr(false, 300), tr(true, 1_400)], current: null, gaveUp: false } }, 'gest-read', lang, () => PAGE).state;
const testing = (lang: 'en' | 'fr'): GesturesPanelState => gesturesStep(initialGesturesState(), 'gest-start', lang, () => PAGE).state;
const cannot = (lang: 'en' | 'fr'): GesturesPanelState => gesturesStep({ ...initialGesturesState(), trial: giveUpDrag(emptyDragTrial()) }, 'gest-read', lang, () => ({ items: [], truncated: false })).state;

const SITE: Record<string, string> = {
  '/controls': CONTROLS,
  '/gest-first-en': pageAround(renderGesturesPanel('en', initialGesturesState()), 'en'),
  '/gest-first-fr': pageAround(renderGesturesPanel('fr', initialGesturesState()), 'fr'),
  '/gest-test-en': pageAround(renderGesturesPanel('en', testing('en')), 'en'),
  '/gest-test-fr': pageAround(renderGesturesPanel('fr', testing('fr')), 'fr'),
  '/gest-done-en': pageAround(renderGesturesPanel('en', done('en')), 'en'),
  '/gest-done-fr': pageAround(renderGesturesPanel('fr', done('fr')), 'fr'),
  '/gest-cannot-en': pageAround(renderGesturesPanel('en', cannot('en')), 'en'),
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

interface GesturePage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
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

describe.skipIf(!enabled)('"Dragging and gestures" in a real browser', () => {
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

  const page = (): GesturePage => b.page as unknown as GesturePage;

  it('finds the slider, the touch area and the sideways strip as laid out, and leaves out the excluded part', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/controls`);
    const f = await page().evaluate(gestureInPage, { ...GESTURE_ARGS, exclude: '.gest' });
    expect(f.items.map((i) => [i.kind, i.name, i.alternatives, i.keyboard])).toEqual([
      ['slider', 'Volume', ['-', '+'], true],
      ['touch-none', 'Signature pad', [], false],
      ['touch-none', 'Sketch', ['Clear'], false],
      ['sideways', 'Places', [], false],
    ]);
    expect(f.truncated).toBe(false);
    const all = await page().evaluate(gestureInPage, GESTURE_ARGS);
    expect(all.items.map((i) => i.name)).toContain('Mine');
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and while testing has no measured failure in English, in any profile', async () => {
    const report = await audit(['/gest-first-en', '/gest-test-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 240_000);

  it('the panel with a result has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/gest-done-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor after saying dragging is not possible', async () => {
    expect(failing(await audit(['/gest-first-fr', '/gest-test-fr', '/gest-done-fr', '/gest-cannot-en'], first)).join('\n')).toBe('');
  }, 240_000);
});
