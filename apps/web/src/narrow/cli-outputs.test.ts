import { describe, expect, it } from 'vitest';
import { HELP_TEXT, OUTPUT_FORMATS, parseArgs, runCli, type CliDeps } from './cli.js';
import { CSV_COLUMNS, parseCsv } from './csv.js';

const BAD = '<html><body><img src="a.png"><p>Opening hours</p></body></html>';
const GOOD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body><main><h1>Hi</h1></main></body></html>';

function deps(files: Record<string, string>): { deps: CliDeps; files: Map<string, string>; logs: string[] } {
  const store = new Map(Object.entries(files));
  const logs: string[] = [];
  const d: CliDeps = {
    async launch() {
      throw new Error('browser launched');
    },
    async readText(path) {
      const text = store.get(path);
      if (text === undefined) throw new Error(`no such file: ${path}`);
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
  return { deps: d, files: store, logs };
}

describe('--format', () => {
  it('knows the three text formats next to SARIF and JUnit', () => {
    expect(OUTPUT_FORMATS).toEqual(['sarif', 'junit', 'markdown', 'csv', 'digest', 'detail', 'coverage', 'worksheet']);
  });
  it('accepts them in any order and drops repeats', () => {
    expect(parseArgs(['--html', 'a.html', '--out', 'o', '--format', 'csv,markdown,digest,csv'])).toMatchObject({ ok: true, args: { formats: ['csv', 'markdown', 'digest'] } });
  });
  it('rejects a format it does not know and lists the ones it does, in both languages', () => {
    const parsed = parseArgs(['--html', 'a.html', '--out', 'o', '--format', 'markdown,pdf']);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.en).toContain('sarif, junit, markdown, csv, digest');
      expect(parsed.error.fr).toContain('sarif, junit, markdown, csv, digest');
    }
  });
  it('still needs --out', () => {
    expect(parseArgs(['--html', 'a.html', '--format', 'markdown']).ok).toBe(false);
  });
  it('is listed in the help, in both languages', () => {
    expect(HELP_TEXT.match(/--format sarif,junit,markdown,csv,digest,detail,coverage,worksheet/g)).toHaveLength(2);
  });
});

describe('runCli with the text formats', () => {
  it('writes the Markdown, CSV and digest files next to the JSON and HTML reports', async () => {
    const d = deps({ 'bad.html': BAD });
    expect(await runCli(['--html', 'bad.html', '--out', 'o', '--format', 'markdown,csv,digest'], d.deps)).toBe(1);
    expect([...d.files.keys()].sort()).toEqual(['bad.html', 'o/narrow-audit.csv', 'o/narrow-audit.en.html', 'o/narrow-audit.en.md', 'o/narrow-audit.en.txt', 'o/narrow-audit.json']);
  });
  it('writes none of them unless asked', async () => {
    const d = deps({ 'bad.html': BAD });
    await runCli(['--html', 'bad.html', '--out', 'o'], d.deps);
    expect([...d.files.keys()].sort()).toEqual(['bad.html', 'o/narrow-audit.en.html', 'o/narrow-audit.json']);
  });
  it('puts the same findings in every file', async () => {
    const d = deps({ 'bad.html': BAD });
    await runCli(['--html', 'bad.html', '--out', 'o/', '--format', 'markdown,csv,digest'], d.deps);
    const json = JSON.parse(d.files.get('o/narrow-audit.json') ?? '{}') as { routes: { entries: { rule?: string; status: string }[] }[] };
    const entries = json.routes.flatMap((r) => r.entries);
    expect(entries.length).toBeGreaterThan(0);
    const rows = parseCsv(d.files.get('o/narrow-audit.csv') ?? '');
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(entries.length + 1);
    const md = d.files.get('o/narrow-audit.en.md') ?? '';
    expect(md.startsWith('# Narrow-screen audit\n')).toBe(true);
    expect(md).toContain('`static-html/img-alt`');
    const failed = entries.filter((e) => e.status === 'fail').length;
    expect(md).toContain(`**To fix: ${failed}**`);
    expect(d.files.get('o/narrow-audit.en.txt') ?? '').toContain(`Narrow-screen audit: ${failed} failure`);
  });
  it('names the Markdown and digest files after the language and writes them in it', async () => {
    const d = deps({ 'bad.html': BAD });
    await runCli(['--html', 'bad.html', '--out', 'o', '--lang', 'fr', '--format', 'markdown,digest'], d.deps);
    expect(d.files.get('o/narrow-audit.fr.md')?.startsWith('# Audit écran étroit\n')).toBe(true);
    expect(d.files.get('o/narrow-audit.fr.txt')).toContain('Audit écran étroit');
    expect(d.files.has('o/narrow-audit.en.md')).toBe(false);
  });
  it('writes the files for a page with nothing to report, and does not word it as a pass', async () => {
    const d = deps({ 'good.html': GOOD });
    expect(await runCli(['--html', 'good.html', '--out', 'o', '--format', 'markdown,csv,digest'], d.deps)).toBe(0);
    const digest = d.files.get('o/narrow-audit.en.txt') ?? '';
    const entries = (JSON.parse(d.files.get('o/narrow-audit.json') ?? '{}') as { routes: { entries: unknown[] }[] }).routes.flatMap((r) => r.entries);
    if (entries.length === 0) expect(digest).toContain('This is not a conformance statement.');
    expect(digest).not.toMatch(/\bpass(?:ed|es)?\b/i);
    expect(d.files.get('o/narrow-audit.en.md')).toContain('A clean result is not a conformance statement.');
    expect(parseCsv(d.files.get('o/narrow-audit.csv') ?? '')).toHaveLength(entries.length + 1);
  });
  it('can be combined with SARIF and JUnit', async () => {
    const d = deps({ 'bad.html': BAD });
    await runCli(['--html', 'bad.html', '--out', 'o', '--format', 'sarif,junit,markdown,csv,digest'], d.deps);
    expect([...d.files.keys()].filter((k) => k.startsWith('o/')).sort()).toEqual([
      'o/narrow-audit.csv', 'o/narrow-audit.en.html', 'o/narrow-audit.en.md', 'o/narrow-audit.en.txt', 'o/narrow-audit.json', 'o/narrow-audit.junit.xml', 'o/narrow-audit.sarif',
    ]);
  });
});

