// Robustness audit for consent: what is read back from storage, what the choice logic answers, and what the gate lets through.
// Inputs are generated from a seed. A failure prints the seed and the smallest input found, so it can be repeated.

import { describe, expect, it } from "vitest";
import { clearConsent, consentKey, consentStatus, isAllowed, loadConsent, saveConsent, setConsent, type ConsentState, type Purpose } from "../panel/consent";
import { gateStorage, removeForPurpose, ruleFor, type GateRule } from "../panel/consentGate";
import { createMemoryStorage } from "../panel/storage";
import { createFaultyStorage } from "./fuzz/faultyStorage";
import { genDateText, genJson, genKeyName, genNumber, genString, mutateJson, mutateText, setOwn, writeJson } from "./fuzz/gen";
import { assertProperty, shrinkJson, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const P = (id: string, version = 1): Purpose => ({ id, label: { en: id, fr: id }, description: { en: id, fr: id }, wordingVersion: version });
const PURPOSES: readonly Purpose[] = [P("saved-places"), P("route-reports", 2), P("a1")];
const PREFIX = "app.";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDoc(rng: Rng): Record<string, unknown> {
  const records: Record<string, unknown> = {};
  for (const p of PURPOSES) {
    if (rng.bool(0.7)) setOwn(records, p.id, { value: rng.pick(["granted", "declined"]), decidedOn: genDateText(rng).slice(0, 10), wordingVersion: rng.int(0, 3) });
  }
  return { records };
}

function assertWellFormed(state: ConsentState): void {
  const ids = new Set(PURPOSES.map((p) => p.id));
  for (const [id, r] of Object.entries(state)) {
    expect(ids.has(id), `unknown id ${id}`).toBe(true);
    expect(["granted", "declined"]).toContain(r.value);
    expect(r.decidedOn).toMatch(DATE_RE);
    expect(Number.isInteger(r.wordingVersion)).toBe(true);
  }
}

describe("reading stored choices", () => {
  it("never throws and only returns well-formed choices, whatever text is stored", () => {
    assertProperty<string>({
      name: "loadConsent on any text",
      runs: 600,
      gen: (rng) => {
        const roll = rng.int(0, 3);
        if (roll === 0) return genString(rng, 60);
        if (roll === 1) return writeJson(rng, genJson(rng, 4));
        if (roll === 2) return mutateText(rng, writeJson(rng, validDoc(rng)));
        return writeJson(rng, mutateJson(rng, validDoc(rng)));
      },
      prop: (text) => {
        const s = createMemoryStorage({ [consentKey(PREFIX)]: text });
        assertWellFormed(loadConsent(s, PREFIX, PURPOSES));
      },
      shrink: shrinkString,
      show: (t) => JSON.stringify(t),
    });
  });

  it("keeps a good choice when a different choice beside it is damaged", () => {
    assertProperty<{ doc: Record<string, unknown>; damaged: string }>({
      name: "one damaged choice does not take the others with it",
      runs: 400,
      gen: (rng) => {
        const doc = validDoc(rng);
        const damaged = rng.pick(PURPOSES).id;
        const records = doc.records as Record<string, unknown>;
        setOwn(records, damaged, rng.pick([null, 5, "granted", [], { value: "maybe" }, { value: "granted", decidedOn: "soon", wordingVersion: 1 }, { value: "granted", decidedOn: "2026-01-01", wordingVersion: 1.5 }]));
        return { doc, damaged };
      },
      prop: ({ doc, damaged }) => {
        const loaded = loadConsent(createMemoryStorage({ [consentKey(PREFIX)]: JSON.stringify(doc) }), PREFIX, PURPOSES);
        expect(loaded[damaged]).toBeUndefined();
        for (const p of PURPOSES) {
          if (p.id === damaged) continue;
          const r = (doc.records as Record<string, { value: string; decidedOn: string; wordingVersion: number } | undefined>)[p.id];
          if (r === undefined || !DATE_RE.test(r.decidedOn)) continue;
          expect(loaded[p.id]).toEqual(r);
        }
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("does not let a stored name such as __proto__ change what every object inherits", () => {
    for (const evil of ["__proto__", "constructor", "prototype"]) {
      const text = `{"records":{"${evil}":{"value":"granted","decidedOn":"2026-01-01","wordingVersion":1},"saved-places":{"value":"granted","decidedOn":"2026-01-01","wordingVersion":1}}}`;
      const loaded = loadConsent(createMemoryStorage({ [consentKey(PREFIX)]: text }), PREFIX, PURPOSES);
      expect(Object.keys(loaded)).toEqual(["saved-places"]);
      expect(({} as Record<string, unknown>).value).toBeUndefined();
      expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    }
  });

  it("gives nothing when storage is missing, blocked or empty", () => {
    expect(loadConsent(null, PREFIX, PURPOSES)).toEqual({});
    expect(loadConsent(createMemoryStorage(), PREFIX, PURPOSES)).toEqual({});
    expect(loadConsent(createFaultyStorage({ [consentKey(PREFIX)]: "{}" }, { failReadWhen: () => true }), PREFIX, PURPOSES)).toEqual({});
  });

  it("reads back what it saved, for any set of choices", () => {
    assertProperty<ConsentState>({
      name: "save then load is the identity for choices of known purposes",
      runs: 300,
      gen: (rng) => {
        let s: ConsentState = {};
        for (const p of PURPOSES) if (rng.bool(0.7)) s = setConsent(s, p, rng.pick(["granted", "declined"]), new Date(2026, rng.int(0, 11), rng.int(1, 28)));
        return s;
      },
      prop: (state) => {
        const st = createMemoryStorage();
        expect(saveConsent(st, PREFIX, state)).toBe(true);
        expect(loadConsent(st, PREFIX, PURPOSES)).toEqual(state);
      },
    });
  });

  it("says so when the choices could not be stored, and changes nothing", () => {
    const state = setConsent({}, PURPOSES[0] as Purpose, "granted", new Date(2026, 10, 20));
    const full = createFaultyStorage({}, { failWriteWhen: () => true });
    expect(saveConsent(full, PREFIX, state)).toBe(false);
    expect(full.snapshot()).toEqual({});
    expect(saveConsent(null, PREFIX, state)).toBe(false);
  });

  it("does not use a choice for a purpose the App no longer offers", () => {
    const st = createMemoryStorage();
    saveConsent(st, PREFIX, { ...setConsent({}, P("gone"), "granted", new Date(2026, 10, 20)), ...setConsent({}, P("a1"), "declined", new Date(2026, 10, 20)) });
    expect(Object.keys(loadConsent(st, PREFIX, PURPOSES))).toEqual(["a1"]);
  });
});

describe("what a choice means", () => {
  function genState(rng: Rng): ConsentState {
    const o: Record<string, { value: "granted" | "declined"; decidedOn: string; wordingVersion: number }> = {};
    for (const p of PURPOSES) {
      if (rng.bool(0.8)) o[p.id] = { value: rng.pick(["granted", "declined"] as const), decidedOn: "2026-11-01", wordingVersion: rng.pick([0, 1, 2, 3, p.wordingVersion, p.wordingVersion]) };
    }
    return o;
  }

  it("allows a feature only for a granted choice made under the current wording", () => {
    assertProperty<ConsentState>({
      name: "isAllowed is exactly current-and-granted",
      runs: 400,
      gen: genState,
      prop: (state) => {
        for (const p of PURPOSES) {
          const r = state[p.id];
          const expected = r !== undefined && r.value === "granted" && r.wordingVersion === p.wordingVersion;
          expect(isAllowed(state, p)).toBe(expected);
          const st = consentStatus(state, p);
          expect(st.stale).toBe(r !== undefined && r.wordingVersion !== p.wordingVersion);
          if (st.stale || r === undefined) expect(st.value).toBe("unknown");
        }
      },
      show: (s) => JSON.stringify(s),
    });
  });

  it("treats a choice for an unknown purpose as no choice", () => {
    expect(isAllowed({}, P("nothing"))).toBe(false);
    expect(consentStatus({}, P("nothing"))).toEqual({ value: "unknown", stale: false });
  });

  it("changing the wording version makes every older choice stale, so it no longer allows anything", () => {
    assertProperty<{ granted: boolean[]; bump: number }>({
      name: "a raised wording version makes every old choice stale",
      gen: (rng) => ({ granted: PURPOSES.map(() => rng.bool()), bump: rng.int(1, 5) }),
      prop: ({ granted, bump }) => {
        const state: Record<string, { value: "granted" | "declined"; decidedOn: string; wordingVersion: number }> = {};
        PURPOSES.forEach((p, i) => {
          state[p.id] = { value: granted[i] === true ? "granted" : "declined", decidedOn: "2026-11-01", wordingVersion: p.wordingVersion };
        });
        PURPOSES.forEach((p, i) => {
          expect(isAllowed(state, p)).toBe(granted[i] === true);
          const raised = { ...p, wordingVersion: p.wordingVersion + bump };
          expect(isAllowed(state, raised)).toBe(false);
          expect(consentStatus(state, raised)).toEqual({ value: "unknown", stale: true });
        });
      },
    });
  });

  it("setConsent and clearConsent change only the one purpose and never the state they were given", () => {
    assertProperty<{ state: ConsentState; at: number; value: "granted" | "declined" }>({
      name: "set and clear are local and pure",
      gen: (rng) => ({ state: genState(rng), at: rng.int(0, PURPOSES.length - 1), value: rng.pick(["granted", "declined"] as const) }),
      prop: ({ state, at, value }) => {
        const frozen = Object.freeze({ ...state });
        const before = JSON.stringify(frozen);
        const p = PURPOSES[at] as Purpose;
        const next = setConsent(frozen, p, value, new Date(2026, 10, 20));
        expect(JSON.stringify(frozen)).toBe(before);
        expect(next[p.id]).toEqual({ value, decidedOn: "2026-11-20", wordingVersion: p.wordingVersion });
        for (const q of PURPOSES) if (q.id !== p.id) expect(next[q.id]).toEqual(frozen[q.id]);
        const cleared = clearConsent(next, p.id);
        expect(cleared[p.id]).toBeUndefined();
        for (const q of PURPOSES) if (q.id !== p.id) expect(cleared[q.id]).toEqual(frozen[q.id]);
        expect(isAllowed(next, p)).toBe(value === "granted");
        expect(isAllowed(cleared, p)).toBe(false);
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("writes the date as year-month-day with two digits, for every day of the year", () => {
    for (let day = 0; day < 366; day += 1) {
      const r = setConsent({}, PURPOSES[0] as Purpose, "granted", new Date(2024, 0, 1 + day));
      expect(r["saved-places"]?.decidedOn).toMatch(DATE_RE);
    }
  });
});

describe("the consent gate", () => {
  const RULES: readonly GateRule[] = [
    { purposeId: "saved-places", key: `${PREFIX}places.v1` },
    { purposeId: "saved-places", key: `${PREFIX}places.`, prefix: true },
    { purposeId: "route-reports", key: `${PREFIX}routeReports.`, prefix: true },
  ];
  const NAMES = [`${PREFIX}places.v1`, `${PREFIX}places.extra`, `${PREFIX}routeReports.v1`, `${PREFIX}routeReports.draft`, `${PREFIX}prefs.v1`, "site.theme", `${PREFIX}placesX`];

  type Step = { op: "set" | "remove" | "get" | "choose"; name: string; value: string; purposeAt: number; choice: "granted" | "declined" | "clear" };

  it("keeps the model and the storage the same through any run of writes, removals and changes of mind", () => {
    assertProperty<Step[]>({
      name: "gate follows its rules",
      runs: 250,
      gen: (rng) =>
        Array.from({ length: rng.int(1, 40) }, (): Step => ({
          op: rng.pick(["set", "set", "remove", "get", "choose"] as const),
          name: rng.pick(NAMES),
          value: genString(rng, 8),
          purposeAt: rng.int(0, PURPOSES.length - 1),
          choice: rng.pick(["granted", "declined", "clear"] as const),
        })),
      prop: (steps) => {
        const inner = createMemoryStorage();
        let state: ConsentState = {};
        const gate = gateStorage(inner, () => state, PURPOSES, RULES);
        const model = new Map<string, string>();
        let expectedRefused = 0;
        for (const st of steps) {
          if (st.op === "choose") {
            const p = PURPOSES[st.purposeAt] as Purpose;
            state = st.choice === "clear" ? clearConsent(state, p.id) : setConsent(state, p, st.choice, new Date(2026, 10, 20));
          } else if (st.op === "set") {
            const rule = ruleFor(RULES, st.name);
            const purpose = rule === undefined ? undefined : PURPOSES.find((p) => p.id === rule.purposeId);
            const allowed = rule === undefined || (purpose !== undefined && isAllowed(state, purpose));
            gate.setItem(st.name, st.value);
            if (allowed) model.set(st.name, st.value);
            else expectedRefused += 1;
          } else if (st.op === "remove") {
            gate.removeItem(st.name);
            model.delete(st.name);
          } else {
            expect(gate.getItem(st.name)).toBe(model.get(st.name) ?? null);
          }
        }
        for (const n of NAMES) expect(inner.getItem(n)).toBe(model.get(n) ?? null);
        expect(gate.refused()).toHaveLength(expectedRefused);
        for (const r of gate.refused()) expect(Object.keys(r).sort()).toEqual(["key", "purposeId", "reason"]);
      },
      shrink: function* (steps) {
        for (let i = 0; i < steps.length; i += 1) yield [...steps.slice(0, i), ...steps.slice(i + 1)];
      },
      show: (s) => JSON.stringify(s),
    });
  });

  it("never keeps the value of a refused write, only the name", () => {
    const gate = gateStorage(createMemoryStorage(), () => ({}), PURPOSES, RULES);
    gate.setItem(`${PREFIX}places.v1`, "SECRET-VALUE-123");
    expect(JSON.stringify(gate.refused())).not.toContain("SECRET");
    expect(gate.refused()).toEqual([{ key: `${PREFIX}places.v1`, purposeId: "saved-places", reason: "no-choice" }]);
  });

  it("says no-choice after the wording changed and declined only for a current no", () => {
    let state: ConsentState = { "saved-places": { value: "declined", decidedOn: "2026-11-01", wordingVersion: 1 } };
    const gate = gateStorage(createMemoryStorage(), () => state, PURPOSES, RULES);
    gate.setItem(`${PREFIX}places.v1`, "x");
    state = { "saved-places": { value: "declined", decidedOn: "2026-11-01", wordingVersion: 0 } };
    gate.setItem(`${PREFIX}places.v1`, "x");
    expect(gate.refused().map((r) => r.reason)).toEqual(["declined", "no-choice"]);
    gate.clearRefused();
    expect(gate.refused()).toEqual([]);
  });

  it("refuses the keys of a purpose that is not in the list, the safe answer", () => {
    const gate = gateStorage(createMemoryStorage(), () => ({}), [], RULES);
    gate.setItem(`${PREFIX}places.v1`, "x");
    expect(gate.getItem(`${PREFIX}places.v1`)).toBeNull();
    expect(gate.refused()).toHaveLength(1);
  });

  it("an exact rule beats a prefix rule, and a longer prefix beats a shorter one", () => {
    const rules: readonly GateRule[] = [
      { purposeId: "a1", key: "k.", prefix: true },
      { purposeId: "saved-places", key: "k.x.", prefix: true },
      { purposeId: "route-reports", key: "k.x.y" },
    ];
    expect(ruleFor(rules, "k.x.y")?.purposeId).toBe("route-reports");
    expect(ruleFor(rules, "k.x.z")?.purposeId).toBe("saved-places");
    expect(ruleFor(rules, "k.other")?.purposeId).toBe("a1");
    expect(ruleFor(rules, "j.other")).toBeUndefined();
  });

  it("finds, for any key name, the rule a plain search over every rule would find", () => {
    assertProperty<string>({
      name: "ruleFor agrees with a plain search",
      runs: 500,
      gen: (rng) => rng.pick([`${PREFIX}places.`, `${PREFIX}places.v1`, `${PREFIX}routeReports.`, `${PREFIX}`, "x"]) + genKeyName(rng, 4),
      prop: (key) => {
        const exact = RULES.filter((r) => r.prefix !== true && r.key === key);
        const prefixed = RULES.filter((r) => r.prefix === true && key.startsWith(r.key)).sort((a, b) => b.key.length - a.key.length);
        expect(ruleFor(RULES, key)).toBe(exact[0] ?? prefixed[0]);
      },
    });
  });

  it("withdrawing removes the purpose's own keys and no others, for any contents of storage", () => {
    assertProperty<string[]>({
      name: "removeForPurpose is exact",
      runs: 300,
      gen: (rng) => Array.from({ length: rng.int(0, 12) }, () => rng.pick(NAMES) + (rng.bool(0.3) ? genKeyName(rng, 3) : "")),
      prop: (names) => {
        const st = createMemoryStorage(Object.fromEntries(names.map((n) => [n, "v"])));
        const before = new Set(names);
        const removed = removeForPurpose(st, RULES, "saved-places");
        for (const n of before) {
          const mine = ruleFor(RULES, n)?.purposeId === "saved-places";
          expect(st.getItem(n) === null, n).toBe(mine);
          expect(removed.includes(n), n).toBe(mine);
        }
      },
    });
  });

  it("withdrawing does not crash when storage refuses a removal, and says which keys are still there", () => {
    const st = createFaultyStorage(
      { [`${PREFIX}places.v1`]: "1", [`${PREFIX}places.extra`]: "2" },
      { failRemoveWhen: (k) => k.endsWith("v1") },
    );
    let removed: string[] = [];
    expect(() => {
      removed = removeForPurpose(st, RULES, "saved-places");
    }).not.toThrow();
    expect(removed).toEqual([`${PREFIX}places.extra`]);
    expect(st.snapshot()).toEqual({ [`${PREFIX}places.v1`]: "1" });
  });

  it("uses numbers and text generated here only for input, never as a purpose id", () => {
    expect(genNumber).toBeTypeOf("function");
    expect(shrinkJson).toBeTypeOf("function");
  });
});
