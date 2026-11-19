import { ruleIdOf } from './ci.js';
import { byLevel, type LevelTotals } from './criteria.js';
import { totals, type AuditReport, type Totals } from './report.js';
import { NBSP, type Lang } from './types.js';

/**
 * A short digest of a report: which rules produced the most findings, which
 * routes carry the most, and how the findings split by conformance level. It
 * is for the top of a job log or a chat message, where the full report is too
 * long. It counts what the checks reported and says nothing about what they
 * did not look at: zero findings is never worded as a pass.
 */

export interface RuleCount {
  /** `check/rule`, as in the SARIF output. */
  readonly rule: string;
  readonly failed: number;
  readonly unknown: number;
  /** Number of routes with at least one finding of the rule. */
  readonly routes: number;
}

export interface RouteCount {
  readonly route: string;
  readonly failed: number;
  readonly unknown: number;
}

export interface Digest {
  readonly totals: Totals;
  readonly routes: number;
  /** Check ids that ran on at least one route. */
  readonly checksRun: number;
  readonly rules: readonly RuleCount[];
  readonly worstRoutes: readonly RouteCount[];
  readonly levels: readonly LevelTotals[];
  readonly waived: number;
  readonly skipped: number;
}

/** Rules ordered by failures, then by unknowns, then by name, so the order is stable from run to run. */
export function countRules(report: AuditReport): RuleCount[] {
  const map = new Map<string, { failed: number; unknown: number; routes: Set<string> }>();
  for (const route of report.routes) {
    for (const e of route.entries) {
      const id = ruleIdOf(e);
      const row = map.get(id) ?? { failed: 0, unknown: 0, routes: new Set<string>() };
      if (e.status === 'fail') row.failed++;
      else row.unknown++;
      row.routes.add(route.route);
      map.set(id, row);
    }
  }
  return [...map.entries()]
    .map(([rule, r]) => ({ rule, failed: r.failed, unknown: r.unknown, routes: r.routes.size }))
    .sort((a, b) => b.failed - a.failed || b.unknown - a.unknown || a.rule.localeCompare(b.rule));
}

/** Routes that have findings, ordered by failures, then unknowns, then name. A route audited in several profiles is counted once. */
export function countRoutes(report: AuditReport): RouteCount[] {
  const map = new Map<string, { failed: number; unknown: number }>();
  for (const route of report.routes) {
    const row = map.get(route.route) ?? { failed: 0, unknown: 0 };
    for (const e of route.entries) {
      if (e.status === 'fail') row.failed++;
      else row.unknown++;
    }
    map.set(route.route, row);
  }
  return [...map.entries()]
    .map(([route, r]) => ({ route, failed: r.failed, unknown: r.unknown }))
    .filter((r) => r.failed + r.unknown > 0)
    .sort((a, b) => b.failed - a.failed || b.unknown - a.unknown || a.route.localeCompare(b.route));
}

export function makeDigest(report: AuditReport, top = 5): Digest {
  const limit = Math.max(0, Math.floor(top));
  return {
    totals: totals(report.routes),
    routes: new Set(report.routes.map((r) => r.route)).size,
    checksRun: new Set(report.routes.flatMap((r) => r.checks.map((c) => c.check))).size,
    rules: countRules(report).slice(0, limit),
    worstRoutes: countRoutes(report).slice(0, limit),
    levels: byLevel(report),
    waived: report.waived?.length ?? 0,
    skipped: report.skipped?.length ?? 0,
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** French uses the singular for 0 and 1. */
const pluriel = (n: number, one: string, many: string): string => `${n} ${n < 2 ? one : many}`;

/** The digest as plain text in one language, a few lines long. */
export function describeDigest(d: Digest, lang: Lang): string {
  const lines: string[] = [];
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  lines.push(
    fr
      ? `Audit écran étroit${colon} ${pluriel(d.totals.failed, 'anomalie à corriger', 'anomalies à corriger')}, ${pluriel(d.totals.unknown, 'point à contrôler à la main', 'points à contrôler à la main')}, sur ${pluriel(d.routes, 'route', 'routes')} et ${pluriel(d.checksRun, 'contrôle', 'contrôles')}.`
      : `Narrow-screen audit${colon} ${plural(d.totals.failed, 'failure to fix', 'failures to fix')}, ${plural(d.totals.unknown, 'item to check by hand', 'items to check by hand')}, across ${plural(d.routes, 'route', 'routes')} and ${plural(d.checksRun, 'check', 'checks')}.`,
  );
  if (d.totals.failed + d.totals.unknown === 0) {
    lines.push(
      fr
        ? 'Les contrôles exécutés n’ont rien signalé. Ce n’est pas une déclaration de conformité.'
        : 'The checks that ran reported nothing. This is not a conformance statement.',
    );
  }
  const levels = d.levels.filter((l) => l.failed + l.unknown > 0);
  if (levels.length > 0) {
    const part = (l: LevelTotals): string => {
      const name = l.level === 'none' ? (fr ? 'hors WCAG' : 'outside WCAG') : fr ? `niveau ${l.level}` : `level ${l.level}`;
      return fr ? `${name}${colon} ${l.failed} à corriger, ${l.unknown} à contrôler` : `${name}${colon} ${l.failed} to fix, ${l.unknown} to check`;
    };
    lines.push((fr ? 'Par niveau – ' : 'By level – ') + levels.map(part).join(fr ? '\u202F; ' : '; ') + '.');
  }
  if (d.rules.length > 0) {
    lines.push(fr ? `Règles les plus fréquentes${colon}` : `Most frequent rules${colon}`);
    for (const r of d.rules) {
      lines.push(
        fr
          ? `  ${r.rule}${colon} ${r.failed} à corriger, ${r.unknown} à contrôler, sur ${pluriel(r.routes, 'route', 'routes')}`
          : `  ${r.rule}${colon} ${r.failed} to fix, ${r.unknown} to check, on ${plural(r.routes, 'route', 'routes')}`,
      );
    }
  }
  if (d.worstRoutes.length > 0) {
    lines.push(fr ? `Routes les plus touchées${colon}` : `Routes with the most findings${colon}`);
    for (const r of d.worstRoutes) {
      lines.push(fr ? `  ${r.route}${colon} ${r.failed} à corriger, ${r.unknown} à contrôler` : `  ${r.route}${colon} ${r.failed} to fix, ${r.unknown} to check`);
    }
  }
  if (d.totals.unmeasured > 0) {
    lines.push(
      fr
        ? `${pluriel(d.totals.unmeasured, 'élément non mesuré (masqué ou sans taille)', 'éléments non mesurés (masqués ou sans taille)')}.`
        : `${plural(d.totals.unmeasured, 'element was not measured (hidden or no size)', 'elements were not measured (hidden or no size)')}.`,
    );
  }
  if (d.waived > 0) {
    lines.push(
      fr
        ? `${pluriel(d.waived, 'anomalie couverte par une dérogation datée, non comptée ci-dessus', 'anomalies couvertes par une dérogation datée, non comptées ci-dessus')}.`
        : `${plural(d.waived, 'failure is covered by a dated waiver and is not counted above', 'failures are covered by a dated waiver and are not counted above')}.`,
    );
  }
  if (d.skipped > 0) {
    lines.push(
      fr
        ? `${pluriel(d.skipped, 'contrôle n’a pas été exécuté', 'contrôles n’ont pas été exécutés')}${colon} rien n’est dit à leur sujet.`
        : `${plural(d.skipped, 'check was not run', 'checks were not run')}${colon} nothing is said about them.`,
    );
  }
  return lines.join('\n') + '\n';
}
