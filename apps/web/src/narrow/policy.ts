import { globMatch, keyOf, ruleIdOf } from './ci.js';
import { criterionOf, type Level } from './criteria.js';
import { daysSince, openSince, type Ledger } from './ledger.js';
import type { AuditReport } from './report.js';
import { CHECK_SC, NBSP, type Entry, type EntryStatus, type Lang } from './types.js';

/**
 * A policy is a short list of limits a team agrees on, kept in a JSON file:
 *
 *   { "version": 1, "rules": [
 *     { "id": "no-level-a", "when": { "status": "fail", "level": ["A"] }, "max": 0 },
 *     { "id": "nothing-older-than-a-month", "when": { "status": "fail", "olderThanDays": 30 }, "max": 0 },
 *     { "id": "backlog", "when": { "status": "unknown" }, "max": 40 } ] }
 *
 * Each rule counts the findings that match its `when` and compares the count
 * with `max`. A rule that needs the ledger (`olderThanDays`) and gets none is
 * not evaluated, and a policy with a rule that was not evaluated is not met:
 * a limit nobody could measure is never reported as kept.
 *
 * Meeting a policy means the counts are within the limits the team chose. It
 * says nothing about conformance.
 */

type Text = { readonly en: string; readonly fr: string };

export type PolicyLevel = Level | 'none';

export interface PolicyWhen {
  readonly status?: EntryStatus;
  /** Levels of the criterion the check relates to. `none` is a check outside WCAG. */
  readonly level?: readonly PolicyLevel[];
  /** Glob on `check/rule`, such as `contrast/*`. */
  readonly rule?: string;
  /** Glob on the route. */
  readonly route?: string;
  /** Only failures open for more than this many days, by the ledger. */
  readonly olderThanDays?: number;
}

export interface PolicyRule {
  readonly id: string;
  readonly when: PolicyWhen;
  readonly max: number;
  /** Why the team set the limit. Printed with the result. */
  readonly note?: string;
}

export interface Policy {
  readonly version: 1;
  readonly rules: readonly PolicyRule[];
}

export type ParsedPolicy = { readonly ok: true; readonly value: Policy } | { readonly ok: false; readonly error: Text };

