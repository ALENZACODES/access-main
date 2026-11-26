import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { TOOLS } from './start.js';
import { initialStartState, renderStartPanel, startToggle } from './start-panel.js';

/**
 * "Where to start" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed: each state of the panel has no measured failure under the
 * browser checks of this module, in the profiles, with and without the go
 * buttons. It does not show that the order fits any one person.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const every = TOOLS.reduce((s, t) => startToggle(s, t, 'en'), initialStartState());
const SITE: Record<string, string> = {
  '/start-first-en': pageAround(renderStartPanel('en', initialStartState()), 'en'),
  '/start-first-fr': pageAround(renderStartPanel('fr', initialStartState()), 'fr'),
  '/start-switch-en': pageAround(renderStartPanel('en', startToggle(initialStartState(), 'switch', 'en')), 'en'),
  '/start-all-en': pageAround(renderStartPanel('en', every), 'en'),
  '/start-all-fr': pageAround(renderStartPanel('fr', { ...every, notice: '' }), 'fr'),
  '/start-nogo-en': pageAround(renderStartPanel('en', every, 2, false), 'en'),
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

describe.skipIf(!enabled)('"Where to start" in a real browser', () => {
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

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-21T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and with one tool has no measured failure in English, in any profile', async () => {
    const report = await audit(['/start-first-en', '/start-switch-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 300_000);

  it('the panel with every tool has no measured failure, in English and French, with and without go buttons', async () => {
    expect(failing(await audit(['/start-all-en', '/start-all-fr', '/start-first-fr', '/start-nogo-en'], first)).join('\n')).toBe('');
  }, 240_000);
});
