// What the App promises about where data goes, written down once and checked.
// The shell declares the policy; the panel shows the no-server wording only when
// that wording is backed by a configured network guard that blocks uploads, and
// start-up fails if the inventory, the guard or the wording contradict the policy.

import { claimIssues } from "./claims";
import type { EgressPolicy } from "./egress";
import type { InventoryEntry } from "./inventory";
import type { Purpose } from "./consent";

export interface AppPolicy {
  readonly accounts: false;
  readonly telemetry: false;
  readonly upload: false;
  readonly sync: false;
  readonly serverStorage: false;
  /** Contributions are saved on the device and handed over only as an exported file. */
  readonly contributions: "export-only";
}

export const NO_SERVER_POLICY: AppPolicy = Object.freeze({
  accounts: false,
  telemetry: false,
  upload: false,
  sync: false,
  serverStorage: false,
  contributions: "export-only",
});

export type PolicyCode = "server-entry" | "upload-allowed" | "no-guard" | "claim-wording";

export interface PolicyProblem {
  code: PolicyCode;
  where: string;
  detail: string;
}

export interface PolicyInput {
  policy: AppPolicy | undefined;
  inventory: readonly InventoryEntry[];
  purposes: readonly Purpose[];
  egress: EgressPolicy | undefined;
}

export function checkPolicy(i: PolicyInput): PolicyProblem[] {
  if (i.policy === undefined) return [];
  const out: PolicyProblem[] = [];
  if (i.egress === undefined) {
    out.push({ code: "no-guard", where: "egress", detail: "the policy says nothing is sent, but no network guard is configured to enforce it" });
  } else if (i.egress.allowUpload) {
    out.push({ code: "upload-allowed", where: "egress", detail: "the network guard allows sending data to listed addresses" });
  }
  for (const e of i.inventory) {
    if (e.where === "sent-to-server") out.push({ code: "server-entry", where: e.id, detail: "the data list says this is sent to a server" });
    for (const loc of ["en", "fr"] as const) {
      for (const [field, text] of [["label", e.label[loc]], ["purpose", e.purpose?.[loc]], ["keptFor", e.keptFor?.[loc]]] as const) {
        if (text === undefined) continue;
        for (const c of claimIssues(loc, text)) out.push({ code: "claim-wording", where: `${e.id}.${field}.${loc}`, detail: `"${c.term}" in: ${c.sentence}` });
      }
    }
  }
  for (const p of i.purposes) {
    for (const loc of ["en", "fr"] as const) {
      for (const [field, text] of [["label", p.label[loc]], ["description", p.description[loc]]] as const) {
        for (const c of claimIssues(loc, text)) out.push({ code: "claim-wording", where: `${p.id}.${field}.${loc}`, detail: `"${c.term}" in: ${c.sentence}` });
      }
    }
  }
  return out;
}

export function assertPolicy(i: PolicyInput): void {
  const problems = checkPolicy(i);
  if (problems.length > 0) {
    throw new Error(`The privacy policy and the configuration disagree:\n${problems.map((p) => `${p.where}: ${p.code} (${p.detail})`).join("\n")}`);
  }
}
