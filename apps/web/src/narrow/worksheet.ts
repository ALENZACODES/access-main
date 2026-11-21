import { PRINCIPLES } from './criteria.js';
import { COVERAGE_LIMITS, STATE_LABELS, coverageForReport, countStates, manualScript, type ReportCoverageRow, type ScriptOptions } from './coverage.js';
import { DETAIL_CSS } from './detail.js';
import { applyManualLog, describeLook, type ManualLog, type ManualRow } from './manual-log.js';
import { NEED_LABELS } from './manual-steps.js';
import { escapeHtml, REPORT_LABELS, type AuditReport } from './report.js';
import { NBSP, type Lang } from './types.js';
import { principleNumber } from './wcag22.js';

/**
 * A worksheet for the part of an audit that people do: one block per Level A
 * and AA criterion of WCAG 2.2 with what to do, what to look for, what this
 * report already says about the criterion, a box to tick and a place for
 * notes. It is one HTML page with no script, so it opens offline and prints.
 *
 * The page keeps nothing: a ticked box and typed notes are gone when the page
 * is closed, and the page says so. A ticked box records that someone looked.
 * It does not record that the criterion is met.
 */

const T = {
  title: { en: 'By-hand worksheet, WCAG 2.2 Level A and AA', fr: 'Fiche de contrôle à la main, WCAG 2.2 niveaux A et AA' },
  skip: { en: 'Skip to the first criterion', fr: 'Aller au premier critère' },
  contents: { en: 'Contents', fr: 'Sommaire' },
  how: { en: 'How to use this page', fr: 'Comment utiliser cette page' },
  notSaved: {
    en: 'This page saves nothing. A ticked box and typed notes are lost when the page is closed. Print the page, or keep your notes somewhere else.',
    fr: 'Cette page n’enregistre rien. Une case cochée et des notes saisies sont perdues à la fermeture de la page. Imprimez la page, ou gardez vos notes ailleurs.',
  },
  firstLook: {
    en: 'Each step is a first look that finds common problems. A ticked box records that someone looked. It does not record that the criterion is met.',
    fr: 'Chaque étape est un premier regard qui trouve les problèmes courants. Une case cochée note que quelqu’un a regardé. Elle ne note pas que le critère est respecté.',
  },
  doIt: { en: 'Do', fr: 'À faire' },
  look: { en: 'Look for', fr: 'À observer' },
  needs: { en: 'Needs', fr: 'Il faut' },
  report: { en: 'In this report', fr: 'Dans ce rapport' },
  checks: { en: 'Related checks', fr: 'Contrôles liés' },
  noChecks: { en: 'none', fr: 'aucun' },
  byHand: { en: 'By hand, from the log', fr: 'À la main, d’après le journal' },
  looked: { en: 'A person has looked', fr: 'Une personne a regardé' },
  notes: { en: 'Notes for', fr: 'Notes pour' },
  none: { en: 'No step matches these options.', fr: 'Aucune étape ne correspond à ces options.' },
  top: { en: 'Back to the contents', fr: 'Retour au sommaire' },
  level: { en: 'Level', fr: 'Niveau' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

export const WORKSHEET_CSS =
  DETAIL_CSS +
  'article{border:1px solid var(--line);padding:8px 16px;margin:16px 0}article h3{margin-top:8px}' +
  'dl.step{margin:0}dl.step dt{font-weight:600;margin-top:8px}dl.step dd{margin:0}' +
  '.tick{display:flex;align-items:center;gap:8px;min-height:44px;margin-top:8px}' +
  '.tick input{width:44px;height:44px;margin:0;flex:none;accent-color:var(--link)}' +
  '.tick input:focus-visible,textarea:focus-visible{outline:3px solid var(--link);outline-offset:2px}' +
  'label.notes{display:block;font-weight:600;margin-top:8px}' +
  'textarea{display:block;box-sizing:border-box;width:100%;min-height:5.5rem;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);padding:8px}' +
  '@media print{article{break-inside:avoid}textarea{min-height:7rem}}';

/** The id of the block of a criterion: `sc-1-4-10`. */
export const blockId = (sc: string): string => `sc-${sc.replace(/\./g, '-')}`;

function reportLine(row: ReportCoverageRow, lang: Lang): string {
  const fr = lang === 'fr';
  const state = STATE_LABELS[row.state][lang];
  if (row.state === 'found') return fr ? `${state}${colon(lang)} ${row.failed} à corriger, ${row.unknown} UNKNOWN` : `${state}${colon(lang)} ${row.failed} to fix, ${row.unknown} UNKNOWN`;
  return state;
}

export interface WorksheetOptions extends ScriptOptions {
  /** Only criteria the report has a finding for, or whose related checks did not run. */
  readonly onlyOpen?: boolean;
  /** The log of by-hand looks. With it, each block says when a person last looked and what they saw. */
  readonly manual?: { readonly log: ManualLog; readonly now: Date };
}

export interface WorksheetItem {
  readonly sc: string;
  readonly row: ReportCoverageRow;
  readonly action: string;
  readonly look: string;
  readonly needs: string;
  /** The newest by-hand note for the criterion, when a log was given. */
  readonly manual?: ManualRow;
}

/** The blocks of the worksheet for a report, in the order of WCAG. */
export function worksheetItems(report: AuditReport, lang: Lang, options: WorksheetOptions = {}): WorksheetItem[] {
  const coverageRows = coverageForReport(report);
  const rows = new Map(coverageRows.map((r) => [r.criterion.sc, r]));
  const looks = options.manual ? new Map(applyManualLog(coverageRows, options.manual.log, options.manual.now).map((m) => [m.row.criterion.sc, m])) : null;
  const out: WorksheetItem[] = [];
  for (const item of manualScript(options, lang)) {
    const sc = item.row.criterion.sc;
    const row = rows.get(sc);
    if (!row) continue;
    if (options.onlyOpen && row.state === 'nothing-found') continue;
    const manual = looks?.get(sc);
    out.push({ sc, row, action: item.action, look: item.look, needs: NEED_LABELS[item.needs][lang], ...(manual ? { manual } : {}) });
  }
  return out;
}

function block(item: WorksheetItem, lang: Lang): string {
  const c = item.row.criterion;
  const id = blockId(c.sc);
  const name = `${c.sc} ${c[lang]}`;
  const checks = item.row.checks.length > 0 ? item.row.checks.map((x) => `<code>${escapeHtml(x)}</code>`).join(', ') : tx('noChecks', lang);
  return [
    `<article aria-labelledby="${id}-h">`,
    `<h3 id="${id}-h">${escapeHtml(name)} (${tx('level', lang)} ${c.level})</h3>`,
    '<dl class="step">',
    `<dt>${tx('doIt', lang)}</dt><dd>${escapeHtml(item.action)}</dd>`,
    `<dt>${tx('look', lang)}</dt><dd>${escapeHtml(item.look)}</dd>`,
    `<dt>${tx('needs', lang)}</dt><dd>${escapeHtml(item.needs)}</dd>`,
    `<dt>${tx('report', lang)}</dt><dd>${escapeHtml(reportLine(item.row, lang))}</dd>`,
    `<dt>${tx('checks', lang)}</dt><dd>${checks}</dd>`,
    ...(item.manual ? [`<dt>${tx('byHand', lang)}</dt><dd>${escapeHtml(describeLook(item.manual, lang))}</dd>`] : []),
    '</dl>',
    `<label class="tick" for="${id}-looked"><input type="checkbox" id="${id}-looked" name="${id}-looked"> ${tx('looked', lang)}${colon(lang)} ${escapeHtml(name)}</label>`,
    `<label class="notes" for="${id}-notes">${tx('notes', lang)} ${escapeHtml(name)}</label>`,
    `<textarea id="${id}-notes" name="${id}-notes" rows="3" autocomplete="off"></textarea>`,
    '</article>',
  ].join('\n');
}

/** The worksheet as one HTML page. */
export function renderWorksheet(report: AuditReport, lang: Lang, options: WorksheetOptions = {}): string {
  const fr = lang === 'fr';
  const items = worksheetItems(report, lang, options);
  const n = countStates(coverageForReport(report));
  const out: string[] = [
    `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      `<title>${tx('title', lang)}</title>\n<style>${WORKSHEET_CSS}</style>\n</head>\n<body>`,
  ];
  out.push(`<a class="skip" href="#how-h">${tx('skip', lang)}</a>`);
  out.push('<header>', `<h1>${tx('title', lang)}</h1>`);
  out.push(`<p>${escapeHtml(REPORT_LABELS.generated[lang])} <time datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(report.generatedAt)}</time></p>`, '</header>');

  const principles = [...new Set(items.map((i) => principleNumber(i.sc)).filter((p): p is 1 | 2 | 3 | 4 => p !== null))];
  out.push(`<nav aria-labelledby="contents-h">\n<h2 id="contents-h">${tx('contents', lang)}</h2>\n<ul>`);
  out.push(`<li><a href="#how-h">${tx('how', lang)}</a></li>`);
  for (const p of principles) out.push(`<li><a href="#p${p}-h">${p}. ${escapeHtml(PRINCIPLES[p][lang])}</a></li>`);
  out.push('</ul>\n</nav>');

  out.push('<main>');
  out.push(`<section aria-labelledby="how-h">\n<h2 id="how-h">${tx('how', lang)}</h2>`);
  out.push(`<p>${tx('firstLook', lang)}</p>`, `<p>${tx('notSaved', lang)}</p>`, `<p>${escapeHtml(COVERAGE_LIMITS[lang])}</p>`);
  out.push(
    `<p>${escapeHtml(
      fr
        ? `${items.length} critères sur cette page. Dans ce rapport${colon(lang)} ${n.found} avec des anomalies trouvées, ${n['see-checks']} à lire dans les anomalies d’un contrôle lié, ${n['nothing-found']} dont les contrôles n’ont rien trouvé, ${n['not-run']} dont les contrôles n’ont pas été exécutés, ${n['by-hand']} sans aucun contrôle.`
        : `${items.length} criteria on this page. In this report${colon(lang)} ${n.found} with something found, ${n['see-checks']} to read in the findings of a related check, ${n['nothing-found']} whose checks found nothing, ${n['not-run']} whose checks did not run, ${n['by-hand']} with no check at all.`,
    )}</p>`,
  );
  if (items.length === 0) out.push(`<p>${tx('none', lang)}</p>`);
  out.push('</section>');

  for (const p of principles) {
    out.push(`<section aria-labelledby="p${p}-h">\n<h2 id="p${p}-h">${p}. ${escapeHtml(PRINCIPLES[p][lang])}</h2>`);
    for (const item of items.filter((i) => principleNumber(i.sc) === p)) out.push(block(item, lang));
    out.push(`<p class="top"><a href="#contents-h">${tx('top', lang)}</a></p>`, '</section>');
  }
  out.push('</main>\n</body>\n</html>\n');
  return out.join('\n');
}
