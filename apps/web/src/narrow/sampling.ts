import { groupByTemplate, type TemplateOptions } from './routes.js';
import type { LocalizedText } from './audit.js';
import { NBSP, type Lang } from './types.js';

/**
 * Chooses which routes to audit when a site has more pages than can be
 * audited. Pages are grouped by template and a few are taken from each
 * group, spread evenly over the sorted list, so the choice is the same on
 * every run and needs no random numbers.
 *
 * A sample says something about the pages in it and nothing about the rest:
 * two pages of one template can differ through their data (a long name, a
 * missing photo, a table with more columns). The plan therefore always states
 * how many routes it leaves out.
 */

export const DEFAULT_PER_TEMPLATE = 3;

export interface PlanOptions extends TemplateOptions {
  /** Routes taken from each template. */
  readonly perTemplate?: number;
  /** Routes that are always audited, whatever their template. */
  readonly always?: readonly string[];
  /** Upper limit on the routes in the plan. Templates with the most routes keep their share first. */
  readonly maxRoutes?: number;
}

export interface PlannedTemplate {
  readonly template: string;
  /** Routes that share the template. */
  readonly total: number;
  /** Routes chosen for the audit. */
  readonly chosen: readonly string[];
}

export interface AuditPlan {
  readonly templates: readonly PlannedTemplate[];
  /** Every chosen route, each once, sorted. */
  readonly routes: readonly string[];
  /** Routes given, counted once each. */
  readonly total: number;
  /** Routes given that the plan leaves out. */
  readonly leftOut: number;
}

/** `count` items spread evenly over a list, always with the first and, from two up, the last. */
export function spread<T>(items: readonly T[], count: number): T[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || items.length === 0) return [];
  if (n >= items.length) return [...items];
  if (n === 1) return [items[0] as T];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.round((i * (items.length - 1)) / (n - 1))] as T);
  return out;
}

export function planAudit(routes: readonly string[], options: PlanOptions = {}): AuditPlan {
  const per = Math.max(1, Math.floor(options.perTemplate ?? DEFAULT_PER_TEMPLATE));
  const groups = groupByTemplate(routes, options);
  const known = new Set(routes);
  const always = new Set((options.always ?? []).filter((r) => known.has(r)));
  const limit = options.maxRoutes === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(options.maxRoutes));

  let room = Math.max(0, limit - always.size);
  const templates: PlannedTemplate[] = [];
  for (const g of groups) {
    const fixed = g.routes.filter((r) => always.has(r));
    const free = g.routes.filter((r) => !always.has(r));
    const want = Math.min(Math.max(0, per - fixed.length), free.length, room);
    const picked = spread(free, want);
    room -= picked.length;
    templates.push({ template: g.template, total: g.routes.length, chosen: [...fixed, ...picked].sort((a, b) => a.localeCompare(b)) });
  }
  const chosen = templates.flatMap((x) => x.chosen).sort((a, b) => a.localeCompare(b));
  const total = templates.reduce((sum, x) => sum + x.total, 0);
  return { templates, routes: chosen, total, leftOut: total - chosen.length };
}

/** Templates of the plan from which no route was chosen, which happens only under `maxRoutes`. */
export function templatesWithoutSample(plan: AuditPlan): string[] {
  return plan.templates.filter((x) => x.chosen.length === 0).map((x) => x.template);
}

const n = (value: number, lang: Lang): string => value.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA');

const HEAD: LocalizedText = { en: 'Audit plan', fr: 'Plan d’audit' };

/** The plan as plain text: one line per template, then what the plan leaves out. */
export function describePlan(plan: AuditPlan, lang: Lang): string {
  const fr = lang === 'fr';
  const lines: string[] = [HEAD[lang]];
  if (plan.total === 0) {
    lines.push(fr ? 'Aucune route n’a été fournie.' : 'No routes were given.');
    return lines.join('\n');
  }
  lines.push(
    fr
      ? `${n(plan.routes.length, lang)} route(s) à auditer sur ${n(plan.total, lang)}, dans ${n(plan.templates.length, lang)} gabarit(s).`
      : `${n(plan.routes.length, lang)} route(s) to audit out of ${n(plan.total, lang)}, in ${n(plan.templates.length, lang)} template(s).`,
  );
  for (const x of plan.templates) {
    lines.push(fr ? `- ${x.template}${NBSP}: ${n(x.chosen.length, lang)} sur ${n(x.total, lang)}` : `- ${x.template}: ${n(x.chosen.length, lang)} of ${n(x.total, lang)}`);
    for (const r of x.chosen) lines.push(`    ${r}`);
  }
  if (plan.leftOut > 0) {
    lines.push(
      fr
        ? `${n(plan.leftOut, lang)} route(s) ne sont pas dans le plan. L’audit ne dit rien de ces pages${NBSP}: deux pages d’un même gabarit peuvent différer par leurs données.`
        : `${n(plan.leftOut, lang)} route(s) are not in the plan. The audit says nothing about those pages: two pages of one template can differ through their data.`,
    );
  }
  const none = templatesWithoutSample(plan);
  if (none.length > 0) {
    lines.push(
      fr
        ? `Gabarits sans aucune route dans le plan, à cause de la limite${NBSP}: ${none.join(', ')}`
        : `Templates with no route in the plan, because of the limit: ${none.join(', ')}`,
    );
  }
  return lines.join('\n');
}

/** The chosen routes, one per line, ready to pass to a tool that reads a list of routes. */
export function planAsRouteList(plan: AuditPlan): string {
  return plan.routes.length === 0 ? '' : `${plan.routes.join('\n')}\n`;
}
