import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { initialPressPanel, pressEvent, renderPressPanel, type PressEvent, type PressPanelState } from './press-panel.js';
import { LONG_PRESS_MS, pressDown, pressFindings, pressStats, pressUp, startPress, stopPress, type PressState } from './press-timing.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';

/**
 * "How I press" in Chromium, when NARROW_E2E=1 and a Chromium is installed.
 * It shows that:
 *
 * - the events Chromium sends for a mouse press, a touch-like pen press and
 *   a key press on the pad are read the way the panel expects, and the hold
 *   times taken from their time stamps match the waits between down and up;
 * - each state of the panel has no measured failure under the browser
 *   checks of this module, in the profiles.
 *
 * It does not show how a real hand, switch or keyboard behaves.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

function run(holds: readonly number[], gap = 800): PressState {
  let s = startPress();
  let t = 1000;
  for (const h of holds) {
    s = pressUp(pressDown(s, t, 'pointer'), t + h);
    t += h + gap;
  }
  return s;
}
const panel = (trial: PressState): PressPanelState => ({ trial, notice: '' });

/** Records every event the panel listens to, with what the panel reads of it. */
const RECORDER =
  '<script>window.__events=[];for(const t of ["pointerdown","pointerup","pointercancel","keydown","keyup"]){document.addEventListener(t,(e)=>{' +
  'window.__events.push({type:e.type,timeStamp:e.timeStamp,key:e.key,repeat:e.repeat,pointerType:e.pointerType,button:e.button,isPrimary:e.isPrimary,onPad:!!(e.target&&e.target.closest&&e.target.closest("[data-press=pad]"))});},true);}</script>';

const SITE: Record<string, string> = {
  '/pad': pageAround(renderPressPanel('en', panel(startPress())), 'en').replace('</body>', `${RECORDER}</body>`),
  '/press-first-en': pageAround(renderPressPanel('en', initialPressPanel()), 'en'),
  '/press-first-fr': pageAround(renderPressPanel('fr', initialPressPanel()), 'fr'),
  '/press-running-en': pageAround(renderPressPanel('en', panel(run([100, 120, 140]))), 'en'),
  '/press-done-en': pageAround(renderPressPanel('en', panel(run([100, 700, 150, 120, 130, 140, 110, 160], 200))), 'en'),
  '/press-done-fr': pageAround(renderPressPanel('fr', panel(run([100, 700, 150, 120, 130, 140, 110, 160], 200))), 'fr'),
  '/press-unknown-en': pageAround(renderPressPanel('en', panel(stopPress(startPress()))), 'en'),
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What these tests use of a Playwright page beyond what the audit needs. */
interface PadPage {
  goto(url: string): Promise<unknown>;
  evaluate<R>(fn: () => R): Promise<R>;
  waitForTimeout(ms: number): Promise<void>;
  focus(selector: string): Promise<void>;
  locator(selector: string): { boundingBox(): Promise<Box | null> };
  mouse: { move(x: number, y: number): Promise<void>; down(o?: { button?: string }): Promise<void>; up(o?: { button?: string }): Promise<void> };
  keyboard: { down(key: string): Promise<void>; up(key: string): Promise<void>; press(key: string): Promise<void> };
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

interface Recorded {
  type: string;
  timeStamp: number;
  key?: string;
  repeat?: boolean;
  pointerType?: string;
  button?: number;
  isPrimary?: boolean;
  onPad: boolean;
}

describe.skipIf(!enabled)('"How I press" in a real browser', () => {
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

  /** The same page, for the calls the audit does not need. */
  const pad = (): PadPage => b.page as unknown as PadPage;
  const PAD_TARGET = { getAttribute: (n: string) => (n === 'data-press' ? 'pad' : null) };
  const OFF_TARGET = { getAttribute: () => null, closest: () => null };
  /** Feeds what Chromium sent through the panel's own reading of events. */
  const replay = (events: readonly Recorded[]): PressState =>
    events.reduce<PressState>((st, e) => {
      const { onPad, ...rest } = e;
      const ev: PressEvent = { ...rest, target: onPad ? PAD_TARGET : OFF_TARGET };
      return pressEvent(st, ev, () => 0);
    }, startPress());
  const recorded = (): Promise<Recorded[]> => pad().evaluate(() => (globalThis as unknown as { __events: Recorded[] }).__events);

  it('times mouse presses on the pad from the time stamps of the events Chromium sends', async () => {
    await pad().goto(`${s.base}/pad`);
    const box = await pad().locator('#press-pad').boundingBox();
    if (!box) throw new Error('no pad');
    await pad().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const waits = [80, LONG_PRESS_MS + 150, 120];
    for (const w of waits) {
      await pad().mouse.down();
      await pad().waitForTimeout(w);
      await pad().mouse.up();
      await pad().waitForTimeout(150);
    }
    const st = pressStats(replay(await recorded()));
    expect(st.count).toBe(3);
    expect(st.vias).toEqual(['pointer']);
    st.holds.forEach((h, i) => {
      const w = waits[i] ?? 0;
      expect(h, `press ${i + 1}`).toBeGreaterThanOrEqual(w - 5);
      expect(h, `press ${i + 1}`).toBeLessThan(w + 250);
    });
    expect(pressFindings(st, 'en').map((f) => f.kind)).toContain('long-hold');
  }, 60_000);

  it('does not count the right mouse button, nor a press that starts off the pad', async () => {
    await pad().goto(`${s.base}/pad`);
    const box = await pad().locator('#press-pad').boundingBox();
    if (!box) throw new Error('no pad');
    await pad().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await pad().mouse.down({ button: 'right' });
    await pad().mouse.up({ button: 'right' });
    await pad().mouse.move(box.x + box.width / 2, box.y - 30);
    await pad().mouse.down();
    await pad().mouse.up();
    expect(pressStats(replay(await recorded())).count).toBe(0);
  }, 60_000);

  it('times key presses on the pad, Enter and Space, and leaves out other keys', async () => {
    await pad().goto(`${s.base}/pad`);
    await pad().focus('#press-pad');
    for (const key of ['Enter', 'Space', 'a']) {
      await pad().keyboard.down(key);
      await pad().waitForTimeout(100);
      await pad().keyboard.up(key);
      await pad().waitForTimeout(100);
    }
    const st = pressStats(replay(await recorded()));
    expect(st.count).toBe(2);
    expect(st.vias).toEqual(['key']);
    for (const h of st.holds) expect(h).toBeGreaterThanOrEqual(95);
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await audit(['/press-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the running test and the result have no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/press-running-en', '/press-done-en'])).join('\n')).toBe('');
  }, 240_000);

  it('the panel has no measured failure in French, nor with an UNKNOWN result', async () => {
    expect(failing(await audit(['/press-first-fr', '/press-done-fr', '/press-unknown-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
