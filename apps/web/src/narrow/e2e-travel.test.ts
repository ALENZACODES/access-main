import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { buildTravel, formNotes } from './travel.js';
import { TRAVEL_ARGS, travelInPage, type TravelControl, type TravelFacts } from './travel-inpage.js';
import { initialTravelState, renderTravelPanel, travelStep, type TravelPanelState } from './travel-panel.js';

/**
 * "Pointer travel" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - `travelInPage` reads the forms and the boxes as laid out, so the same
 *   fields in two columns give a longer, back-and-forth path than in one;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const FIELDS = ['First name', 'Last name', 'Email', 'Phone', 'Town', 'Postal code']
  .map((n, i) => `<label for="f${i}">${n}</label><input id="f${i}">`)
  .map((pair) => `<div>${pair}</div>`)
  .join('');
const formPage = (columns: 1 | 2): string =>
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Form</title>' +
  `<style>body{margin:0}form{display:grid;grid-template-columns:repeat(${columns},1fr);gap:16px;padding:16px}input,button{display:block;width:100%;min-height:44px;box-sizing:border-box}</style></head><body>` +
  `<form aria-label="Your details">${FIELDS}<div><button>Send</button></div></form></body></html>`;

const at = (name: string, x: number, y: number, submit = false): TravelControl => ({ id: `input[${name}]`, name, kind: submit ? 'button' : 'field', form: 0, submit, left: x - 20, top: y - 20, width: 40, height: 40 });
const PAGE: TravelFacts = {
  controls: [at('A field with a long name that has to wrap at 320 pixels', 60, 100), at('B', 260, 100), at('C', 60, 160), at('D', 260, 160), at('E', 60, 220), at('F', 260, 220), at('Send', 60, 1400, true)],
  forms: ['Your details'],
  viewportWidth: 320,
  truncated: true,
};
const counted = (lang: 'en' | 'fr'): TravelPanelState => travelStep(initialTravelState(), lang, () => PAGE).state;

const SITE: Record<string, string> = {
  '/one': formPage(1),
  '/two': formPage(2),
  '/travel-first-en': pageAround(renderTravelPanel('en', initialTravelState()), 'en'),
  '/travel-first-fr': pageAround(renderTravelPanel('fr', initialTravelState()), 'fr'),
  '/travel-counted-en': pageAround(renderTravelPanel('en', counted('en')), 'en'),
  '/travel-counted-fr': pageAround(renderTravelPanel('fr', counted('fr')), 'fr'),
  '/travel-none-en': pageAround(renderTravelPanel('en', travelStep(initialTravelState(), 'en', () => ({ controls: [], forms: [], viewportWidth: null, truncated: false })).state), 'en'),
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

interface FormPage {
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

describe.skipIf(!enabled)('"Pointer travel" in a real browser', () => {
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

  const readForm = async (path: string): Promise<TravelFacts> => {
    const page = b.page as unknown as FormPage;
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(`${s.base}${path}`);
    return page.evaluate(travelInPage, TRAVEL_ARGS);
  };

  it('reads the form, its name, its fields in order and its send button', async () => {
    const f = await readForm('/one');
    expect(f.forms).toEqual(['Your details']);
    expect(f.controls.map((c) => [c.name, c.kind, c.form, c.submit])).toEqual([
      ['First name', 'field', 0, false],
      ['Last name', 'field', 0, false],
      ['Email', 'field', 0, false],
      ['Phone', 'field', 0, false],
      ['Town', 'field', 0, false],
      ['Postal code', 'field', 0, false],
      ['Send', 'button', 0, true],
    ]);
  }, 60_000);

  it('gives the same fields a longer, back-and-forth path in two columns than in one', async () => {
    const one = buildTravel(await readForm('/one')).forms[0];
    const two = buildTravel(await readForm('/two')).forms[0];
    if (!one || !two) throw new Error('no form');
    expect(one.zigzags).toBe(0);
    expect(two.zigzags).toBeGreaterThan(2);
    expect(two.total).toBeGreaterThan(one.total);
    expect(formNotes(two, 600, 'en').map((n) => n.kind)).toContain('zigzag');
    expect(formNotes(one, 600, 'en').map((n) => n.kind)).not.toContain('zigzag');
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await audit(['/travel-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the counted panel has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/travel-counted-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor with no form', async () => {
    expect(failing(await audit(['/travel-first-fr', '/travel-counted-fr', '/travel-none-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
