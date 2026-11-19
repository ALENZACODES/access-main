import { ruleIdOf } from './ci.js';
import { sharedFindings, summariseClusters } from './cluster.js';
import { byCriterion, byLevel, criterionLabel } from './criteria.js';
import { guidanceForReport } from './guidance.js';
import { escapeHtml, REPORT_LABELS, totals, type AuditReport, type RouteAudit } from './report.js';
import { CHECK_LABELS, CHECK_SC, NBSP, type CheckId, type Entry, type Lang } from './types.js';

/**
 * A longer HTML report for people who have to plan the work: totals, the
 * findings by WCAG criterion, the findings that repeat across routes, every
 * route in full, and what to look at by hand. It is one file with no script
 * and no outside resource, so it opens offline and prints.
 *
 * The page has to hold up under the checks it reports on: one h1, headings in
 * order, a skip link that is always visible, table captions and header cells, a
 * visible focus ring, 44 pixel targets, and status given in words, never by
 * colour alone. The tests run this module's own markup checks on its output.
 */

const T = {
  title: { en: 'Narrow-screen audit, detailed report', fr: 'Audit écran étroit, rapport détaillé' },
  skip: { en: 'Skip to the report', fr: 'Aller au rapport' },
  contents: { en: 'Contents', fr: 'Sommaire' },
  summary: { en: 'Summary', fr: 'Résumé' },
  byCriterion: { en: 'Findings by WCAG criterion', fr: 'Anomalies par critère WCAG' },
  shared: { en: 'Findings that repeat across routes', fr: 'Anomalies répétées sur plusieurs routes' },
  routes: { en: 'Routes', fr: 'Routes' },
  nextSteps: { en: 'What to look at by hand', fr: 'À regarder à la main' },
  scope: { en: 'Scope and sources', fr: 'Portée et sources' },
  routesAudited: { en: 'Routes audited', fr: 'Routes auditées' },
  toFix: { en: 'To fix', fr: 'À corriger' },
  toLook: { en: 'UNKNOWN, for a person to look at', fr: 'UNKNOWN, à regarder par une personne' },
  checked: { en: 'Elements checked', fr: 'Éléments contrôlés' },
  unmeasured: { en: 'Not measured (hidden or no size)', fr: 'Non mesurés (masqués ou sans taille)' },
  level: { en: 'Level', fr: 'Niveau' },
  levelNone: { en: 'Not a WCAG criterion', fr: 'Hors critère WCAG' },
  levelCaption: { en: 'Findings by conformance level', fr: 'Anomalies par niveau de conformité' },
  criterion: { en: 'Criterion', fr: 'Critère' },
  checks: { en: 'Checks', fr: 'Contrôles' },
  criterionCaption: { en: 'Findings by criterion, in the order of WCAG', fr: 'Anomalies par critère, dans l’ordre des WCAG' },
  otherChecks: { en: 'Checks outside WCAG', fr: 'Contrôles hors WCAG' },
  finding: { en: 'Finding', fr: 'Anomalie' },
  onRoutes: { en: 'Routes', fr: 'Routes' },
  status: { en: 'Status', fr: 'Statut' },
  sharedCaption: { en: 'Findings seen on two routes or more, the most widespread first', fr: 'Anomalies vues sur au moins deux routes, les plus répandues d’abord' },
  noShared: { en: 'No finding repeats across routes.', fr: 'Aucune anomalie ne se répète sur plusieurs routes.' },
  noFindings: { en: 'The checks that ran reported nothing on this route. That is not a statement that the route conforms.', fr: 'Les contrôles exécutés n’ont rien signalé sur cette route. Cela ne dit pas que la route est conforme.' },
  noRoutes: { en: 'No route was audited.', fr: 'Aucune route n’a été auditée.' },
  noSteps: { en: 'The report has no finding, so there is no check to point to. The scope note below still applies.', fr: 'Le rapport ne contient aucune anomalie, donc aucun contrôle à désigner. La note de portée ci-dessous reste valable.' },
  who: { en: 'Who it matters to', fr: 'Qui est concerné' },
  byHand: { en: 'To look by hand', fr: 'Pour regarder à la main' },
  handLimit: { en: 'Looking by hand does not make a page conform. It shows where to look.', fr: 'Regarder à la main ne rend pas une page conforme. Cela montre où regarder.' },
  truncated: { en: 'Only the first elements were read on this route.', fr: 'Seuls les premiers éléments de cette route ont été lus.' },
  skipped: { en: 'Checks not run in this run, so nothing is said about them', fr: 'Contrôles non exécutés, aucun résultat à leur sujet' },
  waived: { en: 'Failures covered by a dated waiver', fr: 'Anomalies couvertes par une dérogation datée' },
  until: { en: 'until', fr: 'jusqu’au' },
  sharedNote: {
    en: 'A finding that repeats is likely to sit in a shared part of the site. One change may settle it everywhere, which still has to be looked at route by route.',
    fr: 'Une anomalie répétée se trouve sans doute dans une partie commune du site. Un seul changement peut la régler partout, ce qui reste à regarder route par route.',
  },
  top: { en: 'Back to the contents', fr: 'Retour au sommaire' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');
const statusWord = (e: Pick<Entry, 'status'>, lang: Lang): string => REPORT_LABELS[e.status][lang];

export const DETAIL_CSS =
  ':root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--link:#0b4f9c;--fail:#8a0017;--unknown:#594300;--line:#6b6b6b;--soft:#f2f2f2}' +
  '@media (prefers-color-scheme:dark){:root{--fg:#f2f2f2;--bg:#121212;--link:#9cc7ff;--fail:#ffb3bd;--unknown:#ffe08a;--line:#a6a6a6;--soft:#242424}}' +
  'body{font:16px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg);margin:0;padding:16px;max-width:64rem}' +
  'h1,h2,h3{line-height:1.25}h2{margin-top:2.5rem;border-top:2px solid var(--line);padding-top:1rem}' +
  'code{overflow-wrap:anywhere}li,p,td,th,dd,dt{overflow-wrap:anywhere}' +
  'a{color:var(--link)}a:focus-visible{outline:3px solid var(--link);outline-offset:2px}' +
    'nav a,.top a,.skip,.sources a{display:inline-block;min-height:44px;line-height:44px;padding:0 4px}' +
  'nav ul{list-style:none;padding:0}' +
  'table{border-collapse:collapse;width:100%;table-layout:fixed}' +
  'caption{text-align:left;font-weight:600;padding:4px 0}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}' +
  'thead th{background:var(--soft)}td.n,th.n{text-align:right;width:4.5rem}' +
  'dl.totals{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;max-width:32rem}dl.totals dt{font-weight:600}dl.totals dd{margin:0;text-align:right}' +
  '.entries{padding-left:1.25rem}.entries li{margin-bottom:.5rem}' +
  '.fail strong{color:var(--fail)}.unknown strong{color:var(--unknown)}' +
  '@media print{nav,.top,.skip{display:none}body{max-width:none}h2{break-after:avoid}}';

function checkName(check: string, lang: Lang): string {
  const label = (CHECK_LABELS as Readonly<Record<string, { en: string; fr: string } | undefined>>)[check]?.[lang] ?? check;
  const sc = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[check];
  return sc ? `${label} (WCAG ${sc})` : label;
}

function routeTitle(r: RouteAudit, lang: Lang): string {
  return r.viewportWidth === null ? r.route : `${r.route} (${r.viewportWidth}${lang === 'fr' ? NBSP : ' '}px)`;
}

/**
 * A table with a caption, column headers and a row header. The table has a
 * fixed layout and its text wraps anywhere, so it fits a 320 pixel screen
 * without a sideways scroll and needs no scrolling region.
 */
function dataTable(id: string, caption: string, head: readonly { text: string; num?: boolean }[], rows: readonly (readonly string[])[]): string {
  const out: string[] = [];
  out.push(`<table>\n<caption id="${id}-cap">${escapeHtml(caption)}</caption>`);
  out.push(`<thead><tr>${head.map((h) => `<th scope="col"${h.num ? ' class="n"' : ''}>${escapeHtml(h.text)}</th>`).join('')}</tr></thead>`);
  out.push('<tbody>');
  for (const row of rows) {
    out.push(`<tr>${row.map((cellHtml, i) => (i === 0 ? `<th scope="row">${cellHtml}</th>` : `<td${head[i]?.num ? ' class="n"' : ''}>${cellHtml}</td>`)).join('')}</tr>`);
  }
  out.push('</tbody>\n</table>');
  return out.join('\n');
}

function entryItem(e: Entry, lang: Lang): string {
  return (
    `<li class="${e.status}"><strong>${escapeHtml(statusWord(e, lang))}</strong> ${escapeHtml(checkName(e.check, lang))} ` +
    `<code>${escapeHtml(ruleIdOf(e))}</code> <code>${escapeHtml(e.id)}</code>${colon(lang)} ${escapeHtml(e.message[lang])}</li>`
  );
}

const SECTIONS: readonly { readonly id: string; readonly key: Key }[] = [
  { id: 'summary', key: 'summary' },
  { id: 'criteria', key: 'byCriterion' },
  { id: 'shared', key: 'shared' },
  { id: 'routes', key: 'routes' },
  { id: 'next', key: 'nextSteps' },
  { id: 'scope', key: 'scope' },
];

/** Ids of the section headings of the page, in order. The table of contents links to each one. */
export const DETAIL_HEADING_IDS: readonly string[] = SECTIONS.map((s) => `${s.id}-h`);

function sectionOpen(id: string, key: Key, lang: Lang): string {
  return `<section aria-labelledby="${id}-h">\n<h2 id="${id}-h">${tx(key, lang)}</h2>`;
}

const backToTop = (lang: Lang): string => `<p class="top"><a href="#contents-h">${tx('top', lang)}</a></p>`;

function summarySection(report: AuditReport, lang: Lang): string {
  const t = totals(report.routes);
  const routes = new Set(report.routes.map((r) => r.route)).size;
  const out: string[] = [sectionOpen('summary', 'summary', lang)];
  out.push(`<p>${escapeHtml(report.scopeNote[lang])}</p>`);
  out.push('<dl class="totals">');
  const pair = (key: Key, n: number): void => {
    out.push(`<dt>${tx(key, lang)}</dt><dd>${n}</dd>`);
  };
  pair('routesAudited', routes);
  pair('toFix', t.failed);
  pair('toLook', t.unknown);
  pair('checked', t.checked);
  pair('unmeasured', t.unmeasured);
  out.push('</dl>');
  const levels = byLevel(report).filter((l) => l.level !== 'AAA' || l.failed + l.unknown > 0);
  out.push(
    dataTable(
      'levels',
      T.levelCaption[lang],
      [{ text: T.level[lang] }, { text: T.toFix[lang], num: true }, { text: 'UNKNOWN', num: true }],
      levels.map((l) => [l.level === 'none' ? tx('levelNone', lang) : escapeHtml(`${T.level[lang]} ${l.level}`), String(l.failed), String(l.unknown)]),
    ),
  );
  out.push('</section>');
  return out.join('\n');
}

function criteriaSection(report: AuditReport, lang: Lang): string {
  const rows = byCriterion(report).filter((r) => r.failed + r.unknown > 0);
  const out: string[] = [sectionOpen('criteria', 'byCriterion', lang)];
  if (rows.length === 0) {
    out.push(`<p>${escapeHtml(REPORT_LABELS.none[lang])}</p>`);
  } else {
    out.push(
      dataTable(
        'crit',
        T.criterionCaption[lang],
        [{ text: T.criterion[lang] }, { text: T.checks[lang] }, { text: T.toFix[lang], num: true }, { text: 'UNKNOWN', num: true }],
        rows.map((r) => [
          r.sc === null ? tx('otherChecks', lang) : escapeHtml(criterionLabel(r.sc, lang)),
          r.checks.map((c: CheckId) => `<code>${escapeHtml(c)}</code>`).join(', '),
          String(r.failed),
          String(r.unknown),
        ]),
      ),
    );
  }
  out.push(backToTop(lang), '</section>');
  return out.join('\n');
}

function sharedSection(report: AuditReport, lang: Lang, max: number): string {
  const shared = sharedFindings(report);
  const out: string[] = [sectionOpen('shared', 'shared', lang)];
  if (shared.length === 0) {
    out.push(`<p>${tx('noShared', lang)}</p>`);
  } else {
    const s = summariseClusters(report);
    out.push(
      `<p>${escapeHtml(
        lang === 'fr'
          ? `${s.inShared} des ${s.findings} anomalies viennent de ${s.shared} ${s.shared < 2 ? 'anomalie répétée' : 'anomalies répétées'}. ${T.sharedNote.fr}`
          : `${s.inShared} of the ${s.findings} findings come from ${s.shared} repeated ${s.shared === 1 ? 'finding' : 'findings'}. ${T.sharedNote.en}`,
      )}</p>`,
    );
    const shown = shared.slice(0, max);
    out.push(
      dataTable(
        'rep',
        T.sharedCaption[lang],
        [{ text: T.finding[lang] }, { text: T.status[lang] }, { text: T.onRoutes[lang], num: true }, { text: T.routes[lang] }],
        shown.map((c) => [
          `<code>${escapeHtml(ruleIdOf(c.entry))}</code> <code>${escapeHtml(c.entry.id)}</code>`,
          escapeHtml(statusWord(c.entry, lang)),
          String(c.routes.length),
          c.routes.map((r) => escapeHtml(r)).join(', '),
        ]),
      ),
    );
    if (shared.length > shown.length) {
      out.push(`<p>${escapeHtml(lang === 'fr' ? `Et ${shared.length - shown.length} de plus, dans les routes ci-dessous.` : `And ${shared.length - shown.length} more, in the routes below.`)}</p>`);
    }
  }
  out.push(backToTop(lang), '</section>');
  return out.join('\n');
}

function routesSection(report: AuditReport, lang: Lang): string {
  const out: string[] = [sectionOpen('routes', 'routes', lang)];
  if (report.routes.length === 0) out.push(`<p>${tx('noRoutes', lang)}</p>`);
  report.routes.forEach((r, i) => {
    const t = totals([r]);
    out.push(`<h3 id="route-${i}">${escapeHtml(routeTitle(r, lang))}</h3>`);
    out.push(
      `<p>${escapeHtml(
        lang === 'fr'
          ? `${t.failed} à corriger, ${t.unknown} UNKNOWN, ${t.checked} éléments contrôlés, ${t.unmeasured} non mesurés.`
          : `${t.failed} to fix, ${t.unknown} UNKNOWN, ${t.checked} elements checked, ${t.unmeasured} not measured.`,
      )}</p>`,
    );
    if (r.truncated) out.push(`<p>${tx('truncated', lang)}</p>`);
    if (r.entries.length === 0) {
      out.push(`<p>${tx('noFindings', lang)}</p>`);
    } else {
      const ordered = [...r.entries].sort((a, b) => Number(b.status === 'fail') - Number(a.status === 'fail'));
      out.push('<ul class="entries">', ...ordered.map((e) => entryItem(e, lang)), '</ul>');
    }
  });
  if (report.waived && report.waived.length > 0) {
    out.push(`<h3 id="waived">${tx('waived', lang)}</h3>`, '<ul class="entries">');
    for (const w of report.waived) {
      out.push(
        `<li>${escapeHtml(w.route)} <code>${escapeHtml(ruleIdOf(w.entry))}</code> <code>${escapeHtml(w.entry.id)}</code> ` +
          `(${tx('until', lang)} ${escapeHtml(w.expires)})${colon(lang)} ${escapeHtml(w.reason)}</li>`,
      );
    }
    out.push('</ul>');
  }
  out.push(backToTop(lang), '</section>');
  return out.join('\n');
}

function nextSection(report: AuditReport, lang: Lang): string {
  const items = guidanceForReport(report, lang);
  const out: string[] = [sectionOpen('next', 'nextSteps', lang)];
  if (items.length === 0) {
    out.push(`<p>${tx('noSteps', lang)}</p>`);
  } else {
    out.push(`<p>${tx('handLimit', lang)}</p>`);
    items.forEach((item, i) => {
      out.push(`<h3 id="next-${i}">${escapeHtml(checkName(item.check, lang))}</h3>`);
      out.push(`<p>${escapeHtml(lang === 'fr' ? `${item.failed} à corriger, ${item.unknown} UNKNOWN.` : `${item.failed} to fix, ${item.unknown} UNKNOWN.`)}</p>`);
      out.push(`<p><strong>${tx('who', lang)}${colon(lang)}</strong> ${escapeHtml(item.guidance.who[lang])}</p>`);
      out.push(`<p><strong>${tx('byHand', lang)}${colon(lang)}</strong> ${escapeHtml(item.guidance.byHand[lang])}</p>`);
    });
  }
  out.push(backToTop(lang), '</section>');
  return out.join('\n');
}

function scopeSection(report: AuditReport, lang: Lang): string {
  const out: string[] = [sectionOpen('scope', 'scope', lang)];
  out.push(`<p>${escapeHtml(report.scopeNote[lang])}</p>`);
  if (report.skipped && report.skipped.length > 0) {
    out.push(`<p>${tx('skipped', lang)}${colon(lang)} ${escapeHtml(report.skipped.map((c) => CHECK_LABELS[c][lang]).join(', '))}</p>`);
  }
  out.push('<ul class="sources">');
  for (const ref of report.references) {
    out.push(`<li>${escapeHtml(ref.title)}, ${escapeHtml(ref.date)}, <a href="${escapeHtml(ref.url)}">${escapeHtml(ref.url)}</a></li>`);
  }
  out.push('</ul>');
  out.push(`<p>${escapeHtml(`${report.tool.name} ${report.tool.version}`)}</p>`);
  out.push(backToTop(lang), '</section>');
  return out.join('\n');
}

export interface DetailOptions {
  /** Repeated findings shown in the table. The rest stay listed under their routes. */
  readonly maxShared?: number;
}

export const DEFAULT_MAX_SHARED = 25;

/** The detailed report as one HTML page. */
export function renderDetail(report: AuditReport, lang: Lang, options: DetailOptions = {}): string {
  const maxShared = Math.max(1, Math.floor(options.maxShared ?? DEFAULT_MAX_SHARED));
  const t = totals(report.routes);
  const head =
    `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${tx('title', lang)}</title>\n<style>${DETAIL_CSS}</style>\n</head>\n<body>\n`;
  const out: string[] = [head];
  out.push(`<a class="skip" href="#summary-h">${tx('skip', lang)}</a>`);
  out.push('<header>');
  out.push(`<h1>${tx('title', lang)}</h1>`);
  out.push(`<p>${escapeHtml(REPORT_LABELS.generated[lang])} <time datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(report.generatedAt)}</time></p>`);
  out.push(
    `<p>${escapeHtml(
      lang === 'fr' ? `${t.failed} à corriger, ${t.unknown} UNKNOWN, sur ${report.routes.length} routes auditées.` : `${t.failed} to fix, ${t.unknown} UNKNOWN, on ${report.routes.length} routes audited.`,
    )}</p>`,
  );
  out.push('</header>');
  out.push(`<nav aria-labelledby="contents-h">\n<h2 id="contents-h">${tx('contents', lang)}</h2>\n<ul>`);
  for (const s of SECTIONS) out.push(`<li><a href="#${s.id}-h">${tx(s.key, lang)}</a></li>`);
  out.push('</ul>\n</nav>');
  out.push('<main>');
  out.push(summarySection(report, lang), criteriaSection(report, lang), sharedSection(report, lang, maxShared), routesSection(report, lang), nextSection(report, lang), scopeSection(report, lang));
  out.push('</main>\n</body>\n</html>\n');
  return out.join('\n');
}
