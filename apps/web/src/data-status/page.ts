/**
 * Full HTML document for the data-status page (server or build-time rendering).
 * Landmarks: skip link, header with language switch, one h1, main, footer.
 */
import { renderDataStatusPanel, type PanelState } from './panel';
import { describeLoadIssue, type LoadIssue } from './registryLoader';
import { escapeHtml } from './sourceList';
import { otherLocale, switchLocalePath } from './locale';
import { t } from './i18n';

/** Visible focus (3:1 or better on white), readable body text, wrapping tables, no sideways page scroll. */
export const PAGE_CSS =
  'body{margin:0 auto;max-width:72rem;padding:0 16px;font:16px/1.5 system-ui,sans-serif;color:#111827;background:#FFFFFF}' +
  ':focus-visible{outline:3px solid #1D4ED8;outline-offset:2px}' +
  '.ds-skip{position:absolute;left:-9999px}.ds-skip:focus{position:static;display:inline-block;min-height:44px;line-height:44px}' +
  '.ds-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}' +
  'th,td{padding:8px;border:1px solid #4B5563;text-align:left;vertical-align:top}' +
  'a{color:#1D4ED8}';

export interface PageOptions extends PanelState {
  /** Path of this page, used to build the language-switch link. Defaults to "/data-status". */
  pathname?: string;
  loadIssues?: readonly LoadIssue[];
}

export function renderDataStatusPage(opts: PageOptions): string {
  const { locale } = opts;
  const other = otherLocale(locale);
  const title = escapeHtml(t(locale, 'page.title'));
  const switchHref = escapeHtml(switchLocalePath(opts.pathname ?? '/data-status', other));
  const issues = opts.loadIssues ?? [];
  const loadNotice =
    issues.length === 0
      ? ''
      : `<section aria-labelledby="ds-load-title"><h2 id="ds-load-title">${escapeHtml(t(locale, 'page.loadErrors'))}</h2><ul>` +
        issues.map((i) => `<li>${escapeHtml(describeLoadIssue(i, locale))}</li>`).join('') +
        `</ul></section>`;
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>` +
    `<style>${PAGE_CSS}</style></head><body>` +
    `<a class="ds-skip" href="#main">${escapeHtml(t(locale, 'page.skip'))}</a>` +
    `<header><nav aria-label="${title}"><a href="${switchHref}" hreflang="${other}" lang="${other}" ` +
    `style="display:inline-flex;align-items:center;min-width:44px;min-height:44px">${escapeHtml(t(locale, 'page.switchLang'))}</a></nav></header>` +
    `<main id="main" tabindex="-1"><h1>${title}</h1>${loadNotice}` +
    `<div id="data-status" lang="${locale}" role="region" aria-label="${escapeHtml(t(locale, 'qa.title'))}">${renderDataStatusPanel(opts)}</div></main>` +
    `<footer><p>${escapeHtml(t(locale, 'page.footer'))}</p></footer></body></html>`
  );
}
