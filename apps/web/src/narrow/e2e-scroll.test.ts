import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { buildScroll, scrollNotes } from './scroll-effort.js';
import { SCROLL_ARGS, scrollInPage, type ScrollFacts } from './scroll-inpage.js';
import { initialScrollState, renderScrollPanel, scrollStep, type ScrollPanelState } from './scroll-panel.js';

/**
 * "Scroll effort on this page" in Chromium, when NARROW_E2E=1 and a Chromium
 * is installed. It shows that:
 *
 * - `scrollInPage` reads the page height, the headings, the send buttons, the
 *   last control and the fixed bars as the browser lays them out, the same at
 *   any scroll position, and moves nothing;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how far anyone scrolls with one gesture.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const W = 320;
const H = 640;
const LONG =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Long</title>' +
  '<style>body{margin:0}header{position:fixed;top:0;left:0;right:0;height:64px}footer{position:fixed;bottom:0;left:0;right:0;height:96px}main{padding-top:64px}' +
  '.gap{height:2000px}h1,h2{margin:0;height:40px}</style></head><body>' +
  '<header><a href="/" aria-label="Home">H</a></header>' +
  '<main><h1>Places near you</h1><div class="gap"></div><h2>Hours</h2><div class="gap"></div>' +
  '<form><label for="t">Town</label><input id="t"><button>Send</button></form><div class="gap"></div><a href="/c">Contact</a></main>' +
  '<footer><a href="#">Top</a></footer></body></html>';

const PAGE: ScrollFacts = {
  viewportWidth: 320,
  viewportHeight: 640,
  pageHeight: 6400,
  headings: [
    { level: 1, text: 'A heading with a long name that has to wrap at 320 pixels', top: 80, inMain: true },
    { level: 2, text: 'Contact', top: 6000, inMain: true },
  ],
  submits: [{ name: 'Send', top: 6200 }],
  lastControl: { name: 'Back to top', top: 6300 },
  toTop: 0,
  coveredTop: 64,
  coveredBottom: 120,
};
const counted = (lang: 'en' | 'fr'): ScrollPanelState => scrollStep(initialScrollState(), lang, () => PAGE).state;

const SITE: Record<string, string> = {
  '/long': LONG,
  '/scroll-first-en': pageAround(renderScrollPanel('en', initialScrollState()), 'en'),
  '/scroll-first-fr': pageAround(renderScrollPanel('fr', initialScrollState()), 'fr'),
  '/scroll-counted-en': pageAround(renderScrollPanel('en', counted('en')), 'en'),
  '/scroll-counted-fr': pageAround(renderScrollPanel('fr', counted('fr')), 'fr'),
  '/scroll-unknown-en': pageAround(renderScrollPanel('en', { facts: { ...PAGE, viewportHeight: null }, notice: '' }), 'en'),
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
interface LongPage {
  goto(url: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  evaluate<R>(fn: () => R): Promise<R>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
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

describe.skipIf(!enabled)('"Scroll effort on this page" in a real browser', () => {
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

  const page = (): LongPage => b.page as unknown as LongPage;
  const readAt = async (y: number): Promise<ScrollFacts & { after: number }> => {
    await page().evaluate((to: number) => (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, to), y);
    const f = await page().evaluate(scrollInPage, SCROLL_ARGS);
    const after = await page().evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY);
    return { ...f, after };
  };

  it('reads the page height, headings, send button, last control and fixed bars as laid out', async () => {
    await page().setViewportSize({ width: W, height: H });
    await page().goto(`${s.base}/long`);
    const f = await readAt(0);
    expect([f.viewportWidth, f.viewportHeight, f.coveredTop, f.coveredBottom, f.toTop]).toEqual([W, H, 64, 96, 1]);
    expect(f.headings.map((h) => [h.level, h.text, h.top, h.inMain])).toEqual([
      [1, 'Places near you', 64, true],
      [2, 'Hours', 2104, true],
    ]);
    expect(f.submits.map((x) => x.name)).toEqual(['Send']);
    expect(f.lastControl?.name).toBe('Contact');
    expect(f.pageHeight).toBeGreaterThan(6000);
  }, 60_000);

  it('gives the same facts at any scroll, and does not move the page while reading', async () => {
    await page().setViewportSize({ width: W, height: H });
    await page().goto(`${s.base}/long`);
    const top = await readAt(0);
    const down = await readAt(3000);
    expect(down.after).toBe(3000);
    expect(down.headings).toEqual(top.headings);
    expect(down.submits).toEqual(top.submits);
    expect(down.lastControl).toEqual(top.lastControl);
    expect([down.coveredTop, down.coveredBottom]).toEqual([top.coveredTop, top.coveredBottom]);
  }, 60_000);

  it('points to the long stretches of this page and to the send button far down', async () => {
    await page().setViewportSize({ width: W, height: H });
    await page().goto(`${s.base}/long`);
    const kinds = scrollNotes(buildScroll(await readAt(0)), 'en').map((n) => n.kind);
    expect(kinds).toContain('long-stretch');
    expect(kinds).toContain('submit-far');
    expect(kinds).not.toContain('no-to-top');
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await audit(['/scroll-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the counted panel has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/scroll-counted-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor with an UNKNOWN result', async () => {
    expect(failing(await audit(['/scroll-first-fr', '/scroll-counted-fr', '/scroll-unknown-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
