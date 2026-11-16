import { afterEach, describe, expect, it } from 'vitest';
import { exitCode, parseArgs, runCli, type CliDeps } from './cli.js';
import { mountNarrowPanel, narrowRoute, renderPanel, type PanelRoot } from './panel.js';
import { buildRouteAudit, makeReport } from './report.js';
import type { AuditPage } from './run.js';
import { installDom, type Installed, type Spec } from './testkit.js';
import { frTypographyIssues } from './i18n.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const NOW = new Date('2026-11-15T20:00:00.000Z');

describe('parseArgs', () => {
  it('reads every option', () => {
    const p = parseArgs(['--base-url', 'http://x', '--route', '/a', '--route', '/b', '--lang', 'fr', '--out', 'out/', '--en', 'e.json', '--fr', 'f.json', '--offline', '--strict-unknown']);
    expect(p).toEqual({
      ok: true,
      args: {
        baseUrl: 'http://x',
        routes: ['/a', '/b'],
        lang: 'fr',
        outDir: 'out/',
        enFile: 'e.json',
        frFile: 'f.json',
        offline: true,
        strictUnknown: true,
        help: false,
        profiles: null,
        htmlFiles: [],
        dataFile: null,
        allowLicences: [],
        requireFacts: [],
        keyboardMax: null,
        formats: [],
        baselineFile: null,
        writeBaselineFile: null,
        waiversFile: null,
      },
    });
  });
  it('reads the file, profile and keyboard options', () => {
    const p = parseArgs(['--html', 'a.html', '--html', 'b.html', '--data', 'd.json', '--allow-licence', 'CC0-1.0', '--require-fact', 'ramp', '--profiles', 'all', '--keyboard-max', '12']);
    expect(p).toMatchObject({
      ok: true,
      args: { htmlFiles: ['a.html', 'b.html'], dataFile: 'd.json', allowLicences: ['CC0-1.0'], requireFacts: ['ramp'], profiles: 'all', keyboardMax: 12 },
    });
  });
  it('rejects a bad keyboard limit or profile list', () => {
    expect(parseArgs(['--html', 'a.html', '--keyboard-max', 'x']).ok).toBe(false);
    expect(parseArgs(['--html', 'a.html', '--profiles', 'nope']).ok).toBe(false);
  });
  it('explains mistakes in both languages', () => {
    for (const argv of [[], ['--base-url', 'x'], ['--base-url', 'x', '--route', '/', '--en', 'e'], ['--lang', 'de'], ['--nope'], ['--route']]) {
      const p = parseArgs(argv);
      expect(p.ok).toBe(false);
      if (!p.ok) {
        expect(p.error.en.length).toBeGreaterThan(0);
        expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
      }
    }
  });
  it('--help needs nothing else', () => {
    expect(parseArgs(['--help']).ok).toBe(true);
  });
});

const spec: Spec[] = [{ tag: 'button', text: 'Go', interactive: true, rect: [0, 0, 30, 30] }];

function deps(over: Partial<CliDeps> = {}): { deps: CliDeps; logs: string[]; files: Map<string, string>; closed: { n: number } } {
  const logs: string[] = [];
  const files = new Map<string, string>();
  const closed = { n: 0 };
  const page: AuditPage = {
    async setViewportSize() {},
    async goto() {
      dom?.uninstall();
      dom = installDom(spec);
    },
    async reload() {},
    async evaluate(fn, arg) {
      return fn(arg);
    },
  };
  const d: CliDeps = {
    async launch() {
      return {
        page,
        context: { async setOffline() {} },
        async close() {
          closed.n++;
        },
      };
    },
    async readText(path) {
      const v = files.get(path);
      if (v === undefined) throw new Error(`no such file ${path}`);
      return v;
    },
    async writeText(path, text) {
      files.set(path, text);
    },
    log: (l) => logs.push(l),
    now: () => NOW,
    ...over,
  };
  return { deps: d, logs, files, closed };
}

