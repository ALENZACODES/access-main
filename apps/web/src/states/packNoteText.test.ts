import { describe, expect, it } from "vitest";
import {
  MEDIUM_NOTE_MAX, SHORT_NOTE_MAX, NOTE_LENGTHS, foldNote, foldWithMap, highlightSegments, lengthClass, matchRanges, noteChars, noteSnippet, noteWords,
} from "./packNoteText";

describe("foldNote", () => {
  it("lowers case, drops accents, straightens quotes and collapses space", () => {
    expect(foldNote("  Entrée   du  CAFÉ\n")).toBe("entree du cafe");
    expect(foldNote("Don’t")).toBe("don't");
    expect(foldNote("a\t\tb")).toBe("a b");
  });
  it("folds the same words written two ways to one string", () => {
    expect(foldNote("Rampe d’accès")).toBe(foldNote("RAMPE D'ACCES"));
    expect(foldNote("é")).toBe(foldNote("é"));
  });
  it("gives an empty string for nothing but space", () => {
    for (const s of ["", " ", "\n\t "]) expect(foldNote(s)).toBe("");
  });
  it("keeps characters that have no accent to drop", () => {
    expect(foldNote("日本語")).toBe("日本語");
    expect(foldNote("ß")).toBe("ß");
  });
});

describe("foldWithMap", () => {
  it("maps every folded unit back to where its character starts and ends", () => {
    const { folded, starts, ends } = foldWithMap("Café");
    expect(folded).toBe("cafe");
    expect(starts).toEqual([0, 1, 2, 3]);
    expect(ends).toEqual([1, 2, 3, 4]);
  });
  it("handles a letter written as base plus accent mark", () => {
    const { folded, starts, ends } = foldWithMap("éx");
    expect(folded).toBe("ex");
    expect(starts).toEqual([0, 2]);
    expect(ends).toEqual([1, 3]);
  });
  it("handles a character outside the basic plane as one character", () => {
    const { folded, starts, ends } = foldWithMap("a😀b");
    expect(folded).toBe("a😀b");
    expect(starts[1]).toBe(1);
    expect(ends[1]).toBe(3);
    expect(starts[folded.length - 1]).toBe(3);
  });
  it("has one map entry for each unit of the folded text", () => {
    for (const s of ["", "Hello", "Été à l’hôtel", "İstanbul", "😀😀"]) {
      const m = foldWithMap(s);
      expect(m.starts).toHaveLength(m.folded.length);
      expect(m.ends).toHaveLength(m.folded.length);
    }
  });
});

describe("noteWords", () => {
  it("splits on anything that is not a letter or a digit", () => {
    expect(noteWords("Step at 10 Dundas St., side-door")).toEqual(["step", "at", "10", "dundas", "st", "side", "door"]);
  });
  it("splits at an apostrophe", () => {
    expect(noteWords("l’entrée d'honneur")).toEqual(["l", "entree", "d", "honneur"]);
  });
  it("is empty for a note with no words", () => {
    expect(noteWords("— … ,")).toEqual([]);
  });
  it("keeps letters of other scripts", () => {
    expect(noteWords("入口 は 左")).toEqual(["入口", "は", "左"]);
  });
});

describe("noteChars and lengthClass", () => {
  it("counts a letter with an accent, or an emoji, as one character", () => {
    expect(noteChars("é")).toBe(1);
    expect(noteChars("😀")).toBe(1);
    expect(noteChars("")).toBe(0);
    expect(noteChars("abc")).toBe(3);
  });
  it("puts the edges of each class in the lower class", () => {
    expect(lengthClass(0)).toBe("short");
    expect(lengthClass(SHORT_NOTE_MAX)).toBe("short");
    expect(lengthClass(SHORT_NOTE_MAX + 1)).toBe("medium");
    expect(lengthClass(MEDIUM_NOTE_MAX)).toBe("medium");
    expect(lengthClass(MEDIUM_NOTE_MAX + 1)).toBe("long");
  });
  it("has three classes in order", () => {
    expect([...NOTE_LENGTHS]).toEqual(["short", "medium", "long"]);
  });
});

