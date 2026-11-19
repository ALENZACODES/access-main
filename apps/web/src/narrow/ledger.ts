import { keyOf, ruleIdOf } from './ci.js';
import type { AuditReport } from './report.js';
import { NBSP, type EntryStatus, type Lang } from './types.js';

/**
 * A ledger of when each finding was first seen, kept in a JSON file between
 * runs, so a report can say how long a failure has been open. A finding stays
 * in the ledger while it is reported. It leaves only when its check ran on its
 * route and did not report it; when the check or the route was not part of a
 * run, nothing is known, so the entry is kept as it was. An age is the time
 * since the tool first saw the finding, which can be later than the day the
 * problem was introduced.
 */

export interface LedgerEntry {
  /** Route, check, rule and element id, as in the baseline file. */
  readonly key: string;
  readonly route: string;
  readonly rule: string;
  readonly id: string;
  readonly status: EntryStatus;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** When the finding became a failure, if it was first seen as UNKNOWN. */
  readonly failSince?: string;
}

export interface Ledger {
  readonly version: 1;
  readonly entries: readonly LedgerEntry[];
}

export const EMPTY_LEDGER: Ledger = { version: 1, entries: [] };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ledger after a run: new findings are added with the time of the report, known ones keep their first date. */
export function updateLedger(ledger: Ledger, report: AuditReport): Ledger {
  const at = report.generatedAt;
  const ran = new Set<string>();
  const seen = new Map<string, { route: string; rule: string; id: string; status: EntryStatus }>();
  for (const r of report.routes) {
    for (const c of r.checks) ran.add(`${r.route}|${c.check}`);
    for (const e of r.entries) {
      ran.add(`${r.route}|${e.check}`);
      const key = keyOf(r.route, e);
      const prior = seen.get(key);
      if (!prior || (prior.status !== 'fail' && e.status === 'fail')) seen.set(key, { route: r.route, rule: ruleIdOf(e), id: e.id, status: e.status });
    }
  }
  const out: LedgerEntry[] = [];
  const kept = new Set<string>();
  for (const old of ledger.entries) {
    const now = seen.get(old.key);
    if (now) {
      kept.add(old.key);
      const becameFail = old.status !== 'fail' && now.status === 'fail';
      const stillFail = old.status === 'fail' && now.status === 'fail';
      out.push({
        key: old.key,
        route: old.route,
        rule: old.rule,
        id: old.id,
        status: now.status,
        firstSeen: old.firstSeen,
        lastSeen: at,
        ...(becameFail ? { failSince: at } : stillFail && old.failSince !== undefined ? { failSince: old.failSince } : {}),
      });
      continue;
    }
    const check = old.rule.split('/')[0] ?? '';
    // Not reported this time. Drop it only when its check looked at its route.
    if (!ran.has(`${old.route}|${check}`)) out.push(old);
  }
  for (const [key, f] of seen) {
    if (kept.has(key)) continue;
    out.push({ key, route: f.route, rule: f.rule, id: f.id, status: f.status, firstSeen: at, lastSeen: at });
  }
  return { version: 1, entries: out.sort((a, b) => a.key.localeCompare(b.key)) };
}

export type ParsedLedger = { readonly ok: true; readonly value: Ledger } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export function parseLedger(text: string): ParsedLedger {
  const bad = (en: string, fr: string): ParsedLedger => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('The ledger file is not valid JSON.', 'Le fichier de registre n’est pas un JSON valide.');
  }
  const o = raw as { version?: unknown; entries?: unknown } | null;
  if (!o || typeof o !== 'object' || o.version !== 1 || !Array.isArray(o.entries)) {
    return bad('The ledger file needs version 1 and an "entries" list.', 'Le fichier de registre doit avoir version 1 et une liste "entries".');
  }
  const isDate = (v: unknown): boolean => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  for (const [i, e] of (o.entries as Array<Record<string, unknown> | null>).entries()) {
    const text = (k: string): boolean => typeof e?.[k] === 'string';
    const ok =
      e !== null && typeof e === 'object' && text('key') && text('route') && text('rule') && text('id') && (e['status'] === 'fail' || e['status'] === 'unknown') &&
      isDate(e['firstSeen']) && isDate(e['lastSeen']) && (e['failSince'] === undefined || isDate(e['failSince']));
    if (!ok) return bad(`Entry ${i + 1} of the ledger file is missing a field or has a wrong value.`, `L’entrée ${i + 1} du fichier de registre a un champ manquant ou une valeur erronée.`);
    if (Date.parse(e['firstSeen'] as string) > Date.parse(e['lastSeen'] as string)) {
      return bad(`Entry ${i + 1} of the ledger file was last seen before it was first seen.`, `L’entrée ${i + 1} du fichier de registre a été vue pour la dernière fois avant sa première observation.`);
    }
  }
  return { ok: true, value: { version: 1, entries: o.entries as LedgerEntry[] } };
}

