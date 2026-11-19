import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderSarif } from './ci.js';
import { PROFILES } from './profiles.js';
import { totals } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { selectChecks } from './select.js';

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
  /** Markup placed after the footer, outside every landmark. */
  readonly after?: string;
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
    `<footer>${help === 'footer' ? '<a href="/help">Help</a>' : ''}</footer>${o.after ?? ''}</body></html>`
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
  '/bad-form': page({
    title: 'Bad form',
    extra:
      '<input type="text" name="email" placeholder="Your email" required style="border:1px solid #767676">' +
      '<input id="pw" type="password" autocomplete="off" aria-label="Password" onpaste="return false">',
  }),
  '/bad-status': page({
    title: 'Bad status',
    extra:
      '<div class="toast">Saved to your device</div><div role="alert" aria-live="off">Nothing is read</div><div role="progressbar" style="min-height:8px"></div>',
  }),
  '/bad-media': page({ title: 'Bad media', extra: '<video autoplay loop src="data:video/mp4;base64,AAAA" style="width:100px;height:50px"></video>' }),
  '/bad-bars':
    page({ title: 'Bad bars', extra: '<div style="position:fixed;top:0;left:0;right:0;height:400px;background:#eee;z-index:5">Banner</div>' }),
  '/bad-clip': page({ title: 'Bad clip', extra: '<p id="clip" style="width:60px;height:20px;overflow:hidden;white-space:nowrap">A very long place name that does not fit</p>' }),
  '/bad-lang': page({ title: 'Bad lang', extra: '<p>Les heures d’ouverture sont affichées pour vous et pour votre visite cette semaine.</p>' }),
  '/bad-moving': page({ title: 'Bad moving', extra: '<marquee>News</marquee><div class="carousel"><button>Next</button></div>' }),
  '/bad-table': page({ title: 'Bad table', extra: '<table aria-label="Hours"><tr><th></th><th>Hours</th></tr><tr><td>Mon</td><td>9 to 5</td></tr></table>' }),
  '/bad-embed': page({ title: 'Bad embed', extra: '<iframe title="frame" src="/a" style="width:100px;height:50px"></iframe><canvas width="50" height="50"></canvas>' }),
  '/bad-links': page({
    title: 'Bad links',
    extra: '<p><a href="/a" style="text-decoration:underline">Details</a> <a href="/b" style="text-decoration:underline">Details</a> <a href="/r.pdf" target="_blank" style="text-decoration:underline">Annual report</a></p>',
  }),
  '/bad-images': page({ title: 'Bad images', extra: '<img src="/missing.png" alt="IMG_0001.png" width="32" height="32">' }),
  '/bad-skip': page({ title: 'Bad skip', extra: '<a href="#nowhere" style="text-decoration:underline">Skip to main content</a>' }),
  '/bad-plain': page({ title: 'Bad plain', extra: '<p>Please utilize the side door in order to enter and ask your OT about the grab bars.</p>' }),
  '/bad-locale': page({ title: 'Bad locale', extra: '<p lang="fr">La clinique ouvre le 12/31/2026 à 9 am pour toutes les personnes inscrites.</p>' }),
  '/bad-sensory': page({ title: 'Bad sensory', extra: '<p>Press the green button when you have finished the form today.</p>' }),
  '/bad-zoom': page({ title: 'Bad zoom', extra: '<p id="zoom" style="font-size:1rem;line-height:24px;height:24px;overflow:hidden">Opening hours today 9 to 5</p>' }),
  '/bad-heads': page({ title: 'Bad heads', extra: '<h2>Untitled</h2><h2>Hours</h2><h2>Hours</h2>' }),
  '/bad-handlers': page({ title: 'Bad handlers', extra: '<div id="go" onclick="void 0" style="min-height:44px">Go</div>' }),
  '/bad-type': page({ title: 'Bad type', extra: '<p id="t" style="font-size:10px;line-height:1;text-align:justify">The ramp is on the left side of the main door of the building and the lift is at the back of the hall next to the stairs.</p>' }),
  '/bad-order': page({ title: 'Bad order', extra: '<div id="row" style="display:flex;flex-direction:row-reverse"><a href="/a" style="text-decoration:underline">First link</a><a href="/b" style="text-decoration:underline">Second link</a></div>' }),
  '/bad-generated': page({ title: 'Bad generated', extra: '<style>#req::before{content:"Required "}</style><p id="req">Your name</p>' }),
  '/bad-lookalike': page({ title: 'Bad lookalike', extra: '<p><strong>Getting here</strong></p><p>Take the ramp on the left side of the door.</p>' }),
  '/bad-aria': page({ title: 'Bad aria', extra: '<div id="save" role="buton" tabindex="0" style="min-height:44px">Save</div>' }),
  '/bad-refs': page({ title: 'Bad refs', extra: '<p>See the <a href="#prices" style="text-decoration:underline">prices</a> below.</p>' }),
  '/bad-hrefs': page({ title: 'Bad hrefs', extra: '<p>Call <a href="tel:416 555 0100" style="text-decoration:underline">416 555 0100</a> today.</p>' }),
  '/bad-css': page({ title: 'Bad css', extra: '<style>#q:focus{outline:none}</style>' }),
  '/bad-obsolete': page({ title: 'Bad obsolete', extra: '<center>Welcome to the centre</center>' }),
  '/bad-states': page({ title: 'Bad states', extra: '<p><a href="/next" disabled style="text-decoration:underline">Next page</a></p>' }),
  '/bad-lists': page({ title: 'Bad lists', extra: '<ul><div>Ramp at the side door</div><li>Lift in the hall</li></ul>' }),
  '/bad-parts': page({ title: 'Bad parts', extra: '<section><p>Opening hours are posted at the door.</p></section>' }),
  '/bad-limits': page({ title: 'Bad limits', extra: '<label for="plate">Plate</label> <input id="plate" name="plate" type="text" pattern="[A-Z]{4}">' }),
  '/bad-symbols': page({ title: 'Bad symbols', extra: '<button type="button" id="close">\u00D7</button>' }),
  '/bad-regions': page({ title: 'Bad regions', after: '<p id="loose">The ramp is on the left side of the main door of the building.</p>' }),
  '/good-lang': page({ title: 'Good lang', extra: '<p lang="fr">Les heures d’ouverture sont affichées pour vous et pour votre visite cette semaine.</p>' }),
  '/good-form': page({
    title: 'Good form',
    extra:
      '<p>* = required</p><label for="em">Email *</label><input id="em" type="email" name="email" required autocomplete="email">' +
      '<label for="pw2">Password</label><input id="pw2" type="password" autocomplete="current-password"><div role="status" id="msg"></div>',
  }),
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

  it('fails a placeholder-only field and a password that blocks paste', async () => {
    const f = failing(await run(['/bad-form']));
    expect(f.some((x) => x.includes('forms/placeholder-only'))).toBe(true);
    expect(f.some((x) => x.includes('auth/paste-blocked'))).toBe(true);
    expect(f.some((x) => x.includes('auth/autocomplete-off'))).toBe(true);
  }, 60_000);

  it('asks about a required field with no mark and a text field that wants an email keyboard', async () => {
    const report = await run(['/bad-form']);
    const q = (report.routes[0]?.entries ?? []).filter((e) => e.status === 'unknown').map((e) => `${e.check}/${e.rule}`);
    expect(q).toContain('forms/required-unmarked');
    expect(q).toContain('forms/type-mismatch');
  }, 60_000);

  it('a form with labels, a note, types and autocomplete has no form or sign-in findings', async () => {
    const report = await run(['/good-form']);
    const e = (report.routes[0]?.entries ?? []).filter((x) => x.check === 'forms' || x.check === 'auth' || x.check === 'status');
    expect(e.map((x) => `${x.check}/${x.rule}`)).toEqual([]);
    expect(report.routes[0]?.checks.find((c) => c.check === 'forms')?.checked).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('finds a silent alert and an unnamed progress bar, and asks about a toast', async () => {
    const report = await run(['/bad-status']);
    const e = report.routes[0]?.entries.filter((x) => x.check === 'status').map((x) => `${x.rule}:${x.status}`) ?? [];
    expect(e).toContain('live-conflict:fail');
    expect(e).toContain('progress-unnamed:fail');
    expect(e).toContain('toast-silent:unknown');
  }, 60_000);

  it('does not claim a video plays when the browser did not start it', async () => {
    const report = await run(['/bad-media']);
    const e = report.routes[0]?.entries.filter((x) => x.check === 'media') ?? [];
    expect(report.routes[0]?.checks.find((c) => c.check === 'media')?.checked).toBe(1);
    // The clip is not decodable, so the browser never plays it. Without a started video there is no sound failure.
    expect(e.some((x) => x.rule === 'autoplay-sound' && x.status === 'fail')).toBe(false);
    expect(e.some((x) => x.rule === 'no-captions')).toBe(true);
  }, 60_000);

  it('fails fixed bars that take most of a phone screen', async () => {
    const f = failing(await run(['/bad-bars']));
    expect(f.some((x) => x.includes('fixed-space/fixed-covers'))).toBe(true);
  }, 60_000);

  it('the good page has no fixed bar findings and no clipped text', async () => {
    const report = await run(['/a']);
    expect(report.routes[0]?.entries.filter((x) => x.check === 'fixed-space' || x.check === 'clipping')).toEqual([]);
  }, 60_000);

  it('fails text that its own box cuts off', async () => {
    const f = failing(await run(['/bad-clip']));
    expect(f.some((x) => x.includes('clipping/text-clipped'))).toBe(true);
  }, 60_000);

  it('turns a new check into SARIF as well', async () => {
    const sarif = JSON.parse(renderSarif(await run(['/bad-form'])));
    expect(sarif.runs[0].results.some((r: { ruleId: string; level: string }) => r.ruleId === 'auth/paste-blocked' && r.level === 'error')).toBe(true);
  }, 60_000);

  it('asks about French text in an English page, and not when the text says it is French', async () => {
    const bad = (await run(['/bad-lang'])).routes[0]?.entries.filter((x) => x.check === 'lang-parts') ?? [];
    expect(bad.map((x) => [x.rule, x.status])).toEqual([['lang-mismatch', 'unknown']]);
    const good = (await run(['/good-lang'])).routes[0];
    expect(good?.entries.filter((x) => x.check === 'lang-parts')).toEqual([]);
    expect(good?.checks.find((c) => c.check === 'lang-parts')?.checked).toBe(1);
  }, 60_000);

  it('finds moving content, an empty table header, a weak frame title, link and image problems and a dead skip link', async () => {
    const got = async (route: string, check: string): Promise<string[]> =>
      ((await run([route])).routes[0]?.entries ?? []).filter((x) => x.check === check).map((x) => `${x.rule}:${x.status}`);
    expect(await got('/bad-moving', 'timing')).toEqual(['marquee:fail', 'carousel-no-pause:unknown']);
    expect(await got('/bad-table', 'tables')).toEqual(['empty-header:fail']);
    expect(await got('/bad-embed', 'frames')).toEqual(['frame-title-weak:unknown', 'canvas-fallback:unknown']);
    expect(await got('/bad-links', 'links')).toEqual(['same-name-different-target:unknown', 'new-tab-unannounced:unknown', 'file-unannounced:unknown']);
    expect(await got('/bad-images', 'images')).toEqual(['broken:fail', 'alt-filename:fail']);
    expect(await got('/bad-skip', 'bypass')).toEqual(['skip-target-missing:fail']);
  }, 90_000);

  it('asks about plain language, formats and sight-only instructions, and fails text cut at double size', async () => {
    const got = async (route: string, check: string): Promise<string[]> =>
      ((await run([route])).routes[0]?.entries ?? []).filter((x) => x.check === check).map((x) => `${x.rule}:${x.status}`);
    expect(await got('/bad-plain', 'plain')).toEqual(['abbreviation:unknown', 'jargon:unknown']);
    expect(await got('/bad-locale', 'locale')).toEqual(['us-date-in-fr:unknown', 'twelve-hour-in-fr:unknown']);
    expect(await got('/bad-sensory', 'sensory')).toEqual(['colour:unknown']);
    expect(await got('/bad-zoom', 'text-zoom')).toEqual(['clipped-at-200:fail']);
    expect(await got('/bad-handlers', 'handlers')).toEqual(['click-not-focusable:unknown']);
    expect(await got('/bad-type', 'typography')).toEqual(['small-text:unknown', 'justified:unknown', 'tight-leading:unknown']);
    expect(await got('/bad-order', 'order')).toEqual(['reverse-direction:unknown']);
    expect(await got('/bad-generated', 'generated')).toEqual(['css-text:unknown']);
    expect(await got('/bad-lookalike', 'lookalike')).toEqual(['fake-heading:unknown']);
    expect(await got('/bad-regions', 'regions')).toEqual(['outside-landmark:unknown']);
    expect(await got('/bad-heads', 'headings')).toEqual(['heading-generic:unknown', 'heading-duplicate:unknown']);
  }, 90_000);

  it('reads roles, references, link destinations, page styles and old markup from the live page', async () => {
    const got = async (route: string, check: string): Promise<string[]> =>
      ((await run([route])).routes[0]?.entries ?? []).filter((x) => x.check === check).map((x) => `${x.rule}:${x.status}`);
    expect(await got('/bad-aria', 'aria')).toEqual(['unknown-role:fail']);
    expect(await got('/bad-refs', 'references')).toEqual(['fragment-missing:fail']);
    expect(await got('/bad-hrefs', 'hrefs')).toEqual(['tel-format:fail']);
    expect(await got('/bad-css', 'css')).toEqual(['focus-outline-removed:unknown']);
    expect(await got('/bad-obsolete', 'obsolete')).toEqual(['presentational-element:unknown']);
  }, 90_000);

  it('reads states, lists, page parts, form limits and symbols from the live page', async () => {
    const got = async (route: string, check: string): Promise<string[]> =>
      ((await run([route])).routes[0]?.entries ?? []).filter((x) => x.check === check).map((x) => `${x.rule}:${x.status}`);
    expect(await got('/bad-states', 'states')).toEqual(['disabled-no-effect:fail']);
    expect(await got('/bad-lists', 'lists')).toEqual(['list-child:fail']);
    expect(await got('/bad-parts', 'sectioning')).toEqual(['section-no-heading:unknown']);
    expect(await got('/bad-limits', 'constraints')).toEqual(['pattern-unexplained:unknown']);
    expect(await got('/bad-symbols', 'symbols')).toEqual(['symbol-only-name:unknown']);
  }, 90_000);

  it('the good site has no finding from the second five markup checks', async () => {
    const report = await run(['/a', '/b', '/c', '/good-lang', '/good-form']);
    const mine = new Set(['states', 'lists', 'sectioning', 'constraints', 'symbols']);
    expect(report.routes.flatMap((r) => r.entries.filter((x) => mine.has(x.check)).map((x) => `${r.route} ${x.check}/${x.rule}`))).toEqual([]);
    expect(report.routes[0]?.checks.map((c) => c.check)).toEqual(expect.arrayContaining([...mine]));
  }, 90_000);

  it('the good site has no finding from the five markup checks', async () => {
    const report = await run(['/a', '/b', '/c', '/good-lang']);
    const mine = new Set(['aria', 'references', 'hrefs', 'css', 'obsolete']);
    expect(report.routes.flatMap((r) => r.entries.filter((x) => mine.has(x.check)))).toEqual([]);
    expect(report.routes[0]?.checks.map((c) => c.check)).toEqual(expect.arrayContaining([...mine]));
  }, 90_000);

  it('the good site has no finding from the eleven text, layout and structure checks', async () => {
    const report = await run(['/a', '/b', '/c', '/good-lang']);
    const mine = new Set(['plain', 'locale', 'sensory', 'text-zoom', 'headings', 'handlers', 'typography', 'order', 'generated', 'lookalike', 'regions']);
    expect(report.routes.flatMap((r) => r.entries.filter((x) => mine.has(x.check)))).toEqual([]);
    expect(report.routes[0]?.checks.map((c) => c.check)).toEqual(expect.arrayContaining([...mine]));
  }, 90_000);

  it('the good site has no finding from the five structure checks', async () => {
    const report = await run(['/a', '/b', '/c']);
    const mine = new Set(['timing', 'tables', 'frames', 'bypass', 'links', 'images', 'purpose']);
    expect(report.routes.flatMap((r) => r.entries.filter((x) => mine.has(x.check)))).toEqual([]);
  }, 60_000);

  it('runs on every page of the good site without a finding', async () => {
    const report = await run(['/a', '/b', '/c']);
    expect(report.routes.flatMap((r) => r.entries.filter((x) => x.check === 'lang-parts'))).toEqual([]);
  }, 60_000);

  it('a selection leaves the browser results of other checks out and says so', async () => {
    const report = selectChecks(await run(['/bad-form']), { only: ['auth'], skip: [] });
    expect(report.routes[0]?.checks.map((c) => c.check)).toEqual(['auth']);
    expect(report.skipped).toContain('forms');
    expect(failing(report).every((x) => x.includes(' auth/'))).toBe(true);
  }, 60_000);

  it('turns a real failure into SARIF', async () => {
    const sarif = JSON.parse(renderSarif(await run(['/bad-link'])));
    expect(sarif.runs[0].results.some((r: { ruleId: string; level: string }) => r.ruleId === 'link-cue/colour-only' && r.level === 'error')).toBe(true);
  }, 60_000);
});
