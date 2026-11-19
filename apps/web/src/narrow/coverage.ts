import { PRINCIPLES, compareSc } from './criteria.js';
import { MANUAL_STEPS, NEED_LABELS, manualStep, type Need } from './manual-steps.js';
import type { AuditReport } from './report.js';
import { CHECK_ORDER, CHECK_SC, NBSP, type CheckId, type Lang } from './types.js';
import { WCAG22_AA, aaCriterion, principleNumber, type AaCriterion } from './wcag22.js';

/**
 * Which Level A and AA criteria of WCAG 2.2 the checks of this tool relate
 * to, and which they do not touch at all. It exists so that a report with no
 * finding is not read as more than it is.
 *
 * Two things stay true whatever the numbers are. A check that relates to a
 * criterion looks at part of it, never at the whole. And a criterion with no
 * check has to be looked at by a person, with the steps of `manual-steps.ts`
 * as a start.
 */

/**
 * Criteria a check also looks at, besides the one `CHECK_SC` names for it.
 * Each line comes from the README table of this module or from the header
 * comment of the check's own source file. A relation listed here means the
 * check has at least one rule about the criterion, nothing more.
 */
export const ALSO_RELATES: Readonly<Partial<Record<CheckId, readonly string[]>>> = {
  keyboard: ['2.1.2'],
  headings: ['2.4.2'],
  handlers: ['2.5.2', '1.4.13'],
  order: ['2.4.3'],
  // Rules title-repeat and help-place of the check across pages.
  consistency: ['2.4.2', '3.2.6'],
  // Rules few-ways and h1-repeat.
  'site-links': ['2.4.5', '2.4.6'],
  constraints: ['3.2.2'],
  forms: ['3.3.1'],
  // Rules title, change-context, key-handler and media-captions of the markup check.
  'static-html': ['2.4.2', '3.2.2', '2.1.4', '1.2.2'],
};

/** True when the check relates to the criterion, as its main criterion or as an extra one. */
export function relates(check: CheckId, sc: string): boolean {
  return CHECK_SC[check] === sc || (ALSO_RELATES[check]?.includes(sc) ?? false);
}

export type CoverageKind = 'partly-automated' | 'by-hand';

export interface CoverageRow {
  readonly criterion: AaCriterion;
  /** Checks that relate to the criterion, in the order of the report. */
  readonly checks: readonly CheckId[];
  readonly kind: CoverageKind;
}

/** One row per Level A and AA criterion, in the order of WCAG. */
export function coverage(): CoverageRow[] {
  return WCAG22_AA.map((criterion) => {
    const checks = CHECK_ORDER.filter((id) => relates(id, criterion.sc));
    return { criterion, checks, kind: checks.length > 0 ? 'partly-automated' : 'by-hand' };
  });
}

/** Checks that relate to a criterion outside Level A and AA of WCAG 2.2, with that criterion. They are extra and do not count in the coverage. */
export function checksOutsideAa(): { check: CheckId; sc: string }[] {
  const out: { check: CheckId; sc: string }[] = [];
  for (const check of CHECK_ORDER) {
    const sc = CHECK_SC[check];
    if (sc !== null && aaCriterion(sc) === null) out.push({ check, sc });
  }
  return out;
}

export interface CoverageSummary {
  readonly level: 'A' | 'AA';
  readonly total: number;
  readonly partlyAutomated: number;
  readonly byHand: number;
}

export function coverageSummary(rows: readonly CoverageRow[] = coverage()): CoverageSummary[] {
  return (['A', 'AA'] as const).map((level) => {
    const mine = rows.filter((r) => r.criterion.level === level);
    const partly = mine.filter((r) => r.kind === 'partly-automated').length;
    return { level, total: mine.length, partlyAutomated: partly, byHand: mine.length - partly };
  });
}

