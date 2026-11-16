import { CHECK_LABELS, t, type CheckId, type CheckResult, type Entry, type Lang } from './types.js';
import { buildRouteAudit, makeReport, type AuditReport } from './report.js';

/**
 * A failure budget: how many failures and unknowns each check may have. It is
 * for teams that cannot fix everything at once. The budget only goes down:
 * writing a new one keeps the lower of the old limit and today's count, so a
 * regression cannot be written into the file. A budget is an explicit choice
 * by the team. It does not make an UNKNOWN into a pass; it only fails the run
 * when the number of unknowns grows past what was agreed.
 */

export interface Limit {
  readonly fail: number;
  readonly unknown: number;
}

export interface Budget {
  readonly version: 1;
  /** Limits per check, summed over all routes. A check that is not listed has a limit of 0. */
  readonly checks: Readonly<Partial<Record<CheckId, Limit>>>;
}

export type Counts = Readonly<Partial<Record<CheckId, Limit>>>;

/** Failures and unknowns per check, over every route of the report. */
export function countByCheck(report: AuditReport): Counts {
  const out: Partial<Record<CheckId, { fail: number; unknown: number }>> = {};
  for (const r of report.routes) {
    for (const e of r.entries) {
      const c = (out[e.check] ??= { fail: 0, unknown: 0 });
      if (e.status === 'fail') c.fail++;
      else c.unknown++;
    }
  }
  return out;
}

const KNOWN = Object.keys(CHECK_LABELS) as CheckId[];

export type ParsedBudget = { readonly ok: true; readonly value: Budget } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export function parseBudget(text: string): ParsedBudget {
  const bad = (en: string, fr: string): ParsedBudget => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('The budget file is not valid JSON.', 'Le fichier de budget n’est pas un JSON valide.');
  }
  const o = raw as { version?: unknown; checks?: unknown } | null;
  if (!o || o.version !== 1 || typeof o.checks !== 'object' || o.checks === null || Array.isArray(o.checks)) {
    return bad('The budget file needs version 1 and a "checks" object.', 'Le fichier de budget doit avoir version 1 et un objet "checks".');
  }
  const checks: Partial<Record<CheckId, Limit>> = {};
  for (const [k, v] of Object.entries(o.checks as Record<string, unknown>)) {
    if (!KNOWN.includes(k as CheckId)) return bad(`The budget names an unknown check: ${k}.`, `Le budget nomme un contrôle inconnu\u00A0: ${k}.`);
    const l = v as { fail?: unknown; unknown?: unknown } | null;
    const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
    if (!l || !whole(l.fail) || !whole(l.unknown)) return bad(`The limit for ${k} needs whole numbers for fail and unknown.`, `La limite pour ${k} doit avoir des nombres entiers pour fail et unknown.`);
    checks[k as CheckId] = { fail: l.fail, unknown: l.unknown };
  }
  return { ok: true, value: { version: 1, checks } };
}

/** Failures and unknowns over the limit, as entries of the "budget" check. */
export function auditBudget(report: AuditReport, budget: Budget): CheckResult {
  const counts = countByCheck(report);
  const entries: Entry[] = [];
  for (const check of KNOWN) {
    if (check === 'budget') continue;
    const have = counts[check] ?? { fail: 0, unknown: 0 };
    const limit = budget.checks[check] ?? { fail: 0, unknown: 0 };
    if (have.fail > limit.fail) {
      entries.push({
        check: 'budget',
        id: check,
        status: 'fail',
        rule: 'over-fail',
        message: t(
          `${CHECK_LABELS[check].en} has ${have.fail} failures. The budget allows ${limit.fail}.`,
          `${CHECK_LABELS[check].fr} compte ${have.fail} anomalies. Le budget en autorise ${limit.fail}.`,
        ),
      });
    }
    if (have.unknown > limit.unknown) {
      entries.push({
        check: 'budget',
        id: check,
        status: 'fail',
        rule: 'unknown-grew',
        message: t(
          `${CHECK_LABELS[check].en} has ${have.unknown} unknowns, more than the ${limit.unknown} agreed. Something stopped being measured, or a new case needs a decision.`,
          `${CHECK_LABELS[check].fr} compte ${have.unknown} cas inconnus, plus que les ${limit.unknown} convenus. Quelque chose n’est plus mesuré, ou un nouveau cas demande une décision.`,
        ),
      });
    }
  }
  return { checked: KNOWN.length - 1, entries };
}

/** Adds the budget result to a report as its own route. */
export function applyBudget(report: AuditReport, budget: Budget): AuditReport {
  const result = auditBudget(report, budget);
  const next = makeReport([...report.routes, buildRouteAudit('budget', null, { budget: result })], new Date(report.generatedAt));
  return { ...next, generatedAt: report.generatedAt, ...(report.waived ? { waived: report.waived } : {}) };
}

/**
 * The budget for the next run: for each check, the lower of the old limit and
 * today's count. With no old budget, today's counts. A limit is never raised.
 */
export function ratchet(report: AuditReport, old: Budget | null): Budget {
  const counts = countByCheck(report);
  const checks: Partial<Record<CheckId, Limit>> = {};
  for (const check of KNOWN) {
    if (check === 'budget') continue;
    const have = counts[check] ?? { fail: 0, unknown: 0 };
    const was = old?.checks[check];
    const next = was ? { fail: Math.min(was.fail, have.fail), unknown: Math.min(was.unknown, have.unknown) } : have;
    if (next.fail > 0 || next.unknown > 0 || was) checks[check] = next;
  }
  return { version: 1, checks };
}

export function describeBudget(report: AuditReport, budget: Budget, lang: Lang): string {
  const counts = countByCheck(report);
  const colon = lang === 'fr' ? '\u00A0:' : ':';
  const head = lang === 'fr' ? `Budget d’anomalies${colon}` : `Failure budget${colon}`;
  const lines = KNOWN.filter((c) => c !== 'budget' && (budget.checks[c] || counts[c])).map((c) => {
    const have = counts[c] ?? { fail: 0, unknown: 0 };
    const lim = budget.checks[c] ?? { fail: 0, unknown: 0 };
    return lang === 'fr'
      ? `  ${CHECK_LABELS[c].fr}${colon} ${have.fail}/${lim.fail} anomalies, ${have.unknown}/${lim.unknown} inconnus`
      : `  ${CHECK_LABELS[c].en}${colon} ${have.fail}/${lim.fail} failures, ${have.unknown}/${lim.unknown} unknown`;
  });
  return [head, ...lines].join('\n');
}
