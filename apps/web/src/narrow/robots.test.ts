import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { ROBOTS_REFERENCE, describeRobots, isAllowed, parseRobots, ruleMatches, rulesFor, splitByRobots } from './robots.js';

const FILE = `# Rules for everyone
User-agent: *
Disallow: /admin
Allow: /admin/help
Disallow: /*.json$
Crawl-delay: 5
Sitemap: https://app.example/sitemap.xml
this line is not a field

User-agent: Audit
User-agent: other
Disallow: /private/
Disallow:
Sitemap: https://app.example/sitemap.xml
Sitemap: https://app.example/sitemap-fr.xml
`;

describe('parseRobots', () => {
  const robots = parseRobots(FILE);

  it('reads groups, with several agents on one group', () => {
    expect(robots.groups).toEqual([
      {
        agents: ['*'],
        rules: [
          { allow: false, path: '/admin' },
          { allow: true, path: '/admin/help' },
          { allow: false, path: '/*.json$' },
        ],
      },
      { agents: ['audit', 'other'], rules: [{ allow: false, path: '/private/' }] },
    ]);
  });

  it('lists each sitemap once, wherever it stands in the file', () => {
    expect(robots.sitemaps).toEqual(['https://app.example/sitemap.xml', 'https://app.example/sitemap-fr.xml']);
  });

  it('counts the lines it does not use', () => {
    expect(robots.ignored).toBe(2);
  });

  it('drops comments at the end of a line and reads field names in any case', () => {
    const r = parseRobots('USER-AGENT: * # everyone\nDISALLOW: /x # not this\n');
    expect(r.groups).toEqual([{ agents: ['*'], rules: [{ allow: false, path: '/x' }] }]);
  });

  it('ignores a rule that comes before any user agent', () => {
    const r = parseRobots('Disallow: /x\nUser-agent: *\nDisallow: /y\n');
    expect(r.groups).toEqual([{ agents: ['*'], rules: [{ allow: false, path: '/y' }] }]);
    expect(r.ignored).toBe(1);
  });

  it('starts a new group at a user agent that follows rules', () => {
    const r = parseRobots('User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y\n');
    expect(r.groups.map((g) => g.agents)).toEqual([['a'], ['b']]);
  });

  it('reads a file with a byte order mark and old line endings', () => {
    const r = parseRobots('\uFEFFUser-agent: *\rDisallow: /x\r');
    expect(r.groups[0]?.rules).toEqual([{ allow: false, path: '/x' }]);
  });

  it('gives nothing for an empty file', () => {
    expect(parseRobots('')).toEqual({ groups: [], sitemaps: [], ignored: 0 });
  });
});

describe('rulesFor', () => {
  const robots = parseRobots(FILE);

  it('uses the group that names the agent, in any case', () => {
    expect(rulesFor(robots, 'AUDIT')).toEqual([{ allow: false, path: '/private/' }]);
  });

  it('falls back on the group for everyone', () => {
    expect(rulesFor(robots, 'someone-else')).toHaveLength(3);
    expect(rulesFor(robots, '')).toHaveLength(3);
  });

  it('joins groups that name the same agent', () => {
    const r = parseRobots('User-agent: a\nDisallow: /x\n\nUser-agent: a\nDisallow: /y\n');
    expect(rulesFor(r, 'a').map((x) => x.path)).toEqual(['/x', '/y']);
  });

  it('gives no rules when no group applies', () => {
    expect(rulesFor(parseRobots('User-agent: a\nDisallow: /\n'), 'b')).toEqual([]);
  });
});

describe('ruleMatches', () => {
  it.each([
    ['/admin', '/admin', true],
    ['/admin', '/admin/users', true],
    ['/admin', '/administrator', true],
    ['/admin/', '/admin', false],
    ['/*.json$', '/data/places.json', true],
    ['/*.json$', '/data/places.json?x=1', false],
    ['/*.json', '/data/places.json?x=1', true],
    ['/a*b', '/a/x/b/c', true],
    ['/a.b', '/aXb', false],
    ['/s?q=', '/s?q=ramp', true],
    ['/s?q=', '/sq=ramp', false],
    ['/', '/anything', true],
    ['/$', '/', true],
    ['/$', '/a', false],
  ])('%s against %s: %s', (rule, route, want) => {
    expect(ruleMatches(rule, route)).toBe(want);
  });
});

