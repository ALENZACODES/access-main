import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { parsePackPlaces } from "./packPlaces";
import { buildTagNoteIndex } from "./tagNoteIndex";

type Raw = Record<string, unknown> & { id: string };
const raw = (JSON.parse(contentText) as { places: Raw[] }).places;
const { places } = parsePackPlaces(raw);
const index = buildTagNoteIndex(places);
const note = (p: Raw) => (typeof p.wheelchair_description === "string" && p.wheelchair_description.toUpperCase() !== "UNKNOWN" && p.wheelchair_description.trim() !== "" ? p.wheelchair_description : null);

describe("the tags and notes list on the shipped pack", () => {
  it("counts the notes the pack file has", () => {
    expect(index.withNote).toBe(raw.filter((p) => note(p) !== null).length);
    expect(places.length).toBe(raw.length);
  });
  it("lists only places that have a note and a tag the readings cover, and never more than the notes", () => {
    expect(index.reads.length).toBeLessThanOrEqual(index.withNote);
    for (const r of index.reads) {
      const p = raw.find((x) => x.id === r.id)!;
      expect(note(p), r.id).toBe(r.note);
      expect(r.tag, r.id).not.toBe("limited");
      expect(r.mentions.length, r.id).toBeGreaterThan(0);
    }
  });
  it("agrees with a plain search of each note for the words, for every place it lists or leaves out", () => {
    const steps = /\b(steps?|stairs?|staircase|curbs?|kerbs?|threshold)\b/i;
    const ramp = /\b(ramps?|slopes?|sloped|incline)\b/i;
    const lift = /\b(elevators?|lifts?)\b/i;
    const negated = /\b(no|not|without|none|never)\s+(?:\w+\s+)?(steps?|stairs?|ramps?|elevators?|lifts?)\b/i;
    const stepFree = /\bstep[\s-]*free\b/i;
    for (const p of raw) {
      const n = note(p);
      const tag = typeof p.wheelchair === "string" ? p.wheelchair : "unknown";
      const listed = index.reads.some((r) => r.id === p.id);
      if (n === null || negated.test(n) || stepFree.test(n)) continue; // the plain check below is only exact for notes with no negation
      const words = (tag === "yes" || tag === "designated") ? steps.test(n) : tag === "no" ? ramp.test(n) || lift.test(n) : tag === "unknown" ? steps.test(n) || ramp.test(n) || lift.test(n) : false;
      expect(listed, `${p.id}: ${n}`).toBe(words);
    }
  });
});
