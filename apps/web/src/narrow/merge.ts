import { keyOf } from './ci.js';
import { buildRouteAudit, makeReport, type AuditReport, type Reference, type RouteAudit, type WaivedItem } from './report.js';
import type { CheckId, CheckResult } from './types.js';

/**
 * Joins the reports of several runs into one, for a job that audits the
 * routes in parts or runs the browser checks and the file checks apart. A
 * route and viewport that appear in more than one report are joined check by
 * check. When the same check ran on the same route in two reports, the newer
 * report wins and the clash is listed, because adding the two would count the
 * same findings twice. A check counts as skipped only when no report ran it.
 */

export interface MergeClash {
  readonly route: string;
  readonly viewportWidth: number | null;
  readonly check: CheckId;
  /** Time of the report whose result was kept. */
  readonly kept: string;
}

export interface Merged {
  readonly report: AuditReport;
  readonly clashes: readonly MergeClash[];
}

const slot = (r: RouteAudit): string => `${r.route}\u0000${r.viewportWidth ?? ''}`;

function resultsOf(r: RouteAudit): Map<CheckId, CheckResult> {
  const out = new Map<CheckId, CheckResult>();
  for (const c of r.checks) out.set(c.check, { checked: c.checked, entries: r.entries.filter((e) => e.check === c.check) });
  return out;
}

/** Joins reports. `emptyAt` dates the result when the list is empty. */
export function mergeReports(reports: readonly AuditReport[], emptyAt: Date): Merged {
  if (reports.length === 0) return { report: makeReport([], emptyAt), clashes: [] };
  // Oldest first, so a newer result replaces an older one. The sort is stable, so equal times keep the order given.
  const ordered = [...reports].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  const order: string[] = [];
  const merged = new Map<string, { route: string; viewportWidth: number | null; results: Map<CheckId, CheckResult>; from: Map<CheckId, string>; unmeasured: number; truncated: boolean }>();
  const clashes: MergeClash[] = [];

  for (const report of ordered) {
    for (const r of report.routes) {
      const key = slot(r);
      let m = merged.get(key);
      if (!m) {
        m = { route: r.route, viewportWidth: r.viewportWidth, results: new Map(), from: new Map(), unmeasured: 0, truncated: false };
        merged.set(key, m);
        order.push(key);
      }
      m.unmeasured = Math.max(m.unmeasured, r.unmeasured);
      m.truncated = m.truncated || r.truncated;
      for (const [check, result] of resultsOf(r)) {
        if (m.results.has(check)) clashes.push({ route: r.route, viewportWidth: r.viewportWidth, check, kept: report.generatedAt });
        m.results.set(check, result);
        m.from.set(check, report.generatedAt);
      }
    }
  }

  const routes: RouteAudit[] = order.map((key) => {
    const m = merged.get(key);
    if (!m) throw new Error('merge slot missing');
    return buildRouteAudit(m.route, m.viewportWidth, Object.fromEntries(m.results) as Partial<Record<CheckId, CheckResult>>, m.unmeasured, m.truncated);
  });

  const ran = new Set<CheckId>(routes.flatMap((r) => r.checks.map((c) => c.check)));
  const skippedEverywhere = ordered
    .map((r) => new Set(r.skipped ?? []))
    .reduce<Set<CheckId> | null>((acc, s) => (acc === null ? s : new Set([...acc].filter((c) => s.has(c)))), null);
  const skipped = [...(skippedEverywhere ?? [])].filter((c) => !ran.has(c));

  const waived = new Map<string, WaivedItem>();
  for (const report of ordered) for (const w of report.waived ?? []) waived.set(keyOf(w.route, w.entry), w);

  const references = new Map<string, Reference>();
  for (const report of ordered) for (const ref of report.references) references.set(ref.id, ref);

  const newest = ordered[ordered.length - 1] as AuditReport;
  const report: AuditReport = {
    generatedAt: newest.generatedAt,
    tool: newest.tool,
    routes,
    scopeNote: newest.scopeNote,
    references: [...references.values()],
    ...(waived.size > 0 ? { waived: [...waived.values()] } : {}),
    ...(skipped.length > 0 ? { skipped } : {}),
  };
  return { report, clashes };
}

/** One line per clash, in both languages, for the job log. */
export function describeClashes(clashes: readonly MergeClash[]): { en: string; fr: string }[] {
  return clashes.map((c) => {
    const where = c.viewportWidth === null ? c.route : `${c.route} (${c.viewportWidth}px)`;
    return {
      en: `The check ${c.check} ran on ${where} in more than one report. The result of ${c.kept} was kept and the older one dropped, so findings are not counted twice.`,
      fr: `Le contrôle ${c.check} a été exécuté sur ${where} dans plus d’un rapport. Le résultat du ${c.kept} a été gardé et le plus ancien écarté, pour ne pas compter deux fois les anomalies.`,
    };
  });
}
