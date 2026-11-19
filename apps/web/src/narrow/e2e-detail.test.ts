import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderDetail } from './detail.js';
import { PROFILES } from './profiles.js';
import { found, reportOf, route } from './report-fixtures.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { parseManualLog, sampleManualLog } from './manual-log.js';
import { renderWorksheet } from './worksheet.js';

/**
 * The detailed report under the browser checks of this module: the page is
 * served from this process and audited in every profile (narrow, dark, wide
 * text spacing and the others), in English and in French. It runs when
 * NARROW_E2E=1 and a Chromium is installed.
 *
 * What it shows is that the measured checks find no failure on the page. It
 * does not show how a screen reader reads it, and entries with the status
 * UNKNOWN still need a person.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

/** A report with failures, UNKNOWN entries, repeated findings, a long id, a skipped check and a waiver, so every part of the page is drawn. */
function fullReport(): AuditReport {
  const longId = `div#${'very-long-identifier-'.repeat(6)}end`;
  const base = reportOf(
    ['/', '/places/1042', '/help'].map((path) =>
      route(path, {
        contrast: {
          checked: 30,
          entries: [
            found('contrast', 'low', 'fail', 'a#nav-help', 'Contrast is 2.1 to 1. It needs 4.5 to 1.', 'Le contraste est de 2,1 pour 1. Il faut 4,5 pour 1.'),
            found('contrast', 'image', 'unknown', 'h1[0]', 'The text sits on an image, so its contrast was not measured.', 'Le texte est posé sur une image, son contraste n’a donc pas été mesuré.'),
          ],
        },
        'target-size': { checked: 12, entries: path === '/' ? [found('target-size', 'small', 'fail', longId, 'The target is 18 by 18 CSS pixels.', 'La cible mesure 18 sur 18 pixels CSS.')] : [] },
        copy: { checked: 8, entries: path === '/help' ? [found('copy', 'claim', 'unknown', 'p[4]', 'A person has to read this claim.', 'Une personne doit lire cette affirmation.')] : [] },
      }),
    ),
  );
  return {
    ...base,
    skipped: ['keyboard'],
    waived: [{ route: '/old', entry: found('contrast', 'low', 'fail', 'p[9]', 'Contrast is 3.9 to 1.', 'Le contraste est de 3,9 pour 1.'), reason: 'The page retires on that date.', expires: '2026-12-15' }],
  };
}

/** The worksheet with the newest by-hand note in each block, which adds a line of free text a person wrote. */
function worksheetWithLog(): string {
  const now = new Date('2026-11-19T12:00:00Z');
  const log = parseManualLog(sampleManualLog(), now);
  if (!log.ok) throw new Error(log.error.en);
  return renderWorksheet(fullReport(), 'fr', { manual: { log: log.value, now } });
}

const SITE: Record<string, string> = {
  '/worksheet-log': worksheetWithLog(),
  '/detail-en': renderDetail(fullReport(), 'en'),
  '/detail-fr': renderDetail(fullReport(), 'fr'),
  '/detail-empty': renderDetail(reportOf([]), 'en'),
  '/worksheet-en': renderWorksheet(fullReport(), 'en'),
  '/worksheet-fr': renderWorksheet(fullReport(), 'fr'),
  '/worksheet-2-2': renderWorksheet(reportOf([]), 'en', { since: '2.2' }),
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

const NOW = new Date('2026-11-19T12:00:00Z');

describe.skipIf(!enabled)('the detailed report in a real browser', () => {
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

  const run = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: NOW });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));

  it('has no measured failure in English, in any profile', async () => {
    const report = await run(['/detail-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(100);
  }, 180_000);

  it('has no measured failure in French, in any profile', async () => {
    expect(failing(await run(['/detail-fr'])).join('\n')).toBe('');
  }, 180_000);

  it('has no measured failure for a report with no route', async () => {
    expect(failing(await run(['/detail-empty'], PROFILES.slice(0, 1))).join('\n')).toBe('');
  }, 120_000);

  it('the worksheet has no measured failure in English, in any profile', async () => {
    const report = await run(['/worksheet-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(300);
  }, 240_000);

  it('the worksheet has no measured failure in French, in the narrow and dark profiles', async () => {
    const two = PROFILES.filter((p) => p.id === 'narrow' || p.id === 'dark');
    expect(two).toHaveLength(2);
    expect(failing(await run(['/worksheet-fr'], two)).join('\n')).toBe('');
  }, 180_000);

  it('the worksheet with by-hand notes has no measured failure', async () => {
    expect(failing(await run(['/worksheet-log'], PROFILES.slice(0, 1))).join('\n')).toBe('');
  }, 180_000);

  it('a short worksheet has no measured failure', async () => {
    expect(failing(await run(['/worksheet-2-2'], PROFILES.slice(0, 1))).join('\n')).toBe('');
  }, 120_000);

  it('runs the reflow, contrast, target and focus checks on the page', async () => {
    const report = await run(['/detail-en'], PROFILES.slice(0, 1));
    const ran = new Set(report.routes.flatMap((r) => r.checks.filter((c) => c.checked > 0).map((c) => c.check)));
    for (const check of ['reflow', 'contrast', 'target-size', 'focus-visible', 'keyboard']) expect(ran.has(check as never), check).toBe(true);
  }, 120_000);
});
