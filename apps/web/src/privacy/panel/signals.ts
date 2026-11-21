// What the browser says about privacy and storage. Each answer is Yes, No or
// Unknown. A missing or unreadable answer is Unknown; it is never turned into No.

export type Tri = "yes" | "no" | "unknown";

export interface SignalHost {
  navigator?: {
    globalPrivacyControl?: unknown;
    doNotTrack?: unknown;
    cookieEnabled?: unknown;
    storage?: {
      persisted?: () => Promise<boolean>;
      estimate?: () => Promise<{ usage?: number; quota?: number }>;
    };
  };
  isSecureContext?: unknown;
}

export interface Signals {
  /** Global Privacy Control */
  gpc: Tri;
  /** Do Not Track */
  dnt: Tri;
  cookies: Tri;
  secureContext: Tri;
  /** The browser keeps this site's storage even when space is low */
  persistent: Tri;
  usageBytes: number | null;
  quotaBytes: number | null;
}

const bool = (v: unknown): Tri => (v === true ? "yes" : v === false ? "no" : "unknown");

export function dntSignal(v: unknown): Tri {
  if (v === "1" || v === 1 || v === "yes") return "yes";
  if (v === "0" || v === 0 || v === "no") return "no";
  return "unknown";
}

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

async function attempt<T>(f: (() => Promise<T>) | undefined): Promise<T | undefined> {
  if (f === undefined) return undefined;
  try {
    return await f();
  } catch {
    return undefined;
  }
}

export async function readSignals(host: SignalHost): Promise<Signals> {
  const nav = host.navigator;
  const storage = nav?.storage;
  const persisted = await attempt(storage?.persisted === undefined ? undefined : () => storage.persisted!());
  const est = await attempt(storage?.estimate === undefined ? undefined : () => storage.estimate!());
  return {
    gpc: bool(nav?.globalPrivacyControl),
    dnt: dntSignal(nav?.doNotTrack),
    cookies: bool(nav?.cookieEnabled),
    secureContext: bool(host.isSecureContext),
    persistent: bool(persisted),
    usageBytes: count(est?.usage),
    quotaBytes: count(est?.quota),
  };
}
