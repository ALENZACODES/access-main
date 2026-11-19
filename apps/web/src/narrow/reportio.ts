import type { AuditReport } from './report.js';

/**
 * Reads a saved JSON report back, checking its shape before anything uses it.
 * A report file can come from an older or a newer build, or from another
 * machine, so nothing in it is trusted: every field that the outputs read is
 * checked, and the first problem is named with its place in the file. A check
 * id this build does not know is accepted, because a newer build may have
 * written it.
 */

export type ParsedReport = { readonly ok: true; readonly value: AuditReport } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === 'string';
const isBoth = (v: unknown): boolean => isRec(v) && isText(v['en']) && isText(v['fr']);

/** The place of the first problem in an entry, or null when the entry is well formed. */
function entryProblem(e: unknown): string | null {
  if (!isRec(e)) return '';
  if (!isText(e['check']) || e['check'] === '') return '.check';
  if (!isText(e['id'])) return '.id';
  if (e['status'] !== 'fail' && e['status'] !== 'unknown') return '.status';
  if (!isBoth(e['message'])) return '.message';
  if (e['rule'] !== undefined && !isText(e['rule'])) return '.rule';
  return null;
}

/** The place of the first problem in a report, or null when the report is well formed. */
export function reportProblem(raw: unknown): string | null {
  if (!isRec(raw)) return '$';
  if (!isText(raw['generatedAt']) || Number.isNaN(Date.parse(raw['generatedAt']))) return '$.generatedAt';
  const tool = raw['tool'];
  if (!isRec(tool) || !isText(tool['name']) || !isText(tool['version'])) return '$.tool';
  if (!isBoth(raw['scopeNote'])) return '$.scopeNote';
  if (!Array.isArray(raw['references'])) return '$.references';
  for (const [i, ref] of (raw['references'] as unknown[]).entries()) {
    if (!isRec(ref) || !isText(ref['id']) || !isText(ref['title']) || !isText(ref['url']) || !isText(ref['date'])) return `$.references[${i}]`;
  }
  if (!Array.isArray(raw['routes'])) return '$.routes';
  for (const [i, route] of (raw['routes'] as unknown[]).entries()) {
    const at = `$.routes[${i}]`;
    if (!isRec(route)) return at;
    if (!isText(route['route'])) return `${at}.route`;
    if (route['viewportWidth'] !== null && !isCount(route['viewportWidth'])) return `${at}.viewportWidth`;
    if (!isCount(route['unmeasured'])) return `${at}.unmeasured`;
    if (typeof route['truncated'] !== 'boolean') return `${at}.truncated`;
    if (!Array.isArray(route['checks'])) return `${at}.checks`;
    for (const [j, c] of (route['checks'] as unknown[]).entries()) {
      if (!isRec(c) || !isText(c['check']) || c['check'] === '' || !isCount(c['checked']) || !isCount(c['failed']) || !isCount(c['unknown'])) return `${at}.checks[${j}]`;
    }
    if (!Array.isArray(route['entries'])) return `${at}.entries`;
    for (const [j, e] of (route['entries'] as unknown[]).entries()) {
      const problem = entryProblem(e);
      if (problem !== null) return `${at}.entries[${j}]${problem}`;
    }
  }
  if (raw['waived'] !== undefined) {
    if (!Array.isArray(raw['waived'])) return '$.waived';
    for (const [i, w] of (raw['waived'] as unknown[]).entries()) {
      if (!isRec(w) || !isText(w['route']) || !isText(w['reason']) || !isText(w['expires']) || entryProblem(w['entry']) !== null) return `$.waived[${i}]`;
    }
  }
  if (raw['skipped'] !== undefined && (!Array.isArray(raw['skipped']) || (raw['skipped'] as unknown[]).some((s) => !isText(s)))) return '$.skipped';
  return null;
}

export function parseReport(text: string): ParsedReport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { en: 'The report file is not valid JSON.', fr: 'Le fichier de rapport n’est pas un JSON valide.' } };
  }
  const problem = reportProblem(raw);
  if (problem !== null) {
    return {
      ok: false,
      error: {
        en: `The report file is not a narrow-audit report: ${problem} is missing or has the wrong type.`,
        fr: `Le fichier de rapport n’est pas un rapport narrow-audit\u00A0: ${problem} manque ou a le mauvais type.`,
      },
    };
  }
  return { ok: true, value: raw as AuditReport };
}
