import { NBSP, type CheckResult, type Entry } from './types.js';

export type OfflineReason = 'ok' | 'unsupported' | 'no-service-worker' | 'error-page' | 'empty-page' | 'exception';

export interface OfflineResult {
  readonly status: 'pass' | 'fail' | 'unknown';
  readonly reason: OfflineReason;
}

/** Slice of a Playwright Page that the offline check needs. */
export interface OfflinePage {
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}

/** Slice of a Playwright BrowserContext. */
export interface OfflineContext {
  setOffline(offline: boolean): Promise<void>;
}

export const DEFAULT_SW_TIMEOUT_MS = 5000;

/** Runs in the page. Waits for a service worker to become ready, up to timeoutMs. */
export async function swReadyInPage(timeoutMs: number): Promise<'unsupported' | 'ready' | 'timeout'> {
  const g = globalThis as unknown as {
    navigator?: { serviceWorker?: { ready: Promise<unknown> } };
    setTimeout(f: () => void, ms: number): unknown;
  };
  const sw = g.navigator?.serviceWorker;
  if (!sw) return 'unsupported';
  return await Promise.race([
    sw.ready.then(() => 'ready' as const),
    new Promise<'timeout'>((resolve) => {
      g.setTimeout(() => resolve('timeout'), timeoutMs);
    }),
  ]);
}

/** Runs in the page. Looks for a browser error page and counts visible text. */
export function readPageStateInPage(_arg: null): { errorPage: boolean; textLength: number } {
  const doc = (
    globalThis as unknown as {
      document: {
        querySelector(s: string): unknown;
        documentURI?: string;
        body?: { innerText?: string };
      };
    }
  ).document;
  const errorPage =
    doc.querySelector('#main-frame-error') !== null || (doc.documentURI ?? '').startsWith('about:neterror');
  return { errorPage, textLength: (doc.body?.innerText ?? '').trim().length };
}

/**
 * Loads the page online until a service worker is ready, reloads once so the
 * worker controls it, then reloads with the network off. The network is always
 * switched back on. A browser without service workers gives unknown, not pass.
 */
export async function checkOfflineReload(
  page: OfflinePage,
  context: OfflineContext,
  url: string,
  swTimeoutMs: number = DEFAULT_SW_TIMEOUT_MS,
): Promise<OfflineResult> {
  try {
    await page.goto(url);
    const sw = await page.evaluate(swReadyInPage, swTimeoutMs);
    if (sw === 'unsupported') return { status: 'unknown', reason: 'unsupported' };
    if (sw === 'timeout') return { status: 'fail', reason: 'no-service-worker' };
    await page.reload();
  } catch {
    return { status: 'fail', reason: 'exception' };
  }
  try {
    await context.setOffline(true);
    await page.reload();
    const state = await page.evaluate(readPageStateInPage, null);
    if (state.errorPage) return { status: 'fail', reason: 'error-page' };
    if (state.textLength === 0) return { status: 'fail', reason: 'empty-page' };
    return { status: 'pass', reason: 'ok' };
  } catch {
    return { status: 'fail', reason: 'error-page' };
  } finally {
    await context.setOffline(false).catch(() => undefined);
  }
}

export function offlineCheckResult(route: string, r: OfflineResult, swTimeoutMs: number = DEFAULT_SW_TIMEOUT_MS): CheckResult {
  if (r.status === 'pass') return { checked: 1, entries: [] };
  const entry = (status: Entry['status'], en: string, fr: string): Entry => ({
    check: 'offline',
    id: route,
    status,
    message: { en, fr },
  });
  switch (r.reason) {
    case 'unsupported':
      return {
        checked: 1,
        entries: [
          entry(
            'unknown',
            'This browser does not support service workers, so offline loading was not tested.',
            'Ce navigateur ne prend pas en charge les service workers, le chargement hors ligne n’a donc pas été testé.',
          ),
        ],
      };
    case 'no-service-worker':
      return {
        checked: 1,
        entries: [
          entry(
            'fail',
            `No service worker became ready within ${swTimeoutMs} ms, so the page cannot be expected to load offline.`,
            `Aucun service worker n’est devenu actif en ${swTimeoutMs}${NBSP}ms, le chargement hors ligne n’est donc pas possible.`,
          ),
        ],
      };
    case 'empty-page':
      return {
        checked: 1,
        entries: [entry('fail', 'Reloading with the network off showed an empty page.', 'Le rechargement sans réseau a affiché une page vide.')],
      };
    case 'exception':
      return { checked: 1, entries: [entry('fail', 'Loading the page failed before the offline test.', 'Le chargement de la page a échoué avant le test hors ligne.')] };
    default:
      return {
        checked: 1,
        entries: [
          entry(
            'fail',
            'Reloading with the network off showed a browser error page.',
            'Le rechargement sans réseau a affiché une page d’erreur du navigateur.',
          ),
        ],
      };
  }
}
