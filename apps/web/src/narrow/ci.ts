import { buildRouteAudit, makeReport, type AuditReport, type RouteAudit, type WaivedItem } from './report.js';
import { CHECK_LABELS, CHECK_SC, t, type CheckId, type Entry, type Lang } from './types.js';

/**
 * Outputs and gates for a CI job: SARIF and JUnit files, a baseline of known
 * failures, and dated waivers. Everything here is pure, so a job can call it
 * on a saved report as well as on a fresh run. A waiver or a baseline only
 * ever touches failures. UNKNOWN entries are left as they are.
 */

export interface Item {
  /** Stable key: route, check, rule and element id. Element ids move when the markup moves. */
  readonly key: string;
  readonly route: string;
  readonly entry: Entry;
}

export function keyOf(route: string, e: Entry): string {
  return `${route}|${e.check}|${e.rule ?? ''}|${e.id}`;
}

export function flatten(report: AuditReport): Item[] {
  return report.routes.flatMap((r) => r.entries.map((entry) => ({ key: keyOf(r.route, entry), route: r.route, entry })));
}

// ---------------------------------------------------------------- SARIF

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export interface SarifLog {
  readonly $schema: string;
  readonly version: '2.1.0';
  readonly runs: readonly SarifRun[];
}
interface SarifRun {
  readonly tool: { readonly driver: { readonly name: string; readonly version: string; readonly rules: readonly SarifRule[] } };
  readonly results: readonly SarifResult[];
}
interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: { readonly text: string };
  readonly properties: { readonly wcag?: string };
}
interface SarifResult {
  readonly ruleId: string;
  readonly ruleIndex: number;
  readonly level: 'error' | 'note';
  readonly message: { readonly text: string };
  readonly locations: readonly unknown[];
  readonly partialFingerprints: Readonly<Record<string, string>>;
  readonly properties: { readonly status: string; readonly route: string; readonly fr: string };
}

export function ruleIdOf(e: Entry): string {
  return `${e.check}/${e.rule ?? 'general'}`;
}

function sarifLocation(route: string, id: string): unknown {
  const line = /@L(\d+)$/.exec(id);
  const logical = [{ name: id, fullyQualifiedName: `${route} ${id}`, kind: 'element' }];
  if (route.startsWith('html:') || route.startsWith('data:')) {
    const uri = route.slice(5);
    return {
      physicalLocation: {
        artifactLocation: { uri },
        ...(line ? { region: { startLine: Number(line[1]) } } : {}),
      },
      logicalLocations: logical,
    };
  }
  return { logicalLocations: [{ name: id, fullyQualifiedName: `${route} ${id}`, kind: 'element' }] };
}

export function toSarif(report: AuditReport): SarifLog {
  const items = flatten(report);
  const ruleIds: string[] = [];
  const rules: SarifRule[] = [];
  for (const { entry } of items) {
    const id = ruleIdOf(entry);
    if (ruleIds.includes(id)) continue;
    ruleIds.push(id);
    const sc = CHECK_SC[entry.check];
    rules.push({
      id,
      name: id.replace(/[^A-Za-z0-9]+/g, ' ').replace(/(?:^| )(\w)/g, (_m, c: string) => c.toUpperCase()).replace(/ /g, ''),
      shortDescription: { text: CHECK_LABELS[entry.check].en },
      properties: sc ? { wcag: sc } : {},
    });
  }
  const results: SarifResult[] = items.map(({ key, route, entry }) => ({
    ruleId: ruleIdOf(entry),
    ruleIndex: ruleIds.indexOf(ruleIdOf(entry)),
    level: entry.status === 'fail' ? 'error' : 'note',
    message: { text: entry.message.en },
    locations: [sarifLocation(route, entry.id)],
    partialFingerprints: { 'narrowKey/v1': key },
    properties: { status: entry.status, route, fr: entry.message.fr },
  }));
  return { $schema: SARIF_SCHEMA, version: '2.1.0', runs: [{ tool: { driver: { name: report.tool.name, version: report.tool.version, rules } }, results }] };
}

