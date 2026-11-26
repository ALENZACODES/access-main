import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { HOVER_ARGS, hoverInPage, type HoverFacts, type HoverRule } from './hover-inpage.js';
import { hoverStep, initialHoverState, renderHoverPanel, type HoverPanelState } from './hover-panel.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Shown on hover only" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - `hoverInPage` finds a menu shown on hover only, and a tip with a focus
 *   rule, and that a real hover shows the menu while keyboard focus does not
 *   (so the rule found is the barrier it is said to be);
 * - a style sheet from another origin is counted as not read;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const MENU =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Menu</title>' +
  '<link rel="stylesheet" href="__OTHER__/other.css">' +
  '<style>body{margin:0;font:16px sans-serif}a{display:inline-block;min-height:44px;min-width:44px}' +
  'nav ul ul{display:none} nav li:hover > ul{display:block}' +
  '.tip{visibility:hidden} .host:hover .tip,.host:focus-within .tip{visibility:visible}</style></head><body><main>' +
  '<nav><ul><li><a href="#travel" id="travel">Travel</a><ul><li><a href="#bus" id="bus">Bus</a></li></ul></li></ul></nav>' +
  '<p class="host"><a href="#help">Help</a> <span class="tip">Opens the help page</span></p>' +
  '<div class="hoveronly"><style>.hoveronly .x:hover .y{display:block}</style></div>' +
  '</main></body></html>';

const rule = (selector: string, extra: Partial<HoverRule> = {}): HoverRule => ({ selector, reveals: ['display'], twin: false, hiddenNow: 0, controlsHidden: 0, controlNames: [], ...extra });
const FACTS: HoverFacts = {
  rules: [
    ...Array.from({ length: 12 }, (_, i) => rule(`.a-rather-long-class-name-${i}:hover > .another-long-class-name`, { hiddenNow: 1, controlsHidden: 1, controlNames: ['A link with a long name'] })),
    rule('.menu:hover .sub', { twin: true }),
  ],
  sheetsRead: 3,
  sheetsUnread: 2,
  deviceHover: false,
  truncated: true,
};
const readState = (lang: 'en' | 'fr', ability: 'can' | 'cannot' | 'unsure'): HoverPanelState => {
  const answered = hoverStep(initialHoverState(), 'hover-ability', ability, lang, () => FACTS).state;
  return hoverStep(answered, 'hover-read', null, lang, () => FACTS).state;
};

const SITE: Record<string, string> = {
  '/menu': MENU,
  '/other.css': '.far:hover .away{display:block}',
  '/hover-first-en': pageAround(renderHoverPanel('en', initialHoverState()), 'en'),
  '/hover-first-fr': pageAround(renderHoverPanel('fr', initialHoverState()), 'fr'),
  '/hover-cannot-en': pageAround(renderHoverPanel('en', readState('en', 'cannot')), 'en'),
  '/hover-cannot-fr': pageAround(renderHoverPanel('fr', readState('fr', 'cannot')), 'fr'),
  '/hover-can-en': pageAround(renderHoverPanel('en', readState('en', 'can')), 'en'),
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
    res.writeHead(html ? 200 : 404, { 'content-type': (req.url ?? '').endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
    res.end(html ?? 'not found');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise<void>((ok) => server.close(ok)) };
}

interface HoverPage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  evaluate<R>(fn: () => R): Promise<R>;
  hover(selector: string): Promise<void>;
  focus(selector: string): Promise<void>;
  mouse: { move(x: number, y: number): Promise<void> };
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

describe.skipIf(!enabled)('"Shown on hover only" in a real browser', () => {
  let b: Launched;
  let s: Served;
  beforeAll(async () => {
    s = await serve();
    // The menu page links a sheet from another origin: the same server, named another way.
    SITE['/menu'] = MENU.replace('__OTHER__', s.base.replace('127.0.0.1', 'localhost'));
    b = await launch();
  }, 60_000);
  afterAll(async () => {
    await b?.close();
    await s?.close();
  });

  const page = (): HoverPage => b.page as unknown as HoverPage;
  const shown = (id: string) => page().evaluate((x: string) => getComputedStyle(document.getElementById(x)?.closest('ul') as Element).display !== 'none', id);

  it('finds the menu shown on hover only, the tip with a focus rule, and the sheet it could not read', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/menu`);
    const f = await page().evaluate(hoverInPage, { ...HOVER_ARGS, exclude: '.hoveronly' });
    expect(f.rules.map((r) => [r.selector, r.reveals, r.twin, r.hiddenNow, r.controlsHidden, r.controlNames])).toEqual([
      ['nav li:hover > ul', ['display'], false, 1, 1, ['Bus']],
      ['.host:hover .tip', ['visibility'], true, 1, 0, []],
    ]);
    expect(f.sheetsUnread).toBe(1);
    expect(f.sheetsRead).toBe(1);
    expect(f.deviceHover).toBe(true);
  }, 60_000);

  it('the menu really shows on hover and stays hidden on keyboard focus', async () => {
    await page().goto(`${s.base}/menu`);
    expect(await shown('bus')).toBe(false);
    await page().focus('#travel');
    expect(await shown('bus')).toBe(false);
    await page().hover('#travel');
    expect(await shown('bus')).toBe(true);
    await page().mouse.move(300, 600);
    expect(await shown('bus')).toBe(false);
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-21T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and with a result has no measured failure in English, in any profile', async () => {
    const report = await audit(['/hover-first-en', '/hover-cannot-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 300_000);

  it('the panel has no measured failure in French, nor for a person who can hover', async () => {
    expect(failing(await audit(['/hover-first-fr', '/hover-cannot-fr', '/hover-can-en'], first)).join('\n')).toBe('');
  }, 240_000);
});
