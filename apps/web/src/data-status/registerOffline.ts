/** Register the service worker when the browser supports it. Never throws. */
export type RegisterResult = 'registered' | 'unsupported' | 'insecure' | 'failed';

export interface NavigatorLike {
  serviceWorker?: { register(url: string, options?: { scope?: string }): Promise<unknown> };
}

export async function registerOfflineSupport(
  nav: NavigatorLike,
  opts: { scriptUrl: string; isSecureContext: boolean; scope?: string },
): Promise<RegisterResult> {
  if (!nav.serviceWorker) return 'unsupported';
  if (!opts.isSecureContext) return 'insecure';
  try {
    await nav.serviceWorker.register(opts.scriptUrl, opts.scope ? { scope: opts.scope } : undefined);
    return 'registered';
  } catch {
    return 'failed';
  }
}
