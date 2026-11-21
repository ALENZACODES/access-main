import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { handStep, initialHandState, renderHandPanel, type HandState } from './hand-panel.js';
import { MAX_NOTE, OPTIONAL_NEEDS, answer, setNeeds } from './hand-session.js';
import { sampleManualLog } from './manual-log.js';
import { PROFILES } from './profiles.js';
import { nov } from './report-fixtures.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "Look by hand" under the browser checks of this module. Each state of the
 * panel is served as a page from this process and audited in the profiles
 * (narrow, dark, wide text spacing and the others). It runs when
 * NARROW_E2E=1 and a Chromium is installed.
 *
 * What it shows is that the measured checks find no failure in these states.
 * It does not show how a screen reader reads the panel. The pages are the
 * markup of the panel with no script: the clicks are covered by the unit
 * tests, the DOM test and the app spec.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';
const NOW = nov(19);

/** Everything drawn at once: every step, the list open, an earlier look, a saved answer, errors and the prepared log. */
function full(lang: 'en' | 'fr'): HandState {
  let state = initialHandState();
  state = { ...state, session: { ...setNeeds(state.session, OPTIONAL_NEEDS), who: '@sam' }, needsDraft: OPTIONAL_NEEDS, earlierText: sampleManualLog(), listOpen: true };
  state = handStep(state, 'hand-read', lang, NOW).state;
  state = { ...state, session: { ...answer(answer(state.session, '2.4.7', 'problem', `${'A-very-long-word-with-no-space-in-it-'.repeat(5)} on the search page.`), '1.1.1', 'no-problem-found', ''), current: '2.4.7' } };
  state = handStep(state, 'hand-export', lang, NOW).state;
  return { ...state, listOpen: true };
}

/** Errors on every field that can have one. */
function errors(lang: 'en' | 'fr'): HandState {
  const base = initialHandState();
  const step = handStep({ ...base, drafts: { [base.session.current as string]: { result: '', note: 'x'.repeat(MAX_NOTE + 1) } } }, 'hand-save', lang, NOW).state;
  const who = handStep({ ...base, session: answer(base.session, base.session.current as string, 'not-sure', '') }, 'hand-export', lang, NOW).state;
  const log = handStep({ ...base, earlierText: 'not json' }, 'hand-read', lang, NOW).state;
  return { ...step, errors: [...step.errors, ...who.errors], earlierText: 'not json', earlierError: log.earlierError };
}

const SITE: Record<string, string> = {
  '/hand-first-en': pageAround(renderHandPanel('en', initialHandState(), NOW), 'en'),
  '/hand-first-fr': pageAround(renderHandPanel('fr', initialHandState(), NOW), 'fr'),
  '/hand-full-en': pageAround(renderHandPanel('en', full('en'), NOW), 'en'),
  '/hand-full-fr': pageAround(renderHandPanel('fr', full('fr'), NOW), 'fr'),
  '/hand-errors-en': pageAround(renderHandPanel('en', errors('en'), NOW), 'en'),
  '/hand-errors-fr': pageAround(renderHandPanel('fr', errors('fr'), NOW), 'fr'),
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

describe.skipIf(!enabled)('"Look by hand" in a real browser', () => {
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
  const two = PROFILES.filter((p) => p.id === 'narrow' || p.id === 'dark');
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await run(['/hand-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(100);
  }, 240_000);

  it('the panel at first has no measured failure in French, in the narrow and dark profiles', async () => {
    expect(two).toHaveLength(2);
    expect(failing(await run(['/hand-first-fr'], two)).join('\n')).toBe('');
  }, 180_000);

  it('the panel with everything drawn has no measured failure in English, in any profile', async () => {
    expect(failing(await run(['/hand-full-en'])).join('\n')).toBe('');
  }, 300_000);

  it('the panel with everything drawn has no measured failure in French, in the narrow and dark profiles', async () => {
    expect(failing(await run(['/hand-full-fr'], two)).join('\n')).toBe('');
  }, 240_000);

  it('the panel with errors on every field has no measured failure in English', async () => {
    expect(failing(await run(['/hand-errors-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('the panel with errors on every field has no measured failure in French', async () => {
    expect(failing(await run(['/hand-errors-fr'], first)).join('\n')).toBe('');
  }, 120_000);

  it('runs the reflow, contrast, target, focus and keyboard checks on the panel', async () => {
    const report = await run(['/hand-first-en'], first);
    const ran = new Set(report.routes.flatMap((r) => r.checks.filter((c) => c.checked > 0).map((c) => c.check)));
    for (const check of ['reflow', 'contrast', 'target-size', 'focus-visible', 'keyboard']) expect(ran.has(check as never), check).toBe(true);
  }, 120_000);
});
