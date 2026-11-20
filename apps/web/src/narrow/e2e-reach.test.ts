import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { REACH_ARGS, reachInPage, type ReachFacts } from './reach-inpage.js';
import { initialReachState, reachStep, renderReachPanel, type ReachPanelState } from './reach-panel.js';
import { buildReach } from './reach.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Reaching controls by keyboard or switch" in Chromium. Two things are
 * shown here, when NARROW_E2E=1 and a Chromium is installed:
 *
 * - the order worked out by `reachInPage` is the order real Tab presses
 *   follow on the test pages, and the presses counted through a skip link
 *   are the presses it really takes;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how a switch, a screen reader or another browser behaves.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

/** Every control has an aria-label, so the focused element can be named the same way as a stop. */
const MIXED =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Order</title></head><body>' +
  '<header><a href="#content" aria-label="Skip">Skip to content</a><a href="/home" aria-label="Home">Home</a></header>' +
  '<nav aria-label="Menu"><a href="/1" aria-label="M1">One</a><a href="/2" aria-label="M2">Two</a><a aria-label="NoHref">No href</a><a href="/3" aria-label="M3">Three</a></nav>' +
  '<main id="content"><h1>Order</h1><button tabindex="2" aria-label="P2">Second</button><button tabindex="1" aria-label="P1">First</button>' +
  '<input type="radio" name="size" aria-label="Small"><input type="radio" name="size" aria-label="Medium" checked><input type="radio" name="size" aria-label="Large">' +
  '<details><summary aria-label="More">More</summary><a href="/in" aria-label="Inside">Inside</a></details>' +
  '<button disabled aria-label="Off">Off</button><button style="display:none" aria-label="Gone">Gone</button><div hidden><a href="/h" aria-label="HiddenLink">x</a></div>' +
  '<span tabindex="0" aria-label="Span">Span</span><button tabindex="-1" aria-label="Minus">Minus</button>' +
  '<button style="width:0;height:0;padding:0;border:0;overflow:hidden" aria-label="NoBox">x</button>' +
  '<label for="q">Town</label><input id="q" aria-label="Town"><select aria-label="Pick"><option>A</option></select>' +
  '<div inert><button aria-label="Inert">Inert</button></div></main>' +
  '<footer><a href="/c" aria-label="Contact">Contact</a></footer></body></html>';

/** The same page with no positive tabindex, so the presses through the skip link are counted. */
const PLAIN = MIXED.replace('<button tabindex="2" aria-label="P2">Second</button><button tabindex="1" aria-label="P1">First</button>', '');

/** A skip link to a field that can take focus itself, so the Enter lands on it. */
const LANDS =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lands</title></head><body>' +
  '<a href="#q" aria-label="ToField">To the field</a><a href="/a" aria-label="A">A</a><a href="/b" aria-label="B">B</a><a href="/c" aria-label="C">C</a>' +
  '<main><input id="q" aria-label="Field"><a href="/d" aria-label="D">D</a></main></body></html>';

const PAGE: ReachFacts = {
  stops: [
    { id: 'a[0]', tag: 'a', name: 'Skip to content', landmark: 'banner', jumpTo: 5, jumpsToMain: true, jumpLands: false },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `a[${i + 1}]`, tag: 'a', name: `A menu link with a long name, number ${i + 1}`, landmark: 'navigation' as const, jumpTo: null, jumpsToMain: false, jumpLands: false })),
    { id: `button#${'very-long-identifier-'.repeat(4)}[0]`, tag: 'button', name: '', landmark: 'main', jumpTo: null, jumpsToMain: false, jumpLands: false },
  ],
  invisible: 1,
  positive: 1,
  truncated: true,
};
const counted = (lang: 'en' | 'fr'): ReachPanelState => reachStep(initialReachState(), 'reach-count', lang, () => PAGE).state;
const timed = (lang: 'en' | 'fr'): ReachPanelState => reachStep({ ...counted(lang), intervalText: lang === 'fr' ? '1,5' : '1.5' }, 'reach-apply', lang, () => PAGE).state;

const SITE: Record<string, string> = {
  '/order': MIXED,
  '/plain': PLAIN,
  '/lands': LANDS,
  '/reach-first-en': pageAround(renderReachPanel('en', initialReachState()), 'en'),
  '/reach-first-fr': pageAround(renderReachPanel('fr', initialReachState()), 'fr'),
  '/reach-counted-en': pageAround(renderReachPanel('en', timed('en')), 'en'),
  '/reach-counted-fr': pageAround(renderReachPanel('fr', timed('fr')), 'fr'),
  '/reach-error-en': pageAround(renderReachPanel('en', reachStep({ ...counted('en'), intervalText: 'fast' }, 'reach-apply', 'en', () => PAGE).state), 'en'),
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
interface KeyPage extends FullPage {
  goto(url: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  evaluate<R>(fn: () => R): Promise<R>;
  keyboard: { press(key: string): Promise<unknown> };
}

interface Launched {
  page: KeyPage;
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
      return { page: (await context.newPage()) as KeyPage, close: () => browser.close() };
    } catch {
      // try the next package
    }
  }
  throw new Error('playwright-core or @playwright/test is needed for NARROW_E2E=1');
}

