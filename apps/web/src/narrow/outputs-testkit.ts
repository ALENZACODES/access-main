import { buildRouteAudit, makeReport, type AuditReport } from './report.js';
import type { CheckId, Entry, EntryStatus } from './types.js';

/** Test support for the output formats: small reports built by hand, with no browser and no markup. */

export function entry(check: CheckId, rule: string, status: EntryStatus, id: string, en = `English text for ${rule}.`, fr = `Texte français pour ${rule}.`): Entry {
  return { check, id, status, rule, message: { en, fr } };
}

/** Three routes: one with failures and unknowns, one with unknowns only, one clean. */
export function sampleReport(): AuditReport {
  const home = buildRouteAudit(
    '/',
    320,
    {
      reflow: { checked: 12, entries: [entry('reflow', 'overflow', 'fail', 'div#map')] },
      contrast: { checked: 30, entries: [entry('contrast', 'low', 'fail', 'p[2]'), entry('contrast', 'low', 'fail', 'a[4]'), entry('contrast', 'image', 'unknown', 'h1[0]')] },
      copy: { checked: 40, entries: [] },
    },
    2,
    false,
  );
  const help = buildRouteAudit('/help', 320, { contrast: { checked: 8, entries: [entry('contrast', 'image', 'unknown', 'p[0]')] }, typography: { checked: 5, entries: [entry('typography', 'justified', 'unknown', 'p[1]')] } });
  const about = buildRouteAudit('/about', 320, { reflow: { checked: 9, entries: [] }, contrast: { checked: 4, entries: [] } });
  return makeReport([home, help, about], new Date('2026-11-19T10:00:00Z'));
}

export function emptyReport(): AuditReport {
  return makeReport([], new Date('2026-11-19T10:00:00Z'));
}
