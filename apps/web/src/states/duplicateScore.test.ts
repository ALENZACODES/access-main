import { describe, expect, it } from "vitest";
import { DUPLICATE_REASONS, NEAR_M, REASON_WEIGHTS, SIMILAR_NAME, THRESHOLDS, VERY_NEAR_M, addressKeyOf, isCandidate, isStrictness, scorePair, STRICTNESS_LEVELS } from "./duplicateScore";
import { place } from "./placeFixtures";

// 0.001 degrees of latitude is about 111 metres.
const at = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", lat: 43.65, lon: -79.38, ...over });

describe("addressKeyOf", () => {
  it("joins the number and the street as compared", () => {
    expect(addressKeyOf("5 Elm St")).toBe(addressKeyOf("5 elm street"));
    expect(addressKeyOf("5 Elm Street")).not.toBe(addressKeyOf("7 Elm Street"));
    expect(addressKeyOf("5A Elm Street")).toBe("5a elm street");
  });
  it("is null with no street, no number, a box or a corner", () => {
    for (const a of [null, "", "Elm Street", "PO Box 4", "Elm Street & Oak Avenue", "unknown"]) expect(addressKeyOf(a), String(a)).toBeNull();
  });
});

describe("scorePair reasons", () => {
  it("finds the same name through accents, case and an article", () => {
    const s = scorePair(at("a", { name: "Café Étoile" }), at("b", { name: "Le cafe etoile" }));
    expect(s.reasons).toContain("same-name");
    expect(s.nameSimilarity).toBe(1);
  });
  it("finds a similar name when it is a little off", () => {
    const s = scorePair(at("a", { name: "Quesnel Library" }), at("b", { name: "Quesnell Library" }));
    expect(s.reasons).toContain("similar-name");
    expect(s.reasons).not.toContain("same-name");
    expect(s.nameSimilarity!).toBeGreaterThanOrEqual(SIMILAR_NAME);
  });
  it("finds nothing about the name when the names are unlike", () => {
    const s = scorePair(at("a", { name: "Alpha Hall" }), at("b", { name: "Zed Pharmacy" }));
    expect(s.reasons.some((r) => r.endsWith("name"))).toBe(false);
    expect(s.nameSimilarity!).toBeLessThan(SIMILAR_NAME);
  });
  it("finds the same address through a short street type", () => {
    expect(scorePair(at("a", { address: "5 Elm St" }), at("b", { address: "5 elm street" })).reasons).toContain("same-address");
    expect(scorePair(at("a", { address: "5 Elm St" }), at("b", { address: "7 Elm St" })).reasons).not.toContain("same-address");
  });
  it("calls a pair very near or near by distance, never both", () => {
    expect(scorePair(at("a"), at("b", { lat: 43.6502 })).reasons).toContain("very-near");
    const mid = scorePair(at("a"), at("b", { lat: 43.6515 }));
    expect(mid.reasons).toContain("near");
    expect(mid.reasons).not.toContain("very-near");
    const far = scorePair(at("a"), at("b", { lat: 43.66 }));
    expect(far.reasons.some((r) => r === "near" || r === "very-near")).toBe(false);
  });
  it("puts the distance at the limits where the names say", () => {
    expect(VERY_NEAR_M).toBeLessThan(NEAR_M);
    const s = scorePair(at("a"), at("b", { lat: 43.6502 }));
    expect(s.metres!).toBeGreaterThan(20);
    expect(s.metres!).toBeLessThan(VERY_NEAR_M);
  });
  it("finds the same kind, ignoring case and accents", () => {
    expect(scorePair(at("a", { category: "Café" }), at("b", { category: "cafe" })).reasons).toContain("same-kind");
    expect(scorePair(at("a", { category: "cafe" }), at("b", { category: "bar" })).reasons).not.toContain("same-kind");
  });
  it("finds nothing about a part the pack does not give", () => {
    const s = scorePair(at("a", { name: null, address: null, category: null, lat: null, lon: null }), at("b", { name: null, address: null, category: null, lat: null, lon: null }));
    expect(s.reasons).toEqual([]);
    expect(s.score).toBe(0);
    expect(s.metres).toBeNull();
    expect(s.nameSimilarity).toBeNull();
  });
  it("is symmetric", () => {
    const a = at("a", { name: "Quesnel Library", address: "5 Elm St", lat: 43.6502 });
    const b = at("b", { name: "Quesnell Library", address: "5 Elm Street" });
    expect(scorePair(a, b)).toEqual(scorePair(b, a));
  });
  it("lists reasons in a fixed order of kinds", () => {
    const s = scorePair(at("a"), at("b", { lat: 43.6502 }));
    const ranks = s.reasons.map((r) => DUPLICATE_REASONS.indexOf(r));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  });
});

