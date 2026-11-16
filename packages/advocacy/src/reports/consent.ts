/**
 * Consent gate. A report is counted only when the ledger holds exactly one entry for its
 * consent reference, that entry is for the required purpose and version, and its status is
 * "granted". Anything else stops the build; reports are never dropped quietly, because a pack
 * built with and without one person's report would differ by that one person.
 */
import type { AdvocacyReport, ConsentEntry, RequiredPurpose } from "./types.ts";

export const CONSENT_PROBLEMS = ["consent_missing", "consent_revoked", "consent_not_granted", "consent_wrong_purpose", "consent_ambiguous"] as const;
export type ConsentProblem = (typeof CONSENT_PROBLEMS)[number];

export interface ConsentFinding {
  code: ConsentProblem;
  /** Report ids. They stay on the device and never enter a pack. */
  report_ids: string[];
}

export function checkConsent(
  reports: readonly AdvocacyReport[],
  ledger: readonly ConsentEntry[],
  required: RequiredPurpose,
): ConsentFinding[] {
  const byRef = new Map<string, ConsentEntry[]>();
  for (const entry of ledger) {
    const list = byRef.get(entry.ref);
    if (list) list.push(entry);
    else byRef.set(entry.ref, [entry]);
  }
  const found = new Map<ConsentProblem, string[]>();
  const add = (code: ConsentProblem, id: string) => found.set(code, [...(found.get(code) ?? []), id]);
  for (const report of reports) {
    const entries = byRef.get(report.consent_ref) ?? [];
    const entry = entries[0];
    if (!entry) add("consent_missing", report.id);
    else if (entries.length > 1) add("consent_ambiguous", report.id);
    else if (entry.status === "revoked") add("consent_revoked", report.id);
    else if (entry.status !== "granted") add("consent_not_granted", report.id);
    else if (entry.purpose_id !== required.purpose_id || entry.purpose_version !== required.purpose_version) {
      add("consent_wrong_purpose", report.id);
    }
  }
  return CONSENT_PROBLEMS.flatMap((code) => {
    const ids = found.get(code);
    return ids ? [{ code, report_ids: [...ids].sort() }] : [];
  });
}