describe('runCli', () => {
  it('prints help and exits 0', async () => {
    const d = deps();
    expect(await runCli(['--help'], d.deps)).toBe(0);
    expect(d.logs.join('\n')).toContain('Utilisation');
  });
  it('exits 2 on bad arguments without launching a browser', async () => {
    let launched = false;
    const d = deps({
      async launch() {
        launched = true;
        throw new Error('no');
      },
    });
    expect(await runCli([], d.deps)).toBe(2);
    expect(launched).toBe(false);
  });
  it('exits 1 when a check fails, writes both report files and closes the browser', async () => {
    const d = deps();
    const code = await runCli(['--base-url', 'http://x', '--route', '/', '--out', 'out', '--lang', 'fr'], d.deps);
    expect(code).toBe(1);
    expect([...d.files.keys()].sort()).toEqual(['out/narrow-audit.fr.html', 'out/narrow-audit.json']);
    expect(d.files.get('out/narrow-audit.fr.html')).toContain('<html lang="fr">');
    expect(d.logs.join('\n')).toContain('Audit écran étroit');
    expect(d.closed.n).toBe(1);
  });
  it('audits the EN and FR files when given', async () => {
    const d = deps();
    d.files.set('en.json', JSON.stringify({ a: { b: 'Hello' } }));
    d.files.set('fr.json', JSON.stringify({ a: {} }));
    await runCli(['--base-url', 'http://x', '--route', '/', '--en', 'en.json', '--fr', 'fr.json'], d.deps);
    expect(d.logs.join('\n')).toContain('a.b');
    expect(d.logs.join('\n')).toContain('Missing French string.');
  });
  it('exits 2 and still closes the browser when the run throws', async () => {
    const d = deps();
    d.files.clear();
    const code = await runCli(['--base-url', 'http://x', '--route', '/', '--en', 'nope.json', '--fr', 'nope2.json'], d.deps);
    expect(code).toBe(2);
    expect(d.logs.join('\n')).toContain('no such file');
  });
});

describe('runCli with files only', () => {
  const GOOD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body><main><h1>Hi</h1></main></body></html>';
  async function noBrowser(): Promise<never> {
    throw new Error('browser launched');
  }
  it('lints an HTML file without launching a browser', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('good.html', GOOD);
    expect(await runCli(['--html', 'good.html'], d.deps)).toBe(0);
  });
  it('fails on an HTML file with violations and on banned copy', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.html', '<html><body><img src="a.png"><p>Our verified data</p></body></html>');
    expect(await runCli(['--html', 'bad.html', '--out', 'o'], d.deps)).toBe(1);
    const json = d.files.get('o/narrow-audit.json') ?? '';
    expect(json).toContain('img-alt');
    expect(json).toContain('claim-checked');
  });
  it('fails a data file with a missing source and passes a sourced one', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.json', JSON.stringify([{ id: 'x', facts: { ramp: 'yes' } }]));
    expect(await runCli(['--data', 'bad.json'], d.deps)).toBe(1);
    const e = deps({ launch: noBrowser });
    e.files.set(
      'ok.json',
      JSON.stringify([{ id: 'x', source: { name: 'City', url: 'https://example.org/d', licence: 'CC0-1.0', retrieved: '2026-11-01' }, facts: { ramp: 'unknown' } }]),
    );
    expect(await runCli(['--data', 'ok.json'], e.deps)).toBe(0);
  });
  it('reports an unreadable file as an error', async () => {
    const d = deps({ launch: noBrowser });
    expect(await runCli(['--html', 'missing.html'], d.deps)).toBe(2);
  });
});

