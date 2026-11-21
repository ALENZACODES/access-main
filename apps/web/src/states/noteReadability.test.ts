import { describe, expect, it } from "vitest";
import { LONG_SENTENCE_WORDS, MIN_SCORED_WORDS, READING_BANDS, readingBandOf, clampScore, rawScore, readNote } from "./noteReadability";

describe("rawScore", () => {
  it("matches the Flesch formula in English", () => {
    expect(rawScore(10, 1.5, "en")).toBeCloseTo(206.835 - 10.15 - 126.9, 6);
  });
  it("matches Kandel and Moles in French", () => {
    expect(rawScore(10, 1.5, "fr")).toBeCloseTo(207 - 10.15 - 110.4, 6);
  });
  it("falls as sentences get longer and as words get longer", () => {
    expect(rawScore(20, 1.5, "en")).toBeLessThan(rawScore(10, 1.5, "en"));
    expect(rawScore(10, 2, "en")).toBeLessThan(rawScore(10, 1.5, "en"));
    expect(rawScore(20, 1.5, "fr")).toBeLessThan(rawScore(10, 1.5, "fr"));
    expect(rawScore(10, 2, "fr")).toBeLessThan(rawScore(10, 1.5, "fr"));
  });
});

describe("clampScore and readingBandOf", () => {
  it("keeps the score in 0 to 100 and whole", () => {
    expect(clampScore(120.4)).toBe(100);
    expect(clampScore(-30)).toBe(0);
    expect(clampScore(54.5)).toBe(55);
    expect(clampScore(0)).toBe(0);
  });
  it.each([[100, "easy"], [70, "easy"], [69, "fair"], [50, "fair"], [49, "hard"], [30, "hard"], [29, "very-hard"], [0, "very-hard"]])("%i is %s", (score, band) => {
    expect(readingBandOf(score)).toBe(band);
  });
  it("names every band once", () => {
    expect(READING_BANDS).toEqual(["easy", "fair", "hard", "very-hard"]);
    expect(new Set(READING_BANDS.map((b) => readingBandOf(b === "easy" ? 90 : b === "fair" ? 60 : b === "hard" ? 40 : 10))).size).toBe(4);
  });
});

describe("readNote counts", () => {
  it("counts sentences, words and syllables", () => {
    const r = readNote("Ramp at the side entrance. Ring the bell.", "en");
    expect(r.sentences).toBe(2);
    expect(r.words).toBe(8);
    expect(r.syllables).toBe(9); // ramp at the side en-trance ring the bell
    expect(r.wordsPerSentence).toBe(4);
  });
  it("counts a number as a word read digit by digit", () => {
    const r = readNote("Two steps at 10 Main Street.", "en");
    expect(r.words).toBe(6);
    expect(r.syllables).toBe(1 + 1 + 1 + 2 + 1 + 1);
  });
  it("reads a hyphenated word part by part and counts it once", () => {
    const r = readNote("Washrooms are in the sous-sol near the lift today.", "fr");
    expect(r.words).toBe(9);
  });
  it("lists a long word once however often it appears", () => {
    const r = readNote("The elevator is slow. The elevator is old. An Elevator helps.", "en");
    expect(r.longWords).toEqual(["elevator"]);
  });
  it("flags a sentence with more than the allowed words", () => {
    const long = Array.from({ length: LONG_SENTENCE_WORDS + 1 }, () => "go").join(" ") + ".";
    const r = readNote(`Ring. ${long}`, "en");
    expect(r.longSentences).toHaveLength(1);
    expect(r.longSentences[0]!.words).toBe(LONG_SENTENCE_WORDS + 1);
    const exact = Array.from({ length: LONG_SENTENCE_WORDS }, () => "go").join(" ") + ".";
    expect(readNote(exact, "en").longSentences).toHaveLength(0);
  });
});

describe("readNote scoring", () => {
  it("gives no score to no note, a blank note or a few words", () => {
    for (const note of [null, "", "   ", "Open daily"]) {
      const r = readNote(note, "en");
      expect(r.score).toBeNull();
      expect(r.band).toBeNull();
    }
  });
  it("scores a note of exactly the minimum words and not one fewer", () => {
    const n = Array.from({ length: MIN_SCORED_WORDS }, () => "go").join(" ");
    expect(readNote(n, "en").score).not.toBeNull();
    expect(readNote(n.split(" ").slice(1).join(" "), "en").score).toBeNull();
  });
  it("reads a plain note as easy", () => {
    const r = readNote("Ramp at the side door. Ring the bell. Staff will help you in.", "en");
    expect(r.band).toBe("easy");
    expect(r.score).toBeGreaterThanOrEqual(70);
  });
  it("reads a heavy note as hard or worse", () => {
    const r = readNote("Accessibility accommodations necessitate preliminary communication regarding architectural modifications, notwithstanding unpredictable circumstances affecting administrative availability throughout institutional operations.", "en");
    expect(["hard", "very-hard"]).toContain(r.band);
  });
  it("scores a longer sentence lower than the same words split up", () => {
    const together = readNote("Ring the bell at the side door and wait for staff to come and help you in through the back.", "en");
    const apart = readNote("Ring the bell at the side door. Wait for staff to come. They will help you in. Use the back.", "en");
    expect(rawScore(together.wordsPerSentence, together.syllablesPerWord, "en")).toBeLessThan(rawScore(apart.wordsPerSentence, apart.syllablesPerWord, "en"));
    expect(together.wordsPerSentence).toBeGreaterThan(apart.wordsPerSentence);
  });
  it("scores French by its own formula", () => {
    const r = readNote("Entrée par le côté. Sonnez la sonnette. Le personnel vous aide.", "fr");
    expect(r.locale).toBe("fr");
    expect(r.score).toBe(clampScore(rawScore(r.wordsPerSentence, r.syllablesPerWord, "fr")));
    expect(r.band).toBe("easy");
  });
  it("is the same every time", () => {
    const note = "Two steps at the front door. No ramp. Use the side entrance on the left.";
    expect(readNote(note, "en")).toEqual(readNote(note, "en"));
  });
  it("never gives a score outside 0 to 100", () => {
    for (const note of ["Go on. Go on. Go on. Go on. Go on. Go on.", "Internationalization institutionalization characteristically unconstitutionally."]) {
      const r = readNote(note, "en");
      if (r.score !== null) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });
  it("has no score when the text has no words at all", () => {
    expect(readNote("— — — ! ! !", "en").score).toBeNull();
    expect(readNote("— — — ! ! !", "en").sentences).toBe(0);
  });
});
