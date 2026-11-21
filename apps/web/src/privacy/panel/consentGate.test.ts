import { describe, expect, it } from "vitest";
import { setConsent, type ConsentState, type Purpose } from "./consent";
import { gateStorage, removeForPurpose, ruleFor, validateRules, type GateRule } from "./consentGate";
import { createMemoryStorage } from "./storage";

const mk = (id: string, wordingVersion = 1): Purpose => ({
  id,
  label: { en: id, fr: id },
  description: { en: "Keep it on this device", fr: "Garder sur cet appareil" },
  wordingVersion,
});
const PLACES = mk("saved-places");
const HINTS = mk("map-hints");
const RULES: GateRule[] = [
  { purposeId: "saved-places", key: "app.places." , prefix: true },
  { purposeId: "map-hints", key: "app.hints" },
];
const NOW = new Date(2026, 10, 19, 9, 0, 0);
const grant = (s: ConsentState, p: Purpose): ConsentState => setConsent(s, p, "granted", NOW);
const decline = (s: ConsentState, p: Purpose): ConsentState => setConsent(s, p, "declined", NOW);

describe("ruleFor", () => {
  it("prefers an exact rule, then the longest prefix, then nothing", () => {
    const rules: GateRule[] = [
      { purposeId: "a", key: "x." , prefix: true },
      { purposeId: "b", key: "x.long.", prefix: true },
      { purposeId: "c", key: "x.long.one" },
    ];
    expect(ruleFor(rules, "x.long.one")?.purposeId).toBe("c");
    expect(ruleFor(rules, "x.long.two")?.purposeId).toBe("b");
    expect(ruleFor(rules, "x.other")?.purposeId).toBe("a");
    expect(ruleFor(rules, "y")).toBeUndefined();
  });
});

describe("validateRules", () => {
  it("accepts a good list", () => {
    expect(validateRules(RULES, [PLACES, HINTS])).toEqual([]);
  });
  it("reports an unknown purpose, an empty key and a duplicate", () => {
    const bad: GateRule[] = [
      { purposeId: "nope", key: "k" },
      { purposeId: "saved-places", key: "" },
      { purposeId: "saved-places", key: "d" },
      { purposeId: "saved-places", key: "d" },
    ];
    expect(validateRules(bad, [PLACES]).map((p) => p.code)).toEqual(["unknown-purpose", "empty-key", "duplicate-rule"]);
  });
  it("reports an overlap whichever rule comes first", () => {
    const wide: GateRule = { purposeId: "saved-places", key: "app.", prefix: true };
    const narrow: GateRule = { purposeId: "map-hints", key: "app.hints" };
    const narrowPrefix: GateRule = { purposeId: "map-hints", key: "app.hints.", prefix: true };
    for (const rules of [[wide, narrow], [narrow, wide], [wide, narrowPrefix], [narrowPrefix, wide]]) {
      expect(validateRules(rules, [PLACES, HINTS]).map((p) => p.code)).toEqual(["overlap"]);
    }
  });
  it("does not report rules that cannot meet", () => {
    const a: GateRule = { purposeId: "saved-places", key: "app.places.", prefix: true };
    const b: GateRule = { purposeId: "map-hints", key: "app.hints.", prefix: true };
    const c: GateRule = { purposeId: "map-hints", key: "app.hints" };
    expect(validateRules([a, b, c], [PLACES, HINTS])).toEqual([]);
    expect(validateRules([c, b, a], [PLACES, HINTS])).toEqual([]);
  });
  it("reports two purposes that claim the same key", () => {
    const rules: GateRule[] = [
      { purposeId: "saved-places", key: "app.", prefix: true },
      { purposeId: "map-hints", key: "app.hints" },
    ];
    expect(validateRules(rules, [PLACES, HINTS]).map((p) => p.code)).toEqual(["overlap"]);
  });
});