describe('isAllowed', () => {
  const robots = parseRobots(FILE);

  it.each([
    ['/admin', false],
    ['/admin/users', false],
    ['/admin/help', true],
    ['/admin/help/keys', true],
    ['/data.json', false],
    ['/data.json?x=1', true],
    ['/private/x', true],
    ['/', true],
    ['/robots.txt', true],
  ])('%s for everyone: %s', (route, want) => {
    expect(isAllowed(robots, 'reader', route)).toBe(want);
  });

  it('applies only the named group to a named agent', () => {
    expect(isAllowed(robots, 'audit', '/admin')).toBe(true);
    expect(isAllowed(robots, 'audit', '/private/x')).toBe(false);
    expect(isAllowed(robots, 'audit', '/private')).toBe(true);
  });

  it('lets allow win against a disallow of the same length', () => {
    const r = parseRobots('User-agent: *\nDisallow: /page\nAllow: /page\n');
    expect(isAllowed(r, 'x', '/page')).toBe(true);
  });

  it('lets the longer rule win whatever the order', () => {
    const r = parseRobots('User-agent: *\nAllow: /a\nDisallow: /a/b\n');
    expect(isAllowed(r, 'x', '/a/b/c')).toBe(false);
    expect(isAllowed(r, 'x', '/a/c')).toBe(true);
  });

  it('allows everything when the file is empty or disallows nothing', () => {
    expect(isAllowed(parseRobots(''), 'x', '/a')).toBe(true);
    expect(isAllowed(parseRobots('User-agent: *\nDisallow:\n'), 'x', '/a')).toBe(true);
  });

  it('excludes everything but the file itself under Disallow: /', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n');
    expect(isAllowed(r, 'x', '/')).toBe(false);
    expect(isAllowed(r, 'x', '/a')).toBe(false);
    expect(isAllowed(r, 'x', '/robots.txt')).toBe(true);
  });

  it('leaves the fragment of a hash route out of the match', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*map$\n');
    expect(isAllowed(r, 'x', '/#/map')).toBe(true);
    expect(isAllowed(r, 'x', '/map')).toBe(false);
  });
});

describe('splitByRobots and describeRobots', () => {
  const robots = parseRobots(FILE);
  const routes = ['/', '/admin', '/admin/help', '/data.json'];

  it('sorts routes and keeps their order', () => {
    expect(splitByRobots(robots, 'reader', routes)).toEqual({ allowed: ['/', '/admin/help'], disallowed: ['/admin', '/data.json'] });
  });

  it('says how many routes are excluded and that the file blocks nothing', () => {
    expect(describeRobots(robots, 'reader', routes, 'en')).toBe(
      'The robots.txt file names 2 sitemap(s). 2 of 4 route(s) are excluded for the agent reader. The file states what the site asks: it blocks nothing by itself.',
    );
    const fr = describeRobots(robots, 'reader', routes, 'fr');
    expect(fr).toContain('2 route(s) sur 4 sont exclues pour l’agent reader.');
    expect(frTypographyIssues(fr)).toEqual([]);
  });

  it('says so when no route is excluded', () => {
    expect(describeRobots(robots, 'reader', ['/'], 'en')).toBe('The robots.txt file names 2 sitemap(s). None of the 1 route(s) is excluded for the agent reader.');
    const fr = describeRobots(robots, 'reader', ['/'], 'fr');
    expect(fr).toContain('Aucune des 1 route(s) n’est exclue');
    expect(frTypographyIssues(fr)).toEqual([]);
  });
});

describe('reference', () => {
  it('names the protocol with an address, a date and a licence', () => {
    expect(ROBOTS_REFERENCE.url).toMatch(/^https:\/\//);
    expect(ROBOTS_REFERENCE.date).toMatch(/^\d{4}-\d{2}$/);
    expect(ROBOTS_REFERENCE.licence).not.toBe('');
  });
});
