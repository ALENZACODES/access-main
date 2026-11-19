import { globMatch, ruleIdOf } from './ci.js';
import { buildRouteAudit, type AuditReport } from './report.js';
import type { CheckId, CheckResult, Entry, EntryStatus } from './types.js';

/**
 * Narrows a report to the findings a person wants to look at: one status,
 * some routes, some rules, or elements whose id holds some text. The number
 * of things each check looked at is kept as it was, so a filtered report
 * still says how much was read. A filtered report is a view for reading: it
 * must not be used to decide whether a run fails, because the findings that
 * were filtered out still exist.
 */

export interface Filter {
  readonly status?: EntryStatus;
  /** Route patterns with * as a wildcard. A route is kept when it matches one of them. */
  readonly routes?: readonly string[];
  /** Patterns over `check/rule`, such as `contrast/*`. A finding is kept when it matches one of them. */
  readonly rules?: readonly string[];
  /** Patterns over `check/rule` to leave out. They win over `rules`. */
  readonly excludeRules?: readonly string[];
  /** Text the element id must hold, compared without case. */
  readonly idIncludes?: string;
}

export function matchesFilter(route: string, e: Entry, f: Filter): boolean {
  if (f.status !== undefined && e.status !== f.status) return false;
  if (f.routes && f.routes.length > 0 && !f.routes.some((p) => globMatch(p, route))) return false;
  const rule = ruleIdOf(e);
  if (f.rules && f.rules.length > 0 && !f.rules.some((p) => globMatch(p, rule))) return false;
  if (f.excludeRules && f.excludeRules.some((p) => globMatch(p, rule))) return false;
  if (f.idIncludes !== undefined && f.idIncludes !== '' && !e.id.toLowerCase().includes(f.idIncludes.toLowerCase())) return false;
  return true;
}

export function isEmptyFilter(f: Filter): boolean {
  return f.status === undefined && !(f.routes && f.routes.length > 0) && !(f.rules && f.rules.length > 0) && !(f.excludeRules && f.excludeRules.length > 0) && !f.idIncludes;
}

/** The report with only the findings that match. Routes that do not match a route pattern are left out; other routes stay, even with no finding left. */
export function filterReport(report: AuditReport, f: Filter): AuditReport {
  if (isEmptyFilter(f)) return report;
  const routes = report.routes
    .filter((r) => !(f.routes && f.routes.length > 0) || f.routes.some((p) => globMatch(p, r.route)))
    .map((r) => {
      const results: Partial<Record<CheckId, CheckResult>> = {};
      for (const c of r.checks) results[c.check] = { checked: c.checked, entries: r.entries.filter((e) => e.check === c.check && matchesFilter(r.route, e, f)) };
      return buildRouteAudit(r.route, r.viewportWidth, results, r.unmeasured, r.truncated);
    });
  const waived = report.waived?.filter((w) => matchesFilter(w.route, w.entry, f));
  return { ...report, routes, ...(waived ? { waived } : {}) };
}

/** How many findings a filter leaves out. */
export function filteredOut(report: AuditReport, f: Filter): number {
  const all = report.routes.reduce((n, r) => n + r.entries.length, 0);
  const kept = filterReport(report, f).routes.reduce((n, r) => n + r.entries.length, 0);
  return all - kept;
}

export type ParsedFilter = { readonly ok: true; readonly value: Filter } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

/**
 * Reads a filter from text such as `status:fail route:/help* rule:contrast/* -rule:copy/* id:nav`.
 * Terms are separated by spaces. A key may be given more than once, except status and id.
 */
export function parseFilter(text: string): ParsedFilter {
  const bad = (en: string, fr: string): ParsedFilter => ({ ok: false, error: { en, fr } });
  let status: EntryStatus | undefined;
  let idIncludes: string | undefined;
  const routes: string[] = [];
  const rules: string[] = [];
  const excludeRules: string[] = [];
  for (const term of text.split(/\s+/).filter((x) => x !== '')) {
    const at = term.indexOf(':');
    const key = at === -1 ? '' : term.slice(0, at).toLowerCase();
    const value = at === -1 ? '' : term.slice(at + 1);
    if (key === '' || value === '') {
      return bad(`The filter term "${term}" is not of the form key:value. Keys: status, route, rule, -rule, id.`, `Le terme de filtre "${term}" n’a pas la forme clé:valeur. Clés possibles\u00A0: status, route, rule, -rule, id.`);
    }
    if (key === 'status') {
      const v = value.toLowerCase();
      if (v !== 'fail' && v !== 'unknown') return bad(`The status "${value}" is not fail or unknown.`, `Le statut "${value}" n’est ni fail ni unknown.`);
      if (status !== undefined && status !== v) return bad('The filter gives two different statuses. Give one, or none for both.', 'Le filtre donne deux statuts différents. Donnez-en un seul, ou aucun pour les deux.');
      status = v;
    } else if (key === 'route') routes.push(value);
    else if (key === 'rule') rules.push(value.includes('/') ? value : `${value}/*`);
    else if (key === '-rule') excludeRules.push(value.includes('/') ? value : `${value}/*`);
    else if (key === 'id') {
      if (idIncludes !== undefined) return bad('The filter gives id more than once. Give one piece of text.', 'Le filtre donne id plus d’une fois. Donnez un seul texte.');
      idIncludes = value;
    } else {
      return bad(`The filter key "${key}" is not known. Keys: status, route, rule, -rule, id.`, `La clé de filtre "${key}" n’est pas reconnue. Clés possibles\u00A0: status, route, rule, -rule, id.`);
    }
  }
  return {
    ok: true,
    value: {
      ...(status !== undefined ? { status } : {}),
      ...(routes.length > 0 ? { routes } : {}),
      ...(rules.length > 0 ? { rules } : {}),
      ...(excludeRules.length > 0 ? { excludeRules } : {}),
      ...(idIncludes !== undefined ? { idIncludes } : {}),
    },
  };
}

/** The filter written back as text that parseFilter reads. */
export function formatFilter(f: Filter): string {
  return [
    ...(f.status !== undefined ? [`status:${f.status}`] : []),
    ...(f.routes ?? []).map((r) => `route:${r}`),
    ...(f.rules ?? []).map((r) => `rule:${r}`),
    ...(f.excludeRules ?? []).map((r) => `-rule:${r}`),
    ...(f.idIncludes ? [`id:${f.idIncludes}`] : []),
  ].join(' ');
}

/** A note to print with a filtered view, so nobody takes it for the whole report. */
export function describeFiltered(report: AuditReport, f: Filter): { en: string; fr: string } {
  const out = filteredOut(report, f);
  if (isEmptyFilter(f)) return { en: 'No filter: every finding is shown.', fr: 'Aucun filtre\u00A0: toutes les anomalies sont affichées.' };
  return {
    en: `Filter ${formatFilter(f)}: ${out} ${out === 1 ? 'finding is' : 'findings are'} not shown here. They are still in the full report and still count.`,
    fr: `Filtre ${formatFilter(f)}\u00A0: ${out} ${out < 2 ? 'anomalie n’est pas affichée' : 'anomalies ne sont pas affichées'} ici. ${out < 2 ? 'Elle reste' : 'Elles restent'} dans le rapport complet et ${out < 2 ? 'compte' : 'comptent'} toujours.`,
  };
}