describe('--compare', () => {
  async function earlier(html: string): Promise<string> {
    const d = deps({ 'page.html': html });
    await runCli(['--html', 'page.html', '--out', 'o'], d.deps);
    return d.files.get('o/narrow-audit.json') ?? '';
  }
  it('is read as a file option and is null when not given', () => {
    expect(parseArgs(['--html', 'a.html', '--compare', 'old.json'])).toMatchObject({ ok: true, args: { compareFile: 'old.json' } });
    expect(parseArgs(['--html', 'a.html'])).toMatchObject({ ok: true, args: { compareFile: null } });
    expect(parseArgs(['--html', 'a.html', '--compare']).ok).toBe(false);
    expect(HELP_TEXT).toContain('[--compare REPORT.json]');
    expect(HELP_TEXT).toContain('[--compare RAPPORT.json]');
  });
  it('logs what changed since the earlier report and writes it as Markdown', async () => {
    const old = await earlier(GOOD.replace('<h1>Hi</h1>', '<h1>Hi</h1><img src="a.png">'));
    const d = deps({ 'page.html': GOOD.replace('<h1>Hi</h1>', '<h1>Hi</h1><button></button>'), 'old.json': old });
    await runCli(['--html', 'page.html', '--out', 'o', '--compare', 'old.json'], d.deps);
    const log = d.logs.join('\n');
    expect(log).toContain('Compared with the report of 2026-11-19T10:00:00.000Z:');
    expect(log).toContain('No longer reported does not mean fixed');
    const md = d.files.get('o/narrow-audit.compare.en.md') ?? '';
    expect(md).toContain('# Narrow-screen audit – what changed');
    expect(md).toContain('## New findings');
    expect(md).toContain('`static-html/name`');
    expect(md).toContain('## Findings no longer reported');
    expect(md).toContain('`static-html/img-alt`');
  });
  it('says the findings are the same when nothing changed, and does not change the exit code', async () => {
    const old = await earlier(BAD);
    const d = deps({ 'page.html': BAD, 'old.json': old });
    expect(await runCli(['--html', 'page.html', '--compare', 'old.json'], d.deps)).toBe(1);
    expect(d.logs.join('\n')).toContain('Same findings as last time');
    expect([...d.files.keys()].sort()).toEqual(['old.json', 'page.html']);
  });
  it('writes the comparison in French when asked', async () => {
    const old = await earlier(GOOD);
    const d = deps({ 'page.html': BAD, 'old.json': old });
    await runCli(['--html', 'page.html', '--out', 'o', '--lang', 'fr', '--compare', 'old.json'], d.deps);
    expect(d.files.get('o/narrow-audit.compare.fr.md')).toContain('# Audit écran étroit – ce qui a changé');
    expect(d.logs.join('\n')).toContain('Comparaison avec le rapport du');
  });
  it('exits 2 with a message in both languages when the earlier file is not a report', async () => {
    const d = deps({ 'page.html': GOOD, 'old.json': '{"routes": 3}' });
    expect(await runCli(['--html', 'page.html', '--compare', 'old.json'], d.deps)).toBe(2);
    expect(d.logs.join('\n')).toContain('The report file is not a narrow-audit report');
    expect(d.logs.join('\n')).toContain('Le fichier de rapport n’est pas un rapport narrow-audit');
    const e = deps({ 'page.html': GOOD, 'old.json': 'not json' });
    expect(await runCli(['--html', 'page.html', '--compare', 'old.json'], e.deps)).toBe(2);
    expect(e.logs.join('\n')).toContain('The report file is not valid JSON.');
  });
  it('exits 2 when the earlier file is missing', async () => {
    const d = deps({ 'page.html': GOOD });
    expect(await runCli(['--html', 'page.html', '--compare', 'gone.json'], d.deps)).toBe(2);
  });
});
