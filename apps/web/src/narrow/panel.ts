import { renderSarif } from './ci.js';
import { escapeHtml, renderBody, renderJson, type AuditReport } from './report.js';
import { selfAudit } from './run.js';
import type { Lang } from './types.js';

/** The few DOM members the panel needs, so it can be driven without a browser. */
export interface PanelRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void } | null;
}

export interface PanelOptions {
  readonly root: PanelRoot;
  readonly lang: Lang;
  /** Produces the report. Defaults to auditing the current document. */
  readonly run?: () => Promise<AuditReport> | AuditReport;
  readonly now?: () => Date;
  /** Puts text on the clipboard. Defaults to the browser clipboard when there is one. */
  readonly copy?: (text: string) => Promise<void>;
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly report: AuditReport }
  | { readonly kind: 'error'; readonly message: string };

const TEXT = {
  title: { en: 'Narrow-screen audit', fr: 'Audit écran étroit' },
  intro: {
    en: 'Checks this page at its current width. Narrow the window to 320 CSS pixels to test reflow.',
    fr: 'Contrôle cette page à sa largeur actuelle. Réduisez la fenêtre à 320 pixels CSS pour tester la réorganisation.',
  },
  run: { en: 'Run audit', fr: 'Lancer l’audit' },
  idle: { en: 'No audit has been run yet.', fr: 'Aucun audit n’a encore été lancé.' },
  running: { en: 'Running the audit…', fr: 'Audit en cours…' },
  error: { en: 'The audit could not run', fr: 'L’audit n’a pas pu s’exécuter' },
  switchTo: { en: 'Français', fr: 'English' },
  copyJson: { en: 'Copy report (JSON)', fr: 'Copier le rapport (JSON)' },
  copySarif: { en: 'Copy report (SARIF)', fr: 'Copier le rapport (SARIF)' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser.', fr: 'La copie n’est pas disponible dans ce navigateur.' },
  copyFailed: { en: 'Copying failed.', fr: 'La copie a échoué.' },
} as const;

export function renderPanel(lang: Lang, state: State, notice = ''): string {
  const other: Lang = lang === 'en' ? 'fr' : 'en';
  let status: string;
  let body = '';
  switch (state.kind) {
    case 'idle':
      status = TEXT.idle[lang];
      break;
    case 'running':
      status = TEXT.running[lang];
      break;
    case 'error':
      status = `${TEXT.error[lang]}${lang === 'fr' ? '\u00A0' : ''}: ${state.message}`;
      break;
    case 'done':
      status = notice;
      body =
        `<p><button type="button" data-action="copy-json" style="min-height:44px;min-width:44px">${escapeHtml(TEXT.copyJson[lang])}</button> ` +
        `<button type="button" data-action="copy-sarif" style="min-height:44px;min-width:44px">${escapeHtml(TEXT.copySarif[lang])}</button></p>` +
        renderBody(state.report, lang);
      break;
  }
  return (
    `<h1>${escapeHtml(TEXT.title[lang])}</h1>` +
    `<p>${escapeHtml(TEXT.intro[lang])}</p>` +
    `<p><button type="button" data-action="run" style="min-height:44px;min-width:44px">${escapeHtml(TEXT.run[lang])}</button> ` +
    `<button type="button" data-action="lang-${other}" lang="${other}" style="min-height:44px;min-width:44px">${escapeHtml(TEXT.switchTo[lang])}</button></p>` +
    `<div role="status" aria-live="polite">${escapeHtml(status)}</div>` +
    `<div>${body}</div>`
  );
}

/**
 * Mounts the panel. Re-rendering replaces the markup, so focus is put back on
 * the button that was activated, which keeps keyboard use working.
 */
export function mountNarrowPanel(opts: PanelOptions): { getLang(): Lang } {
  let lang = opts.lang;
  let state: State = { kind: 'idle' };
  let notice = '';
  const run = opts.run ?? (() => selfAudit((opts.now ?? (() => new Date()))()));

  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard =
    opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;

  const render = (focusAction?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderPanel(lang, state, notice);
    if (focusAction) opts.root.querySelector?.(`[data-action="${focusAction}"]`)?.focus?.();
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if ((action === 'copy-json' || action === 'copy-sarif') && state.kind === 'done') {
      const report = state.report;
      const text = action === 'copy-json' ? renderJson(report) : renderSarif(report);
      if (!hasClipboard) {
        notice = TEXT.noClipboard[lang];
        render(action);
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          notice = TEXT.copied[lang];
        } catch {
          notice = TEXT.copyFailed[lang];
        }
        render(action);
      })();
    } else if (action === 'lang-en' || action === 'lang-fr') {
      lang = action === 'lang-fr' ? 'fr' : 'en';
      notice = '';
      render(`lang-${lang === 'fr' ? 'en' : 'fr'}`);
    } else if (action === 'run' && state.kind !== 'running') {
      state = { kind: 'running' };
      notice = '';
      render('run');
      void (async (): Promise<void> => {
        try {
          state = { kind: 'done', report: await run() };
        } catch (err) {
          state = { kind: 'error', message: err instanceof Error ? err.message : String(err) };
        }
        render('run');
      })();
    }
  });
  render();
  return { getLang: () => lang };
}

/** Route descriptor for the app shell to register. */
export const narrowRoute = {
  path: '/dev/narrow',
  title: TEXT.title,
  mount: mountNarrowPanel,
} as const;
