import { buildRouteAudit, type AuditReport, type RouteAudit } from './report.js';
import { CHECK_LABELS, CHECK_ORDER, type CheckId, type CheckResult, type Lang } from './types.js';
import type { LocalizedText } from './audit.js';

/**
 * Running only some checks. A switched-off check is never a pass: the report
 * lists it as not run, so a clean result cannot be read as clean for it too.
 */

/** Checks about the run itself. They are applied after selection and cannot be switched off. */
export const FIXED_CHECKS: readonly CheckId[] = ['waiver', 'budget'];

export interface Selection {
  readonly only: readonly CheckId[];
  readonly skip: readonly CheckId[];
}

export type ParsedIds = { readonly ok: true; readonly ids: readonly CheckId[] } | { readonly ok: false; readonly error: LocalizedText };

/** Reads a comma separated list of check ids. */
export function parseCheckIds(value: string): ParsedIds {
  const ids: CheckId[] = [];
  for (const raw of value.split(',')) {
    const name = raw.trim();
    if (name === '') continue;
    const known = CHECK_ORDER.find((c) => c === name);
    if (!known) {
      return {
        ok: false,
        error: {
          en: `Unknown check “${name}”. Known checks: ${CHECK_ORDER.filter((c) => !FIXED_CHECKS.includes(c)).join(', ')}.`,
          fr: `Contrôle inconnu «\u202F${name}\u202F». Contrôles connus\u00A0: ${CHECK_ORDER.filter((c) => !FIXED_CHECKS.includes(c)).join(', ')}.`,
        },
      };
    }
    if (FIXED_CHECKS.includes(known)) {
      return {
        ok: false,
        error: {
          en: `The ${known} check cannot be switched off or selected. It is not run by the browser.`,
          fr: `Le contrôle ${known} ne peut pas être désactivé ni sélectionné. Il n’est pas exécuté par le navigateur.`,
        },
      };
    }
    if (!ids.includes(known)) ids.push(known);
  }
  if (ids.length === 0) {
    return { ok: false, error: { en: 'Give at least one check name.', fr: 'Indiquez au moins un nom de contrôle.' } };
  }
  return { ok: true, ids };
}

/** The checks that will not run, in report order. */
export function skippedChecks(sel: Selection): CheckId[] {
  const out: CheckId[] = [];
  for (const c of CHECK_ORDER) {
    if (FIXED_CHECKS.includes(c)) continue;
    const offByOnly = sel.only.length > 0 && !sel.only.includes(c);
    if (offByOnly || sel.skip.includes(c)) out.push(c);
  }
  return out;
}

/** Removes the results of switched-off checks and lists them in the report. */
export function selectChecks(report: AuditReport, sel: Selection): AuditReport {
  const skipped = skippedChecks(sel);
  if (skipped.length === 0) return report;
  const routes: RouteAudit[] = report.routes.map((r) => {
    const kept: Partial<Record<CheckId, CheckResult>> = {};
    for (const c of r.checks) {
      if (skipped.includes(c.check)) continue;
      kept[c.check] = { checked: c.checked, entries: r.entries.filter((e) => e.check === c.check) };
    }
    return buildRouteAudit(r.route, r.viewportWidth, kept, r.unmeasured, r.truncated);
  });
  return { ...report, routes, skipped };
}

export function describeSkipped(skipped: readonly CheckId[], lang: Lang): string {
  if (skipped.length === 0) return '';
  const names = skipped.map((c) => CHECK_LABELS[c][lang]).join(', ');
  return lang === 'fr'
    ? `Contrôles non exécutés dans cette exécution\u00A0: ${names}. Aucun résultat pour eux ne doit être lu comme sans anomalie.`
    : `Checks not run in this run: ${names}. No result for them should be read as clean.`;
}
