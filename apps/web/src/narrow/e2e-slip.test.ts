import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { buildSlips } from './slip.js';
import { SLIP_ARGS, slipInPage, type SlipFacts } from './slip-inpage.js';
import { initialSlipState, renderSlipPanel, slipStep, type SlipPanelState } from './slip-panel.js';

/**
 * "Slips onto risky controls" in Chromium, when NARROW_E2E=1 and a Chromium
 * is installed. It shows that:
 *
 * - `slipInPage` reads the boxes as laid out, on the page, at any scroll;
 * - where a pair is found, a real click inside the tap circle of one control,
 *   off its own box, lands on the risky control;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how a real hand taps.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const ROW =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Row</title>' +
  '<style>body{margin:0;height:2000px}button{position:absolute;top:100px;width:44px;height:44px;margin:0;padding:0;border:0}</style></head><body>' +
  '<button id="save" style="left:20px" onclick="window.__hit=\'save\'">Save</button>' +
  '<button id="del" style="left:68px" onclick="window.__hit=\'delete\'">Delete</button>' +
  '<button id="help" style="left:220px" onclick="window.__hit=\'help\'">Help</button>' +
  '</body></html>';

const ctl = (name: string, left: number, top: number, width = 44, height = 44) => ({ id: `button[${name}]`, name, left, top, width, height });
const PAGE: SlipFacts = { controls: [ctl('A control with a long name that has to wrap at 320 pixels', 0, 0), ctl('Delete', 48, 0, 30, 30)], truncated: true };
const read = () => PAGE;
const done = (lang: 'en' | 'fr', tap: number | null): SlipPanelState => slipStep(initialSlipState(), lang, read, () => tap).state;

const SITE: Record<string, string> = {
  '/row': ROW,
  '/slip-first-en': pageAround(renderSlipPanel('en', initialSlipState()), 'en'),
  '/slip-first-fr': pageAround(renderSlipPanel('fr', initialSlipState()), 'fr'),
  '/slip-found-en': pageAround(renderSlipPanel('en', done('en', 72)), 'en'),
  '/slip-found-fr': pageAround(renderSlipPanel('fr', done('fr', 72)), 'fr'),
  '/slip-none-en': pageAround(renderSlipPanel('en', slipStep(initialSlipState(), 'en', () => ({ controls: [ctl('Save', 0, 0)], truncated: false }), () => null).state), 'en'),
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

interface RowPage {
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

describe.skipIf(!enabled)('"Slips onto risky controls" in a real browser', () => {
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

  const page = (): RowPage => b.page as unknown as RowPage;
  const readAt = async (y: number): Promise<SlipFacts> => {
    await page().evaluate((to: number) => (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, to), y);
    return page().evaluate(slipInPage, SLIP_ARGS);
  };

  it('reads the boxes on the page, the same at any scroll', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/row`);
    const top = await readAt(0);
    expect(top.controls.map((c) => [c.name, c.left, c.top, c.width, c.height])).toEqual([
      ['Save', 20, 100, 44, 44],
      ['Delete', 68, 100, 44, 44],
      ['Help', 220, 100, 44, 44],
    ]);
    expect((await readAt(50)).controls).toEqual(top.controls);
  }, 60_000);

  it('finds the pair at a 72 pixel tap and not at 44, and a real click inside the circle, off Save, lands on Delete', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/row`);
    const f = await readAt(0);
    expect(buildSlips(f, null).pairs).toEqual([]);
    const m = buildSlips(f, 72);
    expect(m.pairs.map((p) => [p.aimed.name, p.onto.name, p.distance])).toEqual([['Save', 'Delete', 26]]);
    // The centre of Save is at (42, 122). A tap 30 pixels to its right, inside a 36 pixel radius, is past Save's edge.
    await page().mouse.click(42 + 30, 122);
    expect(await page().evaluate(() => (globalThis as unknown as { __hit?: string }).__hit)).toBe('delete');
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await audit(['/slip-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the panel with slips found has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/slip-found-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor with nothing found', async () => {
    expect(failing(await audit(['/slip-first-fr', '/slip-found-fr', '/slip-none-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
