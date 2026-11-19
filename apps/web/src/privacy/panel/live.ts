// The App's live consent gate. It names what the App saves for a person's own records, the
// purpose that has to be agreed to first, and builds the storage that features should write
// through. Reading is never gated. The person agrees or declines in the privacy panel on
// the About page, which is given the same purposes.

import { loadConsent, type Purpose } from "./consent";
import { gateStorage, validateRules, type GateRule, type GatedStorage } from "./consentGate";
import { safeLocalStorage, type StorageLike } from "./storage";

/** Every storage name the App writes starts with this (the same prefix the panel erases and exports). */
export const PRIVACY_STORAGE_PREFIX = "access.";

/** Where route reports are kept. The route reports page reads and writes this name. */
export const ROUTE_REPORTS_STORAGE_KEY = `${PRIVACY_STORAGE_PREFIX}routeReports.v1`;

export const ROUTE_REPORTS_PURPOSE: Purpose = {
  id: "route-reports",
  label: { en: "Keep my route reports", fr: "Conserver mes signalements de parcours" },
  description: {
    en: "Keep the route reports you write on this device so you can read them again. They are not sent anywhere.",
    fr: "Conserver sur cet appareil les signalements de parcours que vous rédigez, pour les relire. Ils ne sont envoyés nulle part.",
  },
  wordingVersion: 1,
};

export const LIVE_PURPOSES: readonly Purpose[] = [ROUTE_REPORTS_PURPOSE];

export const LIVE_RULES: readonly GateRule[] = [{ purposeId: ROUTE_REPORTS_PURPOSE.id, key: ROUTE_REPORTS_STORAGE_KEY }];

/** Throws if the live rules and purposes disagree. Called once when the module loads. */
export function assertLiveRules(rules: readonly GateRule[] = LIVE_RULES, purposes: readonly Purpose[] = LIVE_PURPOSES): void {
  const problems = validateRules(rules, purposes);
  if (problems.length > 0) throw new Error(`Consent gate rules are wrong: ${problems.map((p) => `${p.code} at ${p.where}`).join("; ")}`);
}

assertLiveRules();

/**
 * Storage for features that save a person's records. The choice is read again on every
 * write, so a choice made in the panel counts straight away. Null when the browser
 * blocks storage.
 */
export function liveStorage(base: StorageLike | null = safeLocalStorage()): GatedStorage | null {
  if (base === null) return null;
  return gateStorage(base, () => loadConsent(base, PRIVACY_STORAGE_PREFIX, LIVE_PURPOSES), LIVE_PURPOSES, LIVE_RULES);
}

export type SaveResult = "saved" | "needs-choice" | "declined" | "no-storage";

/**
 * Saves one value through the gate and says what happened, so the page can tell the
 * person the truth instead of showing "saved".
 */
export function saveGated(storage: GatedStorage | null, key: string, value: string): SaveResult {
  if (storage === null) return "no-storage";
  const before = storage.refused().length;
  storage.setItem(key, value);
  const refused = storage.refused();
  if (refused.length === before) return "saved";
  return refused[refused.length - 1]?.reason === "declined" ? "declined" : "needs-choice";
}