/** The date a failure has been open since: when it became a failure, or when it was first seen as one. Null for an UNKNOWN. */
export function openSince(e: LedgerEntry): string | null {
  return e.status === 'fail' ? (e.failSince ?? e.firstSeen) : null;
}

/** Whole days from a date to now. Never negative. */
export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
}

export interface AgedFailure {
  readonly entry: LedgerEntry;
  readonly days: number;
}

/** Failures in the ledger, oldest first. */
export function oldestFailures(ledger: Ledger, now: Date): AgedFailure[] {
  return ledger.entries
    .flatMap((entry) => {
      const since = openSince(entry);
      return since === null ? [] : [{ entry, days: daysSince(since, now) }];
    })
    .sort((a, b) => b.days - a.days || a.entry.key.localeCompare(b.entry.key));
}

export interface AgeBucket {
  /** Lower bound in days, inclusive. */
  readonly from: number;
  /** Upper bound in days, exclusive, or null for the last bucket. */
  readonly to: number | null;
  readonly count: number;
}

/** Counts failures by age. `limits` are the day counts where a new bucket starts: [7, 30, 90] gives under 7, 7 to 29, 30 to 89, 90 and over. */
export function ageBuckets(ledger: Ledger, now: Date, limits: readonly number[] = [7, 30, 90]): AgeBucket[] {
  const edges = [0, ...[...new Set(limits.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.floor(n)))].sort((a, b) => a - b)];
  const ages = oldestFailures(ledger, now).map((f) => f.days);
  return edges.map((from, i) => {
    const to = edges[i + 1] ?? null;
    return { from, to, count: ages.filter((d) => d >= from && (to === null || d < to)).length };
  });
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pluriel = (n: number, one: string, many: string): string => `${n} ${n < 2 ? one : many}`;

/** Plain text: how many failures are open, by age, then the oldest ones, up to `max`. */
export function describeAges(ledger: Ledger, now: Date, lang: Lang, max = 5): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const failures = oldestFailures(ledger, now);
  if (failures.length === 0) {
    return fr ? 'Le registre ne contient aucune anomalie à corriger. Il ne connaît que ce que les contrôles ont signalé.\n' : 'The ledger holds no failure. It only knows what the checks reported.\n';
  }
  const lines: string[] = [];
  lines.push(
    fr
      ? `${pluriel(failures.length, 'anomalie à corriger est ouverte', 'anomalies à corriger sont ouvertes')}. L’âge compte depuis la première observation par l’outil, pas depuis l’apparition du problème.`
      : `${plural(failures.length, 'failure is open', 'failures are open')}. Age counts from when the tool first saw the finding, not from when the problem appeared.`,
  );
  for (const b of ageBuckets(ledger, now)) {
    if (b.count === 0) continue;
    const range = b.to === null ? (fr ? `${b.from} jours et plus` : `${b.from} days and over`) : fr ? `de ${b.from} à ${b.to - 1} jours` : `${b.from} to ${b.to - 1} days`;
    lines.push(`  ${range}${colon} ${b.count}`);
  }
  lines.push(fr ? `Les plus anciennes${colon}` : `Oldest${colon}`);
  const limit = Math.max(1, Math.floor(max));
  for (const f of failures.slice(0, limit)) {
    lines.push(
      fr
        ? `  ${pluriel(f.days, 'jour', 'jours')}${colon} ${f.entry.rule} ${f.entry.id} sur ${f.entry.route}`
        : `  ${plural(f.days, 'day', 'days')}${colon} ${f.entry.rule} ${f.entry.id} on ${f.entry.route}`,
    );
  }
  const left = failures.length - limit;
  if (left > 0) lines.push(fr ? `  … et ${left} de plus.` : `  … and ${left} more.`);
  return lines.join('\n') + '\n';
}