/**
 * What one report says about one criterion.
 * - `found`: a check whose main criterion this is reported something.
 * - `see-checks`: nothing was counted for it, and a check that also looks
 *   at it ran. That check's findings are not sorted by criterion, so they
 *   have to be read in the report itself.
 * - `nothing-found`: its checks ran and reported nothing. This is not a pass.
 * - `not-run`: it has checks, and none of them ran in this report.
 * - `by-hand`: no check relates to it.
 */
export type ReportState = 'found' | 'see-checks' | 'nothing-found' | 'not-run' | 'by-hand';

export interface ReportCoverageRow extends CoverageRow {
  readonly state: ReportState;
  /** Checks of the row that ran on at least one route. */
  readonly ran: readonly CheckId[];
  /** Findings of the checks whose main criterion this is. Findings of checks that only also look at it are not counted. */
  readonly failed: number;
  readonly unknown: number;
}

export function coverageForReport(report: AuditReport): ReportCoverageRow[] {
  const ran = new Set<string>();
  const failed = new Map<string, number>();
  const unknown = new Map<string, number>();
  for (const r of report.routes) {
    for (const c of r.checks) {
      ran.add(c.check);
      failed.set(c.check, (failed.get(c.check) ?? 0) + c.failed);
      unknown.set(c.check, (unknown.get(c.check) ?? 0) + c.unknown);
    }
  }
  return coverage().map((row) => {
    const ranHere = row.checks.filter((id) => ran.has(id));
    const main = ranHere.filter((id) => CHECK_SC[id] === row.criterion.sc);
    const f = main.reduce((n, id) => n + (failed.get(id) ?? 0), 0);
    const u = main.reduce((n, id) => n + (unknown.get(id) ?? 0), 0);
    const state: ReportState =
      row.kind === 'by-hand' ? 'by-hand' : ranHere.length === 0 ? 'not-run' : f + u > 0 ? 'found' : main.length < ranHere.length ? 'see-checks' : 'nothing-found';
    return { ...row, state, ran: ranHere, failed: f, unknown: u };
  });
}

export function countStates(rows: readonly ReportCoverageRow[]): Readonly<Record<ReportState, number>> {
  const out: Record<ReportState, number> = { found: 0, 'see-checks': 0, 'nothing-found': 0, 'not-run': 0, 'by-hand': 0 };
  for (const r of rows) out[r.state]++;
  return out;
}

const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

const LIMITS = {
  en: 'A check that relates to a criterion looks at part of it, never at the whole. No count here says that a page conforms.',
  fr: 'Un contrôle lié à un critère n’en regarde qu’une partie, jamais la totalité. Aucun décompte ici ne dit qu’une page est conforme.',
} as const;

const STATE_LABELS: Readonly<Record<ReportState, { readonly en: string; readonly fr: string }>> = {
  found: { en: 'something found', fr: 'anomalies trouvées' },
  'see-checks': { en: 'a related check ran, read its findings', fr: 'un contrôle lié a été exécuté, lisez ses anomalies' },
  'nothing-found': { en: 'checks ran, nothing found', fr: 'contrôles exécutés, rien trouvé' },
  'not-run': { en: 'checks not run', fr: 'contrôles non exécutés' },
  'by-hand': { en: 'by hand only', fr: 'à la main seulement' },
};

/** Plain text: how many criteria have at least one check, by level, then the criteria that have none. */
export function describeCoverage(lang: Lang): string {
  const fr = lang === 'fr';
  const rows = coverage();
  const lines: string[] = [fr ? 'Couverture des critères WCAG 2.2 de niveau A et AA' : 'Coverage of WCAG 2.2 Level A and AA criteria'];
  for (const s of coverageSummary(rows)) {
    lines.push(
      fr
        ? `Niveau ${s.level}${colon(lang)} ${s.partlyAutomated} critères sur ${s.total} ont au moins un contrôle automatisé, ${s.byHand} n’en ont aucun.`
        : `Level ${s.level}${colon(lang)} ${s.partlyAutomated} of ${s.total} criteria have at least one automated check, ${s.byHand} have none.`,
    );
  }
  lines.push(LIMITS[lang]);
  const byHand = rows.filter((r) => r.kind === 'by-hand');
  if (byHand.length > 0) {
    lines.push(fr ? `Critères sans aucun contrôle, à regarder à la main${colon(lang)}` : `Criteria with no check, to look at by hand${colon(lang)}`);
    for (const r of byHand) lines.push(`  ${r.criterion.sc} ${r.criterion[lang]} (${r.criterion.level})`);
  }
  return `${lines.join('\n')}\n`;
}

