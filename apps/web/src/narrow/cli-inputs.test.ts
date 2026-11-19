import { describe, expect, it } from 'vitest';
import { HELP_TEXT, runCli, type CliDeps } from './cli.js';
import { expandConfig, expandHtmlLists, expandInputs, expandRoutesFiles, parseHtmlList, type InputDeps } from './cli-inputs.js';
import { lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { parseReport } from './reportio.js';

const BAD = '<html><body><img src="a.png"><p>Opening hours</p></body></html>';
const BASE = 'https://app.example';

function world(files: Record<string, string>): { deps: CliDeps; files: Map<string, string>; logs: string[]; text: () => string; launched: () => number } {
  const store = new Map(Object.entries(files));
  const logs: string[] = [];
  let launches = 0;
  const deps: CliDeps = {
    async launch() {
      launches++;
      throw new Error('browser launched');
    },
    async readText(path) {
      const text = store.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file: ${path}`);
      return text;
    },
    async writeText(path, text) {
      store.set(path, text);
    },
    log(line) {
      logs.push(line);
    },
    now: () => new Date('2026-11-19T10:00:00Z'),
  };
  return { deps, files: store, logs, text: () => logs.join('\n'), launched: () => launches };
}

const input = (files: Record<string, string>): { deps: InputDeps; logs: string[] } => {
  const w = world(files);
  return { deps: w.deps, logs: w.logs };
};

describe('expandConfig', () => {
  it('leaves arguments with no config alone', async () => {
    const argv = ['--html', 'a.html'];
    expect(await expandConfig(argv, input({}).deps)).toEqual({ ok: true, argv });
  });

  it('puts the arguments of the file where --config stood', async () => {
    const { deps } = input({ 'c.json': '{"out": "audit", "lang": "fr"}' });
    expect(await expandConfig(['--html', 'a.html', '--config', 'c.json', '--lang', 'en'], deps)).toEqual({
      ok: true,
      argv: ['--html', 'a.html', '--lang', 'fr', '--out', 'audit', '--lang', 'en'],
    });
  });

  it.each([
    [['--config'], '--config needs a file.'],
    [['--config', '--html', 'a.html'], '--config needs a file.'],
    [['--config', 'a.json', '--config', 'b.json'], 'Give --config once.'],
  ])('refuses %j', async (argv, en) => {
    const out = await expandConfig(argv, input({ 'a.json': '{}', 'b.json': '{}' }).deps);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.en).toBe(en);
      expect(frTypographyIssues(out.error.fr)).toEqual([]);
    }
  });

  it('names the file in front of what is wrong with it', async () => {
    const out = await expandConfig(['--config', 'c.json'], input({ 'c.json': '{"offline": "yes"}' }).deps);
    expect(out).toEqual({ ok: false, error: { en: 'c.json: The config key "offline" needs true or false.', fr: 'c.json\u00A0: La clé de configuration "offline" demande true ou false.' } });
  });
});

describe('expandRoutesFiles', () => {
  it('leaves arguments with no routes file alone', async () => {
    const argv = ['--base-url', BASE, '--route', '/'];
    expect(await expandRoutesFiles(argv, input({}).deps)).toEqual({ ok: true, argv });
  });

  it('gives one --route per route, where the option stood', async () => {
    const { deps } = input({ 'r.txt': '/a\n/b\n' });
    expect(await expandRoutesFiles(['--base-url', BASE, '--routes-file', 'r.txt', '--lang', 'fr'], deps)).toEqual({
      ok: true,
      argv: ['--base-url', BASE, '--route', '/a', '--route', '/b', '--lang', 'fr'],
    });
  });

  it('reads --base-url wherever it stands', async () => {
    const { deps } = input({ 'r.txt': '/a\n' });
    expect(await expandRoutesFiles(['--routes-file', 'r.txt', '--base-url', BASE], deps)).toEqual({ ok: true, argv: ['--route', '/a', '--base-url', BASE] });
  });

  it('gives a route named by two files once', async () => {
    const { deps } = input({ 'r1.txt': '/a\n/b\n', 'r2.txt': '/b\n/c\n' });
    const out = await expandRoutesFiles(['--base-url', BASE, '--routes-file', 'r1.txt', '--routes-file', 'r2.txt'], deps);
    expect(out.ok && out.argv.filter((a) => a.startsWith('/'))).toEqual(['/a', '/b', '/c']);
  });

  it('logs a note about repeats in the language of --lang', async () => {
    const en = input({ 'r.txt': '/a\n/a\n' });
    await expandRoutesFiles(['--base-url', BASE, '--routes-file', 'r.txt'], en.deps);
    expect(en.logs).toEqual(['r.txt: 1 route(s) read, 1 repeat(s) dropped.']);
    const fr = input({ 'r.txt': '/a\n/a\n' });
    await expandRoutesFiles(['--base-url', BASE, '--lang', 'fr', '--routes-file', 'r.txt'], fr.deps);
    expect(fr.logs).toEqual(['r.txt\u00A0: 1 route(s) lue(s), 1 répétition(s) ignorée(s).']);
  });

  it.each([
    [['--base-url', BASE, '--routes-file'], '--routes-file needs a file.'],
    [['--base-url', BASE, '--routes-file', '--offline'], '--routes-file needs a file.'],
    [['--routes-file', 'r.txt'], 'r.txt: A routes file needs --base-url, as a full http or https address.'],
    [['--base-url', BASE, '--routes-file', 'bad.txt'], 'bad.txt: Routes file, line 1: a route starts with "/" or is a full address. Found: nope'],
  ])('refuses %j', async (argv, en) => {
    const out = await expandRoutesFiles(argv, input({ 'r.txt': '/a\n', 'bad.txt': 'nope\n' }).deps);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.en).toBe(en);
      expect(frTypographyIssues(out.error.fr), out.error.fr).toEqual([]);
    }
  });
});

describe('expandInputs', () => {
  it('lets the config file name the base URL and a routes file', async () => {
    const { deps } = input({ 'c.json': `{"baseUrl": "${BASE}", "routesFile": ["r.txt"], "offline": true}`, 'r.txt': '/a\n/b\n' });
    expect(await expandInputs(['--config', 'c.json'], deps)).toEqual({ ok: true, argv: ['--base-url', BASE, '--route', '/a', '--route', '/b', '--offline'] });
  });

  it('stops at a bad config before reading any routes file', async () => {
    const { deps } = input({ 'c.json': '[]' });
    const out = await expandInputs(['--config', 'c.json', '--routes-file', 'missing.txt'], deps);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.en).toContain('c.json: ');
  });
});

describe('the command line with a config file', () => {
  it('runs from a config file alone', async () => {
    const w = world({ 'bad.html': BAD, 'c.json': '{"html": ["bad.html"], "out": "o", "format": ["detail", "csv"], "lang": "fr"}' });
    expect(await runCli(['--config', 'c.json'], w.deps)).toBe(1);
    expect([...w.files.keys()].sort()).toEqual(['bad.html', 'c.json', 'o/narrow-audit.csv', 'o/narrow-audit.detail.fr.html', 'o/narrow-audit.fr.html', 'o/narrow-audit.json']);
    expect(w.text()).toContain('Audit écran étroit');
  });

  it('lets an argument typed after --config win', async () => {
    const w = world({ 'bad.html': BAD, 'c.json': '{"html": ["bad.html"], "lang": "fr"}' });
    await runCli(['--config', 'c.json', '--lang', 'en'], w.deps);
    expect(w.logs[0]?.startsWith('Narrow-screen audit')).toBe(true);
  });

  it('adds list options of the file and of the command line together', async () => {
    const w = world({ 'a.html': BAD, 'b.html': BAD, 'c.json': '{"html": ["a.html"], "out": "o"}' });
    await runCli(['--config', 'c.json', '--html', 'b.html'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes.map((r) => r.route)).toEqual(['html:a.html', 'html:b.html']);
  });

  it('stops with code 2 on a config file it cannot use, with the message in both languages', async () => {
    const w = world({ 'c.json': '{"htmls": ["a.html"]}' });
    expect(await runCli(['--config', 'c.json'], w.deps)).toBe(2);
    expect(w.logs).toHaveLength(1);
    expect(w.logs[0]).toContain('c.json: The config key "htmls" is not known. Did you mean "html"?');
    expect(w.logs[0]).toContain(' / c.json\u00A0: La clé de configuration "htmls" n’est pas reconnue.');
  });

  it('stops with code 2 on a config file that does not exist', async () => {
    const w = world({});
    expect(await runCli(['--config', 'missing.json'], w.deps)).toBe(2);
    expect(w.text()).toContain('Could not read an input file / Lecture d’un fichier d’entrée impossible\u00A0: ENOENT: no such file: missing.json');
  });

  it('still reports what the parser refuses in the expanded arguments', async () => {
    const w = world({ 'c.json': '{"lang": "de", "html": ["a.html"]}' });
    expect(await runCli(['--config', 'c.json'], w.deps)).toBe(2);
    expect(w.logs[1]).toBe(HELP_TEXT);
  });
});

describe('the command line with a routes file', () => {
  it('passes the routes on to the browser run', async () => {
    const w = world({ 'r.txt': '/\n/places/1\n' });
    expect(await runCli(['--base-url', BASE, '--routes-file', 'r.txt'], w.deps)).toBe(2);
    expect(w.launched()).toBe(1);
    expect(w.text()).toContain('browser launched');
  });

  it('starts no browser when the file is refused', async () => {
    const w = world({ 'r.txt': 'places/1\n' });
    expect(await runCli(['--base-url', BASE, '--routes-file', 'r.txt'], w.deps)).toBe(2);
    expect(w.launched()).toBe(0);
    expect(w.logs[0]).toContain('r.txt: Routes file, line 1');
  });

  it('counts as giving routes, so --base-url alone is not refused', async () => {
    const w = world({ 'r.txt': '/a\n' });
    await runCli(['--base-url', BASE, '--routes-file', 'r.txt'], w.deps);
    expect(w.text()).not.toContain('Give at least one --route');
  });
});

describe('the detail format on the command line', () => {
  it('writes a page that holds up under the static markup check', async () => {
    const w = world({ 'bad.html': BAD });
    expect(await runCli(['--html', 'bad.html', '--out', 'o', '--format', 'detail'], w.deps)).toBe(1);
    const html = w.files.get('o/narrow-audit.detail.en.html') ?? '';
    expect(html).toContain('<h1>Narrow-screen audit, detailed report</h1>');
    expect(html).toContain('<h3 id="route-0">html:bad.html</h3>');
    expect(lintHtml(html).entries).toEqual([]);
  });

  it('is not written unless asked for', async () => {
    const w = world({ 'bad.html': BAD });
    await runCli(['--html', 'bad.html', '--out', 'o'], w.deps);
    expect([...w.files.keys()].some((f) => f.includes('detail'))).toBe(false);
  });

  it('follows --filter and --redact like the other views', async () => {
    const w = world({ 'bad.html': '<html><body><img src="a.png"><a href="/x" id="account-link"></a></body></html>' });
    await runCli(['--html', 'bad.html', '--out', 'o', '--format', 'detail', '--filter', 'rule:static-html/img-alt', '--redact'], w.deps);
    const html = w.files.get('o/narrow-audit.detail.en.html') ?? '';
    expect(html.match(/<li class="fail">/g)).toHaveLength(1);
    expect(html).not.toContain('account-link');
  });

  it('lists the new options in the help, in both languages', () => {
    for (const flag of ['--config', '--routes-file']) expect(HELP_TEXT.split(flag).length - 1, flag).toBe(2);
    expect(HELP_TEXT.match(/digest,detail,coverage,worksheet\]/g)).toHaveLength(2);
  });
});

describe('parseHtmlList and expandHtmlLists', () => {
  it('reads one file per line, each once, skipping blank lines and comments', () => {
    expect(parseHtmlList('\uFEFF# pages\r\ndist/a.html\r\n\r\n  dist/b.html \ndist/a.html\n')).toEqual(['dist/a.html', 'dist/b.html']);
    expect(parseHtmlList('')).toEqual([]);
  });

  it('leaves arguments with no list alone', async () => {
    const argv = ['--html', 'a.html'];
    expect(await expandHtmlLists(argv, input({}).deps)).toEqual({ ok: true, argv });
  });

  it('gives one --html per file where the option stood, and skips a file already given', async () => {
    const { deps } = input({ 'p.txt': 'a.html\nb.html\nc.html\n' });
    expect(await expandHtmlLists(['--html', 'b.html', '--html-list', 'p.txt', '--out', 'o'], deps)).toEqual({
      ok: true,
      argv: ['--html', 'b.html', '--html', 'a.html', '--html', 'c.html', '--out', 'o'],
    });
  });

  it('gives a file named by two lists once', async () => {
    const { deps } = input({ 'p1.txt': 'a.html\n', 'p2.txt': 'a.html\nb.html\n' });
    const out = await expandHtmlLists(['--html-list', 'p1.txt', '--html-list', 'p2.txt'], deps);
    expect(out.ok && out.argv).toEqual(['--html', 'a.html', '--html', 'b.html']);
  });

  it('lets the config file name a list of pages', async () => {
    const { deps } = input({ 'c.json': '{"htmlList": ["p.txt"], "out": "o"}', 'p.txt': 'a.html\n' });
    expect(await expandInputs(['--config', 'c.json'], deps)).toEqual({ ok: true, argv: ['--out', 'o', '--html', 'a.html'] });
  });
});
