import { describe, expect, it } from "vitest";
import { APPROVED_CLAIMS } from "./claims";
import type { Purpose } from "./consent";
import { createEgressPolicy } from "./egress";
import { FIXTURE } from "./fixtures.test-util";
import type { InventoryEntry } from "./inventory";
import { NO_SERVER_POLICY, assertPolicy, checkPolicy } from "./policy";

const guard = createEgressPolicy({ selfOrigin: "https://app.example.ca", allowedOrigins: ["https://data.example.ca"] });
const clean: InventoryEntry[] = [FIXTURE[0] as InventoryEntry, FIXTURE[2] as InventoryEntry];
const purpose: Purpose = {
  id: "remember-places",
  wordingVersion: 1,
  label: { en: "Remember places", fr: "Mémoriser les lieux" },
  description: { en: "Keep saved places on this device.", fr: "Garder les lieux enregistrés sur cet appareil." },
};
const input = { policy: NO_SERVER_POLICY, inventory: clean, purposes: [purpose], egress: guard };

describe("checkPolicy", () => {
  it("is silent when no policy is declared", () => {
    expect(checkPolicy({ ...input, policy: undefined, egress: undefined, inventory: FIXTURE })).toEqual([]);
  });
  it("accepts a configuration that matches the policy", () => {
    expect(checkPolicy(input)).toEqual([]);
    expect(() => assertPolicy(input)).not.toThrow();
  });
  it("is a frozen no-server policy", () => {
    expect(Object.isFrozen(NO_SERVER_POLICY)).toBe(true);
    expect(NO_SERVER_POLICY.contributions).toBe("export-only");
  });
  it("reports a missing guard", () => {
    expect(checkPolicy({ ...input, egress: undefined }).map((p) => p.code)).toEqual(["no-guard"]);
  });
  it("reports a guard that allows uploads", () => {
    const open = createEgressPolicy({ selfOrigin: "https://app.example.ca", allowUpload: true });
    expect(checkPolicy({ ...input, egress: open }).map((p) => p.code)).toEqual(["upload-allowed"]);
  });
  it("reports an entry that is sent to a server", () => {
    const p = checkPolicy({ ...input, inventory: FIXTURE });
    expect(p).toContainEqual(expect.objectContaining({ code: "server-entry", where: "feedback-note" }));
  });
  it("reports unapproved claim wording in an entry, in either language, with where it is", () => {
    const e: InventoryEntry = { ...(FIXTURE[0] as InventoryEntry), purpose: { en: "Synced across devices", fr: "Garder sur un serveur" } };
    const p = checkPolicy({ ...input, inventory: [e] });
    expect(p.map((x) => x.where)).toEqual(["saved-places.purpose.en", "saved-places.purpose.fr"]);
    expect(p.every((x) => x.code === "claim-wording")).toBe(true);
  });
  it("reports unapproved claim wording in a purpose", () => {
    const bad: Purpose = { ...purpose, description: { en: "We upload your notes.", fr: purpose.description.fr } };
    expect(checkPolicy({ ...input, purposes: [bad] }).map((x) => x.where)).toEqual(["remember-places.description.en"]);
  });
  it("lets the approved no-accounts sentence stand", () => {
    const ok: Purpose = { ...purpose, description: { en: APPROVED_CLAIMS.en[0] as string, fr: APPROVED_CLAIMS.fr[0] as string } };
    expect(checkPolicy({ ...input, purposes: [ok] })).toEqual([]);
  });
  it("throws one message that lists every problem", () => {
    expect(() => assertPolicy({ ...input, egress: undefined, inventory: FIXTURE })).toThrow(/no-guard[\s\S]*server-entry/);
  });
});
