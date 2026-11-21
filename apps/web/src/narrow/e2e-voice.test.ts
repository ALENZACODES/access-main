import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageAround } from './fit-testkit.js';
import { PROFILES } from './profiles.js';
import { totals, type AuditReport } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { buildVoice, say } from './voice.js';
import { VOICE_ARGS, voiceInPage, type VoiceFacts } from './voice-inpage.js';
import { initialVoiceState, renderVoicePanel, voiceStep, type VoicePanelState } from './voice-panel.js';

/**
 * "Say it to press it" in Chromium, when NARROW_E2E=1 and a Chromium is
 * installed. It shows that:
 *
 * - the names `voiceInPage` works out are the accessible names Chromium
 *   gives the same controls, found by role and exact name;
 * - icon buttons, text kept only for screen readers, and shared names are
 *   found on a laid-out page;
 * - each state of the panel has no measured failure under the browser checks
 *   of this module, in the profiles.
 *
 * It does not show how any voice control tool behaves.
 */
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = env['NARROW_E2E'] === '1';

const CONTROLS =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Controls</title>' +
  '<style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}button,a,input,select{display:inline-block;min-width:44px;min-height:44px;margin:4px}</style></head><body><main>' +
  '<button>Send</button>' +
  '<button aria-label="Close"><svg width="20" height="20" aria-hidden="true"><rect width="20" height="20"></rect></svg></button>' +
  '<a href="/h"><span class="sr">Home</span><svg width="20" height="20" aria-hidden="true"><rect width="20" height="20"></rect></svg></a>' +
  '<button aria-label="Read more about ramps">Learn more</button>' +
  '<button>Edit</button><button>Edit</button>' +
  '<span id="a">Search</span> <span id="b">places</span><button aria-labelledby="a b">Find</button>' +
  '<label for="t">Town</label><input id="t">' +
  '<label><input type="checkbox"> Ramp</label>' +
  '<select aria-label="Size"><option>S</option></select>' +
  '<input type="submit" value="Go">' +
  '</main></body></html>';

const PAGE: VoiceFacts = {
  controls: [
    { id: 'button[0]', role: 'button', name: 'Send', visible: 'Send' },
    { id: 'button#x[1]', role: 'button', name: 'Close', visible: '' },
    { id: 'a[0]', role: 'link', name: 'A link with a long name that has to wrap at 320 pixels wide', visible: 'Learn more' },
    { id: 'button[2]', role: 'button', name: 'Edit', visible: 'Edit' },
    { id: 'button[3]', role: 'button', name: 'Edit', visible: 'Edit' },
  ],
  truncated: true,
};
const read = () => PAGE;
const counted = (lang: 'en' | 'fr'): VoicePanelState => voiceStep(initialVoiceState(), 'voice-count', lang, read).state;
const tried = (lang: 'en' | 'fr', phrase: string): VoicePanelState => voiceStep({ ...counted(lang), phrase }, 'voice-try', lang, read).state;

const SITE: Record<string, string> = {
  '/controls': CONTROLS,
  '/voice-first-en': pageAround(renderVoicePanel('en', initialVoiceState()), 'en'),
  '/voice-first-fr': pageAround(renderVoicePanel('fr', initialVoiceState()), 'fr'),
  '/voice-read-en': pageAround(renderVoicePanel('en', tried('en', 'Edit')), 'en'),
  '/voice-read-fr': pageAround(renderVoicePanel('fr', tried('fr', 'cliquer sur Envoyer')), 'fr'),
  '/voice-empty-en': pageAround(renderVoicePanel('en', tried('en', '')), 'en'),
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

/** What these tests use of a Playwright page beyond what the audit needs. */
interface RolePage {
  goto(url: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  getByRole(role: string, o: { name: string; exact: boolean }): { count(): Promise<number> };
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

describe.skipIf(!enabled)('"Say it to press it" in a real browser', () => {
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

  const page = (): RolePage => b.page as unknown as RolePage;
  const readPage = async (): Promise<VoiceFacts> => {
    await page().goto(`${s.base}/controls`);
    return page().evaluate(voiceInPage, VOICE_ARGS);
  };

  it('reads the names and the words shown on a laid-out page', async () => {
    const f = await readPage();
    expect(f.controls.map((c) => [c.role, c.name, c.visible])).toEqual([
      ['button', 'Send', 'Send'],
      ['button', 'Close', ''],
      ['link', 'Home', ''],
      ['button', 'Read more about ramps', 'Learn more'],
      ['button', 'Edit', 'Edit'],
      ['button', 'Edit', 'Edit'],
      ['button', 'Search places', 'Find'],
      ['field', 'Town', 'Town'],
      ['choice', 'Ramp', 'Ramp'],
      ['field', 'Size', ''],
      ['button', 'Go', 'Go'],
    ]);
  }, 60_000);

  it('gives each control the accessible name Chromium gives it', async () => {
    const f = await readPage();
    const roles: Record<string, string[]> = { button: ['button'], link: ['link'], field: ['textbox', 'combobox'], choice: ['checkbox'] };
    for (const c of f.controls) {
      let found = 0;
      for (const role of roles[c.role] ?? []) found += await page().getByRole(role, { name: c.name, exact: true }).count();
      expect(found, `${c.role} “${c.name}”`).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it('finds the controls that take extra steps by voice, and what a phrase reaches', async () => {
    const f = await readPage();
    const m = buildVoice(f);
    expect(m.counts).toEqual({ 'no-name': 0, 'no-words': 3, 'name-differs': 2, 'shared-name': 2 });
    // Send, Town, Ramp and Go.
    expect(m.direct).toBe(4);
    expect(say('click Edit', f).kind).toBe('many');
    expect(say('Learn more', f).kind).toBe('none');
    expect(say('tap Search', f).kind).toBe('one');
  }, 60_000);

  const audit = (routes: string[], profiles = [...PROFILES]) => runAudit({ page: b.page, baseUrl: s.base, routes, profiles, now: new Date('2026-11-20T12:00:00Z') });
  const failing = (r: AuditReport): string[] =>
    r.routes.flatMap((x) => x.entries.filter((e) => e.status === 'fail').map((e) => `${x.route} @${x.viewportWidth} ${e.check}/${e.rule ?? ''} ${e.id}: ${e.message.en}`));
  const first = PROFILES.slice(0, 1);

  it('the panel at first has no measured failure in English, in any profile', async () => {
    const report = await audit(['/voice-first-en']);
    expect(failing(report).join('\n')).toBe('');
    expect(totals(report.routes).checked).toBeGreaterThan(50);
  }, 180_000);

  it('the panel with a result and a phrase has no measured failure in English, in any profile', async () => {
    expect(failing(await audit(['/voice-read-en'])).join('\n')).toBe('');
  }, 180_000);

  it('the panel has no measured failure in French, nor with an empty phrase', async () => {
    expect(failing(await audit(['/voice-first-fr', '/voice-read-fr', '/voice-empty-en'], first)).join('\n')).toBe('');
  }, 180_000);
});
