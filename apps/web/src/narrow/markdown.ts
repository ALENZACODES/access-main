import { ruleIdOf } from './ci.js';
import { byCriterion, criterionLabel } from './criteria.js';
import { countRules } from './digest.js';
import { totals, type AuditReport, type RouteAudit } from './report.js';
import { CHECK_LABELS, NBSP, type CheckId, type Entry, type Lang } from './types.js';

/**
 * A report as Markdown, for a pull request comment or a job summary: totals,
 * a table by check, a table by WCAG criterion, the most frequent rules, then
 * the findings of each route, failures first. Text that comes from the page
 * (element ids, messages that quote page text) is escaped, so it cannot add
 * links, images or markup to the comment. Long routes are cut at a limit and
 * say how many findings were left out.
 */

export interface MarkdownOptions {
  /** Findings listed per route before the rest is counted and left out. */
  readonly maxEntriesPerRoute?: number;
  /** Rows of the most frequent rules table. 0 leaves the table out. */
  readonly topRules?: number;
}

export const DEFAULT_MAX_ENTRIES = 50;
export const DEFAULT_TOP_RULES = 10;

const T = {
  title: { en: 'Narrow-screen audit', fr: 'Audit écran étroit' },
  generated: { en: 'Generated', fr: 'Généré le' },
  fail: { en: 'FAIL', fr: 'À CORRIGER' },
  unknown: { en: 'UNKNOWN', fr: 'INCONNU' },
  toFix: { en: 'To fix', fr: 'À corriger' },
  toCheck: { en: 'Unknown', fr: 'Inconnus' },
  checked: { en: 'Checked', fr: 'Contrôlés' },
  check: { en: 'Check', fr: 'Contrôle' },
  criterion: { en: 'WCAG 2.2 criterion', fr: 'Critère WCAG 2.2' },
  checks: { en: 'Checks', fr: 'Contrôles' },
  rule: { en: 'Rule', fr: 'Règle' },
  routes: { en: 'Routes', fr: 'Routes' },
  byCheck: { en: 'By check', fr: 'Par contrôle' },
  byCriterion: { en: 'By criterion', fr: 'Par critère' },
  topRules: { en: 'Most frequent rules', fr: 'Règles les plus fréquentes' },
  findings: { en: 'Findings by route', fr: 'Anomalies par route' },
  none: { en: 'No findings.', fr: 'Aucune anomalie.' },
  notWcag: { en: 'Not a WCAG criterion', fr: 'Hors critères WCAG' },
  truncated: { en: 'Only the first elements were read on this page.', fr: 'Seuls les premiers éléments de cette page ont été lus.' },
  waived: { en: 'Failures covered by a waiver', fr: 'Anomalies couvertes par une dérogation' },
  until: { en: 'until', fr: 'jusqu’au' },
  skipped: { en: 'Checks not run in this run, so nothing is said about them', fr: 'Contrôles non exécutés, aucun résultat à leur sujet' },
  partial: {
    en: 'A check relates to a criterion and does not test all of it.',
    fr: 'Un contrôle se rapporte à un critère sans le tester en entier.',
  },
} as const;

const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

