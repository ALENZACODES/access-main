import type { Finding, LocalizedText } from './audit.js';
import { describeFinding } from './audit.js';
import {
  CHECK_LABELS,
  CHECK_ORDER,
  CHECK_SC,
  NBSP,
  type CheckId,
  type CheckResult,
  type Entry,
  type Lang,
} from './types.js';

export interface Reference {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  /** Publication date of the referenced version. */
  readonly date: string;
}

/** Where the thresholds and criteria used by these checks come from. */
export const REFERENCES: readonly Reference[] = [
  {
    id: 'wcag22',
    title: 'Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation',
    url: 'https://www.w3.org/TR/WCAG22/',
    date: '2023-10-05',
  },
];

export const SCOPE_NOTE: LocalizedText = {
  en: 'Automated checks cover only some WCAG 2.2 success criteria. A clean result is not a conformance statement.',
  fr: 'Les contrôles automatisés ne couvrent qu’une partie des critères de réussite des WCAG 2.2. Un résultat sans anomalie n’est pas une déclaration de conformité.',
};

export interface CheckSummary {
  readonly check: CheckId;
  readonly checked: number;
  readonly failed: number;
  readonly unknown: number;
}

export interface RouteAudit {
  readonly route: string;
  /** null for checks that are not tied to a page width (the string check). */
  readonly viewportWidth: number | null;
  readonly checks: readonly CheckSummary[];
  readonly entries: readonly Entry[];
  /** Controls that were hidden or had no size, so were not measured. */
  readonly unmeasured: number;
  readonly truncated: boolean;
}

/** A failure that a dated waiver covers. It is listed, not hidden. */
export interface WaivedItem {
  readonly route: string;
  readonly entry: Entry;
  readonly reason: string;
  readonly expires: string;
}

export interface AuditReport {
  readonly generatedAt: string;
  readonly tool: { readonly name: string; readonly version: string };
  readonly routes: readonly RouteAudit[];
  readonly scopeNote: LocalizedText;
  readonly references: readonly Reference[];
  readonly waived?: readonly WaivedItem[];
  /** Checks that were switched off for this run. */
  readonly skipped?: readonly CheckId[];
}

export const TOOL = { name: 'narrow-audit', version: '0.2.0' } as const;

/** Maps the 320px and 44px findings of audit.ts onto report entries. */
export function entriesFromFindings(findings: readonly Finding[]): { reflow: CheckResult['entries']; targets: CheckResult['entries'] } {
  const reflow: Entry[] = [];
  const targets: Entry[] = [];
  for (const f of findings) {
    const entry: Entry = {
      check: f.kind === 'target-too-small' ? 'target-size' : 'reflow',
      id: f.id,
      status: 'fail',
      message: describeFinding(f),
    };
    (f.kind === 'target-too-small' ? targets : reflow).push(entry);
  }
  return { reflow, targets };
}

export function buildRouteAudit(
  route: string,
  viewportWidth: number | null,
  results: Partial<Record<CheckId, CheckResult>>,
  unmeasured = 0,
  truncated = false,
): RouteAudit {
  const checks: CheckSummary[] = [];
  const entries: Entry[] = [];
  for (const check of CHECK_ORDER) {
    const r = results[check];
    if (!r) continue;
    checks.push({
      check,
      checked: r.checked,
      failed: r.entries.filter((e) => e.status === 'fail').length,
      unknown: r.entries.filter((e) => e.status === 'unknown').length,
    });
    entries.push(...r.entries);
  }
  return { route, viewportWidth, checks, entries, unmeasured, truncated };
}

export function addCheck(audit: RouteAudit, check: CheckId, result: CheckResult): RouteAudit {
  const rebuilt: Partial<Record<CheckId, CheckResult>> = {};
  for (const c of audit.checks) {
    rebuilt[c.check] = { checked: c.checked, entries: audit.entries.filter((e) => e.check === c.check) };
  }
  rebuilt[check] = result;
  return buildRouteAudit(audit.route, audit.viewportWidth, rebuilt, audit.unmeasured, audit.truncated);
}

export function makeReport(routes: readonly RouteAudit[], now: Date): AuditReport {
  return { generatedAt: now.toISOString(), tool: TOOL, routes, scopeNote: SCOPE_NOTE, references: REFERENCES };
}

