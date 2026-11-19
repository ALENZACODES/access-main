import { DETAIL_CSS } from './detail.js';
import { escapeHtml, REPORT_LABELS, totals, type AuditReport } from './report.js';
import type { Lang } from './types.js';

/**
 * A page that lists the files one run wrote into `--out`, each with a line
 * on what it is for and who it is for, so that a person who opens the folder
 * knows where to start. It links to the files by their name, so it works
 * from the folder itself, offline.
 */

type Text = { readonly en: string; readonly fr: string };

export interface OutputKind {
  /** Matches the file name inside the output folder. */
  readonly match: RegExp;
  readonly title: Text;
  readonly what: Text;
}

/** The files the command line can write, in the order a person would open them. */
export const OUTPUT_KINDS: readonly OutputKind[] = [
  { match: /^narrow-audit\.detail\.(en|fr)\.html$/, title: { en: 'Detailed report', fr: 'Rapport détaillé' }, what: { en: 'Start here to plan the work: totals, findings by criterion, repeated findings, every route in full.', fr: 'Commencez ici pour planifier le travail\u00A0: totaux, anomalies par critère, anomalies répétées, chaque route en entier.' } },
  { match: /^narrow-audit\.(en|fr)\.html$/, title: { en: 'Report', fr: 'Rapport' }, what: { en: 'Every route with its findings, on one page.', fr: 'Chaque route avec ses anomalies, sur une seule page.' } },
  { match: /^narrow-audit\.worksheet\.(en|fr)\.html$/, title: { en: 'By-hand worksheet', fr: 'Fiche de contrôle à la main' }, what: { en: 'For the person who looks by hand: one step per WCAG 2.2 Level A and AA criterion.', fr: 'Pour la personne qui regarde à la main\u00A0: une étape par critère WCAG 2.2 de niveau A et AA.' } },
  { match: /^narrow-audit\.trend\.(en|fr)\.html$/, title: { en: 'Runs over time', fr: 'Exécutions au fil du temps' }, what: { en: 'A chart and a table of the counts of each run in the history.', fr: 'Un graphique et un tableau des décomptes de chaque exécution de l’historique.' } },
  { match: /^narrow-audit\.coverage\.(en|fr)\.md$/, title: { en: 'Coverage table', fr: 'Tableau de couverture' }, what: { en: 'What the report says for each of the 55 criteria, and which have no check at all.', fr: 'Ce que le rapport dit pour chacun des 55 critères, et lesquels n’ont aucun contrôle.' } },
  { match: /^narrow-audit\.(en|fr)\.md$/, title: { en: 'Report as Markdown', fr: 'Rapport en Markdown' }, what: { en: 'To paste into a pull request or a wiki.', fr: 'À coller dans une demande de fusion ou un wiki.' } },
  { match: /^narrow-audit\.compare\.(en|fr)\.md$/, title: { en: 'Comparison with an earlier report', fr: 'Comparaison avec un rapport antérieur' }, what: { en: 'What is new, what is gone and what changed status since the report given with --compare.', fr: 'Ce qui est nouveau, ce qui a disparu et ce qui a changé de statut depuis le rapport donné avec --compare.' } },
  { match: /^narrow-audit\.review\.(en|fr)\.txt$/, title: { en: 'Worksheet for UNKNOWN findings', fr: 'Fiche pour les anomalies UNKNOWN' }, what: { en: 'The UNKNOWN findings nobody has a recent note for, with the key to copy into the review file.', fr: 'Les anomalies UNKNOWN sans note récente, avec la clé à copier dans le fichier de revue.' } },
  { match: /^narrow-audit\.(en|fr)\.txt$/, title: { en: 'Digest', fr: 'Condensé' }, what: { en: 'A short text summary: totals, the rules and the routes with the most findings.', fr: 'Un court résumé en texte\u00A0: totaux, règles et routes avec le plus d’anomalies.' } },
  { match: /^narrow-audit\.csv$/, title: { en: 'Findings as CSV', fr: 'Anomalies en CSV' }, what: { en: 'One row per finding, for a spreadsheet.', fr: 'Une ligne par anomalie, pour un tableur.' } },
  { match: /^narrow-audit\.json$/, title: { en: 'Report as JSON', fr: 'Rapport en JSON' }, what: { en: 'The full report for tools: --compare, --merge and narrow-audit triage read this file.', fr: 'Le rapport complet pour les outils\u00A0: --compare, --merge et narrow-audit triage lisent ce fichier.' } },
  { match: /^narrow-audit\.sarif$/, title: { en: 'SARIF', fr: 'SARIF' }, what: { en: 'For code scanning tools.', fr: 'Pour les outils d’analyse de code.' } },
  { match: /^narrow-audit\.junit\.xml$/, title: { en: 'JUnit XML', fr: 'XML JUnit' }, what: { en: 'For build servers that show test results.', fr: 'Pour les serveurs de compilation qui affichent des résultats de tests.' } },
];

