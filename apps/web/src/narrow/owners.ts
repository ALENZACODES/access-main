import { globMatch, ruleIdOf } from './ci.js';
import type { AuditReport } from './report.js';
import { NBSP, type Entry, type Lang } from './types.js';

/**
 * Who looks at which finding. A small text file maps routes and rules to a
 * team or a person, so a report with many findings can be split into one list
 * per owner. As in a code owners file, the last line that matches wins, which
 * lets a general line come first and exceptions after it. An owner is a
 * routing label for people: it never changes a count, a status or the exit
 * code, and a finding with no owner is listed, not dropped.
 *
 *   # general rule first
 *   *                 @web
 *   route:/help*      @help-team
 *   rule:contrast/*   @design
 */

export interface OwnerLine {
  readonly kind: 'any' | 'route' | 'rule';
  readonly pattern: string;
  readonly owner: string;
  /** Line in the owners file, from 1. */
  readonly line: number;
}

export interface Owners {
  readonly lines: readonly OwnerLine[];
}

export type ParsedOwners = { readonly ok: true; readonly value: Owners } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export function parseOwners(text: string): ParsedOwners {
  const lines: OwnerLine[] = [];
  const rows = text.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] ?? '').replace(/(^|\s)#.*$/, '').trim();
    if (row === '') continue;
    const parts = row.split(/\s+/);
    const bad = (en: string, fr: string): ParsedOwners => ({ ok: false, error: { en: `Owners file, line ${i + 1}: ${en}`, fr: `Fichier des responsables, ligne ${i + 1}\u00A0: ${fr}` } });
    if (parts.length !== 2) return bad('expected a pattern and one owner, separated by a space.', 'un motif et un seul responsable sont attendus, séparés par une espace.');
    const [what, owner] = parts as [string, string];
    if (!owner.startsWith('@') || owner.length < 2) return bad(`the owner "${owner}" must start with @.`, `le responsable "${owner}" doit commencer par @.`);
    if (what === '*') lines.push({ kind: 'any', pattern: '*', owner, line: i + 1 });
    else if (what.startsWith('route:') && what.length > 6) lines.push({ kind: 'route', pattern: what.slice(6), owner, line: i + 1 });
    else if (what.startsWith('rule:') && what.length > 5) {
      const p = what.slice(5);
      lines.push({ kind: 'rule', pattern: p.includes('/') ? p : `${p}/*`, owner, line: i + 1 });
    } else return bad(`the pattern "${what}" must be *, route:PATTERN or rule:PATTERN.`, `le motif "${what}" doit être *, route:MOTIF ou rule:MOTIF.`);
  }
  return { ok: true, value: { lines } };
}

const lineMatches = (l: OwnerLine, route: string, e: Entry): boolean => l.kind === 'any' || (l.kind === 'route' ? globMatch(l.pattern, route) : globMatch(l.pattern, ruleIdOf(e)));

/** The owner of a finding: the last line that matches, or null when none does. */
export function ownerOf(route: string, e: Entry, owners: Owners): string | null {
  for (let i = owners.lines.length - 1; i >= 0; i--) {
    const l = owners.lines[i];
    if (l && lineMatches(l, route, e)) return l.owner;
  }
  return null;
}

export interface OwnerGroup {
  /** Null for findings no line matches. */
  readonly owner: string | null;
  readonly failed: number;
  readonly unknown: number;
  readonly items: readonly { readonly route: string; readonly entry: Entry }[];
}

/** Findings by owner: owners with the most failures first, and the findings with no owner last. */
export function byOwner(report: AuditReport, owners: Owners): OwnerGroup[] {
  const groups = new Map<string, { owner: string | null; failed: number; unknown: number; items: { route: string; entry: Entry }[] }>();
  for (const r of report.routes) {
    for (const e of r.entries) {
      const owner = ownerOf(r.route, e, owners);
      const g = groups.get(owner ?? '') ?? { owner, failed: 0, unknown: 0, items: [] };
      if (e.status === 'fail') g.failed++;
      else g.unknown++;
      g.items.push({ route: r.route, entry: e });
      groups.set(owner ?? '', g);
    }
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.owner === null) - Number(b.owner === null) || b.failed - a.failed || b.unknown - a.unknown || (a.owner ?? '').localeCompare(b.owner ?? ''),
  );
}

/** Lines of the owners file that match no finding of the report. A line can be unused because nothing was found there, so this is a prompt to look, not an error. */
export function unusedOwnerLines(report: AuditReport, owners: Owners): OwnerLine[] {
  const all = report.routes.flatMap((r) => r.entries.map((e) => ({ route: r.route, e })));
  return owners.lines.filter((l) => l.kind !== 'any' && !all.some((x) => lineMatches(l, x.route, x.e)));
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pluriel = (n: number, one: string, many: string): string => `${n} ${n < 2 ? one : many}`;

/** Plain text: one block per owner with its counts and its first findings, failures first. */
export function describeByOwner(report: AuditReport, owners: Owners, lang: Lang, maxItems = 5): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const groups = byOwner(report, owners);
  if (groups.length === 0) return fr ? 'Aucune anomalie à répartir.\n' : 'No finding to share out.\n';
  const limit = Math.max(1, Math.floor(maxItems));
  const lines: string[] = [];
  for (const g of groups) {
    const name = g.owner ?? (fr ? 'Sans responsable' : 'No owner');
    lines.push(
      fr
        ? `${name}${colon} ${g.failed} à corriger, ${pluriel(g.unknown, 'point à contrôler', 'points à contrôler')}`
        : `${name}${colon} ${g.failed} to fix, ${plural(g.unknown, 'item to check', 'items to check')}`,
    );
    const ordered = [...g.items.filter((x) => x.entry.status === 'fail'), ...g.items.filter((x) => x.entry.status !== 'fail')];
    for (const x of ordered.slice(0, limit)) {
      const status = x.entry.status === 'fail' ? (fr ? 'À CORRIGER' : 'FAIL') : 'UNKNOWN';
      lines.push(`  ${status} ${ruleIdOf(x.entry)} ${x.entry.id} (${x.route})`);
    }
    const left = ordered.length - limit;
    if (left > 0) lines.push(fr ? `  … et ${left} de plus.` : `  … and ${left} more.`);
  }
  return lines.join('\n') + '\n';
}