describe("gateStorage", () => {
  function setup(initial: ConsentState = {}): { inner: ReturnType<typeof createMemoryStorage>; gate: ReturnType<typeof gateStorage>; set: (s: ConsentState) => void } {
    let state = initial;
    const inner = createMemoryStorage();
    const gate = gateStorage(inner, () => state, [PLACES, HINTS], RULES);
    return { inner, gate, set: (s) => (state = s) };
  }
  it("writes nothing for a purpose the person has not decided, and says why", () => {
    const { inner, gate } = setup();
    gate.setItem("app.places.1", "secret value");
    expect(inner.getItem("app.places.1")).toBeNull();
    expect(gate.refused()).toEqual([{ key: "app.places.1", purposeId: "saved-places", reason: "no-choice" }]);
    expect(JSON.stringify(gate.refused())).not.toContain("secret value");
  });
  it("writes after agreement and stops after a no", () => {
    const { inner, gate, set } = setup();
    set(grant({}, PLACES));
    gate.setItem("app.places.1", "a");
    expect(inner.getItem("app.places.1")).toBe("a");
    set(decline({}, PLACES));
    gate.setItem("app.places.2", "b");
    expect(inner.getItem("app.places.2")).toBeNull();
    expect(gate.refused().at(-1)?.reason).toBe("declined");
  });
  it("does not let agreement to one purpose open another", () => {
    const { inner, gate, set } = setup();
    set(grant({}, PLACES));
    gate.setItem("app.hints", "x");
    expect(inner.getItem("app.hints")).toBeNull();
  });
  it("treats an old choice as no choice when the wording changed", () => {
    const { inner, gate, set } = setup();
    set(grant({}, PLACES));
    const gate2 = gateStorage(inner, () => grant({}, PLACES), [mk("saved-places", 2), HINTS], RULES);
    gate2.setItem("app.places.1", "a");
    expect(inner.getItem("app.places.1")).toBeNull();
    expect(gate2.refused()[0]?.reason).toBe("no-choice");
    gate.setItem("app.places.1", "a");
    expect(inner.getItem("app.places.1")).toBe("a");
  });
  it("refuses a key whose purpose is not in the list", () => {
    const inner = createMemoryStorage();
    const gate = gateStorage(inner, () => grant({}, PLACES), [HINTS], RULES);
    gate.setItem("app.places.1", "a");
    expect(inner.length).toBe(0);
  });
  it("leaves keys with no rule alone", () => {
    const { inner, gate } = setup();
    gate.setItem("app.language", "fr");
    expect(inner.getItem("app.language")).toBe("fr");
    expect(gate.refused()).toEqual([]);
  });
  it("always lets a person read, list and remove", () => {
    const inner = createMemoryStorage({ "app.places.1": "a" });
    const gate = gateStorage(inner, () => ({}), [PLACES], RULES);
    expect(gate.getItem("app.places.1")).toBe("a");
    expect(gate.length).toBe(1);
    expect(gate.key(0)).toBe("app.places.1");
    gate.removeItem("app.places.1");
    expect(inner.length).toBe(0);
  });
  it("forgets the refused list when told", () => {
    const { gate } = setup();
    gate.setItem("app.hints", "x");
    expect(gate.refused()).toHaveLength(1);
    gate.clearRefused();
    expect(gate.refused()).toEqual([]);
  });
});

describe("removeForPurpose", () => {
  it("removes only what that purpose saved", () => {
    const s = createMemoryStorage({ "app.places.1": "a", "app.places.2": "b", "app.hints": "c", "app.language": "fr" });
    expect(removeForPurpose(s, RULES, "saved-places").sort()).toEqual(["app.places.1", "app.places.2"]);
    expect(s.getItem("app.hints")).toBe("c");
    expect(s.getItem("app.language")).toBe("fr");
    expect(s.getItem("app.places.1")).toBeNull();
  });
  it("does nothing for a purpose with no rules", () => {
    const s = createMemoryStorage({ a: "1" });
    expect(removeForPurpose(s, RULES, "nope")).toEqual([]);
    expect(s.length).toBe(1);
  });
  it("leaves a key that a more specific rule gives to another purpose", () => {
    const rules: GateRule[] = [
      { purposeId: "saved-places", key: "app.", prefix: true },
      { purposeId: "map-hints", key: "app.hints" },
    ];
    const s = createMemoryStorage({ "app.hints": "c", "app.other": "d" });
    expect(removeForPurpose(s, rules, "saved-places")).toEqual(["app.other"]);
    expect(s.getItem("app.hints")).toBe("c");
  });
});
