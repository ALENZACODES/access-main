import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SummaryLines } from './access-summary.js';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { initialSummaryState, renderSummaryPanel, summaryStep, type SummaryPanelState } from './summary-panel.js';

/**
 * "My access summary" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed: each state of the panel has no measured failure under the
 * browser checks of this module, in the profiles, and its text areas keep
 * the summary in one piece at 320 pixels.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const WHEN = new Date(2026, 10, 20, 11, 30);
const NONE: SummaryLines = { tap: '', zones: '', press: '' };
const EN: SummaryLines = {
  tools: 'What I use: a head pointer and one or two switches.',
  tap: 'Button size at which my taps land: 56 px',
  zones: 'Screen zones I can reach: Bottom, left; Bottom, centre; Bottom, right; Lower middle, left (4 of 12).',
  press: 'My presses (touch): held from 120 ms to 640 ms; at least 300 ms between presses.',
  typing: 'My typing pace: about 42 characters a minute, 12.5 s a short field.',
  drag: 'Dragging: I cannot drag. I need another way to do it, with a single tap or click.',
  scan: 'Switch scanning: row by row, with auto scan, 1.5 s a step.',
  aim: 'Things that move: I take about 10 s to aim, and controls need to stay in place for that long.',
  hover: 'Hover: I cannot hover. Content shown only on hover is out of my reach.',
};
const FR: SummaryLines = {
  tap: 'Taille de bouton où mes appuis atteignent leur cible\u00A0: 56\u00A0px',
  zones: '',
  press: 'Mes appuis (toucher)\u00A0: tenus de 120\u00A0ms à 640\u00A0ms\u202F; au moins 300\u00A0ms entre deux appuis.',
  scan: 'Balayage par contacteur\u00A0: un par un, pas à pas, un appui par étape.',
  hover: 'Survol\u00A0: je peux survoler.',
};
const made = (lang: 'en' | 'fr', lines: SummaryLines): SummaryPanelState => summaryStep(initialSummaryState(), lang, () => lines, () => WHEN).state;

const SITE: Record<string, string> = {
  '/summary-first-en': pageAround(renderSummaryPanel('en', initialSummaryState()), 'en'),
  '/summary-first-fr': pageAround(renderSummaryPanel('fr', initialSummaryState()), 'fr'),
  '/summary-none-en': pageAround(renderSummaryPanel('en', made('en', NONE)), 'en'),
  '/summary-all-en': pageAround(renderSummaryPanel('en', made('en', EN)), 'en'),
  '/summary-some-fr': pageAround(renderSummaryPanel('fr', made('fr', FR)), 'fr'),
  '/summary-no-request-en': pageAround(
    renderSummaryPanel(
      'en',
      summaryStep(
        initialSummaryState(),
        'en',
        () => ({ drag: 'Dragging: 3 of 3 tries made it, 0.9 s in the middle.', hover: 'Hover: I can hover.' }),
        () => WHEN,
        () => ({ drag: false, hover: false }),
      ).state,
    ),
    'en',
  ),
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

interface TextPage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R>(fn: () => R): Promise<R>;
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

describe.skipIf(!enabled)('"My access summary" in a real browser', () => {
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

  it('keeps the whole summary in its text area, unchanged, at 320 pixels', async () => {
    const page = b.page as unknown as TextPage;
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`${s.base}/summary-all-en`);
    const got = await page.evaluate(() => {
      const t = (globalThis as unknown as { document: { getElementById(id: string): { value: string; getBoundingClientRect(): { right: number } } | null; documentElement: { clientWidth: number; scrollWidth: number } } }).document;
      const area = t.getElementById('summary-text');
      return { value: area?.value ?? '', right: area?.getBoundingClientRect().right ?? 0, width: t.documentElement.clientWidth, scroll: t.documentElement.scrollWidth };
    });
    expect(got.value.split('\n').slice(2, 11)).toEqual([EN.tools, EN.tap, EN.zones, EN.press, EN.typing, EN.drag, EN.scan, EN.aim, EN.hover]);
    expect(got.right).toBeLessThanOrEqual(got.width);
    expect(got.scroll).toBeLessThanOrEqual(got.width);
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await audit(['/summary-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the summary with every part, and with none, has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/summary-all-en', '/summary-none-en'])).join('\n')).toBe('');
  }, 240_000);

  it('the summary with parts that need nothing from the site, and so no request, has no measured failure', async () => {
    expect(SITE['/summary-no-request-en']).not.toContain('summary-request');
    expect(failing(await audit(['/summary-no-request-en'], first)).join('\n')).toBe('');
  }, 240_000);

  it('the panel has no measured failure in French', async () => {
    expect(failing(await audit(['/summary-first-fr', '/summary-some-fr'], first)).join('\n')).toBe('');
  }, 180_000);
});