export const INDEX_FILE = (lang: Lang): string => `index.${lang}.html`;

export interface IndexItem {
  readonly file: string;
  readonly title: string;
  readonly what: string;
}

/** The files of a run in the order of `OUTPUT_KINDS`. A file no kind matches comes last, under its own name. */
export function indexItems(files: readonly string[], lang: Lang): IndexItem[] {
  const names = [...new Set(files.map((f) => f.split('/').pop() ?? f))].filter((n) => !/^index\.(en|fr)\.html$/.test(n));
  const out: IndexItem[] = [];
  const used = new Set<string>();
  for (const kind of OUTPUT_KINDS) {
    for (const name of names) {
      if (used.has(name) || !kind.match.test(name)) continue;
      used.add(name);
      out.push({ file: name, title: kind.title[lang], what: kind.what[lang] });
    }
  }
  for (const name of names) {
    if (!used.has(name)) out.push({ file: name, title: name, what: lang === 'fr' ? 'Fichier écrit par cette exécution.' : 'A file this run wrote.' });
  }
  return out;
}

/** The index page for the files a run wrote. `files` are names or paths inside the output folder. */
export function renderIndexPage(report: AuditReport, files: readonly string[], lang: Lang): string {
  const fr = lang === 'fr';
  const t = totals(report.routes);
  const title = fr ? 'Audit écran étroit, fichiers de cette exécution' : 'Narrow-screen audit, files of this run';
  const items = indexItems(files, lang);
  const out: string[] = [
    `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      `<title>${escapeHtml(title)}</title>\n<style>${DETAIL_CSS}dl.files dt{margin-top:12px}dl.files dt a{display:inline-block;min-height:44px;line-height:44px;font-weight:600}dl.files dd{margin:0}</style>\n</head>\n<body>`,
    '<main>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(REPORT_LABELS.generated[lang])} <time datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(report.generatedAt)}</time></p>`,
    `<p>${escapeHtml(fr ? `${t.failed} à corriger, ${t.unknown} UNKNOWN, sur ${report.routes.length} routes auditées.` : `${t.failed} to fix, ${t.unknown} UNKNOWN, on ${report.routes.length} routes audited.`)}</p>`,
    `<p>${escapeHtml(report.scopeNote[lang])}</p>`,
  ];
  if (items.length === 0) {
    out.push(`<p>${escapeHtml(fr ? 'Cette exécution n’a écrit aucun autre fichier.' : 'This run wrote no other file.')}</p>`);
  } else {
    out.push(`<h2 id="files-h">${escapeHtml(fr ? 'Fichiers' : 'Files')}</h2>`, '<dl class="files">');
    for (const item of items) {
      const name = item.title === item.file ? '' : ` (<code>${escapeHtml(item.file)}</code>)`;
      out.push(`<dt><a href="${escapeHtml(encodeURI(item.file))}">${escapeHtml(item.title)}</a>${name}</dt><dd>${escapeHtml(item.what)}</dd>`);
    }
    out.push('</dl>');
  }
  out.push('</main>\n</body>\n</html>\n');
  return out.join('\n');
}
