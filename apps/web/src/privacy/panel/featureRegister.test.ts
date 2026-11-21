import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { checkFeatureRegister, FEATURE_REGISTER, unusedFeatures, usedFeatures, type FeatureRow } from "./featureRegister";

const base: FeatureRow = {
  id: "print",
  used: true,
  path: "apps/web/src/x.ts",
  asks: "no",
  holds: { en: "Printing", fr: "L’impression" },
  why: { en: "To print", fr: "Pour imprimer" },
  source: "Test",
  recordedOn: "2026-11-19",
};
const unusedBase: FeatureRow = { ...base, id: "geolocation", used: false, path: null, why: undefined as never };
delete (unusedBase as { why?: unknown }).why;

describe("FEATURE_REGISTER", () => {
  it("is well formed", () => {
    expect(checkFeatureRegister(FEATURE_REGISTER)).toEqual([]);
  });
  it("has one row per feature id, with used and unused rows both present", () => {
    expect(new Set(FEATURE_REGISTER.map((r) => r.id)).size).toBe(FEATURE_REGISTER.length);
    expect(usedFeatures(FEATURE_REGISTER).length).toBeGreaterThan(5);
    expect(unusedFeatures(FEATURE_REGISTER).length).toBeGreaterThan(5);
    expect(usedFeatures(FEATURE_REGISTER).length + unusedFeatures(FEATURE_REGISTER).length).toBe(FEATURE_REGISTER.length);
  });
  it("never says the App does not use the capabilities that need the person's permission, unless it really is absent", () => {
    for (const id of ["geolocation", "camera-microphone", "notifications", "clipboard-read"]) {
      const r = FEATURE_REGISTER.find((x) => x.id === id);
      expect(r?.used, id).toBe(false);
      expect(r?.asks, id).toBe("yes");
    }
  });
  it("leaves what the App has not confirmed as UNKNOWN, not yes or no", () => {
    expect(FEATURE_REGISTER.find((r) => r.id === "storage-persist")?.asks).toBe("UNKNOWN");
    expect(FEATURE_REGISTER.find((r) => r.id === "sensors")?.asks).toBe("UNKNOWN");
    expect(FEATURE_REGISTER.find((r) => r.id === "credentials")?.asks).toBe("UNKNOWN");
  });
  it("names a header file only on rows that are not used", () => {
    for (const r of FEATURE_REGISTER) if (r.blockedBy !== undefined) expect(r.used, r.id).toBe(false);
  });
  it("passes the copy lint in both languages for every sentence", () => {
    for (const r of FEATURE_REGISTER) {
      for (const l of ["en", "fr"] as const) {
        expect(lintCopy(l, r.holds[l]), `${r.id} holds ${l}`).toEqual([]);
        if (r.why !== undefined) expect(lintCopy(l, r.why[l]), `${r.id} why ${l}`).toEqual([]);
      }
    }
  });
  it("does not name a programming interface in text a person reads", () => {
    const words = /navigator|getUserMedia|serviceWorker|localStorage|createObjectURL|matchMedia|sendBeacon/i;
    for (const r of FEATURE_REGISTER) {
      expect(`${r.holds.en} ${r.holds.fr} ${r.why?.en ?? ""} ${r.why?.fr ?? ""}`, r.id).not.toMatch(words);
    }
  });
});

describe("usedFeatures and unusedFeatures", () => {
  it("split the rows by the used flag and keep their order", () => {
    const rows = [base, unusedBase, { ...base, id: "share" as const }];
    expect(usedFeatures(rows).map((r) => r.id)).toEqual(["print", "share"]);
    expect(unusedFeatures(rows).map((r) => r.id)).toEqual(["geolocation"]);
  });
});

describe("checkFeatureRegister", () => {
  it("accepts a used row with a file and a reason and an unused row with neither", () => {
    expect(checkFeatureRegister([base, unusedBase])).toEqual([]);
  });
  it("catches a row listed twice", () => {
    expect(checkFeatureRegister([base, base])).toEqual(["print: listed twice"]);
  });
  it("catches a used row with no file or no reason", () => {
    expect(checkFeatureRegister([{ ...base, path: null }])).toEqual(["print: used, but no file is named"]);
    const noWhy = { ...base };
    delete (noWhy as { why?: unknown }).why;
    expect(checkFeatureRegister([noWhy])).toEqual(["print: used, but no reason is given"]);
  });
  it("catches an unused row with a file or a reason", () => {
    expect(checkFeatureRegister([{ ...unusedBase, path: "apps/web/src/x.ts" }])).toEqual(["geolocation: not used, but a file is named"]);
    expect(checkFeatureRegister([{ ...unusedBase, why: { en: "x", fr: "x" } }])).toEqual(["geolocation: not used, so it cannot have a reason"]);
  });
  it("catches blank text in either language", () => {
    expect(checkFeatureRegister([{ ...base, holds: { en: " ", fr: "x" } }])).toEqual(["print: holds is empty in one language"]);
    expect(checkFeatureRegister([{ ...base, why: { en: "x", fr: "" } }])).toEqual(["print: why is empty in one language"]);
  });
  it("catches a bad date, a blank source and a bad permission name", () => {
    const out = checkFeatureRegister([{ ...base, recordedOn: "19/11/2026", source: " ", permission: "Bad Name" }]).join("\n");
    expect(out).toContain("recordedOn is not YYYY-MM-DD");
    expect(out).toContain("source is empty");
    expect(out).toContain("permission is not a plain name");
  });
  it("catches a header claim on a used row", () => {
    expect(checkFeatureRegister([{ ...base, blockedBy: "apps/web/src/h.ts" }])).toEqual(["print: used, so its header cannot block it"]);
  });
});