const LEVELS: readonly PolicyLevel[] = ['A', 'AA', 'AAA', 'none'];
const WHEN_KEYS: readonly string[] = ['status', 'level', 'rule', 'route', 'olderThanDays'];
const RULE_KEYS: readonly string[] = ['id', 'when', 'max', 'note'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function parsePolicy(text: string): ParsedPolicy {
  const bad = (en: string, fr: string): ParsedPolicy => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return bad('The policy file is not valid JSON.', 'Le fichier de politique n’est pas du JSON valide.');
  }
  if (!isObject(raw) || raw['version'] !== 1 || !Array.isArray(raw['rules'])) {
    return bad('The policy file needs "version": 1 and a "rules" list.', 'Le fichier de politique demande "version": 1 et une liste "rules".');
  }
  if (raw['rules'].length === 0) return bad('The policy has no rule.', 'La politique ne contient aucune règle.');
  const rules: PolicyRule[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw['rules'].length; i++) {
    const r: unknown = raw['rules'][i];
    const where = { en: `Policy rule ${i + 1}`, fr: `Règle de politique ${i + 1}` };
    const wrong = (en: string, fr: string): ParsedPolicy => bad(`${where.en}: ${en}`, `${where.fr}${NBSP}: ${fr}`);
    if (!isObject(r)) return wrong('it must be an object.', 'elle doit être un objet.');
    const extra = Object.keys(r).find((k) => !RULE_KEYS.includes(k));
    if (extra !== undefined) return wrong(`the key "${extra}" is not known. Keys: ${RULE_KEYS.join(', ')}.`, `la clé "${extra}" n’est pas reconnue. Clés possibles${NBSP}: ${RULE_KEYS.join(', ')}.`);
    const id = r['id'];
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      return wrong('"id" must be lower-case letters, digits and dashes.', '"id" doit être fait de minuscules, de chiffres et de tirets.');
    }
    if (ids.has(id)) return wrong(`the id "${id}" is used twice.`, `l’identifiant "${id}" est utilisé deux fois.`);
    ids.add(id);
    if (!isCount(r['max'])) return wrong('"max" must be a whole number, 0 or more.', '"max" doit être un nombre entier, 0 ou plus.');
    if (r['note'] !== undefined && typeof r['note'] !== 'string') return wrong('"note" must be text.', '"note" doit être du texte.');
    const w = r['when'];
    if (!isObject(w)) return wrong('"when" must be an object. Use {} to count every finding.', '"when" doit être un objet. Utilisez {} pour compter toutes les anomalies.');
    const extraWhen = Object.keys(w).find((k) => !WHEN_KEYS.includes(k));
    if (extraWhen !== undefined) {
      return wrong(`the "when" key "${extraWhen}" is not known. Keys: ${WHEN_KEYS.join(', ')}.`, `la clé "${extraWhen}" de "when" n’est pas reconnue. Clés possibles${NBSP}: ${WHEN_KEYS.join(', ')}.`);
    }
    if (w['status'] !== undefined && w['status'] !== 'fail' && w['status'] !== 'unknown') return wrong('"status" must be "fail" or "unknown".', '"status" doit valoir "fail" ou "unknown".');
    if (w['level'] !== undefined && !(Array.isArray(w['level']) && w['level'].length > 0 && w['level'].every((l) => LEVELS.includes(l as PolicyLevel)))) {
      return wrong(`"level" must be a list from: ${LEVELS.join(', ')}.`, `"level" doit être une liste parmi${NBSP}: ${LEVELS.join(', ')}.`);
    }
    for (const key of ['rule', 'route'] as const) {
      if (w[key] !== undefined && (typeof w[key] !== 'string' || w[key] === '')) return wrong(`"${key}" must be a pattern such as "contrast/*".`, `"${key}" doit être un motif tel que "contrast/*".`);
    }
    if (w['olderThanDays'] !== undefined) {
      if (!isCount(w['olderThanDays'])) return wrong('"olderThanDays" must be a whole number, 0 or more.', '"olderThanDays" doit être un nombre entier, 0 ou plus.');
      if (w['status'] === 'unknown') return wrong('"olderThanDays" counts failures, so it cannot go with "status": "unknown".', '"olderThanDays" compte des anomalies à corriger et ne va donc pas avec "status": "unknown".');
    }
    rules.push({
      id,
      max: r['max'],
      ...(typeof r['note'] === 'string' && r['note'].trim() !== '' ? { note: r['note'].trim() } : {}),
      when: {
        ...(w['status'] !== undefined ? { status: w['status'] as EntryStatus } : {}),
        ...(w['level'] !== undefined ? { level: [...new Set(w['level'] as PolicyLevel[])] } : {}),
        ...(typeof w['rule'] === 'string' ? { rule: w['rule'] } : {}),
        ...(typeof w['route'] === 'string' ? { route: w['route'] } : {}),
        ...(w['olderThanDays'] !== undefined ? { olderThanDays: w['olderThanDays'] as number } : {}),
      },
    });
  }
  return { ok: true, value: { version: 1, rules } };
}

/** The level of the criterion a finding's check relates to, or `none`. */
export function levelOfEntry(e: Pick<Entry, 'check'>): PolicyLevel {
  const sc = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[e.check];
  return (typeof sc === 'string' ? criterionOf(sc)?.level : undefined) ?? 'none';
}

export interface PolicyMatch {
  readonly route: string;
  readonly entry: Entry;
}

export interface RuleResult {
  readonly rule: PolicyRule;
  /** `not-evaluated` when the rule needs a ledger and none was given. */
  readonly state: 'met' | 'over' | 'not-evaluated';
  readonly count: number;
  /** The first findings that match, for the message. */
  readonly examples: readonly PolicyMatch[];
}

export interface PolicyInputs {
  readonly now: Date;
  readonly ledger?: Ledger;
}

export const MAX_EXAMPLES = 3;

export function evaluatePolicy(report: AuditReport, policy: Policy, inputs: PolicyInputs): RuleResult[] {
  const since = new Map<string, string>();
  for (const e of inputs.ledger?.entries ?? []) {
    const open = openSince(e);
    if (open !== null) since.set(e.key, open);
  }
  return policy.rules.map((rule): RuleResult => {
    const w = rule.when;
    if (w.olderThanDays !== undefined && !inputs.ledger) return { rule, state: 'not-evaluated', count: 0, examples: [] };
    const matches: PolicyMatch[] = [];
    for (const r of report.routes) {
      if (w.route !== undefined && !globMatch(w.route, r.route)) continue;
      for (const entry of r.entries) {
        if (w.status !== undefined && entry.status !== w.status) continue;
        if (w.level !== undefined && !w.level.includes(levelOfEntry(entry))) continue;
        if (w.rule !== undefined && !globMatch(w.rule, ruleIdOf(entry))) continue;
        if (w.olderThanDays !== undefined) {
          if (entry.status !== 'fail') continue;
          const open = since.get(keyOf(r.route, entry));
          if (open === undefined || daysSince(open, inputs.now) <= w.olderThanDays) continue;
        }
        matches.push({ route: r.route, entry });
      }
    }
    return { rule, state: matches.length > rule.max ? 'over' : 'met', count: matches.length, examples: matches.slice(0, MAX_EXAMPLES) };
  });
}

