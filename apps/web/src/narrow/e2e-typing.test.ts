import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { TYPING_ARGS, pageTypingOf, typingRawInPage } from './typing-inpage.js';
import { initialTypingState, renderTypingPanel, typingStep, type TypingPanelState } from './typing-panel.js';
import { emptyRun, recordChange, takesBack, type FieldRun, type PageTyping } from './typing-trial.js';

/**
 * "My typing pace" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - `typingRawInPage` counts the text fields as laid out, leaving out the
 *   hidden ones and the part it is told to, and finds a limit the page states;
 * - real typing and deleting raise the input events the panel counts, with
 *   the input types it reads;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how fast anyone types.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const FORM =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Form</title></head><body><main>' +
  '<section class="typing"><input aria-label="Practice"></section>' +
  '<p>Please sign in. Your session will expire after 10 minutes of inactivity.</p>' +
  '<label>Name <input id="name"></label><label>Email <input type="email"></label><label>Note <textarea></textarea></label>' +
  '<input type="checkbox" aria-label="Keep"><div style="display:none"><input aria-label="Hidden"></div>' +
  '<script>window.__events=[];document.getElementById("name").addEventListener("input",function(e){window.__events.push({t:e.inputType,v:e.target.value,s:e.timeStamp})});</script>' +
  '</main></body></html>';

const PAGE: PageTyping = { fields: 30, limitMinutes: 10, limitText: 'Your session will expire after 10 minutes of inactivity.' };
const run = (first: number, last: number, value: string, takenBack = 0): FieldRun => ({ first, last, value, takenBack });
const RUNS = [run(0, 25_000, 'A name that is longer than a narrow screen allows'), run(0, 20_000, 'K1A 0B1', 2), run(0, 30_000, 'alex@example.ca')];
const done = (lang: 'en' | 'fr', page: PageTyping | null = PAGE): TypingPanelState => typingStep({ ...initialTypingState(), phase: 'running', runs: RUNS }, 'typing-done', lang, () => page as PageTyping).state;
const practising = (lang: 'en' | 'fr'): TypingPanelState => typingStep(initialTypingState(), 'typing-start', lang, () => PAGE).state;

const SITE: Record<string, string> = {
  '/form': FORM,
  '/typing-first-en': pageAround(renderTypingPanel('en', initialTypingState()), 'en'),
  '/typing-first-fr': pageAround(renderTypingPanel('fr', initialTypingState()), 'fr'),
  '/typing-run-en': pageAround(renderTypingPanel('en', practising('en')), 'en'),
  '/typing-run-fr': pageAround(renderTypingPanel('fr', practising('fr')), 'fr'),
  '/typing-done-en': pageAround(renderTypingPanel('en', done('en')), 'en'),
  '/typing-done-fr': pageAround(renderTypingPanel('fr', done('fr')), 'fr'),
  '/typing-none-en': pageAround(renderTypingPanel('en', done('en', { fields: 2, limitMinutes: null, limitText: '' })), 'en'),
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

interface FormPage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  evaluate<R>(fn: () => R): Promise<R>;
  focus(selector: string): Promise<void>;
  keyboard: { type(text: string): Promise<void>; press(key: string): Promise<void> };
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

describe.skipIf(!enabled)('"My typing pace" in a real browser', () => {
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

  const page = (): FormPage => b.page as unknown as FormPage;

  it('counts the visible text fields outside the panel and finds the stated limit', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/form`);
    const raw = await page().evaluate(typingRawInPage, { ...TYPING_ARGS, exclude: '.typing' });
    expect(raw.fields).toBe(3);
    expect(pageTypingOf(raw)).toEqual({ fields: 3, limitMinutes: 10, limitText: 'Your session will expire after 10 minutes of inactivity.' });
    expect((await page().evaluate(typingRawInPage, TYPING_ARGS)).fields).toBe(4);
  }, 60_000);

  it('real typing and deleting raise the input events the panel counts', async () => {
    await page().goto(`${s.base}/form`);
    await page().focus('#name');
    await page().keyboard.type('Alx');
    await page().keyboard.press('Backspace');
    await page().keyboard.type('ex');
    const events = await page().evaluate(() => (globalThis as unknown as { __events: Array<{ t: string; v: string; s: number }> }).__events);
    expect(events.map((e) => [e.t, e.v])).toEqual([
      ['insertText', 'A'],
      ['insertText', 'Al'],
      ['insertText', 'Alx'],
      ['deleteContentBackward', 'Al'],
      ['insertText', 'Ale'],
      ['insertText', 'Alex'],
    ]);
    let r = emptyRun();
    for (const e of events) r = recordChange(r, e.s, takesBack(e.t), e.v);
    expect(r.takenBack).toBe(1);
    expect(r.value).toBe('Alex');
    expect((r.last ?? 0) - (r.first ?? 0)).toBeGreaterThanOrEqual(0);
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and while practising has no measured failure in English, in any profile', async () => {
    const report = await audit(['/typing-first-en', '/typing-run-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 240_000);

  it('the panel with a result has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/typing-done-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor with no limit stated', async () => {
    expect(failing(await audit(['/typing-first-fr', '/typing-run-fr', '/typing-done-fr', '/typing-none-en'], first)).join('\n')).toBe('');
  }, 240_000);
});