/** Escapes text for use in Markdown prose and table cells. Line breaks become spaces, so one finding stays one line. */
export function mdEscape(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]()#+!|~])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Text as inline code. A backtick inside would end the code span, so the fence grows to fit, as CommonMark allows. */
export function mdCode(text: string): string {
  const one = text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|');
  if (one === '') return '` `';
  const longest = Math.max(0, ...(one.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = one.startsWith('`') || one.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${one}${pad}${fence}`;
}

function table(head: readonly string[], rows: readonly (readonly string[])[], numeric: readonly number[]): string[] {
  const align = head.map((_, i) => (numeric.includes(i) ? '---:' : '---'));
  return [`| ${head.join(' | ')} |`, `| ${align.join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
}

const labelOf = (check: CheckId, lang: Lang): string => (CHECK_LABELS as Readonly<Record<string, { en: string; fr: string } | undefined>>)[check]?.[lang] ?? check;

function routeTitle(r: RouteAudit, lang: Lang): string {
  return r.viewportWidth === null ? mdCode(r.route) : `${mdCode(r.route)} (${r.viewportWidth}${lang === 'fr' ? NBSP : ''}px)`;
}

function findingLine(e: Entry, lang: Lang): string {
  return `- **${e.status === 'fail' ? T.fail[lang] : T.unknown[lang]}** ${mdCode(ruleIdOf(e))} ${mdCode(e.id)} ${mdEscape(e.message[lang])}`;
}

export function renderMarkdown(report: AuditReport, lang: Lang, options: MarkdownOptions = {}): string {
  const maxEntries = Math.max(1, Math.floor(options.maxEntriesPerRoute ?? DEFAULT_MAX_ENTRIES));
  const topRules = Math.max(0, Math.floor(options.topRules ?? DEFAULT_TOP_RULES));
  const sum = totals(report.routes);
  const out: string[] = [];
  out.push(`# ${T.title[lang]}`, '');
  out.push(`${T.generated[lang]} ${mdEscape(report.generatedAt)} · ${mdEscape(report.tool.name)} ${mdEscape(report.tool.version)}`, '');
  out.push(`> ${mdEscape(report.scopeNote[lang])}`, '');
  out.push(`**${T.toFix[lang]}${colon(lang)} ${sum.failed}** · ${T.toCheck[lang]}${colon(lang)} ${sum.unknown} · ${T.checked[lang]}${colon(lang)} ${sum.checked}`, '');

  const perCheck = new Map<CheckId, { checked: number; failed: number; unknown: number }>();
  for (const r of report.routes) {
    for (const c of r.checks) {
      const row = perCheck.get(c.check) ?? { checked: 0, failed: 0, unknown: 0 };
      row.checked += c.checked;
      row.failed += c.failed;
      row.unknown += c.unknown;
      perCheck.set(c.check, row);
    }
  }
  if (perCheck.size > 0) {
    out.push(`## ${T.byCheck[lang]}`, '');
    out.push(
      ...table(
        [T.check[lang], T.toFix[lang], T.toCheck[lang], T.checked[lang]],
        [...perCheck.entries()].map(([check, c]) => [`${mdEscape(labelOf(check, lang))} (${mdCode(check)})`, String(c.failed), String(c.unknown), String(c.checked)]),
        [1, 2, 3],
      ),
      '',
    );
    out.push(`## ${T.byCriterion[lang]}`, '', `${T.partial[lang]}`, '');
    out.push(
      ...table(
        [T.criterion[lang], T.checks[lang], T.toFix[lang], T.toCheck[lang]],
        byCriterion(report).map((row) => [
          row.sc === null ? T.notWcag[lang] : mdEscape(criterionLabel(row.sc, lang)),
          row.checks.map((c) => mdCode(c)).join(', '),
          String(row.failed),
          String(row.unknown),
        ]),
        [2, 3],
      ),
      '',
    );
  }

  const rules = countRules(report).slice(0, topRules);
  if (rules.length > 0) {
    out.push(`## ${T.topRules[lang]}`, '');
    out.push(...table([T.rule[lang], T.toFix[lang], T.toCheck[lang], T.routes[lang]], rules.map((r) => [mdCode(r.rule), String(r.failed), String(r.unknown), String(r.routes)]), [1, 2, 3]), '');
  }

  out.push(`## ${T.findings[lang]}`, '');
  if (report.routes.length === 0) out.push(T.none[lang], '');
  for (const r of report.routes) {
    const agg = totals([r]);
    out.push(`### ${routeTitle(r, lang)}`, '');
    out.push(`${T.toFix[lang]}${colon(lang)} ${agg.failed} · ${T.toCheck[lang]}${colon(lang)} ${agg.unknown} · ${T.checked[lang]}${colon(lang)} ${agg.checked}`, '');
    if (r.truncated) out.push(`_${T.truncated[lang]}_`, '');
    if (r.entries.length === 0) {
      out.push(T.none[lang], '');
      continue;
    }
    const ordered = [...r.entries.filter((e) => e.status === 'fail'), ...r.entries.filter((e) => e.status !== 'fail')];
    for (const e of ordered.slice(0, maxEntries)) out.push(findingLine(e, lang));
    const left = ordered.length - maxEntries;
    if (left > 0) {
      out.push(
        lang === 'fr'
          ? `- … et ${left} ${left === 1 ? 'autre anomalie, non listée' : 'autres anomalies, non listées'} ici. Le rapport JSON les contient toutes.`
          : `- … and ${left} more ${left === 1 ? 'finding' : 'findings'} not listed here. The JSON report holds all of them.`,
      );
    }
    out.push('');
  }

  if (report.waived && report.waived.length > 0) {
    out.push(`## ${T.waived[lang]}`, '');
    for (const w of report.waived) {
      out.push(`- ${mdCode(w.route)} ${mdCode(ruleIdOf(w.entry))} ${mdCode(w.entry.id)} ${mdEscape(w.reason)} (${T.until[lang]} ${mdEscape(w.expires)})`);
    }
    out.push('');
  }
  if (report.skipped && report.skipped.length > 0) {
    out.push(`## ${T.skipped[lang]}`, '', report.skipped.map((c) => mdCode(c)).join(', '), '');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
