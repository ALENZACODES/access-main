import { describe, expect, it } from 'vitest';
import { runCli, type CliDeps } from './cli.js';
import { DEFAULT_AGENT, PLAN_HELP_TEXT, parsePlanArgs, runPlan, type PlanDeps } from './plan-cli.js';

const BASE = 'https://app.example';
const SITEMAP = `<urlset>${['/places/1', '/places/2', '/places/3', '/places/4', '/admin/users', '/about'].map((r) => `<url><loc>${BASE}${r}</loc></url>`).join('')}<url><loc>https://cdn.example/x</loc></url></urlset>`;
const ROBOTS = 'User-agent: *\nDisallow: /admin\nSitemap: https://app.example/sitemap.xml\n';

function world(files: Record<string, string>): { deps: PlanDeps; files: Map<string, string>; logs: string[]; text: () => string } {
  const store = new Map(Object.entries(files));
  const logs: string[] = [];
  const deps: PlanDeps = {
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
  };
  return { deps, files: store, logs, text: () => logs.join('\n') };
}

describe('parsePlanArgs', () => {
  it('reads every option', () => {
    const parsed = parsePlanArgs([
      '--base-url', BASE, '--sitemap', 's1.xml', '--sitemap', 's2.xml', '--routes', 'r.txt', '--page', '/=index.html', '--robots', 'robots.txt', '--agent', 'audit',
      '--per-template', '2', '--max-routes', '50', '--min-siblings', '4', '--always', '/', '--literal', 'help', '--lang', 'fr', '--out', 'routes.txt',
    ]);
    expect(parsed).toEqual({
      ok: true,
      args: {
        baseUrl: BASE,
        sitemapFiles: ['s1.xml', 's2.xml'],
        routeFiles: ['r.txt'],
        pages: [['/', 'index.html']],
        robotsFile: 'robots.txt',
        agent: 'audit',
        perTemplate: 2,
        maxRoutes: 50,
        minSiblings: 4,
        always: ['/'],
        literals: ['help'],
        lang: 'fr',
        outFile: 'routes.txt',
        help: false,
      },
    });
  });

  it('has defaults', () => {
    expect(parsePlanArgs(['--base-url', BASE, '--sitemap', 's.xml'])).toMatchObject({ ok: true, args: { agent: DEFAULT_AGENT, perTemplate: null, maxRoutes: null, lang: 'en', outFile: null } });
  });

  it.each([
    [['--sitemap', 's.xml'], '--base-url is required'],
    [['--base-url', 'app.example', '--sitemap', 's.xml'], 'full http or https address'],
    [['--base-url', BASE], 'Nothing to plan from'],
    [['--base-url', BASE, '--sitemap'], '--sitemap needs a value'],
    [['--base-url', BASE, '--page', 'index.html'], '--page needs ROUTE=FILE'],
    [['--base-url', BASE, '--page', '/='], '--page needs ROUTE=FILE'],
    [['--base-url', BASE, '--sitemap', 's.xml', '--per-template', '0'], '--per-template needs a whole number, 1 or more'],
    [['--base-url', BASE, '--sitemap', 's.xml', '--max-routes', '2.5'], '--max-routes needs a whole number'],
    [['--base-url', BASE, '--sitemap', 's.xml', '--min-siblings', '1'], '--min-siblings needs a whole number, 2 or more'],
    [['--base-url', BASE, '--sitemap', 's.xml', '--lang', 'de'], '--lang must be en or fr'],
    [['--base-url', BASE, '--sitemap', 's.xml', '--route', '/'], 'Unknown option --route'],
    [['--base-url', BASE, '--sitemap', 's.xml', '--nope'], 'Unknown option --nope'],
  ])('refuses %j', (argv, en) => {
    const parsed = parsePlanArgs(argv);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toContain(en);
    expect(parsed.error.fr).not.toBe('');
    expect(parsed.error.fr).not.toBe(parsed.error.en);
    expect(parsed.error.fr).not.toMatch(/inconnu/i);
  });

  it('asks for nothing else with --help', () => {
    expect(parsePlanArgs(['--help'])).toMatchObject({ ok: true, args: { help: true } });
  });
});