export interface Totals {
  readonly checked: number;
  readonly failed: number;
  readonly unknown: number;
  readonly unmeasured: number;
}

export function totals(routes: readonly RouteAudit[]): Totals {
  let checked = 0;
  let failed = 0;
  let unknown = 0;
  let unmeasured = 0;
  for (const r of routes) {
    unmeasured += r.unmeasured;
    for (const c of r.checks) {
      checked += c.checked;
      failed += c.failed;
      unknown += c.unknown;
    }
  }
  return { checked, failed, unknown, unmeasured };
}

const L = {
  title: { en: 'Narrow-screen audit', fr: 'Audit écran étroit' },
  generated: { en: 'Generated', fr: 'Généré le' },
  fail: { en: 'FAIL', fr: 'À CORRIGER' },
  unknown: { en: 'UNKNOWN', fr: 'UNKNOWN' },
  failed: { en: 'to fix', fr: 'à corriger' },
  unknownN: { en: 'unknown', fr: 'UNKNOWN' },
  checked: { en: 'checked', fr: 'contrôlés' },
  unmeasured: { en: 'not measured (hidden or no size)', fr: 'non mesurés (masqués ou sans taille)' },
  truncated: { en: 'Only the first elements were read on this page.', fr: 'Seuls les premiers éléments de cette page ont été lus.' },
  none: { en: 'No findings.', fr: 'Aucune anomalie.' },
  sources: { en: 'Sources', fr: 'Sources' },
  criterion: { en: 'WCAG', fr: 'WCAG' },
  stringsRoute: { en: 'Strings', fr: 'Chaînes' },
  waived: { en: 'Failures covered by a waiver', fr: 'Anomalies couvertes par une dérogation' },
  until: { en: 'until', fr: 'jusqu’au' },
  skipped: { en: 'Checks not run in this run, so nothing is said about them', fr: 'Contrôles non exécutés, aucun résultat à leur sujet' },
} as const;

const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

function checkTitle(check: CheckId, lang: Lang): string {
  const sc = CHECK_SC[check];
  return sc ? `${CHECK_LABELS[check][lang]} (${L.criterion[lang]} ${sc})` : CHECK_LABELS[check][lang];
}

function ruleTag(e: Entry): string {
  return e.rule ? ` [${e.rule}]` : '';
}

function routeHeading(r: RouteAudit, lang: Lang): string {
  return r.viewportWidth === null ? `${r.route}` : `${r.route} (${r.viewportWidth}${lang === 'fr' ? NBSP : ''}px)`;
}

function counts(c: { failed: number; unknown: number; checked: number }, lang: Lang): string {
  return `${c.failed} ${L.failed[lang]}, ${c.unknown} ${L.unknownN[lang]}, ${c.checked} ${L.checked[lang]}`;
}

export function renderText(report: AuditReport, lang: Lang): string {
  const lines: string[] = [];
  lines.push(`${L.title[lang]}`);
  lines.push(`${L.generated[lang]} ${report.generatedAt}`);
  lines.push(report.scopeNote[lang]);
  for (const r of report.routes) {
    const agg = totals([r]);
    lines.push('');
    lines.push(`${routeHeading(r, lang)}${colon(lang)} ${counts(agg, lang)}, ${agg.unmeasured} ${L.unmeasured[lang]}`);
    if (r.truncated) lines.push(`  ${L.truncated[lang]}`);
    if (r.entries.length === 0) lines.push(`  ${L.none[lang]}`);
    for (const e of r.entries) {
      lines.push(`  [${L[e.status][lang]}] ${checkTitle(e.check, lang)}${ruleTag(e)} ${e.id}${colon(lang)} ${e.message[lang]}`);
    }
  }
  if (report.waived && report.waived.length > 0) {
    lines.push('');
    lines.push(`${L.waived[lang]}${colon(lang)} ${report.waived.length}`);
    for (const w of report.waived) {
      lines.push(`  ${w.route} ${checkTitle(w.entry.check, lang)}${ruleTag(w.entry)} ${w.entry.id} (${L.until[lang]} ${w.expires})${colon(lang)} ${w.reason}`);
    }
  }
  if (report.skipped && report.skipped.length > 0) {
    lines.push('');
    lines.push(`${L.skipped[lang]}${colon(lang)} ${report.skipped.map((c) => CHECK_LABELS[c][lang]).join(', ')}`);
  }
  lines.push('');
  lines.push(`${L.sources[lang]}${colon(lang)}`);
  for (const ref of report.references) lines.push(`  ${ref.title}, ${ref.date}, ${ref.url}`);
  return lines.join('\n') + '\n';
}

