import { describe, expect, it } from "vitest";
import type { ConsentState, Purpose } from "./consent";
import type { GateRule } from "./consentGate";
import { receiptOpen, receiptRows, type ReceiptInput } from "./receipt";
import type { RegisterRow } from "./storageRegister";

const P = (id: string, wordingVersion = 1): Purpose => ({ id, label: { en: `Label ${id}`, fr: `Étiquette ${id}` }, description: { en: `Does ${id}`, fr: `Fait ${id}` }, wordingVersion });
const row = (key: string, en: string): RegisterRow => ({ key, path: "p", holds: { en, fr: `${en} (fr)` }, gated: true, reach: "panel", source: "s", recordedOn: "2026-11-20" });
const RULES: GateRule[] = [{ purposeId: "a", key: "access.a.v1" }, { purposeId: "b", key: "access.b.", prefix: true }];
const REGISTER = [row("access.a.v1", "A items"), row("access.b.one", "B one"), row("access.b.two", "B two"), row("access.other", "Other")];
const base = (over: Partial<ReceiptInput> = {}): ReceiptInput => ({ purposes: [P("a"), P("b")], rules: RULES, consent: {}, register: REGISTER, keys: [], removesOnNo: true, ...over });

describe("receiptRows", () => {
  it("gives one row per purpose, in order", () => {
    expect(receiptRows(base()).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("is not asked yet when there is no record, with no date", () => {
    const r = receiptRows(base())[0]!;
    expect(r.answer).toBe("unknown");
    expect(r.decidedOn).toBeUndefined();
  });
  it("reports a current yes and a current no with their date", () => {
    const consent: ConsentState = { a: { value: "granted", decidedOn: "2026-11-01", wordingVersion: 1 }, b: { value: "declined", decidedOn: "2026-11-02", wordingVersion: 1 } };
    const rows = receiptRows(base({ consent }));
    expect(rows.map((r) => [r.answer, r.decidedOn])).toEqual([["granted", "2026-11-01"], ["declined", "2026-11-02"]]);
  });
  it("reports an answer given under older wording as asked again, and keeps its date", () => {
    const consent: ConsentState = { a: { value: "granted", decidedOn: "2026-10-01", wordingVersion: 1 } };
    const r = receiptRows(base({ purposes: [P("a", 2)], consent }))[0]!;
    expect(r.answer).toBe("changed");
    expect(r.decidedOn).toBe("2026-10-01");
    expect(r.wordingVersion).toBe(2);
  });
  it("lists what each choice lets the App save, by the gate's rules", () => {
    const rows = receiptRows(base());
    expect(rows[0]?.covers?.map((c) => c.en)).toEqual(["A items"]);
    expect(rows[1]?.covers?.map((c) => c.en)).toEqual(["B one", "B two"]);
  });
  it("leaves a row with no rule out of every choice", () => {
    const all = receiptRows(base()).flatMap((r) => r.covers ?? []).map((c) => c.en);
    expect(all).not.toContain("Other");
  });
  it("says what is covered is not listed when no list was given, and counts the rules instead", () => {
    const { register, ...rest } = base();
    void register;
    const rows = receiptRows(rest);
    expect(rows.map((r) => r.covers)).toEqual([null, null]);
    expect(rows.map((r) => r.tied)).toEqual([1, 1]);
  });
  it("counts what is saved now for each choice, by the gate's rules", () => {
    const rows = receiptRows(base({ keys: ["access.a.v1", "access.b.one", "access.b.three", "access.other", "unrelated"] }));
    expect(rows.map((r) => r.savedNow)).toEqual([1, 2]);
  });
  it("counts nothing saved when nothing is stored", () => {
    expect(receiptRows(base()).map((r) => r.savedNow)).toEqual([0, 0]);
  });
  it("has nothing tied to a purpose with no rule", () => {
    const r = receiptRows(base({ purposes: [P("c")] }))[0]!;
    expect(r.tied).toBe(0);
    expect(r.covers).toEqual([]);
  });
  it("lets the longest prefix rule win, so a key is counted once", () => {
    const rules: GateRule[] = [{ purposeId: "a", key: "access.", prefix: true }, { purposeId: "b", key: "access.b.", prefix: true }];
    const rows = receiptRows(base({ rules, keys: ["access.x", "access.b.y"] }));
    expect(rows.map((r) => r.savedNow)).toEqual([1, 1]);
  });
  it("passes on whether saying no removes what was saved", () => {
    expect(receiptRows(base({ removesOnNo: false })).every((r) => !r.removesOnNo)).toBe(true);
    expect(receiptRows(base()).every((r) => r.removesOnNo)).toBe(true);
  });
  it("is empty for no purposes", () => {
    expect(receiptRows(base({ purposes: [] }))).toEqual([]);
  });
});

describe("receiptOpen", () => {
  it("counts the choices that are not asked yet or asked again", () => {
    const consent: ConsentState = { a: { value: "granted", decidedOn: "2026-11-01", wordingVersion: 1 } };
    expect(receiptOpen(receiptRows(base({ consent })))).toBe(1);
    expect(receiptOpen(receiptRows(base({ purposes: [P("a", 2), P("b")], consent })))).toBe(2);
    expect(receiptOpen([])).toBe(0);
  });
});