describe.skipIf(!enabled)('"Reaching controls by keyboard or switch" in a real browser', () => {
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

  const focusedName = (): Promise<string> => b.page.evaluate(() => (globalThis as unknown as { document: { activeElement: { getAttribute(n: string): string | null } | null } }).document.activeElement?.getAttribute('aria-label') ?? '');
  const readFacts = (): Promise<ReachFacts> => b.page.evaluate(reachInPage, REACH_ARGS);

  /** The aria-labels met by pressing Tab from the top, until focus leaves the page or comes back to the first. */
  async function tabWalk(max: number): Promise<string[]> {
    const met: string[] = [];
    for (let i = 0; i < max; i += 1) {
      await b.page.keyboard.press('Tab');
      const name = await focusedName();
      if (name === '' || name === met[0]) break;
      met.push(name);
    }
    return met;
  }

  it('the order worked out is the order real Tab presses follow', async () => {
    await b.page.goto(`${s.base}/order`);
    const facts = await readFacts();
    const walked = await tabWalk(40);
    expect(facts.stops.map((x) => x.name)).toEqual(walked);
    expect(walked).toEqual(['P1', 'P2', 'Skip', 'Home', 'M1', 'M2', 'M3', 'Medium', 'More', 'Span', 'NoBox', 'Town', 'Pick', 'Contact']);
    expect([facts.positive, facts.invisible]).toEqual([2, 1]);
    expect(facts.stops.map((x) => x.landmark)).toEqual(['main', 'main', 'banner', 'banner', 'navigation', 'navigation', 'navigation', 'main', 'main', 'main', 'main', 'main', 'main', 'contentinfo']);
  }, 60_000);

  it('leaves the presses through the skip link UNKNOWN on a page with a positive tabindex, where Chromium mixes the two orders', async () => {
    await b.page.goto(`${s.base}/order`);
    const model = buildReach(await readFacts());
    expect(model.skip).toMatchObject({ at: 2, toMain: true });
    expect(model.stops.every((x) => x.viaSkip === null)).toBe(true);
    // What Chromium does: from the place the link points to, the next Tab goes to the next control in the document, here a positive one, then on in tab order.
    for (let i = 0; i < 3; i += 1) await b.page.keyboard.press('Tab');
    expect(await focusedName()).toBe('Skip');
    await b.page.keyboard.press('Enter');
    const met: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await b.page.keyboard.press('Tab');
      met.push(await focusedName());
    }
    expect(met).toEqual(['P2', 'Skip', 'Home']);
  }, 60_000);

  it('the presses through the skip link are the presses it really takes', async () => {
    await b.page.goto(`${s.base}/plain`);
    const model = buildReach(await readFacts());
    expect(model.skip).toMatchObject({ at: 0, toMain: true, lands: false });
    const town = model.stops.find((x) => x.stop.name === 'Town');
    expect(town?.viaSkip).not.toBeNull();
    expect(town && town.viaSkip !== null && town.viaSkip < town.direct).toBe(true);
    const at = model.skip?.at ?? 0;
    for (let i = 0; i <= at; i += 1) await b.page.keyboard.press('Tab');
    expect(await focusedName()).toBe('Skip');
    await b.page.keyboard.press('Enter');
    const after = (town?.viaSkip ?? 0) - (at + 2);
    for (let i = 0; i < after; i += 1) await b.page.keyboard.press('Tab');
    expect(await focusedName()).toBe('Town');
  }, 60_000);

  it('a skip link to a place that takes focus lands on it, with no Tab after the Enter', async () => {
    await b.page.goto(`${s.base}/lands`);
    const model = buildReach(await readFacts());
    expect(model.skip).toMatchObject({ at: 0, to: 4, lands: true, toMain: true });
    expect(model.stops[4]).toMatchObject({ direct: 5, viaSkip: 2, best: 2 });
    await b.page.keyboard.press('Tab');
    await b.page.keyboard.press('Enter');
    expect(await focusedName()).toBe('Field');
    await b.page.keyboard.press('Tab');
    expect(await focusedName()).toBe('D');
    expect(model.stops[5]?.best).toBe(3);
  }, 60_000);

  it('moves no focus while it reads', async () => {
    await b.page.goto(`${s.base}/order`);
    await readFacts();
    expect(await focusedName()).toBe('');
  }, 60_000);

  const run = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await run(['/reach-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the counted panel has no measured failure in English, in any profile', async () => {
    expect(failing(await run(['/reach-counted-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor with an error by the field', async () => {
    expect(failing(await run(['/reach-first-fr', '/reach-counted-fr', '/reach-error-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