describe('runPlan', () => {
  it('prints the help in both languages', async () => {
    const w = world({});
    expect(await runPlan(['--help'], w.deps)).toBe(0);
    expect(w.logs).toEqual([PLAN_HELP_TEXT]);
    expect(PLAN_HELP_TEXT).toContain('Usage: narrow-audit plan');
    expect(PLAN_HELP_TEXT).toContain('Utilisation\u00A0: narrow-audit plan');
  });

  it('prints the usage with code 2 on a usage error', async () => {
    const w = world({});
    expect(await runPlan([], w.deps)).toBe(2);
    expect(w.logs[0]).toContain('--base-url is required');
    expect(w.logs[1]).toBe(PLAN_HELP_TEXT);
  });

  it('plans from a sitemap and says what it left out', async () => {
    const w = world({ 's.xml': SITEMAP });
    expect(await runPlan(['--base-url', BASE, '--sitemap', 's.xml', '--per-template', '2', '--out', 'routes.txt'], w.deps)).toBe(0);
    expect(w.text()).toContain('s.xml: 6 route(s), 1 address(es) on another host, 0 repeat(s).');
    expect(w.text()).toContain('4 route(s) to audit out of 6, in 3 template(s).');
    expect(w.text()).toContain('2 route(s) are not in the plan.');
    expect(w.files.get('routes.txt')).toBe('/about\n/admin/users\n/places/1\n/places/4\n');
  });

  it('sets aside what the robots file excludes, and lists it', async () => {
    const w = world({ 's.xml': SITEMAP, 'robots.txt': ROBOTS });
    expect(await runPlan(['--base-url', BASE, '--sitemap', 's.xml', '--robots', 'robots.txt', '--out', 'routes.txt'], w.deps)).toBe(0);
    expect(w.text()).toContain(`1 of 6 route(s) are excluded for the agent ${DEFAULT_AGENT}.`);
    expect(w.text()).toContain('  - /admin/users');
    expect(w.files.get('routes.txt')).not.toContain('/admin');
  });

  it('adds routes from a list and from the links of saved pages', async () => {
    const w = world({ 'r.txt': '# routes\n/map\nhttps://app.example/help/\nhttps://other.example/x\n\n', 'index.html': '<a href="/places/9">Nine</a><a href="https://www.ontario.ca/">Ontario</a>' });
    expect(await runPlan(['--base-url', BASE, '--routes', 'r.txt', '--page', '/=index.html', '--out', 'routes.txt'], w.deps)).toBe(0);
    expect(w.text()).toContain('r.txt: 1 line(s) that are not routes of this site were left out.');
    expect(w.text()).toContain('Pages read: 1. Routes found in their links: 2, of which 1 with no markup given.');
    expect(w.files.get('routes.txt')).toBe('/\n/help\n/map\n/places/9\n');
  });

  it('keeps the routes named with --always', async () => {
    const w = world({ 's.xml': SITEMAP });
    await runPlan(['--base-url', BASE, '--sitemap', 's.xml', '--per-template', '1', '--always', '/places/3', '--out', 'routes.txt'], w.deps);
    expect(w.files.get('routes.txt')).toContain('/places/3\n');
  });

  it('says that an index is not followed', async () => {
    const w = world({ 'i.xml': `<sitemapindex><sitemap><loc>${BASE}/s1.xml</loc></sitemap></sitemapindex>`, 's.xml': SITEMAP });
    expect(await runPlan(['--base-url', BASE, '--sitemap', 'i.xml', '--sitemap', 's.xml'], w.deps)).toBe(0);
    expect(w.text()).toContain('i.xml: this file is an index. It names 1 other sitemap(s), which are not read from here.');
  });

  it('prints an empty plan when no route was found', async () => {
    const w = world({ 'r.txt': 'https://other.example/x\n' });
    expect(await runPlan(['--base-url', BASE, '--routes', 'r.txt'], w.deps)).toBe(0);
    expect(w.text()).toContain('No routes were given.');
  });

  it('stops with code 2 on a file that is not a sitemap, and names it', async () => {
    const w = world({ 's.xml': '<html></html>' });
    expect(await runPlan(['--base-url', BASE, '--sitemap', 's.xml'], w.deps)).toBe(2);
    expect(w.logs[0]).toContain('s.xml: The file is not a sitemap');
  });

  it('stops with code 2 on a missing file', async () => {
    const w = world({});
    expect(await runPlan(['--base-url', BASE, '--sitemap', 'missing.xml'], w.deps)).toBe(2);
    expect(w.text()).toContain('Planning failed');
  });

  it('writes in French when asked', async () => {
    const w = world({ 's.xml': SITEMAP, 'robots.txt': ROBOTS });
    await runPlan(['--base-url', BASE, '--sitemap', 's.xml', '--robots', 'robots.txt', '--lang', 'fr'], w.deps);
    expect(w.text()).toContain('s.xml\u00A0: 6 route(s), 1 adresse(s) d’un autre hôte, 0 répétition(s).');
    expect(w.text()).toContain('Plan d’audit');
    expect(w.text()).not.toMatch(/inconnu/i);
  });
});

describe('narrow-audit plan through the main command', () => {
  it('runs the plan and never starts a browser', async () => {
    const w = world({ 's.xml': SITEMAP });
    const deps: CliDeps = {
      ...w.deps,
      async launch() {
        throw new Error('browser launched');
      },
      now: () => new Date('2026-11-19T10:00:00Z'),
    };
    expect(await runCli(['plan', '--base-url', BASE, '--sitemap', 's.xml'], deps)).toBe(0);
    expect(w.text()).toContain('Audit plan');
  });
});