export function renderSarif(report: AuditReport): string {
  return JSON.stringify(toSarif(report), null, 2) + '\n';
}

// ---------------------------------------------------------------- JUnit

function stripXmlControls(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    out += ch;
  }
  return out;
}

export function xmlEscape(s: string): string {
  return stripXmlControls(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderJunit(report: AuditReport, lang: Lang = 'en'): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const cases = report.routes.reduce((n, r) => n + r.checks.length, 0);
  const failedCases = report.routes.reduce((n, r) => n + r.checks.filter((c) => c.failed > 0).length, 0);
  const skippedCases = report.routes.reduce((n, r) => n + r.checks.filter((c) => c.failed === 0 && c.unknown > 0).length, 0);
  out.push(`<testsuites name="${xmlEscape(report.tool.name)}" tests="${cases}" failures="${failedCases}" skipped="${skippedCases}" time="0">`);
  for (const r of report.routes) {
    const f = r.checks.filter((c) => c.failed > 0).length;
    const s = r.checks.filter((c) => c.failed === 0 && c.unknown > 0).length;
    out.push(`  <testsuite name="${xmlEscape(r.route)}" tests="${r.checks.length}" failures="${f}" skipped="${s}" time="0" timestamp="${xmlEscape(report.generatedAt)}">`);
    for (const c of r.checks) {
      const mine = r.entries.filter((e) => e.check === c.check);
      const fails = mine.filter((e) => e.status === 'fail');
      const unknowns = mine.filter((e) => e.status === 'unknown');
      const name = `${CHECK_LABELS[c.check][lang]} (${c.checked})`;
      out.push(`    <testcase classname="${xmlEscape(r.route)}" name="${xmlEscape(name)}" time="0">`);
      const line = (e: Entry): string => `${e.rule ? `[${e.rule}] ` : ''}${e.id}: ${e.message[lang]}`;
      if (fails.length > 0) {
        out.push(`      <failure message="${xmlEscape(line(fails[0] as Entry))}" type="${xmlEscape(c.check)}">${xmlEscape(fails.map(line).join('\n'))}</failure>`);
        if (unknowns.length > 0) out.push(`      <system-out>${xmlEscape(unknowns.map((e) => `UNKNOWN ${line(e)}`).join('\n'))}</system-out>`);
      } else if (unknowns.length > 0) {
        out.push(`      <skipped message="${xmlEscape(`UNKNOWN: ${line(unknowns[0] as Entry)}`)}"/>`);
        out.push(`      <system-out>${xmlEscape(unknowns.map((e) => `UNKNOWN ${line(e)}`).join('\n'))}</system-out>`);
      }
      out.push('    </testcase>');
    }
    out.push('  </testsuite>');
  }
  out.push('</testsuites>');
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- baseline

export interface Baseline {
  readonly version: 1;
  readonly generatedAt: string;
  /** Keys of the failures that were known when the baseline was written. */
  readonly keys: readonly string[];
}

export function makeBaseline(report: AuditReport): Baseline {
  const keys = [...new Set(flatten(report).filter((i) => i.entry.status === 'fail').map((i) => i.key))].sort();
  return { version: 1, generatedAt: report.generatedAt, keys };
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export function parseBaseline(text: string): Parsed<Baseline> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: t('The baseline file is not valid JSON.', 'Le fichier de référence n’est pas un JSON valide.') };
  }
  const o = raw as { version?: unknown; generatedAt?: unknown; keys?: unknown } | null;
  if (!o || o.version !== 1 || typeof o.generatedAt !== 'string' || !Array.isArray(o.keys) || o.keys.some((k) => typeof k !== 'string')) {
    return { ok: false, error: t('The baseline file has the wrong shape. Expected version 1 with a list of keys.', 'Le fichier de référence n’a pas la bonne forme. Attendu\u00A0: version 1 et une liste de clés.') };
  }
  return { ok: true, value: { version: 1, generatedAt: o.generatedAt, keys: o.keys as string[] } };
}

export interface BaselineDiff {
  /** Failures that are not in the baseline. These fail the job. */
  readonly added: readonly Item[];
  /** Baseline keys that no longer fail. */
  readonly fixed: readonly string[];
  /** Failures that are in the baseline. */
  readonly known: number;
}

