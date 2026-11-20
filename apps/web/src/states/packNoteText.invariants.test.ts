import { describe, expect, it } from "vitest";
import { foldNote, foldWithMap, highlightSegments, matchRanges, noteChars, noteSnippet, noteWords } from "./packNoteText";
import { lcg } from "./placeFixtures";

const PIECES = ["door", "Step", "entrée", "Café", "ramp", "ÉCOLE", "l’accès", "  ", "\n", "-", "10", "😀", "é", "side", "—", "Washroom", "ß", "İ", "日本"];

function notes(seed: number, n: number): string[] {
  const next = lcg(seed);
  return Array.from({ length: n }, () => Array.from({ length: 1 + Math.floor(next() * 25) }, () => PIECES[Math.floor(next() * PIECES.length)]).join(next() < 0.5 ? " " : ""));
}
const TERMS = ["door", "e", "cafe", "ramp", "a", "entree", "10", "washroom", "x", "side"];
const all = notes(2026, 600);

describe("highlighting over many awkward notes", () => {
  it("always joins back to exactly the note", () => {
    for (const note of all) expect(highlightSegments(note, TERMS).map((s) => s.text).join(""), JSON.stringify(note)).toBe(note);
  });
  it("never makes an empty piece and never two matching pieces in a row", () => {
    for (const note of all) {
      const segs = highlightSegments(note, TERMS);
      segs.forEach((s, i) => {
        expect(s.text.length).toBeGreaterThan(0);
        if (i > 0) expect(s.match && segs[i - 1]!.match).toBe(false);
      });
    }
  });
  it("gives ranges that are in order, inside the note and not touching", () => {
    for (const note of all) {
      const ranges = matchRanges(note, TERMS);
      let last = -1;
      for (const [s, e] of ranges) {
        expect(s).toBeGreaterThan(last);
        expect(e).toBeGreaterThan(s);
        expect(e).toBeLessThanOrEqual(note.length);
        last = e;
      }
    }
  });
  it("never starts or ends a piece in the middle of a surrogate pair", () => {
    for (const note of all) {
      for (const s of highlightSegments(note, TERMS)) {
        expect(/^[\udc00-\udfff]/.test(s.text), JSON.stringify(note)).toBe(false);
        expect(/[\ud800-\udbff]$/.test(s.text), JSON.stringify(note)).toBe(false);
      }
    }
  });
  it("never starts a matching piece with an accent mark on its own", () => {
    for (const note of all) for (const s of highlightSegments(note, TERMS)) expect(/^\p{M}/u.test(s.text) && s.match, JSON.stringify(note)).toBe(false);
  });
  it("marks text that folds to the term", () => {
    for (const note of all) for (const s of highlightSegments(note, ["door"])) if (s.match) expect(foldNote(s.text)).toContain("door");
  });
  it("marks nothing when the term is not in the folded note", () => {
    for (const note of all) {
      const has = foldNote(note).includes("zzq");
      expect(matchRanges(note, ["zzq"]).length > 0).toBe(has);
    }
  });
});

describe("folding over many awkward notes", () => {
  it("is idempotent", () => {
    for (const note of all) expect(foldNote(foldNote(note)), JSON.stringify(note)).toBe(foldNote(note));
  });
  it("keeps the map the same length as the folded text and in order", () => {
    for (const note of all) {
      const { folded, starts, ends } = foldWithMap(note);
      expect(starts).toHaveLength(folded.length);
      for (let i = 1; i < starts.length; i += 1) expect(starts[i]!).toBeGreaterThanOrEqual(starts[i - 1]!);
      for (let i = 0; i < ends.length; i += 1) expect(ends[i]!).toBeGreaterThan(starts[i]!);
    }
  });
  it("has words that are each found in the folded note, in order", () => {
    for (const note of all) {
      const folded = foldNote(note);
      let from = 0;
      for (const w of noteWords(note)) {
        const at = folded.indexOf(w, from);
        expect(at, `${w} in ${JSON.stringify(folded)}`).toBeGreaterThanOrEqual(0);
        from = at + w.length;
      }
    }
  });
  it("counts at most as many characters as UTF-16 units", () => {
    for (const note of all) expect(noteChars(note)).toBeLessThanOrEqual(note.length);
  });
});

describe("snippets over many awkward notes", () => {
  it("stays within the limit, is part of the trimmed note, and says what it cut", () => {
    for (const note of all) {
      for (const max of [10, 40, 120]) {
        const s = noteSnippet(note, ["door", "ramp"], max);
        if (!s.cut) {
          expect(s.text).toBe(note);
          continue;
        }
        expect(Array.from(s.text).length, JSON.stringify(note)).toBeLessThanOrEqual(max);
        expect(note.includes(s.text)).toBe(true);
        expect(s.before || s.after).toBe(true);
      }
    }
  });
  it("is the whole note exactly when the note fits in the limit", () => {
    for (const note of all) expect(noteSnippet(note, [], 2000).cut).toBe(false);
  });
  it("keeps the first match in view when it fits in the window", () => {
    let checked = 0;
    for (const note of all) {
      const r = matchRanges(note, ["door"])[0];
      if (r === undefined || noteChars(note) < 80 || noteChars(note.slice(r[0], r[1])) > 10) continue;
      const s = noteSnippet(note, ["door"], 70);
      expect(foldNote(s.text), JSON.stringify(note)).toContain("door");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });
});
