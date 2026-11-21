import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { byOwner, describeByOwner, ownerOf, parseOwners, unusedOwnerLines, type Owners } from './owners.js';
import { found, reportOf, smallSite } from './report-fixtures.js';

const owners = (text: string): Owners => {
  const p = parseOwners(text);
  if (!p.ok) throw new Error(p.error.en);
  return p.value;
};

const FILE = `# general rule first
*                 @web
route:/help*      @help-team   # the help centre
rule:contrast/*   @design
`;

describe('parseOwners', () => {
  it('reads the three kinds of line and keeps their line numbers', () => {
    expect(owners(FILE).lines).toEqual([
      { kind: 'any', pattern: '*', owner: '@web', line: 2 },
      { kind: 'route', pattern: '/help*', owner: '@help-team', line: 3 },
      { kind: 'rule', pattern: 'contrast/*', owner: '@design', line: 4 },
    ]);
  });
  it('skips comments and empty lines, and accepts CR LF', () => {
    expect(owners('\r\n# only a comment\r\n\r\n*  @web\r\n').lines).toHaveLength(1);
    expect(owners('').lines).toEqual([]);
  });
  it('reads a bare check name as all of its rules', () => {
    expect(owners('rule:images @content').lines[0]?.pattern).toBe('images/*');
  });
  it('keeps a hash inside a route pattern', () => {
    expect(owners('route:/a#b @web').lines[0]?.pattern).toBe('/a#b');
  });
  it.each([
    ['* web', 'line 1', 'must start with @', 'doit commencer par @'],
    ['*', 'line 1', 'expected a pattern and one owner', 'un motif et un seul responsable'],
    ['* @a @b', 'line 1', 'expected a pattern and one owner', 'un motif et un seul responsable'],
    ['# x\n/help @web', 'line 2', 'must be *, route:PATTERN or rule:PATTERN', 'doit être *, route:MOTIF ou rule:MOTIF'],
    ['route: @web', 'line 1', 'must be *, route:PATTERN or rule:PATTERN', 'doit être'],
    ['* @', 'line 1', 'must start with @', 'doit commencer par @'],
  ])('rejects "%s" and names the line, in both languages', (text, line, en, fr) => {
    const p = parseOwners(text);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.error.en).toContain(line);
      expect(p.error.en).toContain(en);
      expect(p.error.fr).toContain(fr);
      expect(p.error.fr).toContain(line.replace('line', 'ligne'));
      expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
  });
});

describe('ownerOf', () => {
  const o = owners(FILE);
  it('lets the last matching line win', () => {
    expect(ownerOf('/', found('images', 'broken', 'fail', 'img'), o)).toBe('@web');
    expect(ownerOf('/help/faq', found('images', 'broken', 'fail', 'img'), o)).toBe('@help-team');
    expect(ownerOf('/help/faq', found('contrast', 'low', 'fail', 'p'), o)).toBe('@design');
    expect(ownerOf('/', found('contrast', 'low', 'fail', 'p'), o)).toBe('@design');
  });
  it('follows the order of the file, not the kind of line', () => {
    const flipped = owners('rule:contrast/* @design\nroute:/help* @help-team');
    expect(ownerOf('/help', found('contrast', 'low', 'fail', 'p'), flipped)).toBe('@help-team');
  });
  it('gives null when no line matches', () => {
    expect(ownerOf('/', found('images', 'broken', 'fail', 'img'), owners('route:/help* @help-team'))).toBeNull();
    expect(ownerOf('/', found('images', 'broken', 'fail', 'img'), owners(''))).toBeNull();
  });
});

describe('byOwner', () => {
  it('groups findings and puts the owner with the most failures first', () => {
    const groups = byOwner(smallSite(), owners(FILE));
    expect(groups.map((g) => [g.owner, g.failed, g.unknown, g.items.length])).toEqual([
      ['@design', 2, 1, 3],
      ['@help-team', 0, 1, 1],
      ['@web', 0, 1, 1],
    ]);
  });
  it('lists findings with no owner last, and drops none', () => {
    const groups = byOwner(smallSite(), owners('rule:images @content'));
    expect(groups.map((g) => [g.owner, g.items.length])).toEqual([['@content', 1], [null, 4]]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(5);
  });
  it('is empty for a report with no finding', () => {
    expect(byOwner(reportOf([]), owners(FILE))).toEqual([]);
  });
});

describe('unusedOwnerLines', () => {
  it('lists the lines that match no finding, and never the general line', () => {
    const o = owners('* @web\nroute:/shop* @shop\nrule:contrast/* @design\nrule:tables @data');
    expect(unusedOwnerLines(smallSite(), o).map((l) => [l.line, l.owner])).toEqual([[2, '@shop'], [4, '@data']]);
    expect(unusedOwnerLines(smallSite(), owners('* @web'))).toEqual([]);
  });
});

describe('describeByOwner', () => {
  const en = describeByOwner(smallSite(), owners(FILE), 'en');
  const fr = describeByOwner(smallSite(), owners(FILE), 'fr');
  it('writes one block per owner, failures first', () => {
    expect(en).toBe(
      '@design: 2 to fix, 1 item to check\n  FAIL contrast/low a#nav-help (/)\n  FAIL contrast/low p[3] (/)\n  UNKNOWN contrast/image h1[0] (/)\n' +
        '@help-team: 0 to fix, 1 item to check\n  UNKNOWN links/new-tab-unannounced a[2] (/help)\n' +
        '@web: 0 to fix, 1 item to check\n  UNKNOWN images/alt-generic img#logo (/)\n',
    );
    expect(fr).toContain('@design\u00A0: 2 à corriger, 1 point à contrôler\n  À CORRIGER contrast/low a#nav-help (/)');
    expect(fr).toContain('  UNKNOWN contrast/image h1[0] (/)');
  });
  it('names the group with no owner and cuts long lists', () => {
    const text = describeByOwner(smallSite(), owners(''), 'en', 2);
    expect(text).toBe('No owner: 2 to fix, 3 items to check\n  FAIL contrast/low a#nav-help (/)\n  FAIL contrast/low p[3] (/)\n  … and 3 more.\n');
    expect(describeByOwner(smallSite(), owners(''), 'fr', 2)).toContain('Sans responsable\u00A0: 2 à corriger, 3 points à contrôler');
    expect(describeByOwner(smallSite(), owners(''), 'fr', 2)).toContain('  … et 3 de plus.');
  });
  it('says so when there is nothing to share out', () => {
    expect(describeByOwner(reportOf([]), owners(FILE), 'en')).toBe('No finding to share out.\n');
    expect(describeByOwner(reportOf([]), owners(FILE), 'fr')).toBe('Aucune anomalie à répartir.\n');
  });
  it('follows French typography', () => {
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });
});