export function diffAgainstBaseline(report: AuditReport, baseline: Baseline): BaselineDiff {
  const known = new Set(baseline.keys);
  const failing = flatten(report).filter((i) => i.entry.status === 'fail');
  const now = new Set(failing.map((i) => i.key));
  return {
    added: failing.filter((i) => !known.has(i.key)),
    fixed: baseline.keys.filter((k) => !now.has(k)),
    known: failing.filter((i) => known.has(i.key)).length,
  };
}

export function describeDiff(d: BaselineDiff, lang: Lang): string {
  const colon = lang === 'fr' ? '\u00A0:' : ':';
  return lang === 'fr'
    ? `Comparaison avec la référence${colon} ${d.added.length} nouvelles anomalies, ${d.fixed.length} corrigées, ${d.known} déjà connues.`
    : `Compared with the baseline${colon} ${d.added.length} new failures, ${d.fixed.length} fixed, ${d.known} already known.`;
}

// ---------------------------------------------------------------- waivers

export interface Waiver {
  readonly check: CheckId;
  readonly rule?: string;
  /** Route pattern. * matches any run of characters. Default: every route. */
  readonly route?: string;
  /** Element id pattern. Default: every element. */
  readonly id?: string;
  readonly reason: string;
  /** Last day the waiver applies, as YYYY-MM-DD (UTC). */
  readonly expires: string;
  readonly owner?: string;
}

export function globMatch(pattern: string, text: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(text);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** A waiver ends at the close of its last day. */
export function isExpired(w: Pick<Waiver, 'expires'>, now: Date): boolean {
  const m = DATE.exec(w.expires);
  if (!m) return true;
  const endOfDay = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
  return now.getTime() >= endOfDay;
}

const MIN_REASON = 10;
const CHECKS = Object.keys(CHECK_LABELS) as CheckId[];

export function parseWaivers(text: string): { readonly waivers: readonly Waiver[]; readonly problems: readonly Entry[] } {
  const problems: Entry[] = [];
  const bad = (id: string, rule: string, en: string, fr: string): void => {
    problems.push({ check: 'waiver', id, status: 'fail', rule, message: t(en, fr) });
  };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    bad('file', 'invalid-json', 'The waivers file is not valid JSON.', 'Le fichier de dérogations n’est pas un JSON valide.');
    return { waivers: [], problems };
  }
  const list = (raw as { waivers?: unknown } | null)?.waivers;
  if (!Array.isArray(list)) {
    bad('file', 'shape', 'The waivers file needs a "waivers" list.', 'Le fichier de dérogations doit contenir une liste "waivers".');
    return { waivers: [], problems };
  }
  const waivers: Waiver[] = [];
  list.forEach((w: unknown, i) => {
    const id = `waiver[${i}]`;
    const o = (w ?? {}) as Record<string, unknown>;
    const str = (k: string): string | undefined => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
    const check = str('check');
    if (!check || !CHECKS.includes(check as CheckId)) return bad(id, 'check', 'The waiver names no known check.', 'La dérogation ne nomme aucun contrôle connu.');
    if (check === 'waiver') return bad(id, 'check', 'A waiver cannot waive a waiver problem.', 'Une dérogation ne peut pas lever un problème de dérogation.');
    const reason = (str('reason') ?? '').trim();
    if (reason.length < MIN_REASON) return bad(id, 'reason', `The waiver needs a reason of at least ${MIN_REASON} characters.`, `La dérogation doit avoir une raison d’au moins ${MIN_REASON} caractères.`);
    const expires = str('expires') ?? '';
    if (!validDate(expires)) return bad(id, 'expires', 'The waiver needs an expiry date as YYYY-MM-DD.', 'La dérogation doit avoir une date d’expiration au format AAAA-MM-JJ.');
    const rule = str('rule');
    const route = str('route');
    const elementId = str('id');
    const owner = str('owner');
    waivers.push({
      check: check as CheckId,
      ...(rule ? { rule } : {}),
      ...(route ? { route } : {}),
      ...(elementId ? { id: elementId } : {}),
      reason,
      expires,
      ...(owner ? { owner } : {}),
    });
  });
  return { waivers, problems };
}

