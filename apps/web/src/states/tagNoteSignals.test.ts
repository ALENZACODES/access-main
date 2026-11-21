import { describe, expect, it } from "vitest";
import { countByDirection, scanSignals } from "./tagNoteSignals";

const dirs = (note: string) => scanSignals(note).map((s) => `${s.direction}:${s.text.toLowerCase()}`);

describe("scanSignals plain words", () => {
  it("reads a ramp or a lift as pointing toward access", () => {
    expect(dirs("Ramp at the side door.")).toEqual(["access:ramp"]);
    expect(dirs("An elevator serves every floor.")).toEqual(["access:elevator"]);
    expect(dirs("Ascenseur disponible.")).toEqual(["access:ascenseur"]);
  });
  it("reads steps and stairs as pointing toward a barrier", () => {
    expect(dirs("Two steps at the front door.")).toEqual(["barrier:steps"]);
    expect(dirs("Escalier à l’entrée.")).toEqual(["barrier:escalier"]);
  });
  it("reads narrow and tight as barrier and wide as access", () => {
    expect(dirs("Narrow gate.")).toEqual(["barrier:narrow"]);
    expect(dirs("Wide aisles.")).toEqual(["access:wide"]);
    expect(dirs("Passage étroit.")).toEqual(["barrier:étroit"]);
  });
  it("says nothing for the bare word width", () => {
    expect(dirs("Door width is 80 cm.")).toEqual([]);
  });
  it("says nothing for a note with no such words", () => {
    expect(dirs("Open daily until late.")).toEqual([]);
    expect(dirs("Parking at the rear.")).toEqual([]);
  });
});

describe("scanSignals negation", () => {
  it("turns round a negated ramp or lift", () => {
    expect(dirs("No ramp.")).toEqual(["barrier:ramp"]);
    expect(dirs("Without an elevator you use the stairs.").map((x) => x.split(":")[0])).toEqual(["barrier", "barrier"]);
    expect(dirs("Pas d’ascenseur.")).toEqual(["barrier:ascenseur"]);
  });
  it("turns round negated steps", () => {
    expect(dirs("No steps at the entrance.")).toEqual(["access:steps"]);
    expect(dirs("Sans escalier.")).toEqual(["access:sans escalier"]);
  });
  it("turns round negated width words", () => {
    expect(dirs("Not narrow.")).toEqual(["access:narrow"]);
    expect(dirs("Not wide.")).toEqual(["barrier:wide"]);
  });
  it("does not carry a negator across a clause break", () => {
    expect(dirs("No lift, ramp at the side.")).toEqual(["barrier:lift", "access:ramp"]);
  });
});

describe("scanSignals phrases", () => {
  it("reads step free and level entrance as access, once each", () => {
    expect(dirs("Step free entrance.")).toEqual(["access:step free"]);
    expect(dirs("Level entrance from the street.")).toEqual(["access:level entrance"]);
    expect(dirs("Stepfree.")).toEqual(["access:stepfree"]);
  });
  it("reads stairs only and not wheelchair as barrier, once each", () => {
    expect(dirs("Stairs only to the second floor.")).toEqual(["barrier:stairs only"]);
    expect(dirs("Not wheelchair friendly.")).toEqual(["barrier:not wheelchair"]);
    expect(dirs("Inaccessible washroom.")).toEqual(["barrier:inaccessible"]);
  });
  it("reads French phrases", () => {
    expect(dirs("Entrée de plain pied.")).toEqual(["access:de plain pied"]);
    expect(dirs("Porte automatique.")).toEqual(["access:porte automatique"]);
    expect(dirs("Escaliers seulement.")).toEqual(["barrier:escaliers seulement"]);
  });
  it("does not count a word twice when a phrase holds it", () => {
    expect(scanSignals("Wide doors and step free access.").map((s) => s.cue)).toEqual(["wide doors", "step free"]);
  });
  it("ignores accents and case", () => {
    expect(dirs("PORTE AUTOMATIQUE")).toEqual(["access:porte automatique"]);
    expect(dirs("De Plain Pied")).toEqual(["access:de plain pied"]);
  });
});

describe("scanSignals shape", () => {
  it("returns the words as written with their places in the note", () => {
    const note = "Use the Ramp at the side.";
    const [s] = scanSignals(note);
    expect(note.slice(s!.start, s!.end)).toBe("Ramp");
    expect(s!.text).toBe("Ramp");
    expect(s!.cue).toBe("ramp");
  });
  it("is in reading order", () => {
    const s = scanSignals("Ramp, then two steps, then an elevator.");
    expect(s.map((x) => x.start)).toEqual([...s.map((x) => x.start)].sort((a, b) => a - b));
    expect(s).toHaveLength(3);
  });
  it("gives nothing for no note or a blank one", () => {
    expect(scanSignals(null)).toEqual([]);
    expect(scanSignals("   ")).toEqual([]);
  });
  it("does not change the note", () => {
    const n = "No ramp.";
    scanSignals(n);
    expect(n).toBe("No ramp.");
  });
});

describe("countByDirection", () => {
  it("counts each direction", () => {
    expect(countByDirection(scanSignals("Ramp at the side. Two steps at the front. Elevator inside."))).toEqual({ access: 2, barrier: 1 });
    expect(countByDirection([])).toEqual({ access: 0, barrier: 0 });
  });
});