/** Plain text: what one report says, criterion by criterion, counted by state. */
export function describeReportCoverage(report: AuditReport, lang: Lang): string {
  const fr = lang === 'fr';
  const rows = coverageForReport(report);
  const n = countStates(rows);
  const lines: string[] = [
    fr ? `Ce rapport et les ${rows.length} critères WCAG 2.2 de niveau A et AA${colon(lang)}` : `This report and the ${rows.length} WCAG 2.2 Level A and AA criteria${colon(lang)}`,
    fr
      ? `  ${n.found} avec des anomalies trouvées, ${n['see-checks']} à lire dans les anomalies d’un contrôle lié, ${n['nothing-found']} dont les contrôles n’ont rien trouvé, ${n['not-run']} dont les contrôles n’ont pas été exécutés, ${n['by-hand']} sans aucun contrôle.`
      : `  ${n.found} with something found, ${n['see-checks']} to read in the findings of a related check, ${n['nothing-found']} whose checks found nothing, ${n['not-run']} whose checks did not run, ${n['by-hand']} with no check at all.`,
    `  ${LIMITS[lang]}`,
  ];
  if (n['nothing-found'] > 0) {
    lines.push(
      fr
        ? '  «\u202FRien trouvé\u202F» veut dire que les contrôles n’ont rien signalé sur les pages auditées. Ce n’est pas un résultat pour le critère.'
        : '  “Nothing found” means the checks reported nothing on the pages audited. It is not a result for the criterion.',
    );
  }
  for (const r of rows.filter((x) => x.state === 'see-checks')) {
    lines.push(`  ${r.criterion.sc} ${r.criterion[lang]}${colon(lang)} ${fr ? 'voir' : 'see'} ${r.ran.join(', ')}`);
  }
  for (const r of rows.filter((x) => x.state === 'found')) {
    lines.push(
      fr
        ? `  ${r.criterion.sc} ${r.criterion.fr}${colon(lang)} ${r.failed} à corriger, ${r.unknown} UNKNOWN (${r.ran.join(', ')})`
        : `  ${r.criterion.sc} ${r.criterion.en}${colon(lang)} ${r.failed} to fix, ${r.unknown} UNKNOWN (${r.ran.join(', ')})`,
    );
  }
  return `${lines.join('\n')}\n`;
}

const cell = (text: string): string => text.replace(/\|/g, '\\|');

/** A Markdown table of the 55 criteria. With a report, a column says what that report found. */
export function renderCoverageMarkdown(lang: Lang, report?: AuditReport): string {
  const fr = lang === 'fr';
  const rows = report ? coverageForReport(report) : null;
  const out: string[] = [fr ? '# Couverture des critères WCAG 2.2 (A et AA)' : '# Coverage of WCAG 2.2 criteria (A and AA)', '', LIMITS[lang], ''];
  const head = fr ? ['Critère', 'Niveau', 'Contrôles liés'] : ['Criterion', 'Level', 'Related checks'];
  if (rows) head.push(fr ? 'Dans ce rapport' : 'In this report');
  out.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
  const none = fr ? 'aucun, à regarder à la main' : 'none, look by hand';
  coverage().forEach((row, i) => {
    const cells = [`${row.criterion.sc} ${cell(row.criterion[lang])}`, row.criterion.level, row.checks.length > 0 ? row.checks.map((c) => `\`${c}\``).join(', ') : none];
    const r = rows?.[i];
    if (r) {
      const detail = r.state === 'found' ? (fr ? `${colon(lang)} ${r.failed} à corriger, ${r.unknown} UNKNOWN` : `${colon(lang)} ${r.failed} to fix, ${r.unknown} UNKNOWN`) : '';
      cells.push(`${STATE_LABELS[r.state][lang]}${detail}`);
    }
    out.push(`| ${cells.join(' | ')} |`);
  });
  return `${out.join('\n')}\n`;
}