describe('runCli with CI options', () => {
  const BAD = '<html><body><img src="a.png"></body></html>';
  async function noBrowser(): Promise<never> {
    throw new Error('browser launched');
  }
  const waivers = (list: unknown[]): string => JSON.stringify({ waivers: list });
  it('parses the CI flags and rejects bad ones', () => {
    expect(parseArgs(['--html', 'a.html', '--out', 'o', '--format', 'sarif,junit,sarif', '--baseline', 'b.json', '--write-baseline', 'w.json', '--waivers', 'v.json'])).toMatchObject({
      ok: true,
      args: { formats: ['sarif', 'junit'], baselineFile: 'b.json', writeBaselineFile: 'w.json', waiversFile: 'v.json' },
    });
    expect(parseArgs(['--html', 'a.html', '--format', 'pdf', '--out', 'o']).ok).toBe(false);
    expect(parseArgs(['--html', 'a.html', '--format', 'sarif']).ok).toBe(false);
    expect(parseArgs(['--html', 'a.html', '--baseline']).ok).toBe(false);
  });
  it('writes SARIF and JUnit next to the other reports', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.html', BAD);
    expect(await runCli(['--html', 'bad.html', '--out', 'o', '--format', 'sarif,junit'], d.deps)).toBe(1);
    expect([...d.files.keys()].sort()).toEqual(['bad.html', 'o/narrow-audit.en.html', 'o/narrow-audit.json', 'o/narrow-audit.junit.xml', 'o/narrow-audit.sarif']);
    expect(JSON.parse(d.files.get('o/narrow-audit.sarif') ?? '{}').version).toBe('2.1.0');
    expect(d.files.get('o/narrow-audit.junit.xml')).toContain('<failure');
  });
  it('a baseline from the same run makes the next run pass, and a new failure fails it', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.html', BAD);
    expect(await runCli(['--html', 'bad.html', '--write-baseline', 'base.json'], d.deps)).toBe(1);
    expect(await runCli(['--html', 'bad.html', '--baseline', 'base.json'], d.deps)).toBe(0);
    expect(d.logs.join('\n')).toContain('0 new failures');
    d.files.set('bad.html', BAD + '<button></button>');
    expect(await runCli(['--html', 'bad.html', '--baseline', 'base.json'], d.deps)).toBe(1);
    expect(d.logs.join('\n')).toContain('1 new failures');
  });
  it('a baseline does not hide unknowns when strict', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('u.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title></head><body><main><h1>x</h1><a href="/a">here</a></main></body></html>');
    expect(await runCli(['--html', 'u.html', '--write-baseline', 'b.json'], d.deps)).toBe(0);
    expect(await runCli(['--html', 'u.html', '--baseline', 'b.json', '--strict-unknown'], d.deps)).toBe(1);
  });
  it('rejects a broken baseline file with exit 2', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.html', BAD);
    d.files.set('b.json', '{"nope":1}');
    expect(await runCli(['--html', 'bad.html', '--baseline', 'b.json'], d.deps)).toBe(2);
  });
  it('a waiver turns a failure into a listed exception, and the run passes', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title></head><body><main><h1>x</h1><img src="a.png"></main></body></html>');
    d.files.set('w.json', waivers([{ check: 'static-html', rule: 'img-alt', reason: 'Decorative image, fix in ticket 12', expires: '2026-12-31' }]));
    expect(await runCli(['--html', 'bad.html', '--waivers', 'w.json', '--out', 'o'], d.deps)).toBe(0);
    expect(d.logs.join('\n')).toContain('1 failures waived');
    expect(JSON.parse(d.files.get('o/narrow-audit.json') ?? '{}').waived).toHaveLength(1);
    expect(d.files.get('o/narrow-audit.en.html')).toContain('Failures covered by a waiver');
  });
  it('an expired waiver fails the run', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('bad.html', BAD);
    d.files.set('w.json', waivers([{ check: 'static-html', rule: 'img-alt', reason: 'Decorative image, fix in ticket 12', expires: '2026-11-01' }]));
    expect(await runCli(['--html', 'bad.html', '--waivers', 'w.json'], d.deps)).toBe(1);
    expect(d.logs.join('\n')).toContain('expired on 2026-11-01');
  });
  it('an invalid waivers file fails the run instead of being ignored', async () => {
    const d = deps({ launch: noBrowser });
    d.files.set('good.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title></head><body><main><h1>x</h1></main></body></html>');
    d.files.set('w.json', waivers([{ check: 'contrast', reason: 'no', expires: '2026-12-31' }]));
    expect(await runCli(['--html', 'good.html', '--waivers', 'w.json'], d.deps)).toBe(1);
  });
});

describe('exitCode', () => {
  const unknownOnly = makeReport(
    [buildRouteAudit('/', 320, { contrast: { checked: 1, entries: [{ check: 'contrast', id: 'a', status: 'unknown', message: { en: 'e', fr: 'f' } }] } })],
    NOW,
  );
  it('only counts unknowns as failures when asked to', () => {
    expect(exitCode(unknownOnly, false)).toBe(0);
    expect(exitCode(unknownOnly, true)).toBe(1);
  });
});