describe("matchRanges", () => {
  it("finds a term ignoring case and accents, and returns where it sits in the original", () => {
    expect(matchRanges("Entrée du CAFÉ", ["cafe"])).toEqual([[10, 14]]);
    expect(matchRanges("Entrée du CAFÉ", ["entree"])).toEqual([[0, 6]]);
  });
  it("finds every occurrence", () => {
    expect(matchRanges("door door", ["door"])).toEqual([[0, 4], [5, 9]]);
  });
  it("merges overlapping and touching matches", () => {
    expect(matchRanges("abcdef", ["abc", "cde"])).toEqual([[0, 5]]);
    expect(matchRanges("abcdef", ["abc", "def"])).toEqual([[0, 6]]);
  });
  it("finds a match that starts inside a word, since a phrase can", () => {
    expect(matchRanges("sidedoor", ["door"])).toEqual([[4, 8]]);
  });
  it("ignores empty terms and finds nothing in an empty note", () => {
    expect(matchRanges("abc", ["", "  "])).toEqual([]);
    expect(matchRanges("", ["a"])).toEqual([]);
  });
  it("covers the whole accented letter when the term is the folded letter", () => {
    expect(matchRanges("é", ["e"])).toEqual([[0, 1]]);
    expect(matchRanges("é", ["e"])).toEqual([[0, 2]]);
  });
  it("does not cut an accent mark off its letter, in the middle of a note either", () => {
    const note = "cafe\u0301 e\u0301";
    expect(matchRanges(note, ["cafe"])).toEqual([[0, 5]]);
    expect(highlightSegments(note, ["cafe"]).map((x) => x.text)).toEqual(["cafe\u0301", " e\u0301"]);
  });
  it("matches across a collapsed run of space only when the term has one space", () => {
    expect(matchRanges("a  b", ["a b"])).toEqual([]);
  });
});

describe("highlightSegments", () => {
  it("returns the note whole when nothing matches", () => {
    expect(highlightSegments("Step at the door", ["ramp"])).toEqual([{ text: "Step at the door", match: false }]);
    expect(highlightSegments("Step", [])).toEqual([{ text: "Step", match: false }]);
  });
  it("returns nothing for an empty note", () => {
    expect(highlightSegments("", ["a"])).toEqual([]);
  });
  it("marks matches and keeps the text between them", () => {
    expect(highlightSegments("Step at the door", ["step", "door"])).toEqual([
      { text: "Step", match: true }, { text: " at the ", match: false }, { text: "door", match: true },
    ]);
  });
  it("marks a match at the very end and at the very start", () => {
    expect(highlightSegments("door", ["door"])).toEqual([{ text: "door", match: true }]);
    const segs = highlightSegments("a door b", ["a"]);
    expect(segs[0]).toEqual({ text: "a", match: true });
  });
  it("joins back to exactly the note", () => {
    for (const note of ["Step at the door", "Entrée — sonnez ‘ici’", "a😀b door", "\n\nline\nbreak"]) {
      expect(highlightSegments(note, ["door", "e", "b"]).map((s) => s.text).join("")).toBe(note);
    }
  });
  it("never makes an empty piece", () => {
    for (const s of highlightSegments("aaa bbb aaa", ["aaa", "bbb"])) expect(s.text.length).toBeGreaterThan(0);
  });
});

describe("noteSnippet", () => {
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  it("returns the note whole when it fits", () => {
    expect(noteSnippet("short note", ["note"], 50)).toEqual({ text: "short note", cut: false, before: false, after: false });
    expect(noteSnippet("12345", [], 5).cut).toBe(false);
  });
  it("cuts a long note at a word and says the end was cut", () => {
    const s = noteSnippet(long, [], 40);
    expect(s.cut).toBe(true);
    expect(s.before).toBe(false);
    expect(s.after).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(40);
    expect(long.startsWith(s.text)).toBe(true);
    expect(s.text.endsWith("word") ? false : /\s|\d$/.test(s.text.slice(-1))).toBe(true);
  });
  it("centres a window near the first match and says both ends were cut", () => {
    const s = noteSnippet(long, ["word30"], 60);
    expect(s.text).toContain("word30");
    expect(s.before).toBe(true);
    expect(s.after).toBe(true);
    expect(long).toContain(s.text);
  });
  it("starts the window at the start of a word", () => {
    const s = noteSnippet(long, ["word45"], 50);
    expect(s.text.startsWith("word")).toBe(true);
  });
  it("shows the end of the note when the match is near it, without an after cut", () => {
    const s = noteSnippet(long, ["word59"], 50);
    expect(s.text).toContain("word59");
    expect(s.after).toBe(false);
    expect(s.before).toBe(true);
  });
  it("never goes over the limit, and a limit under one is read as one", () => {
    for (const max of [1, 5, 17, 50, 120]) expect(Array.from(noteSnippet(long, ["word10"], max).text).length).toBeLessThanOrEqual(Math.max(1, max));
    expect(Array.from(noteSnippet("abcdef", [], 0).text).length).toBeLessThanOrEqual(1);
  });
  it("copes with a long note that has no spaces", () => {
    const s = noteSnippet("x".repeat(500), ["xx"], 80);
    expect(Array.from(s.text).length).toBeLessThanOrEqual(80);
    expect(s.cut).toBe(true);
  });
});
