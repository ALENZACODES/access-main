import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { DEFAULT_SCAN, buildScan } from './scan-cost.js';
import { SCAN_ARGS, scanInPage, type ScanFacts } from './scan-inpage.js';
import { initialScanState, renderScanPanel, scanStep, type ScanPanelState } from './scan-panel.js';

/**
 * "Switch scanning" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - `scanInPage` gives the controls in the order the Tab key reaches them in
 *   Chromium, as laid out at 320 pixels, and finds the main action;
 * - the rows `buildScan` makes from that layout are those seen on screen;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how a real scanner groups controls.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const FORM =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Form</title>' +
  '<style>body{margin:0;font:16px sans-serif}nav{display:flex;gap:8px}nav a,button,input{min-height:44px;min-width:44px}label{display:block}</style></head><body>' +
  '<nav><a href="#a">Home</a><a href="#b">Help</a><a href="#c">Menu</a></nav><main>' +
  '<form><label>Name <input></label><label>Email <input type="email"></label><button>Send</button></form>' +
  '<button tabindex="-1">Not reached</button><section class="scancost"><button>Mine</button></section>' +
  '</main></body></html>';

const c = (name: string, left: number, top: number, main = false) => ({ id: `button[${name}]`, name, main, left, top, width: 80, height: 44 });
const LONG: ScanFacts = { controls: [...Array.from({ length: 24 }, (_, i) => c(`A control with a long name ${i}`, (i % 10) * 40, 300 + Math.floor(i / 10) * 50)), c('Send', 0, 0, true)], truncated: true };
const read = (lang: 'en' | 'fr', facts: ScanFacts, mode: 'linear' | 'row-column' = 'linear'): ScanPanelState => {
  const set = scanStep(initialScanState(), 'scan-mode', mode, lang, () => facts).state;
  return scanStep(set, 'scan-read', null, lang, () => facts).state;
};

const SITE: Record<string, string> = {
  '/form': FORM,
  '/scan-first-en': pageAround(renderScanPanel('en', initialScanState()), 'en'),
  '/scan-first-fr': pageAround(renderScanPanel('fr', initialScanState()), 'fr'),
  '/scan-long-en': pageAround(renderScanPanel('en', read('en', LONG)), 'en'),
  '/scan-long-fr': pageAround(renderScanPanel('fr', read('fr', LONG)), 'fr'),
  '/scan-rows-en': pageAround(renderScanPanel('en', read('en', LONG, 'row-column')), 'en'),
  '/scan-step-en': pageAround(renderScanPanel('en', scanStep(read('en', LONG), 'scan-pace', 'step', 'en', () => LONG).state), 'en'),
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

interface ScanPage {
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

describe.skipIf(!enabled)('"Switch scanning" in a real browser', () => {
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

  const page = (): ScanPage => b.page as unknown as ScanPage;

  it('gives the controls in tab order as laid out, and their rows', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/form`);
    const f = await page().evaluate(scanInPage, { ...SCAN_ARGS, exclude: '.scancost' });
    expect(f.controls.map((x) => [x.name, x.main])).toEqual([
      ['Home', false],
      ['Help', false],
      ['Menu', false],
      ['Name', false],
      ['Email', false],
      ['Send', true],
    ]);
    const m = buildScan(f, { ...DEFAULT_SCAN, mode: 'row-column' });
    expect(m.rows).toBe(4);
    expect(m.costs.map((x) => x.steps)).toEqual([2, 3, 4, 3, 4, 5]);
    expect(m.backJumps).toBe(0);
    expect(m.main?.control.name).toBe('Send');
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-21T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and with a long page read has no measured failure in English, in any profile', async () => {
    const report = await audit(['/scan-first-en', '/scan-long-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 240_000);

  it('the panel has no measured failure row by row, step by step, and in French', async () => {
    expect(failing(await audit(['/scan-rows-en', '/scan-step-en', '/scan-first-fr', '/scan-long-fr'], first)).join('\n')).toBe('');
  }, 240_000);
});
