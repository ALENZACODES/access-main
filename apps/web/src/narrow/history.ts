import { countByCheck } from './budget.js';
import type { AuditReport } from './report.js';
import { totals } from './report.js';
import { CHECK_LABELS, type CheckId, type Lang } from './types.js';

/**
 * A short history of audit runs, one summary line per run, so a team can see
 * whether failures and unknowns are going down. It keeps counts only, never
 * page content. The newest runs are kept up to a limit.
 */

export interface RunSummary {
  readonly at: string;
  readonly routes: number;
  readonly checked: number;
  readonly failed: number;
  readonly unknown: number;
  readonly checks: Readonly<Partial<Record<CheckId, { readonly failed: number; readonly unknown: number }>>>;
}

export interface History {
  readonly version: 1;
  readonly runs: readonly RunSummary[];
}

export const EMPTY_HISTORY: History = { version: 1, runs: [] };
export const DEFAULT_HISTORY_MAX = 100;

export function summarise(report: AuditReport): RunSummary {
  const tot = totals(report.routes);
  const counts = countByCheck(report);
  const checks: Partial<Record<CheckId, { failed: number; unknown: number }>> = {};
  for (const [k, v] of Object.entries(counts) as Array<[CheckId, { fail: number; unknown: number }]>) checks[k] = { failed: v.fail, unknown: v.unknown };
  return { at: report.generatedAt, routes: report.routes.length, checked: tot.checked, failed: tot.failed, unknown: tot.unknown, checks };
}

/** Adds a run. A run with the same time as the last one replaces it. Keeps the newest max runs. */
export function appendRun(history: History, report: AuditReport, max = DEFAULT_HISTORY_MAX): History {
  const run = summarise(report);
  const runs = history.runs.filter((r, i) => !(i === history.runs.length - 1 && r.at === run.at));
  runs.push(run);
  return { version: 1, runs: runs.slice(Math.max(0, runs.length - Math.max(1, max))) };
}

export type ParsedHistory = { readonly ok: true; readonly value: History } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export function parseHistory(text: string): ParsedHistory {
  const bad = (en: string, fr: string): ParsedHistory => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('The history file is not valid JSON.', 'Le fichier d’historique n’est pas un JSON valide.');
  }
  const o = raw as { version?: unknown; runs?: unknown } | null;
  if (!o || o.version !== 1 || !Array.isArray(o.runs)) return bad('The history file needs version 1 and a "runs" list.', 'Le fichier d’historique doit avoir version 1 et une liste "runs".');
  for (const r of o.runs as Array<Record<string, unknown> | null>) {
    const num = (k: string): boolean => typeof r?.[k] === 'number';
    if (!r || typeof r['at'] !== 'string' || !num('routes') || !num('checked') || !num('failed') || !num('unknown') || typeof r['checks'] !== 'object' || r['checks'] === null) {
      return bad('A run in the history file is missing a field.', 'Une exécution du fichier d’historique a un champ manquant.');
    }
  }
  return { ok: true, value: { version: 1, runs: o.runs as RunSummary[] } };
}

export interface Trend {
  readonly previous: RunSummary | null;
  readonly current: RunSummary;
  readonly failedDelta: number;
  readonly unknownDelta: number;
  /** Checks with more failures than in the previous run. */
  readonly worse: readonly CheckId[];
  /** Checks with fewer failures than in the previous run. */
  readonly better: readonly CheckId[];
}

export function trend(history: History): Trend | null {
  const current = history.runs[history.runs.length - 1];
  if (!current) return null;
  const previous = history.runs[history.runs.length - 2] ?? null;
  const ids = new Set<CheckId>([...(Object.keys(current.checks) as CheckId[]), ...(previous ? (Object.keys(previous.checks) as CheckId[]) : [])]);
  const worse: CheckId[] = [];
  const better: CheckId[] = [];
  if (previous) {
    for (const id of ids) {
      const a = previous.checks[id]?.failed ?? 0;
      const b = current.checks[id]?.failed ?? 0;
      if (b > a) worse.push(id);
      if (b < a) better.push(id);
    }
  }
  return {
    previous,
    current,
    failedDelta: previous ? current.failed - previous.failed : 0,
    unknownDelta: previous ? current.unknown - previous.unknown : 0,
    worse: worse.sort(),
    better: better.sort(),
  };
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export function describeTrend(tr: Trend | null, lang: Lang): string {
  if (!tr) return lang === 'fr' ? 'Aucun historique.' : 'No history yet.';
  const colon = lang === 'fr' ? '\u00A0:' : ':';
  const date = (iso: string): string => iso.slice(0, 10);
  const lines: string[] = [];
  if (!tr.previous) {
    lines.push(
      lang === 'fr'
        ? `Première exécution enregistrée${colon} ${tr.current.failed} anomalies, ${tr.current.unknown} inconnus.`
        : `First run recorded${colon} ${tr.current.failed} failures, ${tr.current.unknown} unknown.`,
    );
    return lines.join('\n');
  }
  lines.push(
    lang === 'fr'
      ? `Depuis le ${date(tr.previous.at)}${colon} anomalies ${tr.current.failed} (${signed(tr.failedDelta)}), inconnus ${tr.current.unknown} (${signed(tr.unknownDelta)}).`
      : `Since ${date(tr.previous.at)}${colon} failures ${tr.current.failed} (${signed(tr.failedDelta)}), unknown ${tr.current.unknown} (${signed(tr.unknownDelta)}).`,
  );
  const names = (ids: readonly CheckId[]): string => ids.map((i) => CHECK_LABELS[i][lang]).join(', ');
  if (tr.worse.length > 0) lines.push(`${lang === 'fr' ? 'Plus d’anomalies' : 'More failures'}${colon} ${names(tr.worse)}`);
  if (tr.better.length > 0) lines.push(`${lang === 'fr' ? 'Moins d’anomalies' : 'Fewer failures'}${colon} ${names(tr.better)}`);
  return lines.join('\n');
}
