import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDeviceFacts } from './device-facts.js';
import { initialFitState, renderFitPanel, type FitState } from './fit-panel.js';
import { DESKTOP, PHONE, SILENT, pageAround } from './fit-testkit.js';
import { summarisePlainly } from './plain-summary.js';
import { PROFILES } from './profiles.js';
import { nov, reportOf, smallSite } from './report-fixtures.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "This page on your screen" under the browser checks of this module. Each
 * state of the panel is served as a page from this process and audited in
 * the profiles (narrow, dark, wide text spacing and the others). It runs
 * when NARROW_E2E=1 and a Chromium is installed.
 *
 * What it shows is that the measured checks find no failure in these states.
 * It does not show how a screen reader reads the panel, and the pages here
 * are the markup of the panel with no script, so the clicks are covered by
 * the unit tests and by the app spec, not here.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';
const NOW = nov(19);

/** Everything drawn at once: findings, both errors, a long finished text, a warning and a notice. */
function full(lang: 'en' | 'fr'): FitState {
  const fr = lang === 'fr';
  return {
    ...initialFitState(readDeviceFacts(PHONE)),
    audit: { kind: 'done', summary: summarisePlainly(smallSite()) },
    draft: { kind: 'cannot-reach', what: fr ? 'Je ne peux pas atteindre le menu. Écrivez à ana@example.org' : 'I cannot reach the menu. Write to ana@example.org', includeSettings: true, includeFindings: true },
    errors: [
      { field: 'kind', message: fr ? 'Choisissez le type d’obstacle.' : 'Choose the kind of barrier.' },
      { field: 'what', message: fr ? 'Décrivez ce qui s’est passé, en au moins 10 caractères.' : 'Say what happened, in at least 10 characters.' },
    ],
    text: `${'A-very-long-word-with-no-space-in-it-'.repeat(6)}\n${'Line of the text.\n'.repeat(12)}`,
    notice: fr ? 'Le texte est prêt ci-dessous.' : 'The text is ready below.',
  };
}

const SITE: Record<string, string> = {
  '/fit-first-en': pageAround(renderFitPanel('en', initialFitState(readDeviceFacts(PHONE)), NOW), 'en'),
  '/fit-first-fr': pageAround(renderFitPanel('fr', initialFitState(readDeviceFacts(PHONE)), NOW), 'fr'),
  '/fit-silent-en': pageAround(renderFitPanel('en', initialFitState(readDeviceFacts(SILENT)), NOW), 'en'),
  '/fit-full-en': pageAround(renderFitPanel('en', full('en'), NOW), 'en'),
  '/fit-full-fr': pageAround(renderFitPanel('fr', full('fr'), NOW), 'fr'),
  '/fit-none-en': pageAround(renderFitPanel('en', { ...initialFitState(readDeviceFacts(DESKTOP)), audit: { kind: 'done', summary: summarisePlainly(reportOf([])) } }, NOW), 'en'),
  '/fit-error-fr': pageAround(renderFitPanel('fr', { ...initialFitState(readDeviceFacts(DESKTOP)), audit: { kind: 'error', message: 'La page a disparu.' } }, NOW), 'fr'),
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

describe.skipIf(!enabled)('"This page on your screen" in a real browser', () => {
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

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await run(['/fit-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(100);
  }, 180_000);

  it('the panel at first has no measured failure in French, in any profile', async () => {
    expect(failing(await run(['/fit-first-fr'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel with everything drawn has no measured failure in English, in any profile', async () => {
    expect(failing(await run(['/fit-full-en'])).join('\n')).toBe('');
  }, 240_000);

  it('the panel with everything drawn has no measured failure in French, in any profile', async () => {
    expect(failing(await run(['/fit-full-fr'])).join('\n')).toBe('');
  }, 240_000);

  it('the panel with nothing known has no measured failure', async () => {
    expect(failing(await run(['/fit-silent-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('the panel with no finding has no measured failure', async () => {
    expect(failing(await run(['/fit-none-en'], first)).join('\n')).toBe('');
  }, 120_000);

  it('the panel after an error has no measured failure', async () => {
    expect(failing(await run(['/fit-error-fr'], first)).join('\n')).toBe('');
  }, 120_000);

  it('runs the reflow, contrast, target, focus and keyboard checks on the panel', async () => {
    const report = await run(['/fit-full-en'], first);
    const ran = new Set(report.routes.flatMap((r) => r.checks.filter((c) => c.checked > 0).map((c) => c.check)));
    for (const check of ['reflow', 'contrast', 'target-size', 'focus-visible', 'keyboard']) expect(ran.has(check as never), check).toBe(true);
  }, 120_000);
});