/** True when every rule was evaluated and is within its limit. */
export function policyMet(results: readonly RuleResult[]): boolean {
  return results.every((r) => r.state === 'met');
}

/** The `when` of a rule in a few words, for messages: `status fail, level A, older than 30 days`. */
export function describeWhen(w: PolicyWhen, lang: Lang): string {
  const fr = lang === 'fr';
  const out: string[] = [];
  if (w.status !== undefined) out.push(w.status === 'fail' ? (fr ? 'à corriger' : 'failures') : 'UNKNOWN');
  if (w.level !== undefined) out.push(`${fr ? 'niveau' : 'level'} ${w.level.map((l) => (l === 'none' ? (fr ? 'hors WCAG' : 'outside WCAG') : l)).join(fr ? ' ou ' : ' or ')}`);
  if (w.rule !== undefined) out.push(`${fr ? 'règle' : 'rule'} ${w.rule}`);
  if (w.route !== undefined) out.push(`route ${w.route}`);
  if (w.olderThanDays !== undefined) out.push(fr ? `en cours depuis plus de ${w.olderThanDays} jours` : `open for more than ${w.olderThanDays} days`);
  return out.length > 0 ? out.join(', ') : fr ? 'toutes les anomalies' : 'every finding';
}

/** Plain text: one line per rule, the rules that are over their limit first, then what the result means. */
export function describePolicy(results: readonly RuleResult[], lang: Lang): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const order = { over: 0, 'not-evaluated': 1, met: 2 } as const;
  const sorted = [...results].sort((a, b) => order[a.state] - order[b.state]);
  const over = results.filter((r) => r.state === 'over').length;
  const skipped = results.filter((r) => r.state === 'not-evaluated').length;
  const lines: string[] = [];
  if (policyMet(results)) {
    lines.push(fr ? `Politique${colon} les ${results.length} limites sont tenues.` : `Policy${colon} all ${results.length} limits are kept.`);
  } else {
    lines.push(
      fr
        ? `Politique${colon} ${over} limite(s) dépassée(s) et ${skipped} non évaluée(s), sur ${results.length}.`
        : `Policy${colon} ${over} limit(s) exceeded and ${skipped} not evaluated, out of ${results.length}.`,
    );
  }
  for (const r of sorted) {
    const what = describeWhen(r.rule.when, lang);
    if (r.state === 'not-evaluated') {
      lines.push(fr ? `  NON ÉVALUÉE ${r.rule.id} (${what})${colon} cette règle demande le registre des anomalies (--ledger).` : `  NOT EVALUATED ${r.rule.id} (${what})${colon} this rule needs the ledger of findings (--ledger).`);
      continue;
    }
    const tag = r.state === 'over' ? (fr ? 'DÉPASSÉE' : 'OVER') : fr ? 'TENUE' : 'KEPT';
    lines.push(`  ${tag} ${r.rule.id} (${what})${colon} ${r.count} ${fr ? 'pour une limite de' : 'against a limit of'} ${r.rule.max}`);
    if (r.rule.note) lines.push(`    ${r.rule.note}`);
    if (r.state === 'over') {
      for (const m of r.examples) lines.push(`    ${ruleIdOf(m.entry)} ${m.entry.id} (${m.route})`);
      if (r.count > r.examples.length) lines.push(fr ? `    … et ${r.count - r.examples.length} de plus.` : `    … and ${r.count - r.examples.length} more.`);
    }
  }
  lines.push(
    fr
      ? 'Une politique tenue veut dire que les décomptes restent dans les limites choisies par l’équipe. Cela ne dit rien de la conformité.'
      : 'A policy that is kept means the counts are within the limits the team chose. It says nothing about conformance.',
  );
  return `${lines.join('\n')}\n`;
}

/** A starting policy: no Level A failure, nothing open for more than 30 days, and a cap on what waits for a person. */
export function samplePolicy(): string {
  const policy: Policy = {
    version: 1,
    rules: [
      { id: 'no-level-a-failures', when: { status: 'fail', level: ['A'] }, max: 0, note: 'Level A failures stop people outright.' },
      { id: 'no-failure-older-than-30-days', when: { status: 'fail', olderThanDays: 30 }, max: 0 },
      { id: 'unknown-backlog', when: { status: 'unknown' }, max: 40, note: 'UNKNOWN findings wait for a person. Keep the pile small enough to look at.' },
    ],
  };
  return `${JSON.stringify(policy, null, 2)}\n`;
}
