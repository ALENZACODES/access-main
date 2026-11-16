import { describe, expect, it } from "vitest";
import { APPROVED_CLAIMS, claimIssues } from "./claims";

describe("claimIssues", () => {
  it.each([
    ["en", "Sign in to keep your places."],
    ["en", "Your list is backed up on our servers."],
    ["en", "We sync your notes."],
    ["en", "Stored in the cloud."],
    ["en", "Used for analytics."],
    ["fr", "Ouvrez une session pour garder vos lieux."],
    ["fr", "Vos notes sont synchronisées."],
    ["fr", "Gardé sur nos serveurs."],
    ["fr", "Créez un compte."],
  ] as const)("flags %s: %s", (locale, text) => {
    expect(claimIssues(locale, text)).toHaveLength(1);
  });
  it("names the sentence and the term", () => {
    expect(claimIssues("en", "Saved here. We upload it nightly.")).toEqual([{ sentence: "We upload it nightly.", term: "upload" }]);
  });
  it("accepts the approved sentences, alone or among others", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const s of APPROVED_CLAIMS[locale]) {
        expect(claimIssues(locale, s)).toEqual([]);
        expect(claimIssues(locale, `${s} Autre phrase.`)).toEqual([]);
      }
    }
  });
  it("does not accept a near copy of an approved sentence", () => {
    const s = APPROVED_CLAIMS.en[0] as string;
    expect(claimIssues("en", s.replace("no accounts", "no accounts yet"))).toHaveLength(1);
  });
  it.each([
    ["en", "Saved places stay on this device."],
    ["en", "Counts, discounts and encounters."],
    ["fr", "Les lieux restent sur cet appareil."],
  ] as const)("leaves plain text alone: %s", (locale, text) => {
    expect(claimIssues(locale, text)).toEqual([]);
  });
});
