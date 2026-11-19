import { keyOf, ruleIdOf } from './ci.js';
import { clusterFindings, type Cluster } from './cluster.js';
import { criterionOf, type Level } from './criteria.js';
import { daysSince, openSince, type Ledger } from './ledger.js';
import { ownerOf, type Owners } from './owners.js';
import type { AuditReport } from './report.js';
import { CHECK_SC, NBSP, type Lang } from './types.js';

/**
 * An order to work through the findings of a report. Each distinct finding
 * gets a score from four things the report and its ledger hold: its status,
 * the level of the WCAG criterion its check relates to, how many routes it is
 * on, and how long it has been open. The parts of the score are listed with
 * every item, so the order can be argued with.
 *
 * The score is a starting point. It does not know how many people a problem
 * stops, or how hard it is to settle, and an UNKNOWN finding may turn out to
 * be the worst one once a person has looked.
 */

export const WEIGHTS = {
  /** High enough that a failure always comes before an UNKNOWN finding, whatever the other parts add. */
  fail: 120,
  unknown: 20,
  levelA: 30,
  levelAA: 20,
  levelAAA: 5,
  outsideWcag: 10,
  /** Per extra route, up to `spreadMax`. */
  spreadPerRoute: 5,
  spreadMax: 30,
  /** Per full week open, up to `ageMax`. */
  agePerWeek: 3,
  ageMax: 30,
} as const;

export type ScorePart = 'status' | 'level' | 'spread' | 'age';

export interface PriorityItem {
  readonly cluster: Cluster;
  readonly score: number;
  readonly parts: Readonly<Record<ScorePart, number>>;
  /** Criterion the check relates to, or null for a check outside WCAG. */
  readonly sc: string | null;
  readonly level: Level | null;
  /** Days the oldest occurrence has been a failure, or null when the ledger does not say. */
  readonly daysOpen: number | null;
  /** Owner of the first occurrence, or null. */
  readonly owner: string | null;
}

export interface PriorityInputs {
  readonly now: Date;
  readonly ledger?: Ledger;
  readonly owners?: Owners;
}

function levelPoints(level: Level | null): number {
  if (level === 'A') return WEIGHTS.levelA;
  if (level === 'AA') return WEIGHTS.levelAA;
  if (level === 'AAA') return WEIGHTS.levelAAA;
  return WEIGHTS.outsideWcag;
}

/** The distinct findings of a report, the ones to start with first. Equal scores keep a fixed order, by rule and then by element. */
export function prioritise(report: AuditReport, inputs: PriorityInputs): PriorityItem[] {
  const since = new Map<string, string>();
  for (const e of inputs.ledger?.entries ?? []) {
    const open = openSince(e);
    if (open !== null) since.set(e.key, open);
  }
  return clusterFindings(report)
    .map((cluster): PriorityItem => {
      const e = cluster.entry;
      const sc = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[e.check] ?? null;
      const level = sc ? (criterionOf(sc)?.level ?? null) : null;
      let daysOpen: number | null = null;
      if (e.status === 'fail') {
        for (const route of cluster.routes) {
          const open = since.get(keyOf(route, e));
          if (open === undefined) continue;
          const days = daysSince(open, inputs.now);
          if (daysOpen === null || days > daysOpen) daysOpen = days;
        }
      }
      const parts: Record<ScorePart, number> = {
        status: e.status === 'fail' ? WEIGHTS.fail : WEIGHTS.unknown,
        level: levelPoints(level),
        spread: Math.min(WEIGHTS.spreadMax, WEIGHTS.spreadPerRoute * (cluster.routes.length - 1)),
        age: daysOpen === null ? 0 : Math.min(WEIGHTS.ageMax, Math.floor(daysOpen / 7) * WEIGHTS.agePerWeek),
      };
      const first = cluster.routes[0] ?? '';
      return {
        cluster,
        score: parts.status + parts.level + parts.spread + parts.age,
        parts,
        sc,
        level,
        daysOpen,
        owner: inputs.owners ? ownerOf(first, e, inputs.owners) : null,
      };
    })
    .sort((a, b) => b.score - a.score || ruleIdOf(a.cluster.entry).localeCompare(ruleIdOf(b.cluster.entry)) || a.cluster.entry.id.localeCompare(b.cluster.entry.id));
}

