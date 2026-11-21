import { ruleIdOf } from './ci.js';
import { mdCode, mdEscape } from './markdown.js';
import type { AuditReport } from './report.js';
import { NBSP, type Entry, type Lang } from './types.js';

/**
 * What changed between two reports: findings that are new, findings that are
 * no longer reported, and findings whose status changed. A finding is only
 * compared where its check ran on the same route in both reports. When a
 * check ran on one side only, its findings are counted as not comparable and
 * are never called new or gone. "No longer reported" is not "fixed": the
 * element may have moved, or the page may have lost the part that held it, so
 * the wording never says fixed.
 */

export interface ChangedItem {
  readonly route: string;
  readonly entry: Entry;
}

export interface StatusChange {
  readonly route: string;
  /** The finding as it is in the newer report. */
  readonly entry: Entry;
  readonly from: Entry['status'];
}

export interface Comparison {
  readonly before: string;
  readonly after: string;
  readonly added: readonly ChangedItem[];
  readonly gone: readonly ChangedItem[];
  readonly statusChanged: readonly StatusChange[];
  /** Findings present in both reports with the same status. */
  readonly kept: number;
  /** Findings of checks that ran on one side only for their route. */
  readonly notComparable: number;
  readonly routesAdded: readonly string[];
  readonly routesRemoved: readonly string[];
}

const SEP = '\u0000';
const ident = (route: string, e: Entry): string => [route, e.check, e.rule ?? '', e.id].join(SEP);

interface Side {
  /** route + check pairs that ran. */
  readonly ran: Set<string>;
  /** Findings by identity. A route audited in several profiles can hold the same finding more than once. */
  readonly found: Map<string, { route: string; entries: Entry[] }>;
  readonly routes: Set<string>;
}

function index(report: AuditReport): Side {
  const ran = new Set<string>();
  const found = new Map<string, { route: string; entries: Entry[] }>();
  const routes = new Set<string>();
  for (const r of report.routes) {
    routes.add(r.route);
    for (const c of r.checks) ran.add(`${r.route}${SEP}${c.check}`);
    for (const e of r.entries) {
      ran.add(`${r.route}${SEP}${e.check}`);
      const key = ident(r.route, e);
      const slot = found.get(key) ?? { route: r.route, entries: [] };
      slot.entries.push(e);
      found.set(key, slot);
    }
  }
  return { ran, found, routes };
}

const worst = (entries: readonly Entry[]): Entry => entries.find((e) => e.status === 'fail') ?? (entries[0] as Entry);

export function compareReports(before: AuditReport, after: AuditReport): Comparison {
  const a = index(before);
  const b = index(after);
  const added: ChangedItem[] = [];
  const gone: ChangedItem[] = [];
  const statusChanged: StatusChange[] = [];
  let kept = 0;
  let notComparable = 0;

  for (const [key, slot] of b.found) {
    const now = worst(slot.entries);
    const ranKey = `${slot.route}${SEP}${now.check}`;
    const was = a.found.get(key);
    if (!a.ran.has(ranKey)) notComparable++;
    else if (!was) added.push({ route: slot.route, entry: now });
    else if (worst(was.entries).status !== now.status) statusChanged.push({ route: slot.route, entry: now, from: worst(was.entries).status });
    else kept++;
  }
  for (const [key, slot] of a.found) {
    if (b.found.has(key)) continue;
    const was = worst(slot.entries);
    if (!b.ran.has(`${slot.route}${SEP}${was.check}`)) notComparable++;
    else gone.push({ route: slot.route, entry: was });
  }
  const order = (x: ChangedItem, y: ChangedItem): number =>
    Number(y.entry.status === 'fail') - Number(x.entry.status === 'fail') || x.route.localeCompare(y.route) || ruleIdOf(x.entry).localeCompare(ruleIdOf(y.entry)) || x.entry.id.localeCompare(y.entry.id);
  return {
    before: before.generatedAt,
    after: after.generatedAt,
    added: added.sort(order),
    gone: gone.sort(order),
    statusChanged: statusChanged.sort(order),
    kept,
    notComparable,
    routesAdded: [...b.routes].filter((r) => !a.routes.has(r)).sort(),
    routesRemoved: [...a.routes].filter((r) => !b.routes.has(r)).sort(),
  };
}

/** New failures, and findings that went from UNKNOWN to FAIL. This is what a job would gate on. */
export function newFailures(c: Comparison): ChangedItem[] {
  return [...c.added.filter((x) => x.entry.status === 'fail'), ...c.statusChanged.filter((x) => x.entry.status === 'fail').map((x) => ({ route: x.route, entry: x.entry }))];
}

