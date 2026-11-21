import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { WILD } from './routes.js';
import { DEFAULT_PER_TEMPLATE, describePlan, planAsRouteList, planAudit, spread, templatesWithoutSample } from './sampling.js';

const places = (count: number): string[] => Array.from({ length: count }, (_v, i) => `/places/${i + 1}`);
const SITE = ['/', '/about', ...places(40), '/places/1/photos', '/places/2/photos'];

describe('spread', () => {
  it.each([
    [10, 3, [1, 6, 10]],
    [10, 2, [1, 10]],
    [10, 1, [1]],
    [3, 5, [1, 2, 3]],
    [5, 5, [1, 2, 3, 4, 5]],
    [4, 0, []],
    [4, -2, []],
    [0, 3, []],
  ])('%i items, %i wanted', (length, count, want) => {
    const items = Array.from({ length }, (_v, i) => i + 1);
    expect(spread(items, count)).toEqual(want);
  });

  it('never gives an item twice', () => {
    for (let length = 1; length <= 30; length++) {
      for (let count = 1; count <= length; count++) {
        const picked = spread(Array.from({ length }, (_v, i) => i), count);
        expect(new Set(picked).size, `${length}/${count}`).toBe(count);
      }
    }
  });
});

describe('planAudit', () => {
  it('takes a few routes from each template and all of a small one', () => {
    const plan = planAudit(SITE);
    const byTemplate = Object.fromEntries(plan.templates.map((x) => [x.template, x]));
    expect(byTemplate[`/places/${WILD}`]?.total).toBe(40);
    expect(byTemplate[`/places/${WILD}`]?.chosen).toHaveLength(DEFAULT_PER_TEMPLATE);
    expect(byTemplate[`/places/${WILD}/photos`]?.chosen).toEqual(['/places/1/photos', '/places/2/photos']);
    expect(byTemplate['/']?.chosen).toEqual(['/']);
    expect(plan.total).toBe(44);
    expect(plan.routes).toHaveLength(7);
    expect(plan.leftOut).toBe(37);
  });

  it('gives the same plan whatever the order of the routes', () => {
    const reversed = [...SITE].reverse();
    expect(planAudit(reversed)).toEqual(planAudit(SITE));
  });

  it('takes the first and the last of the sorted routes of a template', () => {
    const plan = planAudit(places(40), { perTemplate: 2 });
    const sorted = places(40).sort((a, b) => a.localeCompare(b));
    expect(plan.routes).toEqual([sorted[0], sorted[39]]);
  });

  it('always keeps the routes named', () => {
    const plan = planAudit(SITE, { perTemplate: 2, always: ['/places/17', '/not-on-the-site'] });
    const chosen = plan.templates.find((x) => x.template === `/places/${WILD}`)?.chosen ?? [];
    expect(chosen).toContain('/places/17');
    expect(chosen).toHaveLength(2);
    expect(plan.routes).not.toContain('/not-on-the-site');
  });

  it('keeps every named route even beyond the share of its template', () => {
    const plan = planAudit(places(40), { perTemplate: 1, always: ['/places/3', '/places/4', '/places/5'] });
    expect(plan.routes).toEqual(['/places/3', '/places/4', '/places/5']);
  });

  it('stops at the limit and names the templates left with nothing', () => {
    const plan = planAudit(SITE, { maxRoutes: 4 });
    expect(plan.routes).toHaveLength(4);
    expect(plan.templates[0]?.chosen).toHaveLength(3);
    expect(templatesWithoutSample(plan)).toHaveLength(2);
    expect(plan.leftOut).toBe(40);
  });

  it('keeps named routes first under the limit', () => {
    const plan = planAudit(SITE, { maxRoutes: 1, always: ['/about'] });
    expect(plan.routes).toEqual(['/about']);
  });

  it('takes at least one route per template', () => {
    expect(planAudit(SITE, { perTemplate: 0 }).routes).toHaveLength(4);
  });

  it('counts a repeated route once', () => {
    const plan = planAudit(['/a', '/a', '/b']);
    expect(plan.total).toBe(2);
    expect(plan.leftOut).toBe(0);
  });

  it('gives an empty plan for no routes', () => {
    expect(planAudit([])).toEqual({ templates: [], routes: [], total: 0, leftOut: 0 });
  });

  it('passes the template options on', () => {
    const help = Array.from({ length: 12 }, (_v, i) => `/help/topic-${String.fromCharCode(97 + i)}`);
    expect(planAudit(help).routes).toHaveLength(DEFAULT_PER_TEMPLATE);
    expect(planAudit(help, { literals: ['help'] }).routes).toHaveLength(12);
  });
});

describe('describePlan', () => {
  it('says how many routes are audited and how many are left out', () => {
    const text = describePlan(planAudit(SITE), 'en');
    expect(text).toContain('7 route(s) to audit out of 44, in 4 template(s).');
    expect(text).toContain(`- /places/${WILD}: 3 of 40`);
    expect(text).toContain('37 route(s) are not in the plan. The audit says nothing about those pages');
    expect(text).not.toContain('because of the limit');
  });

  it('says the same in French, with French typography', () => {
    const text = describePlan(planAudit(SITE), 'fr');
    expect(text).toContain('7 route(s) à auditer sur 44, dans 4 gabarit(s).');
    expect(text).toContain(`- /places/${WILD}\u00A0: 3 sur 40`);
    expect(text).toContain('L’audit ne dit rien de ces pages');
    for (const line of text.split('\n').filter((l) => !l.startsWith('    '))) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('names the templates with no route under a limit', () => {
    const plan = planAudit(SITE, { maxRoutes: 3 });
    expect(describePlan(plan, 'en')).toContain('Templates with no route in the plan, because of the limit: ');
    expect(describePlan(plan, 'fr')).toContain('Gabarits sans aucune route dans le plan, à cause de la limite\u00A0: ');
  });

  it('leaves the closing sentence out when every route is in the plan', () => {
    expect(describePlan(planAudit(['/', '/about']), 'en')).not.toContain('not in the plan');
  });

  it('says so when no routes were given', () => {
    expect(describePlan(planAudit([]), 'en')).toBe('Audit plan\nNo routes were given.');
    expect(describePlan(planAudit([]), 'fr')).toBe('Plan d’audit\nAucune route n’a été fournie.');
  });

  it('never words a plan as a result', () => {
    for (const lang of ['en', 'fr'] as const) {
      expect(describePlan(planAudit(SITE), lang)).not.toMatch(/pass|conform|réussi|compliant/i);
    }
  });
});

describe('planAsRouteList', () => {
  it('gives one route per line with a final line break', () => {
    expect(planAsRouteList(planAudit(['/b', '/a']))).toBe('/a\n/b\n');
  });

  it('gives empty text for an empty plan', () => {
    expect(planAsRouteList(planAudit([]))).toBe('');
  });
});