export function waiverMatches(w: Waiver, route: string, e: Entry): boolean {
  if (e.check !== w.check) return false;
  if (w.rule !== undefined && (e.rule ?? '') !== w.rule) return false;
  if (w.route !== undefined && !globMatch(w.route, route)) return false;
  if (w.id !== undefined && !globMatch(w.id, e.id)) return false;
  return true;
}

export interface WaiverResult {
  /** The report without the waived failures, and with a "waivers" route when there are problems. */
  readonly report: AuditReport;
  readonly waived: readonly WaivedItem[];
}

export function applyWaivers(report: AuditReport, waivers: readonly Waiver[], now: Date, parseProblems: readonly Entry[] = []): WaiverResult {
  const waived: WaivedItem[] = [];
  const used = new Set<number>();
  const problems: Entry[] = [...parseProblems];
  waivers.forEach((w, i) => {
    if (isExpired(w, now)) {
      problems.push({
        check: 'waiver',
        id: `waiver[${i}]`,
        status: 'fail',
        rule: 'expired',
        message: t(`The waiver for ${w.check}${w.rule ? '/' + w.rule : ''} expired on ${w.expires}. Fix the cause or renew it.`, `La dérogation pour ${w.check}${w.rule ? '/' + w.rule : ''} a expiré le ${w.expires}. Corrigez la cause ou renouvelez-la.`),
      });
    }
  });
  const routes: RouteAudit[] = report.routes.map((r) => {
    const kept: Entry[] = [];
    for (const e of r.entries) {
      const idx = e.status === 'fail' ? waivers.findIndex((w) => !isExpired(w, now) && waiverMatches(w, r.route, e)) : -1;
      const w = idx >= 0 ? waivers[idx] : undefined;
      if (idx >= 0) used.add(idx);
      if (w) waived.push({ route: r.route, entry: e, reason: w.reason, expires: w.expires });
      else kept.push(e);
    }
    return rebuild(r, kept);
  });
  waivers.forEach((w, i) => {
    if (!isExpired(w, now) && !used.has(i)) {
      problems.push({
        check: 'waiver',
        id: `waiver[${i}]`,
        status: 'unknown',
        rule: 'unused',
        message: t(`The waiver for ${w.check}${w.rule ? '/' + w.rule : ''} matched nothing. It may be out of date.`, `La dérogation pour ${w.check}${w.rule ? '/' + w.rule : ''} ne correspond à rien. Elle est peut-être périmée.`),
      });
    }
  });
  const withProblems = problems.length > 0 ? [...routes, buildRouteAudit('waivers', null, { waiver: { checked: waivers.length + parseProblems.length, entries: problems } })] : routes;
  const next = makeReport(withProblems, new Date(report.generatedAt));
  return { report: { ...next, generatedAt: report.generatedAt, ...(report.skipped ? { skipped: report.skipped } : {}) }, waived };
}

/** Rebuilds a route with fewer entries, keeping how many items each check looked at. */
function rebuild(r: RouteAudit, kept: readonly Entry[]): RouteAudit {
  const checks = r.checks.map((c) => ({
    check: c.check,
    checked: c.checked,
    failed: kept.filter((e) => e.check === c.check && e.status === 'fail').length,
    unknown: kept.filter((e) => e.check === c.check && e.status === 'unknown').length,
  }));
  return { ...r, checks, entries: kept };
}

export function describeWaived(waived: readonly WaivedItem[], lang: Lang): string {
  if (waived.length === 0) return '';
  const lines = waived.map((w) => `  ${w.route} ${w.entry.check}${w.entry.rule ? '/' + w.entry.rule : ''} ${w.entry.id}${lang === 'fr' ? ' (jusqu’au ' : ' (until '}${w.expires}): ${w.reason}`);
  const head = lang === 'fr' ? `${waived.length} anomalies sous dérogation\u00A0:` : `${waived.length} failures waived:`;
  return [head, ...lines].join('\n');
}
