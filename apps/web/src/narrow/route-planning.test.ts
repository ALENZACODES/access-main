import { describe, expect, it } from 'vitest';
import { discoverRoutes } from './discover.js';
import { isAllowed, parseRobots, splitByRobots } from './robots.js';
import { WILD, groupByTemplate, matchTemplate } from './routes.js';
import { describePlan, planAsRouteList, planAudit } from './sampling.js';
import { parseSitemap, routesFromSitemap } from './sitemap.js';

/** The pieces used one after the other, the way a person would plan an audit of a large site. */

const BASE = 'https://app.example/';

const ROBOTS = `User-agent: *
Disallow: /account
Sitemap: https://app.example/sitemap.xml
`;

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://app.example/</loc></url>
  <url><loc>https://app.example/fr</loc></url>
  <url><loc>https://app.example/account/settings</loc></url>
${Array.from({ length: 200 }, (_v, i) => `  <url><loc>https://app.example/places/${1000 + i}</loc></url>`).join('\n')}
${Array.from({ length: 12 }, (_v, i) => `  <url><loc>https://app.example/cities/city-${String.fromCharCode(97 + i)}</loc></url>`).join('\n')}
  <url><loc>https://tiles.example/map</loc></url>
</urlset>`;

const HOME = '<a href="/map">Map</a><a href="/places/1000">A place</a><a href="/guide.pdf">Guide</a>';

describe('planning an audit from a sitemap, a robots file and one page', () => {
  const robots = parseRobots(ROBOTS);
  const parsed = parseSitemap(SITEMAP);
  if (!parsed.ok) throw new Error(parsed.error.en);
  const fromSitemap = routesFromSitemap(parsed.value, BASE);
  const fromPages = discoverRoutes({ [BASE]: HOME });
  const all = [...new Set([...fromSitemap.routes, ...fromPages.routes])];
  const { allowed, disallowed } = splitByRobots(robots, 'audit', all);
  const plan = planAudit(allowed, { perTemplate: 2, always: ['/'] });

  it('reads 215 routes from the sitemap and skips the other host', () => {
    expect(fromSitemap.routes).toHaveLength(215);
    expect(fromSitemap.skipped).toBe(1);
  });

  it('finds a route the sitemap does not list', () => {
    expect(fromPages.routes).toContain('/map');
    expect(fromSitemap.routes).not.toContain('/map');
    expect(fromPages.files).toEqual(['/guide.pdf']);
    expect(all).toHaveLength(216);
  });

  it('sets aside the route the site asks visitors to leave alone', () => {
    expect(disallowed).toEqual(['/account/settings']);
    expect(isAllowed(robots, 'audit', '/places/1000')).toBe(true);
  });

  it('reduces 215 routes to five templates', () => {
    expect(groupByTemplate(allowed).map((g) => [g.template, g.routes.length])).toEqual([
      [`/places/${WILD}`, 200],
      [`/cities/${WILD}`, 12],
      ['/', 1],
      ['/fr', 1],
      ['/map', 1],
    ]);
  });

  it('plans seven routes and says that 208 are left out', () => {
    expect(plan.routes).toEqual(['/', '/cities/city-a', '/cities/city-l', '/fr', '/map', '/places/1000', '/places/1199']);
    expect(plan.leftOut).toBe(208);
    expect(describePlan(plan, 'en')).toContain('208 route(s) are not in the plan.');
    expect(planAsRouteList(plan).split('\n')).toHaveLength(8);
  });

  it('places a route that was not in the list under a template of the plan', () => {
    const templates = plan.templates.map((x) => x.template);
    expect(matchTemplate('/places/5000', templates)).toBe(`/places/${WILD}`);
    expect(matchTemplate('/cities/city-z', templates)).toBe(`/cities/${WILD}`);
    expect(matchTemplate('/contact', templates)).toBeNull();
  });
});
