import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderSarif } from './ci.js';
import { PROFILES } from './profiles.js';
import { totals } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * Real browser gates over a small site served from this process. They run when
 * NARROW_E2E=1 and playwright-core (or @playwright/test) with a Chromium is
 * installed. The good site must have no failures in any profile. The bad site
 * breaks one rule per page, and each break must be found.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const CSS =
  'body{font:16px/1.5 system-ui,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:8px}' +
  'a,button,input{display:inline-block;min-height:44px;min-width:44px;box-sizing:border-box;font:inherit}' +
  'a{color:#0b4f9c}input{border:1px solid #767676;background:#fff}p{margin:8px 0}';

interface PageOpts {
  readonly title: string;
  readonly nav?: readonly string[];
  readonly help?: 'footer' | 'header' | 'none';
  readonly extra?: string;
  readonly inline?: string;
}

function page(o: PageOpts): string {
  const nav = (o.nav ?? ['Map', 'Tools', 'About']).map((n) => `<a href="/${n.toLowerCase()}">${n}</a>`).join(' ');
  const help = o.help ?? 'footer';
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${o.title}</title><style>${CSS}</style></head><body>` +
    `<header>${help === 'header' ? '<a href="/help">Help</a>' : ''}<nav aria-label="Main">${nav}</nav></header>` +
    `<main><h1>${o.title}</h1>${o.inline ?? '<p>Read the <a href="/hours" style="text-decoration:underline">opening hours</a> today.</p>'}` +
    `<label for="q">Search</label> <input id="q" name="q" type="text">${o.extra ?? ''}</main>` +
    `<footer>${help === 'footer' ? '<a href="/help">Help</a>' : ''}</footer></body></html>`
  );
}

const SITE: Record<string, string> = {
  '/a': page({ title: 'Home' }),
  '/b': page({ title: 'Map page' }),
  '/c': page({ title: 'Tools page' }),
  '/bad-nav': page({ title: 'Bad nav', nav: ['Tools', 'Map', 'About'], help: 'header' }),
  '/bad-link': page({ title: 'Bad link', inline: '<p>Read the <a href="/hours" style="text-decoration:none;color:#444">opening hours</a> today.</p>' }),
  '/bad-field': page({ title: 'Bad field', extra: '<input aria-label="Name" style="border:1px solid #ddd">' }),
  '/bad-tiles': page({ title: 'Bad tiles', extra: '<img src="https://tile.openstreetmap.org/1/1/1.png" alt="Map tile" width="64" height="64">' }),
  '/bad-fonts': page({ title: 'Bad fonts', extra: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' }),
  '/bad-orient': page({ title: 'Bad orientation', extra: '<style>@media (orientation:landscape){#filters{display:none}}</style><button id="filters">Filters</button>' }),
  '/bad-drag': page({ title: 'Bad drag', extra: '<div draggable="true" style="min-height:44px">Drag me</div>' }),
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

const NOW = new Date('2026-11-15T12:00:00Z');

describe.skipIf(!enabled)('real browser gates over a served site', () => {
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

  const run = (routes: string[], profiles = PROFILES.slice(0, 1)) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: NOW });
  const failing = (r: Awaited<ReturnType<typeof run>>): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));

  it('the good site has no failures in any profile, and pages are compared', async () => {
    const report = await run(['/a', '/b', '/c'], [...PROFILES]);
    expect(failing(report)).toEqual([]);
    const site = report.routes.find((r) => r.route === 'site');
    expect(site?.checks[0]).toMatchObject({ check: 'consistency', checked: 3, failed: 0 });
    expect(totals(report.routes).checked).toBeGreaterThan(100);
  }, 120_000);

  it('finds navigation that changes order and help that moves', async () => {
    const report = await run(['/a', '/bad-nav']);
    const f = failing(report).filter((x) => x.startsWith('site'));
    expect(f.some((x) => x.includes('consistency/nav-order'))).toBe(true);
    expect(f.some((x) => x.includes('consistency/help-place'))).toBe(true);
  }, 60_000);

  it('finds a link told apart by colour alone', async () => {
    const f = failing(await run(['/bad-link']));
    expect(f.some((x) => x.includes('link-cue/colour-only'))).toBe(true);
  }, 60_000);

  it('finds a field with a faint border', async () => {
    const f = failing(await run(['/bad-field']));
    expect(f.some((x) => x.includes('non-text-contrast/boundary'))).toBe(true);
  }, 60_000);

  it('fails a third-party tile server that the page really requests', async () => {
    const f = failing(await run(['/bad-tiles']));
    expect(f.some((x) => x.includes('external/tile-server'))).toBe(true);
  }, 60_000);

  it('asks about an outside font host and does not fail it', async () => {
    const report = await run(['/bad-fonts']);
    const e = report.routes[0]?.entries.filter((x) => x.check === 'external') ?? [];
    expect(e.map((x) => [x.rule, x.status])).toEqual([['font-cdn', 'unknown']]);
  }, 60_000);

  it('the good site loads nothing from outside', async () => {
    const report = await run(['/a']);
    expect(report.routes[0]?.entries.filter((x) => x.check === 'external')).toEqual([]);
  }, 60_000);

  it('asks about a control that disappears in landscape', async () => {
    const report = await run(['/bad-orient'], PROFILES.filter((p) => p.id === 'narrow' || p.id === 'landscape'));
    const p = report.routes[0]?.entries.filter((x) => x.check === 'parity') ?? [];
    expect(p.map((x) => [x.id, x.rule, x.status])).toEqual([['landscape', 'landscape-missing', 'unknown']]);
    expect(p[0]?.message.en).toContain('button “filters”');
  }, 60_000);

  it('asks about dragging and never passes it', async () => {
    const report = await run(['/bad-drag']);
    const d = report.routes[0]?.entries.filter((e) => e.check === 'dragging') ?? [];
    expect(d).toHaveLength(1);
    expect(d[0]?.status).toBe('unknown');
  }, 60_000);

  it('the good page sets no link-cue or field findings of its own', async () => {
    const report = await run(['/a']);
    expect(report.routes[0]?.entries.filter((e) => ['link-cue', 'non-text-contrast', 'dragging'].includes(e.check))).toEqual([]);
    expect(report.routes[0]?.checks.find((c) => c.check === 'link-cue')?.checked).toBe(1);
    expect(report.routes[0]?.checks.find((c) => c.check === 'non-text-contrast')?.checked).toBe(1);
  }, 60_000);

  it('turns a real failure into SARIF', async () => {
    const sarif = JSON.parse(renderSarif(await run(['/bad-link'])));
    expect(sarif.runs[0].results.some((r: { ruleId: string; level: string }) => r.ruleId === 'link-cue/colour-only' && r.level === 'error')).toBe(true);
  }, 60_000);
});
