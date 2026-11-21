import { describe, expect, it } from "vitest";
import type { ConsentState, Purpose } from "./consent";
import { LIVE_PURPOSES } from "./live";
import { LIVE_WORDING_HISTORY, wordingChanges, wordingProblems, type WordingHistory, type WordingVersion } from "./wordingHistory";

const b = (en: string, fr = `${en} (fr)`) => ({ en, fr });
const V1: WordingVersion = { version: 1, label: b("Keep reports"), description: b("Keep reports here."), changedOn: "2026-11-01" };
const V2: WordingVersion = { version: 2, label: b("Keep reports"), description: b("Keep reports here and share them."), changedOn: "2026-11-10", whatChanged: b("Sharing was added.") };
const P1: Purpose = { id: "reports", label: V1.label, description: V1.description, wordingVersion: 1 };
const P2: Purpose = { id: "reports", label: V2.label, description: V2.description, wordingVersion: 2 };
const H = (...versions: WordingVersion[]): WordingHistory => ({ purposeId: "reports", versions });

describe("the real history", () => {
  it("has no problems against the real choices", () => {
    expect(wordingProblems(LIVE_PURPOSES, LIVE_WORDING_HISTORY)).toEqual([]);
  });
  it("says UNKNOWN for a date that was not recorded", () => {
    expect(LIVE_WORDING_HISTORY.flatMap((h) => h.versions).filter((v) => v.version === 1).every((v) => v.changedOn === "UNKNOWN")).toBe(true);
  });
});

describe("wordingProblems", () => {
  it("accepts a sound history of one version and of two", () => {
    expect(wordingProblems([P1], [H(V1)])).toEqual([]);
    expect(wordingProblems([P2], [H(V1, V2)])).toEqual([]);
  });
  it("flags a choice with no history", () => {
    expect(wordingProblems([P1], [])).toEqual(["reports: has no wording history"]);
    expect(wordingProblems([P1], [H()])).toEqual(["reports: has no wording history"]);
  });
  it("flags a history for a choice the App does not offer, and a history listed twice", () => {
    expect(wordingProblems([], [H(V1)])).toEqual(["reports: has a history but is not a choice the App offers"]);
    expect(wordingProblems([P1], [H(V1), H(V1)])).toEqual(["reports: listed twice"]);
  });
  it("flags versions that do not start at 1 or have a gap", () => {
    expect(wordingProblems([P1], [H({ ...V1, version: 2 })]).join("\n")).toContain("version 2 is in position 1");
    expect(wordingProblems([{ ...P2, wordingVersion: 3 }], [H(V1, { ...V2, version: 3 })]).join("\n")).toContain("version 3 is in position 2");
  });
  it("flags a date that is neither a date nor UNKNOWN", () => {
    expect(wordingProblems([P1], [H({ ...V1, changedOn: "Nov 1" })])).toEqual(["reports: version 1 changedOn is neither YYYY-MM-DD nor UNKNOWN"]);
    expect(wordingProblems([P1], [H({ ...V1, changedOn: "UNKNOWN" })])).toEqual([]);
  });
  it("flags empty words in either language", () => {
    expect(wordingProblems([P1], [H({ ...V1, label: b("", "x") })]).join("\n")).toContain("empty en label or description");
    expect(wordingProblems([P1], [H({ ...V1, description: b("x", " ") })]).join("\n")).toContain("empty fr label or description");
  });
  it("flags a new version that does not say what changed, in both languages", () => {
    const { whatChanged, ...none } = V2;
    void whatChanged;
    expect(wordingProblems([P2], [H(V1, none)]).join("\n")).toContain("version 2 does not say what changed in both languages");
    expect(wordingProblems([P2], [H(V1, { ...V2, whatChanged: b("x", "") })]).join("\n")).toContain("does not say what changed");
  });
  it("flags a new version that has the same words as the one before", () => {
    const same: WordingVersion = { ...V2, description: V1.description, label: V1.label };
    expect(wordingProblems([{ ...P2, label: V1.label, description: V1.description }], [H(V1, same)]).join("\n")).toContain("version 2 has the same words as version 1");
  });
  it("flags a change of spacing only as no change", () => {
    const spaced: WordingVersion = { ...V2, description: b("Keep  reports here.", "Keep reports here. (fr)") };
    expect(wordingProblems([{ ...P2, description: spaced.description }], [H(V1, spaced)]).join("\n")).toContain("same words");
  });
  it("flags words that changed without a new version, in each language and field", () => {
    expect(wordingProblems([{ ...P1, description: b("Changed.", V1.description.fr) }], [H(V1)])).toEqual(["reports: the en description changed without a new wording version"]);
    expect(wordingProblems([{ ...P1, label: b(V1.label.en, "Autre") }], [H(V1)])).toEqual(["reports: the fr label changed without a new wording version"]);
  });
  it("flags a version raised without a history entry, and a history ahead of the version", () => {
    expect(wordingProblems([{ ...P1, wordingVersion: 2 }], [H(V1)])).toEqual(["reports: the choice is at wording version 2 but the history ends at version 1"]);
    expect(wordingProblems([P1], [H(V1, V2)])).toEqual(["reports: the choice is at wording version 1 but the history ends at version 2"]);
  });
});

