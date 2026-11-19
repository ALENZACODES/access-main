import { ruleIdOf } from './ci.js';
import type { AuditReport } from './report.js';
import { NBSP, type Entry, type Lang } from './types.js';

/**
 * Groups the same finding seen on several routes. A problem in a shared part
 * of the site, such as the header or the navigation, shows up once per route,
 * and a long report then hides that one change would clear all of them. Two
 * findings are the same when their check, rule, element id and English
 * message match. A route audited in several profiles counts once. Grouping
 * changes how findings are shown, never how they are counted.
 */

export interface Cluster {
  readonly entry: Entry;
  /** Routes that hold the finding, in the order of the report. */
  readonly routes: readonly string[];
}

const SEP = '\u0000';
const same = (e: Entry): string => [e.check, e.rule ?? '', e.id, e.message.en].join(SEP);

export function clusterFindings(report: AuditReport): Cluster[] {
  const map = new Map<string, { entry: Entry; routes: string[] }>();
  for (const r of report.routes) {
    for (const e of r.entries) {
      const key = same(e);
      const c = map.get(key);
      if (!c) map.set(key, { entry: e, routes: [r.route] });
      else {
        if (!c.routes.includes(r.route)) c.routes.push(r.route);
        if (e.status === 'fail' && c.entry.status !== 'fail') c.entry = e;
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.routes.length - a.routes.length || Number(b.entry.status === 'fail') - Number(a.entry.status === 'fail') || ruleIdOf(a.entry).localeCompare(ruleIdOf(b.entry)) || a.entry.id.localeCompare(b.entry.id),
  );
}

/** Findings seen on at least `minRoutes` routes: the ones most likely to sit in a shared part of the site. */
export function sharedFindings(report: AuditReport, minRoutes = 2): Cluster[] {
  const min = Math.max(2, Math.floor(minRoutes));
  return clusterFindings(report).filter((c) => c.routes.length >= min);
}

export interface ClusterSummary {
  /** Findings as the report counts them, one per route. */
  readonly findings: number;
  /** Distinct findings after grouping. */
  readonly distinct: number;
  /** Distinct findings seen on two routes or more. */
  readonly shared: number;
  /** Findings (counted per route) that belong to a shared group. */
  readonly inShared: number;
}

export function summariseClusters(report: AuditReport): ClusterSummary {
  const clusters = clusterFindings(report);
  const shared = clusters.filter((c) => c.routes.length >= 2);
  return {
    findings: clusters.reduce((n, c) => n + c.routes.length, 0),
    distinct: clusters.length,
    shared: shared.length,
    inShared: shared.reduce((n, c) => n + c.routes.length, 0),
  };
}

/** Plain text: how many findings repeat across routes, then the shared ones, most widespread first, up to `max`. */
export function describeShared(report: AuditReport, lang: Lang, max = 10): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const s = summariseClusters(report);
  const shared = sharedFindings(report);
  if (shared.length === 0) {
    return fr ? 'Aucune anomalie ne se répète sur plusieurs routes.\n' : 'No finding repeats across routes.\n';
  }
  const lines: string[] = [];
  lines.push(
    fr
      ? `${s.inShared} des ${s.findings} anomalies viennent de ${s.shared} ${s.shared < 2 ? 'anomalie répétée' : 'anomalies répétées'} sur plusieurs routes. Elles se trouvent sans doute dans une partie commune du site${colon} un seul changement peut les régler partout, ce qui reste à contrôler route par route.`
      : `${s.inShared} of the ${s.findings} findings come from ${s.shared} ${s.shared === 1 ? 'finding that repeats' : 'findings that repeat'} across routes. They are most likely in a shared part of the site${colon} one change may clear them everywhere, which still has to be checked route by route.`,
  );
  const limit = Math.max(1, Math.floor(max));
  for (const c of shared.slice(0, limit)) {
    const status = c.entry.status === 'fail' ? (fr ? 'À CORRIGER' : 'FAIL') : 'UNKNOWN';
    const shown = c.routes.slice(0, 5).join(', ');
    const more = c.routes.length - 5;
    lines.push(
      fr
        ? `  ${status} ${ruleIdOf(c.entry)} ${c.entry.id}${colon} ${c.routes.length} routes (${shown}${more > 0 ? `, et ${more} de plus` : ''})`
        : `  ${status} ${ruleIdOf(c.entry)} ${c.entry.id}${colon} ${c.routes.length} routes (${shown}${more > 0 ? `, and ${more} more` : ''})`,
    );
  }
  const left = shared.length - limit;
  if (left > 0) lines.push(fr ? `  … et ${left} de plus.` : `  … and ${left} more.`);
  return lines.join('\n') + '\n';
}
