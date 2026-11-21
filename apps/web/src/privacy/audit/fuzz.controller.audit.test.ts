// Robustness audit for the panel's controller: random runs of the panel's actions, with the browser's storage failing and
// being changed by something else between steps. After every step the controller must not have thrown, must have touched
// only names inside the data scope, and must say what happened truthfully. At the end the page it draws must pass the HTML audit.

import { describe, expect, it } from "vitest";
import { loadActivity, MAX_ACTIVITY_ENTRIES } from "../panel/activityLog";
import { consentKey } from "../panel/consent";
import type { GateRule } from "../panel/consentGate";
import { ruleFor } from "../panel/consentGate";
import { createPrivacyController, type PrivacyAction, type PrivacyController, type PrivacyState } from "../panel/controller";
import { inScope, type DataScope } from "../panel/dataScope";
import { FIXTURE } from "../panel/fixtures.test-util";
import { exportLocalData } from "../panel/localData";
import type { Purpose } from "../panel/consent";
import { createFaultyStorage, outsideTouches, type FaultyStorage } from "./fuzz/faultyStorage";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { auditHtml, formatViolations } from "./htmlAudit";

const PREFIX = "app.";
const SCOPE: DataScope = { prefix: PREFIX, keys: ["app-prefs.v1"] };
const NOW = new Date(2026, 10, 20, 9, 0, 0);
const PURPOSES: readonly Purpose[] = [
  { id: "saved-places", label: { en: "Saved places", fr: "Lieux enregistrés" }, description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" }, wordingVersion: 1 },
  { id: "route-reports", label: { en: "Route reports", fr: "Signalements de trajet" }, description: { en: "Keep route reports on this device", fr: "Garder les signalements de trajet sur cet appareil" }, wordingVersion: 1 },
];
const RULES: readonly GateRule[] = [
  { purposeId: "saved-places", key: `${PREFIX}places.`, prefix: true },
  { purposeId: "route-reports", key: `${PREFIX}routeReports.v1` },
];
const SEED_DATA: Record<string, string> = {
  [`${PREFIX}places.1`]: "a",
  [`${PREFIX}places.2`]: "b",
  [`${PREFIX}routeReports.v1`]: "c",
  [`${PREFIX}draft`]: "d",
  "app-prefs.v1": '{"x":1}',
  "site.theme": "dark",
  unrelated: "1",
};

/** Faults as plain data, so a script can be printed, shrunk and replayed. */
interface FaultSpec {
  failWrites: boolean;
  dropWrites: boolean;
  failRemovesEndingWith: string | null;
  dropRemovesEndingWith: string | null;
  failReads: boolean;
  quota: number | null;
}
const NO_FAULTS: FaultSpec = { failWrites: false, dropWrites: false, failRemovesEndingWith: null, dropRemovesEndingWith: null, failReads: false, quota: null };

type Step =
  | { t: "act"; action: PrivacyAction }
  | { t: "faults"; spec: FaultSpec }
  | { t: "other-tab"; key: string; value: string }
  | { t: "other-tab-remove"; key: string }
  | { t: "load-export"; kind: "own" | "mutated" | "foreign" | "junk"; salt: number };

function genFaultSpec(rng: Rng): FaultSpec {
  if (rng.bool(0.35)) return NO_FAULTS;
  return {
    failWrites: rng.bool(0.2),
    dropWrites: rng.bool(0.1),
    failRemovesEndingWith: rng.bool(0.3) ? rng.pick([".1", ".v1", "draft", "e"]) : null,
    dropRemovesEndingWith: rng.bool(0.2) ? rng.pick([".2", ".v1", "draft"]) : null,
    failReads: rng.bool(0.08),
    quota: rng.bool(0.15) ? rng.int(0, 400) : null,
  };
}

function genAction(rng: Rng): PrivacyAction {
  const purposeId = rng.pick(["saved-places", "route-reports", "saved-places", "nope", "__proto__", ""]);
  return rng.pick<PrivacyAction>([
    { type: "export" },
    { type: "erase-ask" },
    { type: "erase-cancel" },
    { type: "erase-confirm" },
    { type: "erase-confirm" },
    { type: "set-locale", locale: rng.pick(["en", "fr"] as const) },
    { type: "consent", purposeId, value: rng.pick(["granted", "declined"] as const) },
    { type: "consent", purposeId: "saved-places", value: "declined" },
    { type: "consent", purposeId: "route-reports", value: "declined" },
    { type: "consent", purposeId: "saved-places", value: "granted" },
    { type: "export-list-csv" },
    { type: "export-list-text" },
    { type: "mark-seen" },
    { type: "import-confirm" },
    { type: "import-confirm" },
    { type: "import-cancel" },
    { type: "export-support" },
    { type: "export-printable" },
    { type: "report", status: { kind: "nothing" } },
    { type: "export-kept-csv" },
    { type: "clear-device-ask" },
    { type: "clear-device-cancel" },
  ]);
}

function genScript(rng: Rng): Step[] {
  const n = rng.int(1, 32);
  const out: Step[] = [];
  for (let i = 0; i < n; i += 1) {
    const roll = rng.next();
    if (roll < 0.5) out.push({ t: "act", action: genAction(rng) });
    else if (roll < 0.65) out.push({ t: "faults", spec: genFaultSpec(rng) });
    else if (roll < 0.75) out.push({ t: "other-tab", key: rng.pick([`${PREFIX}places.${i}`, consentKey(PREFIX), `${PREFIX}activity.v1`, `${PREFIX}egress.v1`, `${PREFIX}seen.v1`, `${PREFIX}prefs.v1`, `${PREFIX}draft`, "site.theme"]), value: rng.bool(0.5) ? genString(rng, 40) : mutateText(rng, '{"records":{"saved-places":{"value":"granted","decidedOn":"2026-11-01","wordingVersion":1}}}') });
    else if (roll < 0.8) out.push({ t: "other-tab-remove", key: rng.pick(Object.keys(SEED_DATA)) });
    else out.push({ t: "load-export", kind: rng.pick(["own", "own", "mutated", "foreign", "junk"] as const), salt: rng.int(0, 1_000_000) });
  }
  return out;
}

function exportText(storage: FaultyStorage, kind: "own" | "mutated" | "foreign" | "junk", salt: number): string {
  const saved = storage.ops.length;
  void saved;
  const items: Record<string, string> = { [`${PREFIX}places.${salt % 7}`]: `v${salt}`, [`${PREFIX}draft`]: "restored", [`${PREFIX}routeReports.v1`]: "r" };
  const base = JSON.stringify({ format: "app-local-data", version: 1, exportedAt: NOW.toISOString(), prefix: PREFIX, items });
  if (kind === "own") return base;
  if (kind === "foreign") return JSON.stringify({ format: "app-local-data", version: 1, exportedAt: NOW.toISOString(), prefix: PREFIX, items: { ...items, "site.theme": "light" } });
  if (kind === "junk") return `junk ${salt}`;
  const rng = { int: (a: number, b: number) => a + (salt % (b - a + 1)), pick: <T,>(l: readonly T[]) => l[salt % l.length] as T, bool: () => salt % 2 === 0, next: () => (salt % 1000) / 1000 };
  return mutateText(rng as unknown as Rng, base);
}

function faultsOf(spec: FaultSpec): Parameters<FaultyStorage["setFaults"]>[0] {
  return {
    ...(spec.failWrites ? { failWriteWhen: () => true } : {}),
    ...(spec.dropWrites ? { dropWriteWhen: () => true } : {}),
    ...(spec.failRemovesEndingWith !== null ? { failRemoveWhen: (k: string) => k.endsWith(spec.failRemovesEndingWith as string) } : {}),
    ...(spec.dropRemovesEndingWith !== null ? { dropRemoveWhen: (k: string) => k.endsWith(spec.dropRemovesEndingWith as string) } : {}),
    ...(spec.failReads ? { failReadWhen: () => true } : {}),
    ...(spec.quota !== null ? { quotaChars: spec.quota } : {}),
  };
}

interface World {
  storage: FaultyStorage;
  c: PrivacyController;
  calls: PrivacyState[];
}

function build(): World {
  const storage = createFaultyStorage({ ...SEED_DATA });
  const c = createPrivacyController({
    storage,
    prefix: PREFIX,
    inventory: FIXTURE,
    purposes: PURPOSES,
    withdrawRules: RULES,
    extraKeys: SCOPE.keys,
    logActivity: true,
    trackChanges: true,
    now: () => NOW,
    languages: ["en"],
  });
  const calls: PrivacyState[] = [];
  c.subscribe((s) => calls.push(s));
  return { storage, c, calls };
}

const ruleKeys = (storage: FaultyStorage, purposeId: string): string[] => Object.keys(storage.snapshot()).filter((k) => ruleFor(RULES, k)?.purposeId === purposeId);

function run(script: readonly Step[]): void {
  const { storage, c, calls } = build();
  storage.clearOps();
  let dispatches = 0;
  for (const step of script) {
    if (step.t === "faults") {
      storage.setFaults(faultsOf(step.spec));
      continue;
    }
    if (step.t === "other-tab") {
      try {
        storage.setItem(step.key, step.value);
      } catch {
        // the other tab's write failed too
      }
      continue;
    }
    if (step.t === "other-tab-remove") {
      try {
        storage.removeItem(step.key);
      } catch {
        // as above
      }
      continue;
    }
    const action: PrivacyAction = step.t === "load-export" ? { type: "import-load", text: exportText(storage, step.kind, step.salt) } : step.action;
    // Only the controller's own calls count against the scope rule, so the other tab's writes are cleared from the log.
    const opsBefore = storage.ops.length;
    const before = storage.snapshot();
    const gone = action.type === "consent" && action.value === "declined" ? ruleKeys(storage, action.purposeId) : [];
    const st = c.dispatch(action);
    dispatches += 1;
    const mine = storage.ops.slice(opsBefore);
    const outside = [...new Set(mine.filter((o) => (o.kind === "set" || o.kind === "remove") && !inScope(SCOPE, o.key)).map((o) => o.key))];
    expect(outside, `${action.type} touched names outside the scope`).toEqual([]);
    expect(st).toBe(c.getState());
    if (action.type === "erase-confirm" && st.status?.kind === "erased") {
      expect(Object.keys(storage.snapshot()).filter((k) => inScope(SCOPE, k)), "an erase that said it finished left names behind").toEqual([]);
      expect(st.consent).toEqual({});
    }
    if (action.type === "import-confirm" && st.status?.kind === "import-rolled-back") expect(storage.snapshot(), "a rolled back import changed storage").toEqual(before);
    if (action.type === "consent" && PURPOSES.some((p) => p.id === action.purposeId) && st.status?.kind === "consent-withdrawn") {
      const left = new Set(Object.keys(storage.snapshot()));
      const reallyGone = gone.filter((k) => !left.has(k)).length;
      expect(st.status.removed, "the count of removed items is not what left storage").toBe(reallyGone);
    }
    if (action.type === "consent" && !PURPOSES.some((p) => p.id === action.purposeId)) expect(st.consent).toEqual(c.getState().consent);
    if (action.type === "consent" && PURPOSES.some((p) => p.id === action.purposeId)) expect(st.importPending, "a file checked before a consent choice is still waiting to be restored").toBe(false);
  }
  expect(calls.length, "every dispatch tells the subscribers once").toBe(dispatches);
  storage.setFaults();
  expect(loadActivity(storage, PREFIX, NOW).length).toBeLessThanOrEqual(MAX_ACTIVITY_ENTRIES);
  for (const l of ["en", "fr"] as const) {
    c.dispatch({ type: "set-locale", locale: l });
    const html = c.html();
    const v = auditHtml(`<section lang="${l}">${html}</section>`);
    expect(v, formatViolations(v)).toEqual([]);
  }
  expect(outsideTouches(storage, (k) => inScope(SCOPE, k) || Object.keys(SEED_DATA).includes(k) || k.startsWith("site.") || k.startsWith(PREFIX))).toEqual([]);
}

describe("random runs of the panel", () => {
  it("never throws, never leaves the scope and tells the truth, whatever fails", () => {
    assertProperty<Step[]>({
      name: "controller survives random runs under failing storage",
      runs: 400,
      seed: 7_001,
      gen: genScript,
      prop: run,
      shrink: function* (steps) {
        yield [];
        for (let i = 0; i < steps.length; i += 1) yield [...steps.slice(0, i), ...steps.slice(i + 1)];
      },
      show: (s) => JSON.stringify(s),
    });
  });

  it("does the same with a second seed, so the first is not a lucky one", () => {
    assertProperty<Step[]>({ name: "controller survives random runs (seed 2)", runs: 300, seed: 424_242, gen: genScript, prop: run, show: (s) => JSON.stringify(s) });
  });
});

describe("withdrawing consent when the browser refuses", () => {
  it("does not throw, keeps the item it could not remove, and counts only what left", () => {
    const { storage, c } = build();
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    storage.setFaults({ failRemoveWhen: (k) => k.endsWith(".1") });
    const st = c.dispatch({ type: "consent", purposeId: "saved-places", value: "declined" });
    expect(storage.getItem(`${PREFIX}places.1`)).toBe("a");
    expect(storage.getItem(`${PREFIX}places.2`)).toBeNull();
    expect(st.status).toMatchObject({ kind: "consent-withdrawn", removed: 1 });
    expect(st.consent["saved-places"]?.value).toBe("declined");
  });

  it("still records the refusal when nothing could be removed", () => {
    const { storage, c } = build();
    storage.setFaults({ failRemoveWhen: () => true });
    const st = c.dispatch({ type: "consent", purposeId: "saved-places", value: "declined" });
    expect(st.consent["saved-places"]?.value).toBe("declined");
    expect(st.status?.kind).toBe("consent-saved");
  });
});

describe("a restore that fails part way, through the panel", () => {
  it("says it was rolled back and leaves storage as it was", () => {
    const { storage, c } = build();
    const file = exportLocalData(createFaultyStorage({ [`${PREFIX}a`]: "1", [`${PREFIX}b`]: "2", [`${PREFIX}c`]: "3" }), SCOPE, NOW, "en");
    expect(c.dispatch({ type: "import-load", text: file.text }).status).toMatchObject({ kind: "import-ready", additions: 3 });
    const before = storage.snapshot();
    storage.setFaults({ failWriteNumber: 2 });
    const st = c.dispatch({ type: "import-confirm" });
    expect(st.status).toEqual({ kind: "import-rolled-back" });
    expect(storage.snapshot()).toEqual(before);
    expect(st.importPending).toBe(false);
  });
});

describe("an erase that the browser only half does", () => {
  it("says how many names are still there, and does not say it finished", () => {
    const { storage, c } = build();
    storage.setFaults({ dropRemoveWhen: (k) => k.endsWith("draft"), failRemoveWhen: (k) => k.endsWith(".1") });
    c.dispatch({ type: "erase-ask" });
    const st = c.dispatch({ type: "erase-confirm" });
    expect(st.status).toEqual({ kind: "erase-partial", failed: 2 });
    expect(Object.keys(storage.snapshot()).filter((k) => inScope(SCOPE, k)).sort()).toEqual([`${PREFIX}draft`, `${PREFIX}places.1`]);
    expect(storage.getItem("site.theme")).toBe("dark");
    expect(storage.getItem("unrelated")).toBe("1");
  });
});

describe("a pending restore and a consent choice", () => {
  it("is dropped when a choice changes, so a restore cannot put back what a refusal just removed", () => {
    const { storage, c } = build();
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    const file = JSON.stringify({ format: "app-local-data", version: 1, exportedAt: NOW.toISOString(), prefix: PREFIX, items: { [`${PREFIX}places.9`]: "from-file" } });
    expect(c.dispatch({ type: "import-load", text: file }).importPending).toBe(true);
    const st = c.dispatch({ type: "consent", purposeId: "saved-places", value: "declined" });
    expect(st.importPending).toBe(false);
    const after = c.dispatch({ type: "import-confirm" });
    expect(after.status).toBeNull();
    expect(storage.getItem(`${PREFIX}places.9`)).toBeNull();
    expect(storage.getItem(`${PREFIX}places.1`)).toBeNull();
  });

  it("is not dropped by a choice for a purpose the App does not offer", () => {
    const { c } = build();
    const file = JSON.stringify({ format: "app-local-data", version: 1, exportedAt: NOW.toISOString(), prefix: PREFIX, items: { [`${PREFIX}x`]: "1" } });
    c.dispatch({ type: "import-load", text: file });
    expect(c.dispatch({ type: "consent", purposeId: "nope", value: "declined" }).importPending).toBe(true);
  });
});

describe("storage that will not be read", () => {
  it("lets the person download what can be read, and says nothing was found when none can", () => {
    const { storage, c } = build();
    storage.setFaults({ failReadWhen: (k) => k.endsWith("draft") });
    const st = c.dispatch({ type: "export" });
    expect(st.status).toMatchObject({ kind: "exported" });
    expect(st.lastExport?.text).not.toContain('"app.draft"');
    expect(st.lastExport?.text).toContain('"app.places.1"');
    storage.setFaults({ failReadWhen: () => true });
    expect(c.dispatch({ type: "export" }).status).toEqual({ kind: "nothing" });
  });

  it("does not say an erase finished when it cannot see that the names are gone", () => {
    const { storage, c } = build();
    storage.setFaults({ failReadWhen: (k) => k.startsWith(`${PREFIX}places.`) });
    c.dispatch({ type: "erase-ask" });
    const st = c.dispatch({ type: "erase-confirm" });
    expect(st.status).toEqual({ kind: "erase-partial", failed: 2 });
    storage.setFaults();
    expect(storage.getItem(`${PREFIX}places.1`)).toBeNull();
  });
});
