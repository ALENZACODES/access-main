import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_CSS, pageAround } from './pair-testkit.js';
import { EMPTY_PAIR, comparePair, pairStep, renderPairTool, type PairState } from './pair-tool.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Compare two colours" under the browser checks of this module. Each state
 * of the tool is served as a page from this process and audited in the
 * profiles (narrow, dark, wide text spacing and the others). It runs when
 * NARROW_E2E=1 and a Chromium is installed.
 *
 * What it shows is that the measured checks find no failure in these states.
 * It does not show how a screen reader reads the tool. The pages are the
 * markup of the tool with no script: the clicks are covered by the unit
 * tests, the DOM test and the app spec.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const typed = (text: string, background: string, large = false): PairState => ({ ...EMPTY_PAIR, text, background, large });
const css = () => ({ text: `${SAMPLE_CSS}\n.x{--glass: rgb(0 0 0 / 50%);--glass-ink:#fff}\n${'.very-long-selector-with-no-space-in-it'.repeat(4)}{--a:#fff;--a-ink:#999}`, unreadable: 2 });
const full = (lang: 'en' | 'fr'): PairState => pairStep(comparePair(typed('#7a7a7a', '#777777', true), lang), 'pair-tokens', lang, css).state;

const SITE: Record<string, string> = {
  '/pair-first-en': pageAround(renderPairTool('en', EMPTY_PAIR), 'en'),
  '/pair-first-fr': pageAround(renderPairTool('fr', EMPTY_PAIR), 'fr'),
  '/pair-full-en': pageAround(renderPairTool('en', full('en')), 'en'),
  '/pair-full-fr': pageAround(renderPairTool('fr', full('fr')), 'fr'),
  '/pair-errors-fr': pageAround(renderPairTool('fr', comparePair(typed('x'.repeat(80), ''), 'fr')), 'fr'),
  '/pair-reaches-en': pageAround(renderPairTool('en', comparePair(typed('#1b1916', '#fffdf8'), 'en')), 'en'),
  '/pair-unknown-en': pageAround(renderPairTool('en', comparePair(typed('rgb(0 0 0 / 50%)', '#ffffff80'), 'en')), 'en'),
  // The lightest pair there is: the swatches must not count as text with low contrast.
  '/pair-pale-en': pageAround(renderPairTool('en', comparePair(typed('#fffffe', '#ffffff'), 'en')), 'en'),
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

describe.skipIf(!enabled)('"Compare two colours" in a real browser', () => {
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

  const run = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-19T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the tool at first has no measured failure in English, in any profile', async () => {
    const report = await run(['/pair-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(80);
  }, 180_000);

  it('the tool at first has no measured failure in French, in any profile', async () => {
    expect(failing(await run(['/pair-first-fr'])).join('\n')).toBe('');
  }, 180_000);

  it('the tool with a result, suggestions and tokens has no measured failure in English, in any profile', async () => {
    expect(failing(await run(['/pair-full-en'])).join('\n')).toBe('');
  }, 240_000);

  it('the tool with a result, suggestions and tokens has no measured failure in French, in any profile', async () => {
    expect(failing(await run(['/pair-full-fr'])).join('\n')).toBe('');
  }, 240_000);

  it('the tool with long field errors has no measured failure', async () => {
    expect(failing(await run(['/pair-errors-fr'], first)).join('\n')).toBe('');
  }, 120_000);

  it('the tool with a pair that reaches the minimum has no measured failure', async () => {
    expect(failing(await run(['/pair-reaches-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('the tool with an UNKNOWN result has no measured failure', async () => {
    expect(failing(await run(['/pair-unknown-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('two pale swatches side by side are not a failure of the tool', async () => {
    expect(failing(await run(['/pair-pale-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('runs the reflow, contrast, target, focus and keyboard checks on the tool', async () => {
    const report = await run(['/pair-full-en'], first);
    const ran = new Set(report.routes.flatMap((r) => r.checks.filter((c) => c.checked > 0).map((c) => c.check)));
    for (const check of ['reflow', 'contrast', 'target-size', 'focus-visible', 'keyboard']) expect(ran.has(check as never), check).toBe(true);
  }, 120_000);
});
