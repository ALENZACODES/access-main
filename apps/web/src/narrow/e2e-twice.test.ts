import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { TWICE_ARGS, twiceInPage, type TwiceFacts, type TwiceField } from './twice-inpage.js';
import { buildTwice } from './twice.js';
import { initialTwiceState, renderTwicePanel, twiceStep, type TwicePanelState } from './twice-panel.js';

/**
 * "Asked twice" in Chromium, when NARROW_E2E=1 and a Chromium is installed.
 * It shows that:
 *
 * - `twiceInPage` reads a laid-out checkout form at 320 pixels, and
 *   `buildTwice` finds the email to confirm, the phone asked twice by its
 *   autocomplete token, the two addresses with no box to reuse the first,
 *   and the password asked twice for security, and leaves the two travellers'
 *   names alone;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const CHECKOUT =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Checkout</title>' +
  '<style>body{margin:0;font:16px sans-serif}label{display:block;margin:8px 0}input{display:block;min-height:44px;width:100%;box-sizing:border-box}</style></head><body><main><form>' +
  '<label>Email <input type="email" autocomplete="email"></label><label>Confirm email <input type="email"></label>' +
  '<label>Phone <input type="tel" autocomplete="tel"></label><label>Mobile <input type="tel" autocomplete="tel"></label>' +
  '<fieldset><legend>Shipping</legend><label>Street <input autocomplete="shipping street-address"></label><label>Postal code <input autocomplete="shipping postal-code"></label></fieldset>' +
  '<fieldset><legend>Billing</legend><label>Street <input autocomplete="billing street-address"></label><label>Postal code <input autocomplete="billing postal-code"></label></fieldset>' +
  '<fieldset><legend>Traveller 1</legend><label>Name <input></label></fieldset><fieldset><legend>Traveller 2</legend><label>Name <input></label></fieldset>' +
  '<label>Password <input type="password" autocomplete="new-password"></label><label>Repeat password <input type="password" autocomplete="new-password"></label>' +
  '<section class="twice"><label>Mine <input></label></section>' +
  '</form></main></body></html>';

const f = (label: string, extra: Partial<TwiceField> = {}): TwiceField => ({ id: `input[${label}]`, label, type: 'text', token: '', form: 0, group: '', ...extra });
const FACTS: TwiceFacts = {
  fields: [
    f('An email address with a rather long label to wrap', { type: 'email' }),
    f('Confirm an email address with a rather long label to wrap', { type: 'email' }),
    f('Street', { token: 'shipping street-address' }),
    f('Street', { token: 'billing street-address' }),
    f('Password', { type: 'password' }),
    f('Repeat password', { type: 'password' }),
  ],
  sameAs: [],
  truncated: true,
};
const read = (lang: 'en' | 'fr', facts: TwiceFacts = FACTS): TwicePanelState => twiceStep(initialTwiceState(), lang, () => facts).state;

const SITE: Record<string, string> = {
  '/checkout': CHECKOUT,
  '/twice-first-en': pageAround(renderTwicePanel('en', initialTwiceState()), 'en'),
  '/twice-first-fr': pageAround(renderTwicePanel('fr', initialTwiceState()), 'fr'),
  '/twice-read-en': pageAround(renderTwicePanel('en', read('en')), 'en'),
  '/twice-read-fr': pageAround(renderTwicePanel('fr', read('fr')), 'fr'),
  '/twice-none-en': pageAround(renderTwicePanel('en', read('en', { fields: [f('Name')], sameAs: ['Same as above'], truncated: false })), 'en'),
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

interface TwicePage {
  goto(url: string): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  emulateMedia(o: { reducedMotion: "reduce" | "no-preference" | null }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
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

describe.skipIf(!enabled)('"Asked twice" in a real browser', () => {
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

  const page = (): TwicePage => b.page as unknown as TwicePage;

  it('reads a laid-out checkout form and finds what it asks twice', async () => {
    await page().setViewportSize({ width: 320, height: 640 });
    await page().goto(`${s.base}/checkout`);
    const facts = await page().evaluate(twiceInPage, { ...TWICE_ARGS, exclude: '.twice' });
    expect(facts.fields).toHaveLength(12);
    expect(facts.fields.map((x) => x.label)).not.toContain('Mine');
    const m = buildTwice(facts);
    expect(m.findings.map((x) => [x.kind, x.first?.label ?? '', x.second?.label ?? ''])).toEqual([
      ['confirm', 'Email', 'Confirm email'],
      ['same-token', 'Phone', 'Mobile'],
      ['two-addresses', '', ''],
      ['confirm-password', 'Password', 'Repeat password'],
    ]);
    expect(m.twice).toBe(3);
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-21T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first and with a result has no measured failure in English, in any profile', async () => {
    const report = await audit(['/twice-first-en', '/twice-read-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 300_000);

  it('the panel has no measured failure in French, nor with nothing asked twice', async () => {
    expect(failing(await audit(['/twice-first-fr', '/twice-read-fr', '/twice-none-en'], first)).join('\n')).toBe('');
  }, 240_000);
});