describe("scorePair score", () => {
  it("is the sum of the weights of the reasons, kept at 1", () => {
    const s = scorePair(at("a"), at("b", { lat: 43.6502 }));
    expect(s.score).toBeCloseTo(s.reasons.reduce((n, r) => n + REASON_WEIGHTS[r], 0) > 1 ? 1 : s.reasons.reduce((n, r) => n + REASON_WEIGHTS[r], 0), 3);
    expect(s.score).toBeLessThanOrEqual(1);
  });
  it("rises with each added reason", () => {
    const nameOnly = scorePair(at("a", { address: "1 A St", lat: 43.7, category: "bar" }), at("b", { address: "2 B St", lat: 43.6, category: "shop" })).score;
    const nameAndAddress = scorePair(at("a", { lat: 43.7, category: "bar" }), at("b", { lat: 43.6, category: "shop" })).score;
    expect(nameAndAddress).toBeGreaterThan(nameOnly);
  });
  it("is 1 when everything is alike", () => {
    expect(scorePair(at("a"), at("b")).score).toBe(1);
  });
  it("has weights that add up so name and street together pass every threshold", () => {
    expect(REASON_WEIGHTS["same-name"] + REASON_WEIGHTS["same-address"]).toBeGreaterThanOrEqual(THRESHOLDS.balanced);
  });
});

describe("thresholds at their edges", () => {
  const mk = (score: number, reasons: Parameters<typeof isCandidate>[0]["reasons"]) => ({ score, reasons, metres: null, nameSimilarity: null });
  it("accepts a score exactly at the threshold and not one hair under", () => {
    for (const lv of STRICTNESS_LEVELS) {
      expect(isCandidate(mk(THRESHOLDS[lv], ["same-name"]), lv)).toBe(true);
      expect(isCandidate(mk(THRESHOLDS[lv] - 0.001, ["same-name"]), lv)).toBe(false);
    }
  });
  it("needs a name or street reason whatever the score", () => {
    expect(isCandidate(mk(1, ["very-near", "near", "same-kind"]), "loose")).toBe(false);
    expect(isCandidate(mk(1, ["same-address"]), "strict")).toBe(true);
    expect(isCandidate(mk(1, ["similar-name"]), "strict")).toBe(true);
  });
  it("rounds scores to three places", () => {
    const s = scorePair(at("a", { name: "Quesnel Library" }), at("b", { name: "Quesnell Library" }));
    expect(Math.round(s.score * 1000) / 1000).toBe(s.score);
  });
});

describe("isCandidate", () => {
  it("accepts the same name at the same address", () => {
    for (const lv of STRICTNESS_LEVELS) expect(isCandidate(scorePair(at("a"), at("b")), lv)).toBe(true);
  });
  it("never accepts a pair that is only near and of the same kind", () => {
    const s = scorePair(at("a", { name: "Alpha Hall", address: "1 A St" }), at("b", { name: "Zed Pharmacy", address: "2 B St", lat: 43.6502 }));
    expect(s.reasons).toEqual(["very-near", "same-kind"]);
    for (const lv of STRICTNESS_LEVELS) expect(isCandidate(s, lv)).toBe(false);
  });
  it("is stricter at the strict level than at the loose level", () => {
    const s = scorePair(at("a", { name: "Quesnel Library", address: "1 A St", lat: 43.7 }), at("b", { name: "Quesnell Library", address: "2 B St", lat: 43.6, category: "bar" }));
    expect(isCandidate(s, "strict")).toBe(false);
    expect(THRESHOLDS.strict).toBeGreaterThan(THRESHOLDS.balanced);
    expect(THRESHOLDS.balanced).toBeGreaterThan(THRESHOLDS.loose);
  });
  it("accepts the same street number with no names when the places are very near", () => {
    const s = scorePair(at("a", { name: null }), at("b", { name: null, lat: 43.6502 }));
    expect(isCandidate(s, "balanced")).toBe(true);
  });
  it("recognises only the three levels", () => {
    expect(isStrictness("loose")).toBe(true);
    expect(isStrictness("lax")).toBe(false);
    expect(isStrictness(undefined)).toBe(false);
  });
});