export interface ScriptOptions {
  /** Only criteria that no check relates to. */
  readonly onlyByHand?: boolean;
  readonly level?: 'A' | 'AA';
  /** Only steps that need one of these. */
  readonly needs?: readonly Need[];
  /** Only criteria added by this version of WCAG. */
  readonly since?: '2.1' | '2.2';
}

export interface ScriptItem {
  readonly row: CoverageRow;
  readonly action: string;
  readonly look: string;
  readonly needs: Need;
}

/** The by-hand steps that match the options, in the order of WCAG. */
export function manualScript(options: ScriptOptions, lang: Lang): ScriptItem[] {
  const items: ScriptItem[] = [];
  for (const row of coverage()) {
    const step = manualStep(row.criterion.sc);
    if (!step) continue;
    if (options.onlyByHand && row.kind !== 'by-hand') continue;
    if (options.level && row.criterion.level !== options.level) continue;
    if (options.needs && !options.needs.includes(step.needs)) continue;
    if (options.since && row.criterion.since !== options.since) continue;
    items.push({ row, action: step.action[lang], look: step.look[lang], needs: step.needs });
  }
  return items;
}

/** The script as a Markdown checklist, grouped by principle. The boxes are for the person's own notes: ticking one records that someone looked, not that the criterion is met. */
export function renderManualScript(options: ScriptOptions, lang: Lang): string {
  const fr = lang === 'fr';
  const items = manualScript(options, lang);
  const out: string[] = [fr ? '# Contrôles à la main, WCAG 2.2 (A et AA)' : '# By-hand checks, WCAG 2.2 (A and AA)', ''];
  if (items.length === 0) {
    out.push(fr ? 'Aucune étape ne correspond à ces options.' : 'No step matches these options.');
    return `${out.join('\n')}\n`;
  }
  out.push(
    fr
      ? `${items.length} étapes sur ${MANUAL_STEPS.length}. Chaque étape est un premier regard qui trouve les problèmes courants. Cocher une case note que quelqu’un a regardé, pas que le critère est respecté.`
      : `${items.length} of ${MANUAL_STEPS.length} steps. Each step is a first look that finds common problems. Ticking a box records that someone looked, not that the criterion is met.`,
  );
  let principle: number | null = null;
  for (const item of items) {
    const p = principleNumber(item.row.criterion.sc);
    if (p !== null && p !== principle) {
      principle = p;
      out.push('', `## ${p}. ${PRINCIPLES[p][lang]}`, '');
    }
    const c = item.row.criterion;
    const related = item.row.checks.length > 0 ? (fr ? ` Contrôles liés${colon(lang)} ${item.row.checks.join(', ')}.` : ` Related checks${colon(lang)} ${item.row.checks.join(', ')}.`) : '';
    out.push(`- [ ] **${c.sc} ${c[lang]}** (${c.level})`);
    out.push(`  - ${fr ? `À faire${colon(lang)}` : `Do${colon(lang)}`} ${item.action}`);
    out.push(`  - ${fr ? `À observer${colon(lang)}` : `Look for${colon(lang)}`} ${item.look}`);
    out.push(`  - ${fr ? `Il faut${colon(lang)}` : `Needs${colon(lang)}`} ${NEED_LABELS[item.needs][lang]}.${related}`);
  }
  return `${out.join('\n')}\n`;
}

/** The criteria of a list of numbers, sorted as WCAG orders them, with numbers outside Level A and AA left out. */
export function sortedAa(scs: readonly string[]): AaCriterion[] {
  return [...new Set(scs)]
    .sort(compareSc)
    .map((sc) => aaCriterion(sc))
    .filter((c): c is AaCriterion => c !== null);
}
