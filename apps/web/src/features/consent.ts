import { loadFeaturePackage } from "./packages.ts";

export type ConsentCheck = "granted" | "denied" | "unavailable";

/** Fail closed. Never treat missing storage, engine methods or errors as permission. */
export async function consentStatus(purpose: string): Promise<ConsentCheck> {
  try {
    const pkg = await loadFeaturePackage("consent");
    if (!pkg || typeof pkg.createConsentEngine !== "function" || typeof pkg.createLocalStorageStore !== "function") {
      return "unavailable";
    }
    const store = (pkg.createLocalStorageStore as (...args: unknown[]) => unknown)();
    const engine = (pkg.createConsentEngine as (opts: unknown) => unknown)({ store }) as Record<string, unknown>;
    // An explicit affirmative decision from the engine is the only authority.
    for (const name of ["hasConsent", "isGranted", "hasGrant"] as const) {
      if (typeof engine[name] === "function") {
        const outcome = await (engine[name] as (p: string) => unknown)(purpose);
        return outcome === true ? "granted" : "denied";
      }
    }
  } catch {
    return "unavailable";
  }
  return "unavailable";
}

export async function consentGranted(purpose: string): Promise<boolean> {
  return (await consentStatus(purpose)) === "granted";
}