const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

/** Why an item has its score, in words: `FAIL, Level A, 3 routes, open 21 days`. */
export function describeWhy(item: PriorityItem, lang: Lang): string {
  const fr = lang === 'fr';
  const e = item.cluster.entry;
  const out: string[] = [e.status === 'fail' ? (fr ? 'À CORRIGER' : 'FAIL') : 'UNKNOWN'];
  out.push(item.level ? `${fr ? 'niveau' : 'Level'} ${item.level}` : fr ? 'hors WCAG' : 'outside WCAG');
  const n = item.cluster.routes.length;
  out.push(fr ? `${n} ${n < 2 ? 'route' : 'routes'}` : `${n} ${n === 1 ? 'route' : 'routes'}`);
  if (item.daysOpen !== null) out.push(fr ? `en cours depuis ${item.daysOpen} ${item.daysOpen < 2 ? 'jour' : 'jours'}` : `open ${item.daysOpen} ${item.daysOpen === 1 ? 'day' : 'days'}`);
  return out.join(', ');
}

const LIMIT = {
  en: 'The order counts status, WCAG level, number of routes and age. It does not know how many people a problem stops, and an UNKNOWN finding may turn out to matter most once a person has looked.',
  fr: 'L’ordre tient compte du statut, du niveau WCAG, du nombre de routes et de l’ancienneté. Il ne sait pas combien de personnes un problème arrête, et une anomalie UNKNOWN peut se révéler la plus importante une fois regardée par une personne.',
} as const;

/** Plain text: the first `max` items with their score and the reasons for it. */
export function describePriorities(items: readonly PriorityItem[], lang: Lang, max = 10): string {
  const fr = lang === 'fr';
  if (items.length === 0) return fr ? 'Aucune anomalie à ordonner.\n' : 'No finding to put in order.\n';
  const limit = Math.max(1, Math.floor(max));
  const lines: string[] = [fr ? `Par où commencer${colon(lang)} ${Math.min(limit, items.length)} sur ${items.length} anomalies distinctes` : `Where to start${colon(lang)} ${Math.min(limit, items.length)} of ${items.length} distinct findings`];
  items.slice(0, limit).forEach((item, i) => {
    const e = item.cluster.entry;
    const owner = item.owner ? ` ${item.owner}` : '';
    lines.push(`  ${i + 1}. [${item.score}] ${ruleIdOf(e)} ${e.id}${owner} (${describeWhy(item, lang)})`);
    lines.push(`     ${e.message[lang]}`);
  });
  if (items.length > limit) lines.push(fr ? `  … et ${items.length - limit} de plus.` : `  … and ${items.length - limit} more.`);
  lines.push(LIMIT[lang]);
  return `${lines.join('\n')}\n`;
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** A Markdown table of every item, in order, with the parts of each score. */
export function renderPrioritiesMarkdown(items: readonly PriorityItem[], lang: Lang): string {
  const fr = lang === 'fr';
  const out: string[] = [fr ? '# Par où commencer' : '# Where to start', '', LIMIT[lang], ''];
  if (items.length === 0) {
    out.push(fr ? 'Aucune anomalie à ordonner.' : 'No finding to put in order.');
    return `${out.join('\n')}\n`;
  }
  const head = fr ? ['Rang', 'Score', 'Anomalie', 'Pourquoi', 'Responsable', 'Routes'] : ['Rank', 'Score', 'Finding', 'Why', 'Owner', 'Routes'];
  out.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
  items.forEach((item, i) => {
    const e = item.cluster.entry;
    const p = item.parts;
    out.push(
      `| ${i + 1} | ${item.score} (${p.status}+${p.level}+${p.spread}+${p.age}) | \`${cell(ruleIdOf(e))}\` \`${cell(e.id)}\` | ${cell(describeWhy(item, lang))} | ${cell(item.owner ?? '')} | ${cell(item.cluster.routes.join(', '))} |`,
    );
  });
  return `${out.join('\n')}\n`;
}
