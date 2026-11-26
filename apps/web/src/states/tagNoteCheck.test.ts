import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISAGREEMENT_ORDER, DISAGREEMENT_FILTERS, DISAGREEMENT_KINDS, DISAGREEMENT_ORDERS, checkPlace, checkPlaces, filterFindings, isDisagreementFilter, isDisagreementOrder, orderFindings,
} from "./tagNoteCheck";
import { withNote } from "./noteTopicFixtures";

const yes = (id: string, note: string | null, over: Record<string, unknown> = {}) => withNote(id, note, { wheelchair: "yes", name: `Place ${id}`, ...over });
const no = (id: string, note: string | null, over: Record<string, unknown> = {}) => withNote(id, note, { wheelchair: "no", name: `Place ${id}`, ...over });

describe("checkPlace for a yes tag", () => {
  it("flags barrier words", () => {
    const d = checkPlace(yes("a", "Two steps at the front door."))!;
    expect(d.kind).toBe("yes-but-barrier");
    expect(d.weight).toBe("one-sided");
    expect(d.against.map((s) => s.text)).toEqual(["steps"]);
  });
  it("flags a negated ramp", () => {
    expect(checkPlace(yes("a", "No ramp at the entrance."))!.kind).toBe("yes-but-barrier");
  });
  it("treats designated like yes", () => {
    expect(checkPlace(yes("a", "Stairs only.", { wheelchair: "designated" }))!.kind).toBe("yes-but-barrier");
  });
  it("calls it mixed when the note also uses access words", () => {
    const d = checkPlace(yes("a", "Two steps at the front, ramp at the side."))!;
    expect(d.weight).toBe("mixed");
    expect(d.signals).toHaveLength(2);
    expect(d.against).toHaveLength(1);
  });
  it("finds nothing when the note only uses access words", () => {
    expect(checkPlace(yes("a", "Ramp at the side. Elevator inside."))).toBeNull();
  });
  it("finds nothing in a note with no such words", () => {
    expect(checkPlace(yes("a", "Open daily until late."))).toBeNull();
  });
});

describe("checkPlace for a no tag", () => {
  it("flags access words", () => {
    const d = checkPlace(no("a", "Ramp at the side door."))!;
    expect(d.kind).toBe("no-but-access");
    expect(d.weight).toBe("one-sided");
  });
  it("flags step free and no steps", () => {
    expect(checkPlace(no("a", "Step free entrance."))!.kind).toBe("no-but-access");
    expect(checkPlace(no("a", "No steps at the door."))!.kind).toBe("no-but-access");
  });
  it("calls it mixed when the note also uses barrier words", () => {
    expect(checkPlace(no("a", "Ramp at the side but two steps inside."))!.weight).toBe("mixed");
  });
  it("finds nothing when the note only uses barrier words", () => {
    expect(checkPlace(no("a", "Stairs only to the second floor."))).toBeNull();
  });
});

describe("checkPlace leaves other cases alone", () => {
  it("says nothing for a limited or unknown tag, whatever the note", () => {
    expect(checkPlace(yes("a", "Two steps.", { wheelchair: "limited" }))).toBeNull();
    expect(checkPlace(yes("a", "Stairs only.", { wheelchair: null }))).toBeNull();
    expect(checkPlace(yes("a", "Step free.", { wheelchair: "UNKNOWN" }))).toBeNull();
  });
  it("says nothing without a note", () => {
    expect(checkPlace(yes("a", null))).toBeNull();
    expect(checkPlace(yes("a", "   "))).toBeNull();
  });
  it("carries the note and name as written", () => {
    const d = checkPlace(yes("a", "Two STEPS at the door."))!;
    expect(d.note).toBe("Two STEPS at the door.");
    expect(d.name).toBe("Place a");
    expect(d.tag).toBe("yes");
  });
  it("works in French", () => {
    expect(checkPlace(yes("a", "Escaliers seulement."))!.kind).toBe("yes-but-barrier");
    expect(checkPlace(no("a", "Entrée de plain pied."))!.kind).toBe("no-but-access");
  });
});

describe("checkPlaces", () => {
  const set = [
    yes("a", "Two steps at the door."),
    yes("b", "Ramp at the side."),
    no("c", "Step free entrance."),
    no("d", "Stairs only."),
    yes("e", null),
    yes("f", "Two steps; ramp at the side.", { wheelchair: "limited" }),
    yes("g", "No lift but a ramp."),
  ];
  const r = checkPlaces(set);
  it("lists the findings in pack order", () => {
    expect(r.findings.map((f) => f.id)).toEqual(["a", "c", "g"]);
  });
  it("counts what it checked and what it left out", () => {
    expect(r.checked).toBe(5);
    expect(r.withoutNote).toBe(1);
    expect(r.noTagToCheck).toBe(1);
    expect(r.checked + r.withoutNote + r.noTagToCheck).toBe(set.length);
  });
  it("tallies by kind and by weight", () => {
    expect(r.byKind).toEqual({ "yes-but-barrier": 2, "no-but-access": 1 });
    expect(r.oneSided + r.mixed).toBe(r.findings.length);
    expect(r.mixed).toBe(1);
  });
  it("is empty for no places", () => {
    expect(checkPlaces([])).toMatchObject({ findings: [], checked: 0, withoutNote: 0, noTagToCheck: 0, oneSided: 0, mixed: 0 });
  });
  it("does not change the places", () => {
    const copy = JSON.stringify(set);
    checkPlaces(set);
    expect(JSON.stringify(set)).toBe(copy);
  });
});

describe("filtering and ordering", () => {
  const r = checkPlaces([yes("b", "Two steps at the door, ramp at the side.", { name: "Zed" }), yes("a", "Stairs only.", { name: "Étoile" }), no("c", "Step free entrance.", { name: null }), no("d", "Ramp.", { name: "Alpha" })]);
  it("filters by kind", () => {
    expect(filterFindings(r.findings, "all")).toHaveLength(4);
    expect(filterFindings(r.findings, "yes-but-barrier").map((f) => f.id)).toEqual(["b", "a"]);
    expect(filterFindings(r.findings, "no-but-access").map((f) => f.id)).toEqual(["c", "d"]);
  });
  it("puts one-sided notes first, then pack order", () => {
    expect(orderFindings(r.findings, "one-sided-first").map((f) => f.id)).toEqual(["a", "c", "d", "b"]);
  });
  it("orders by name without accents, unnamed last", () => {
    expect(orderFindings(r.findings, "name").map((f) => f.id)).toEqual(["d", "a", "b", "c"]);
  });
  it("keeps pack order for pack and does not change its input", () => {
    const copy = [...r.findings];
    expect(orderFindings(r.findings, "pack").map((f) => f.id)).toEqual(r.findings.map((f) => f.id));
    for (const o of DISAGREEMENT_ORDERS) orderFindings(r.findings, o);
    expect(r.findings).toEqual(copy);
  });
  it("recognises only its own values", () => {
    expect(DISAGREEMENT_FILTERS).toEqual(["all", ...DISAGREEMENT_KINDS]);
    expect(isDisagreementFilter("no-but-access")).toBe(true);
    expect(isDisagreementFilter("both")).toBe(false);
    expect(isDisagreementOrder("name")).toBe(true);
    expect(isDisagreementOrder("worst")).toBe(false);
    expect(DEFAULT_DISAGREEMENT_ORDER).toBe("one-sided-first");
  });
});
