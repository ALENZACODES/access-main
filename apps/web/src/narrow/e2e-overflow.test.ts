import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OVERFLOW_FIXTURES, fixturePage } from './overflow-fixtures.js';
import { OVERFLOW_ARGS, overflowInPage, type OverflowFacts } from './overflow-inpage.js';
import { causesOf, regionKind } from './overflow.js';
import { runAudit, type FullPage } from './run.js';

/**
 * The overflow probe in a real browser, at 320 CSS pixels: each fixture
 * page overflows in one known way, and the probe has to name that cause and
 * that element, and nothing else. It runs when NARROW_E2E=1 and a Chromium
 * is installed.
 *
 * This is the test of the probe against real layout. The unit tests drive
 * it with boxes written by hand.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const SITE: Record<string, string> = Object.fromEntries(OVERFLOW_FIXTURES.map((f) => [`/${f.name}`, fixturePage(f)]));

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

describe.skipIf(!enabled)('the overflow probe in a real browser', () => {
  let b: Launched;
  let s: Served;
  beforeAll(async () => {
    s = await serve();
    b = await launch();
    await b.page.setViewportSize({ width: 320, height: 640 });
  }, 60_000);
  afterAll(async () => {
    await b?.close();
    await s?.close();
  });

  const probe = async (name: string): Promise<OverflowFacts> => {
    await b.page.setViewportSize({ width: 320, height: 640 });
    await b.page.goto(`${s.base}/${name}`);
    return b.page.evaluate(overflowInPage, OVERFLOW_ARGS);
  };

  for (const fixture of OVERFLOW_FIXTURES) {
    it(`${fixture.name}: ${fixture.causes.length + (fixture.regions?.length ?? 0) === 0 ? 'finds nothing' : `finds ${[...fixture.causes, ...(fixture.regions ?? [])].join(', ')}`}`, async () => {
      const facts = await probe(fixture.name);
      expect(causesOf(facts.origins).map((c) => `${c.kind} ${c.id}`)).toEqual([...fixture.causes]);
      expect(facts.regions.map((r) => `${regionKind(r)} ${r.id}`)).toEqual([...(fixture.regions ?? [])]);
      expect(facts.pageScrolls).toBe(fixture.causes.length > 0);
      expect(facts.viewportPx).toBe(320);
      expect(facts.rtl).toBe(fixture.dir === 'rtl');
      expect(facts.originCount).toBe(facts.origins.length);
    }, 30_000);
  }

  it('measures a fixed width: the width, the space and how far it reaches', async () => {
    const [origin] = (await probe('fixed-width')).origins;
    expect(origin).toMatchObject({ widthPx: 600, spacePx: 320, overPx: 280, display: 'block', text: false, shifted: false });
  }, 30_000);

  it('reports the long word, shortened, with its length', async () => {
    const [origin] = (await probe('long-word')).origins;
    expect(origin?.text).toBe(true);
    expect(origin?.wordChars).toBe(86);
    expect(origin?.word).toBe('https://example.org/a/very/long/address…');
    expect(origin?.overPx).toBeGreaterThan(100);
  }, 30_000);

  it('counts the items of a row that stick out as one cause about the row', async () => {
    const facts = await probe('flex-nowrap');
    expect(facts.origins.length).toBe(2);
    const [cause] = causesOf(facts.origins);
    expect(cause).toMatchObject({ kind: 'flex-nowrap', id: 'div#row[0]', siblings: 1 });
    expect(cause?.origin.overPx).toBe(160);
  }, 30_000);

  it('adds up the columns and gaps of a grid', async () => {
    const [origin] = (await probe('grid-columns')).origins;
    expect(origin?.parentGridPx).toBe(620);
  }, 30_000);

  it('says whether a region that scrolls can take keyboard focus', async () => {
    expect((await probe('region-table')).regions[0]).toMatchObject({ table: true, keyboard: true, contentPx: 600, spacePx: 320, role: 'region' });
    expect((await probe('region-code')).regions[0]).toMatchObject({ pre: true, keyboard: false, table: false });
  }, 30_000);

  it('finds nothing more when the window is wide enough', async () => {
    await b.page.setViewportSize({ width: 1280, height: 800 });
    await b.page.goto(`${s.base}/fixed-width`);
    const facts = await b.page.evaluate(overflowInPage, OVERFLOW_ARGS);
    expect(facts.pageScrolls).toBe(false);
    expect(facts.origins).toEqual([]);
  }, 30_000);

  it('puts the causes in the reflow check of a full audit, next to the finding that the page scrolls', async () => {
    const report = await runAudit({ page: b.page, baseUrl: s.base, routes: ['/two-causes', '/fits', '/region-table'], now: new Date('2026-11-19T12:00:00Z') });
    const reflow = (route: string): string[] => (report.routes.find((r) => r.route === route)?.entries ?? []).filter((e) => e.check === 'reflow').map((e) => `${e.status} ${e.rule ?? ''} ${e.id}`);
    expect(reflow('/two-causes')).toEqual(['fail  page', 'fail cause-fixed-width div#a[0]', 'fail cause-nowrap p#b[1]']);
    expect(reflow('/fits')).toEqual([]);
    expect(reflow('/region-table')).toEqual(['unknown region-content div#scroller[0]']);
  }, 120_000);
});
