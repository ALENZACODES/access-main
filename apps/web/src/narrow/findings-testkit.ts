import { buildRouteAudit, makeReport, type AuditReport, type RouteAudit } from './report.js';
import type { CheckId, CheckResult, Entry, EntryStatus } from './types.js';

/** Test support: findings and small reports built by hand, with no browser and no markup. */

export function finding(check: CheckId, rule: string, status: EntryStatus, id: string, en = `English text for ${rule}.`, fr = `Texte français pour ${rule}.`): Entry {
  return { check, id, status, rule, message: { en, fr } };
}

export function routeOf(route: string, results: Partial<Record<CheckId, CheckResult>>, viewportWidth: number | null = 320): RouteAudit {
  return buildRouteAudit(route, viewportWidth, results);
}

export const at = (day: number, hour = 10): Date => new Date(Date.UTC(2026, 10, day, hour, 0, 0));

/** A header problem on three routes, one failure on one route, and one clean route. */
export function siteReport(): AuditReport {
  const nav = (): Entry => finding('contrast', 'low', 'fail', 'a#nav-help');
  const logo = (): Entry => finding('images', 'alt-generic', 'unknown', 'img#logo');
  return makeReport(
    [
      routeOf('/', { contrast: { checked: 20, entries: [nav(), finding('contrast', 'low', 'fail', 'p[3]')] }, images: { checked: 4, entries: [logo()] } }),
      routeOf('/help', { contrast: { checked: 12, entries: [nav()] }, images: { checked: 2, entries: [logo()] } }),
      routeOf('/map', { contrast: { checked: 9, entries: [nav()] }, images: { checked: 1, entries: [] } }),
      routeOf('/about', { contrast: { checked: 5, entries: [] } }),
    ],
    at(19),
  );
}