export function renderJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The report as HTML fragments without page chrome. Used by the page and the in-app panel. */
export function renderBody(report: AuditReport, lang: Lang): string {
  const out: string[] = [];
  out.push(`<p>${escapeHtml(report.scopeNote[lang])}</p>`);
  report.routes.forEach((r, i) => {
    const agg = totals([r]);
    out.push(`<section aria-labelledby="route-${i}">`);
    out.push(`<h2 id="route-${i}">${escapeHtml(routeHeading(r, lang))}</h2>`);
    out.push(`<p>${escapeHtml(counts(agg, lang))}, ${agg.unmeasured} ${escapeHtml(L.unmeasured[lang])}</p>`);
    if (r.truncated) out.push(`<p>${escapeHtml(L.truncated[lang])}</p>`);
    if (r.entries.length === 0) {
      out.push(`<p>${escapeHtml(L.none[lang])}</p>`);
    } else {
      out.push('<ul class="entries">');
      for (const e of r.entries) {
        out.push(
          `<li class="${e.status}"><strong>${escapeHtml(L[e.status][lang])}</strong> ` +
            `${escapeHtml(checkTitle(e.check, lang))}${escapeHtml(ruleTag(e))} <code>${escapeHtml(e.id)}</code>${colon(lang)} ` +
            `${escapeHtml(e.message[lang])}</li>`,
        );
      }
      out.push('</ul>');
    }
    out.push('</section>');
  });
  if (report.skipped && report.skipped.length > 0) {
    out.push(`<h2>${escapeHtml(L.skipped[lang])}</h2><p>${escapeHtml(report.skipped.map((c) => CHECK_LABELS[c][lang]).join(', '))}</p>`);
  }
  if (report.waived && report.waived.length > 0) {
    out.push(`<h2>${escapeHtml(L.waived[lang])}</h2><ul>`);
    for (const w of report.waived) {
      out.push(
        `<li>${escapeHtml(w.route)} ${escapeHtml(checkTitle(w.entry.check, lang))}${escapeHtml(ruleTag(w.entry))} <code>${escapeHtml(w.entry.id)}</code> ` +
          `(${escapeHtml(L.until[lang])} ${escapeHtml(w.expires)})${colon(lang)} ${escapeHtml(w.reason)}</li>`,
      );
    }
    out.push('</ul>');
  }
  out.push(`<h2>${escapeHtml(L.sources[lang])}</h2><ul>`);
  for (const ref of report.references) {
    out.push(`<li>${escapeHtml(ref.title)}, ${escapeHtml(ref.date)}, <a href="${escapeHtml(ref.url)}" style="display:inline-block;min-height:44px;line-height:44px">${escapeHtml(ref.url)}</a></li>`);
  }
  out.push('</ul>');
  return out.join('\n');
}

export const REPORT_CSS =
  'body{font:16px/1.5 system-ui,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:16px;max-width:60rem}' +
  'h1,h2{line-height:1.25}code{overflow-wrap:anywhere}li,p{overflow-wrap:anywhere}' +
  'a{color:#0b4f9c}a:focus-visible,button:focus-visible{outline:3px solid #0b4f9c;outline-offset:2px}' +
  'button{min-height:44px;min-width:44px;padding:8px 16px;font:inherit}' +
  '.entries{padding-left:1.25rem}.fail strong{color:#8a0017}.unknown strong{color:#594300}';

export function renderHtml(report: AuditReport, lang: Lang): string {
  return (
    `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeHtml(L.title[lang])}</title>\n<style>${REPORT_CSS}</style>\n</head>\n<body>\n` +
    `<main>\n<h1>${escapeHtml(L.title[lang])}</h1>\n` +
    `<p>${escapeHtml(L.generated[lang])} ${escapeHtml(report.generatedAt)}</p>\n` +
    `${renderBody(report, lang)}\n</main>\n</body>\n</html>\n`
  );
}

export { L as REPORT_LABELS };
