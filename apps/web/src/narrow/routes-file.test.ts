import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { MANY_ROUTES, describeRoutesFile, parseRoutesFile, type ParsedRoutes } from './routes-file.js';
import { planAsRouteList, planAudit } from './sampling.js';

const BASE = 'https://app.example';

function ok(text: string, base = BASE): Extract<ParsedRoutes, { ok: true }> {
  const parsed = parseRoutesFile(text, base);
  if (!parsed.ok) throw new Error(parsed.error.en);
  return parsed;
}

describe('parseRoutesFile', () => {
  it('reads one route per line and skips blank lines and comments', () => {
    expect(ok('# chosen by the plan\n/\n\n/places/1\n  /about  \n').routes).toEqual(['/', '/places/1', '/about']);
  });

  it('reads Windows line endings and a byte order mark', () => {
    expect(ok('\uFEFF/a\r\n/b\r\n').routes).toEqual(['/a', '/b']);
  });

  it('accepts a full address on the host of the base URL', () => {
    expect(ok('https://app.example/places/1?tab=photos#top\n').routes).toEqual(['/places/1?tab=photos']);
  });

  it('writes each route the same way and counts repeats', () => {
    const parsed = ok('/a\n/a/\n/a//\nhttps://app.example/a\n/b\n');
    expect(parsed.routes).toEqual(['/a', '/b']);
    expect(parsed.repeats).toBe(3);
  });

  it('keeps the order of the file', () => {
    expect(ok('/z\n/a\n/m\n').routes).toEqual(['/z', '/a', '/m']);
  });

  it('reads what the plan command writes', () => {
    const list = planAsRouteList(planAudit(['/', '/about', '/places/1', '/places/2']));
    expect(ok(list).routes).toEqual(['/', '/about', '/places/1', '/places/2']);
  });

  it.each([
    ['places/1\n', 'Routes file, line 1: a route starts with "/" or is a full address. Found: places/1', 'Fichier de routes, ligne 1'],
    ['/a\n\n--route\n', 'Routes file, line 3: a route starts with "/"', 'Fichier de routes, ligne 3'],
    ['/a\nhttps://other.example/b\n', 'Routes file, line 2: this address is not on the host of --base-url', 'n’est pas sur l’hôte de --base-url'],
    ['mailto:someone@app.example\n', 'Routes file, line 1: a route starts with "/"', 'une route commence par "/"'],
    ['', 'The routes file holds no route.', 'Le fichier de routes ne contient aucune route.'],
    ['# nothing yet\n\n', 'The routes file holds no route.', 'Le fichier de routes ne contient aucune route.'],
  ])('refuses %j', (text, en, fr) => {
    const parsed = parseRoutesFile(text, BASE);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toContain(en);
    expect(parsed.error.fr).toContain(fr);
    expect(frTypographyIssues(parsed.error.fr), parsed.error.fr).toEqual([]);
  });

  it('cuts a long bad line in the message', () => {
    const parsed = parseRoutesFile(`${'x'.repeat(300)}\n`, BASE);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.en.length).toBeLessThan(160);
  });

  it.each([[''], ['app.example'], ['ftp://app.example']])('needs a base URL, and refuses %j', (base) => {
    const parsed = parseRoutesFile('/a\n', base);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.en).toContain('A routes file needs --base-url');
  });
});

describe('describeRoutesFile', () => {
  it('says nothing for a short file with no repeat', () => {
    expect(describeRoutesFile('routes.txt', ok('/a\n/b\n'), 'en')).toBe('');
  });

  it('names the repeats it dropped', () => {
    expect(describeRoutesFile('routes.txt', ok('/a\n/a\n/b\n'), 'en')).toBe('routes.txt: 2 route(s) read, 1 repeat(s) dropped.');
    const fr = describeRoutesFile('routes.txt', ok('/a\n/a\n/b\n'), 'fr');
    expect(fr).toBe('routes.txt\u00A0: 2 route(s) lue(s), 1 répétition(s) ignorée(s).');
    expect(frTypographyIssues(fr)).toEqual([]);
  });

  it('adds a note for a long list, without refusing it', () => {
    const many = ok(Array.from({ length: MANY_ROUTES + 1 }, (_v, i) => `/places/${i}`).join('\n'));
    expect(many.routes).toHaveLength(MANY_ROUTES + 1);
    expect(describeRoutesFile('routes.txt', many, 'en')).toBe(`routes.txt: ${MANY_ROUTES + 1} route(s) read, a browser audit of ${MANY_ROUTES + 1} routes takes a while, and narrow-audit plan can choose a few per template.`);
    expect(frTypographyIssues(describeRoutesFile('routes.txt', many, 'fr'))).toEqual([]);
    expect(describeRoutesFile('routes.txt', ok(Array.from({ length: MANY_ROUTES }, (_v, i) => `/p/${i}`).join('\n')), 'en')).toBe('');
  });
});
