import { buildRouteAudit, makeReport, type AuditReport, type RouteAudit } from './report.js';
import type { CheckId, CheckResult, Entry, EntryStatus } from './types.js';

/** Test support: findings, routes and reports built by hand, with no browser and no markup. */

export function found(check: CheckId, rule: string, status: EntryStatus, id: string, en = `English text for ${rule}.`, fr = `Texte français pour ${rule}.`): Entry {
  return { check, id, status, rule, message: { en, fr } };
}

export function route(path: string, results: Partial<Record<CheckId, CheckResult>>, viewportWidth: number | null = 320): RouteAudit {
  return buildRouteAudit(path, viewportWidth, results);
}

/** A date in November 2026, at 10:00 UTC unless another hour is given. */
export const nov = (day: number, hour = 10): Date => new Date(Date.UTC(2026, 10, day, hour, 0, 0));

export function reportOf(routes: readonly RouteAudit[], day = 19): AuditReport {
  return makeReport(routes, nov(day));
}

/** Two failures and two unknowns on the home page, one unknown on the help page, and a clean page. */
export function smallSite(day = 19): AuditReport {
  return reportOf(
    [
      route('/', {
        contrast: { checked: 20, entries: [found('contrast', 'low', 'fail', 'a#nav-help'), found('contrast', 'low', 'fail', 'p[3]'), found('contrast', 'image', 'unknown', 'h1[0]')] },
        images: { checked: 4, entries: [found('images', 'alt-generic', 'unknown', 'img#logo')] },
      }),
      route('/help', { links: { checked: 6, entries: [found('links', 'new-tab-unannounced', 'unknown', 'a[2]')] }, contrast: { checked: 9, entries: [] } }),
      route('/about', { contrast: { checked: 5, entries: [] } }),
    ],
    day,
  );
}