export function isUnchanged(c: Comparison): boolean {
  return c.added.length + c.gone.length + c.statusChanged.length + c.notComparable + c.routesAdded.length + c.routesRemoved.length === 0;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pluriel = (n: number, one: string, many: string): string => `${n} ${n < 2 ? one : many}`;
const fails = (items: readonly ChangedItem[]): number => items.filter((x) => x.entry.status === 'fail').length;

/** The comparison in a few lines of plain text. */
export function describeComparison(c: Comparison, lang: Lang): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const lines: string[] = [];
  lines.push(fr ? `Comparaison avec le rapport du ${c.before}${colon}` : `Compared with the report of ${c.before}${colon}`);
  if (isUnchanged(c)) {
    lines.push(
      fr
        ? `  Mêmes anomalies que la dernière fois (${c.kept}). Cela ne dit rien de ce que les contrôles ne regardent pas.`
        : `  Same findings as last time (${c.kept}). This says nothing about what the checks do not look at.`,
    );
    return lines.join('\n') + '\n';
  }
  lines.push(
    fr
      ? `  ${pluriel(c.added.length, 'nouvelle anomalie', 'nouvelles anomalies')}, dont ${fails(c.added)} au statut À CORRIGER.`
      : `  ${plural(c.added.length, 'new finding', 'new findings')}, including ${fails(c.added)} with the status FAIL.`,
  );
  lines.push(
    fr
      ? `  ${pluriel(c.gone.length, 'anomalie n’est plus signalée', 'anomalies ne sont plus signalées')}, dont ${fails(c.gone)} au statut À CORRIGER. Ne plus être signalée ne veut pas dire corrigée${colon} l’élément a pu être déplacé ou retiré.`
      : `  ${plural(c.gone.length, 'finding is no longer reported', 'findings are no longer reported')}, including ${fails(c.gone)} with the status FAIL. No longer reported does not mean fixed${colon} the element may have moved or been removed.`,
  );
  if (c.statusChanged.length > 0) {
    const worse = c.statusChanged.filter((x) => x.entry.status === 'fail').length;
    lines.push(
      fr
        ? `  ${pluriel(c.statusChanged.length, 'anomalie a changé de statut', 'anomalies ont changé de statut')}${colon} ${worse} de UNKNOWN vers À CORRIGER, ${c.statusChanged.length - worse} dans l’autre sens.`
        : `  ${plural(c.statusChanged.length, 'finding changed status', 'findings changed status')}${colon} ${worse} from UNKNOWN to FAIL, ${c.statusChanged.length - worse} the other way.`,
    );
  }
  lines.push(fr ? `  ${pluriel(c.kept, 'anomalie inchangée', 'anomalies inchangées')}.` : `  ${plural(c.kept, 'finding is unchanged', 'findings are unchanged')}.`);
  if (c.notComparable > 0) {
    lines.push(
      fr
        ? `  ${pluriel(c.notComparable, 'anomalie non comparable', 'anomalies non comparables')}${colon} le contrôle n’a été exécuté que d’un côté pour cette route.`
        : `  ${plural(c.notComparable, 'finding cannot be compared', 'findings cannot be compared')}${colon} the check ran on one side only for that route.`,
    );
  }
  if (c.routesAdded.length > 0) lines.push(fr ? `  Routes ajoutées${colon} ${c.routesAdded.join(', ')}` : `  Routes added${colon} ${c.routesAdded.join(', ')}`);
  if (c.routesRemoved.length > 0) lines.push(fr ? `  Routes retirées${colon} ${c.routesRemoved.join(', ')}` : `  Routes removed${colon} ${c.routesRemoved.join(', ')}`);
  return lines.join('\n') + '\n';
}

const STATUS = { fail: { en: 'FAIL', fr: 'À CORRIGER' }, unknown: { en: 'UNKNOWN', fr: 'UNKNOWN' } } as const;

/** The comparison as Markdown, with the new findings and the ones no longer reported listed, up to a limit each. */
export function renderComparisonMarkdown(c: Comparison, lang: Lang, maxItems = 50): string {
  const fr = lang === 'fr';
  const limit = Math.max(1, Math.floor(maxItems));
  const out: string[] = [];
  out.push(fr ? '# Audit écran étroit – ce qui a changé' : '# Narrow-screen audit – what changed', '');
  out.push(fr ? `Du ${mdEscape(c.before)} au ${mdEscape(c.after)}.` : `From ${mdEscape(c.before)} to ${mdEscape(c.after)}.`, '');
  out.push(...describeComparison(c, lang).trimEnd().split('\n').slice(1).map((l) => `- ${mdEscape(l.trim())}`), '');
  const section = (title: string, items: readonly ChangedItem[], extra: (x: ChangedItem) => string = () => ''): void => {
    if (items.length === 0) return;
    out.push(`## ${title}`, '');
    for (const x of items.slice(0, limit)) {
      out.push(`- **${STATUS[x.entry.status][lang]}**${extra(x)} ${mdCode(x.route)} ${mdCode(ruleIdOf(x.entry))} ${mdCode(x.entry.id)} ${mdEscape(x.entry.message[lang])}`);
    }
    const left = items.length - limit;
    if (left > 0) out.push(fr ? `- … et ${left} de plus.` : `- … and ${left} more.`);
    out.push('');
  };
  section(fr ? 'Nouvelles anomalies' : 'New findings', c.added);
  const from = new Map(c.statusChanged.map((x) => [x, x.from] as const));
  section(
    fr ? 'Statut modifié' : 'Status changed',
    c.statusChanged,
    (x) => {
      const was = from.get(x as StatusChange);
      return was ? ` (${fr ? 'avant' : 'was'} ${STATUS[was][lang]})` : '';
    },
  );
  section(fr ? 'Anomalies qui ne sont plus signalées' : 'Findings no longer reported', c.gone);
  return out.join('\n').replace(/\n+$/, '\n');
}