class FakeRoot implements PanelRoot {
  innerHTML = '';
  attrs: Record<string, string> = {};
  handler: ((e: { target: unknown }) => void) | null = null;
  focused: string[] = [];
  setAttribute(n: string, v: string): void {
    this.attrs[n] = v;
  }
  addEventListener(_t: 'click', h: (e: { target: unknown }) => void): void {
    this.handler = h;
  }
  querySelector(sel: string): { focus(): void } {
    return { focus: () => this.focused.push(sel) };
  }
  click(action: string): void {
    this.handler?.({ target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
  }
}

const tick = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('panel', () => {
  const report = makeReport([buildRouteAudit('/x', 320, {})], NOW);

  it('renders idle with 44px buttons and a polite status region', () => {
    const html = renderPanel('en', { kind: 'idle' });
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html.match(/min-height:44px/g)).toHaveLength(2);
  });

  it('runs the audit on click, shows it, and puts focus back on the button', async () => {
    const root = new FakeRoot();
    mountNarrowPanel({ root, lang: 'en', run: () => report });
    expect(root.innerHTML).toContain('No audit has been run yet.');
    root.click('run');
    expect(root.innerHTML).toContain('Running the audit');
    await tick();
    expect(root.innerHTML).toContain('<section');
    expect(root.focused.at(-1)).toBe('[data-action="run"]');
  });

  it('switches language, sets the lang attribute and keeps focus on the toggle', () => {
    const root = new FakeRoot();
    const panel = mountNarrowPanel({ root, lang: 'en', run: () => report });
    root.click('lang-fr');
    expect(panel.getLang()).toBe('fr');
    expect(root.attrs['lang']).toBe('fr');
    expect(root.innerHTML).toContain('Lancer l’audit');
    expect(root.focused.at(-1)).toBe('[data-action="lang-en"]');
  });

  it('shows an escaped error when the run fails and ignores clicks while running', async () => {
    const root = new FakeRoot();
    let calls = 0;
    mountNarrowPanel({
      root,
      lang: 'en',
      run: async () => {
        calls++;
        throw new Error('<boom>');
      },
    });
    root.click('run');
    root.click('run');
    await tick();
    expect(calls).toBe(1);
    expect(root.innerHTML).toContain('&lt;boom&gt;');
    expect(root.innerHTML).not.toContain('<boom>');
  });

  it('copies the report as JSON or SARIF and says so, in both languages', async () => {
    const root = new FakeRoot();
    const copied: string[] = [];
    mountNarrowPanel({ root, lang: 'en', run: () => report, copy: async (t) => void copied.push(t) });
    root.click('run');
    await tick();
    expect(root.innerHTML).toContain('data-action="copy-json"');
    root.click('copy-json');
    await tick();
    root.click('copy-sarif');
    await tick();
    expect(JSON.parse(copied[0] ?? '{}').tool.name).toBe('narrow-audit');
    expect(JSON.parse(copied[1] ?? '{}').version).toBe('2.1.0');
    expect(root.innerHTML).toContain('Copied.');
    expect(root.focused.at(-1)).toBe('[data-action="copy-sarif"]');
    root.click('lang-fr');
    expect(root.innerHTML).not.toContain('Copied.');
  });

  it('reports a failed copy and a missing clipboard instead of claiming success', async () => {
    const root = new FakeRoot();
    mountNarrowPanel({
      root,
      lang: 'fr',
      run: () => report,
      copy: async () => {
        throw new Error('denied');
      },
    });
    root.click('run');
    await tick();
    root.click('copy-json');
    await tick();
    expect(root.innerHTML).toContain('La copie a échoué.');
    expect(root.innerHTML).not.toContain('Copié.');
    const bare = new FakeRoot();
    mountNarrowPanel({ root: bare, lang: 'en', run: () => report });
    bare.click('run');
    await tick();
    bare.click('copy-json');
    expect(bare.innerHTML).toContain('Copying is not available in this browser.');
  });

  it('the copy buttons exist only once there is a report', () => {
    expect(renderPanel('en', { kind: 'idle' })).not.toContain('copy-json');
    expect(renderPanel('en', { kind: 'done', report })).toContain('copy-sarif');
    expect((renderPanel('en', { kind: 'done', report }).match(/min-height:44px/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('defaults to auditing the live document', async () => {
    dom = installDom(spec);
    const root = new FakeRoot();
    mountNarrowPanel({ root, lang: 'en', now: () => NOW });
    root.click('run');
    await tick();
    expect(root.innerHTML).toContain('<section');
  });

  it('French panel text follows the typography rules', () => {
    const html = renderPanel('fr', { kind: 'error', message: 'x' });
    expect(frTypographyIssues(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))).not.toContain('apostrophe');
    expect(html).toContain('\u00A0:');
  });

  it('exposes a route descriptor for the shell', () => {
    expect(narrowRoute.path).toBe('/dev/narrow');
    expect(narrowRoute.title.fr).toBe('Audit écran étroit');
    expect(narrowRoute.mount).toBe(mountNarrowPanel);
  });
});