describe("wordingChanges", () => {
  const answered = (value: "granted" | "declined", version: number): ConsentState => ({ reports: { value, decidedOn: "2026-11-05", wordingVersion: version } });
  it("lists nothing when there is no answer", () => {
    expect(wordingChanges({}, [P2], [H(V1, V2)])).toEqual([]);
  });
  it("lists nothing when the answer is under the current wording", () => {
    expect(wordingChanges(answered("granted", 2), [P2], [H(V1, V2)])).toEqual([]);
  });
  it("lists a choice answered under older wording, with both wordings, the answer and its date", () => {
    const [c] = wordingChanges(answered("granted", 1), [P2], [H(V1, V2)]);
    expect(c).toMatchObject({ purposeId: "reports", answeredVersion: 1, currentVersion: 2, answeredOn: "2026-11-05", answer: "granted" });
    expect(c?.before?.description.en).toBe("Keep reports here.");
    expect(c?.after.description.en).toBe("Keep reports here and share them.");
  });
  it("collects what changed in every version after the one answered, oldest first", () => {
    const V3: WordingVersion = { ...V2, version: 3, description: b("Keep reports here, share them and count them."), whatChanged: b("Counting was added.") };
    const P3: Purpose = { ...P2, description: V3.description, wordingVersion: 3 };
    const [c] = wordingChanges(answered("declined", 1), [P3], [H(V1, V2, V3)]);
    expect(c?.notes.map((n) => n.en)).toEqual(["Sharing was added.", "Counting was added."]);
    const [later] = wordingChanges(answered("declined", 2), [P3], [H(V1, V2, V3)]);
    expect(later?.notes.map((n) => n.en)).toEqual(["Counting was added."]);
  });
  it("does not guess the earlier wording when that version is not on record", () => {
    const [c] = wordingChanges(answered("granted", 1), [P2], [H(V2)]);
    expect(c?.before).toBeNull();
    expect(c?.notes.map((n) => n.en)).toEqual(["Sharing was added."]);
  });
  it("lists a choice with no history at all, with no earlier wording and no notes", () => {
    const [c] = wordingChanges(answered("granted", 1), [P2], []);
    expect(c).toMatchObject({ before: null, notes: [] });
  });
  it("lists an answer under a newer version than the choice has, since it does not count either", () => {
    const [c] = wordingChanges(answered("granted", 5), [P2], [H(V1, V2)]);
    expect(c).toMatchObject({ answeredVersion: 5, currentVersion: 2, before: null, notes: [] });
  });
  it("lists each choice in the order the App offers them", () => {
    const Q: Purpose = { ...P1, id: "other" };
    const consent: ConsentState = { reports: { value: "granted", decidedOn: "2026-11-05", wordingVersion: 1 }, other: { value: "declined", decidedOn: "2026-11-06", wordingVersion: 0 } };
    expect(wordingChanges(consent, [P2, Q], []).map((c) => c.purposeId)).toEqual(["reports", "other"]);
  });
});
