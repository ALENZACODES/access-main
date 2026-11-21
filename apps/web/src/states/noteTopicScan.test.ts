import { describe, expect, it } from "vitest";
import { lcg } from "./placeFixtures";
import { TOPIC_IDS } from "./noteTopicLexicon";
import { TOPIC_MAX_SCAN_CHARS, scanTopics, topicMarkSegments, topicWordSpans } from "./noteTopicScan";
import { foldText } from "./suggest";

const topicsOf = (text: string) => scanTopics(text).map((m) => m.topic);
const cuesOf = (text: string) => scanTopics(text).map((m) => m.cue);

describe("topicWordSpans", () => {
  it("gives each word with its folded form and where it sits in the text", () => {
    const spans = topicWordSpans("Entrée par l’ESCALIER");
    expect(spans.map((s) => s.folded)).toEqual(["entree", "par", "l", "escalier"]);
    expect("Entrée par l’ESCALIER".slice(spans[3]!.start, spans[3]!.end)).toBe("ESCALIER");
  });
  it("keeps an accent mark with its letter, composed or not", () => {
    const text = "Entée";
    expect(topicWordSpans(text)).toEqual([{ folded: "entee", start: 0, end: text.length }]);
  });
  it("splits at hyphens, slashes and digits stay in words", () => {
    expect(topicWordSpans("sous-sol/door 10").map((s) => s.folded)).toEqual(["sous", "sol", "door", "10"]);
  });
  it("gives nothing for empty text, spaces or only punctuation", () => {
    for (const t of ["", "   ", "...!?"]) expect(topicWordSpans(t)).toEqual([]);
  });
  it("reads no further than the limit", () => {
    const long = "door ".repeat(TOPIC_MAX_SCAN_CHARS);
    const spans = topicWordSpans(long);
    expect(spans.length).toBe(Math.ceil(TOPIC_MAX_SCAN_CHARS / 5));
    expect(spans[spans.length - 1]!.end).toBeLessThanOrEqual(TOPIC_MAX_SCAN_CHARS);
  });
});

describe("scanTopics: what it finds", () => {
  it("finds a word of each topic in English", () => {
    const samples: Record<string, string> = {
      steps: "three steps", ramp: "a long ramp", lift: "the elevator", door: "the front door", washroom: "restroom upstairs",
      parking: "parking lot", floor: "second floor", width: "narrow", surface: "gravel", seating: "tables", help: "ask staff",
    };
    for (const id of TOPIC_IDS) expect(topicsOf(samples[id]!), id).toContain(id);
  });
  it("finds French words, with or without their accents or capitals", () => {
    expect(topicsOf("ASCENSEUR")).toEqual(["lift"]);
    expect(topicsOf("Entrée")).toEqual(["door"]);
    expect(topicsOf("entree")).toEqual(["door"]);
    expect(topicsOf("étage")).toEqual(["floor"]);
  });
  it("reads a cue of several words as one use, longest first", () => {
    expect(cuesOf("Salle de bain au sous-sol")).toEqual(["salle de bain", "sous sol"]);
    expect(cuesOf("rez-de-chaussée")).toEqual(["rez de chaussee"]);
    expect(cuesOf("salles de toilette")).toEqual(["salles de toilette"]);
  });
  it("does not use a word inside another word", () => {
    for (const t of ["doorstop", "rampage", "icebox", "stepping", "liftoff", "tablet", "asked", "bellow", "icing"]) expect(scanTopics(t), t).toEqual([]);
  });
  it("matches a whole word at the start, middle and end of the text", () => {
    expect(cuesOf("door")).toEqual(["door"]);
    expect(cuesOf("a door here")).toEqual(["door"]);
    expect(cuesOf("by the door")).toEqual(["door"]);
  });
  it("finds every use, in reading order, with the right positions", () => {
    const text = "Door, then ramp, then another door.";
    const found = scanTopics(text);
    expect(found.map((m) => text.slice(m.start, m.end))).toEqual(["Door", "ramp", "door"]);
    expect(found.map((m) => m.topic)).toEqual(["door", "ramp", "door"]);
  });
  it("gives nothing for text with no topic word, and for empty text", () => {
    expect(scanTopics("Open daily until late")).toEqual([]);
    expect(scanTopics("")).toEqual([]);
  });
  it("treats a word that two cues could share as the one topic it belongs to", () => {
    expect(topicsOf("ring")).toEqual(["help"]);
    expect(topicsOf("counter")).toEqual(["seating"]);
  });
  it("counts the words it names, not what the note goes on to say", () => {
    expect(topicsOf("There is no way to use the ramp")).toEqual(["ramp"]);
  });
});

describe("scanTopics: words that come after a negating word", () => {
  const neg = (t: string) => scanTopics(t).map((m) => m.negated);
  it("marks a use right after no, not, without, sans or pas", () => {
    expect(neg("no steps")).toEqual([true]);
    expect(neg("not a ramp")).toEqual([true]);
    expect(neg("without an elevator")).toEqual([true]);
    expect(neg("sans ascenseur")).toEqual([true]);
    expect(neg("pas de marches")).toEqual([true]);
    expect(neg("Pas d’escalier")).toEqual([true]);
  });
  it("looks back two words and no further", () => {
    expect(neg("no way to the door")).toEqual([false]);
    expect(neg("no wide ramp")).toEqual([true, true]);
    expect(neg("no very wide ramp")).toEqual([true, false]);
  });
  it("does not carry a negating word over a full stop, comma, semicolon, colon, question mark, dash, bracket or line break", () => {
    for (const sep of [". ", ", ", "; ", ": ", "? ", "\n", " \u2014 ", " \u2013 ", " ("]) expect(neg(`no${sep}ramp`), JSON.stringify(sep)).toEqual([false]);
  });
  it("is case-blind and leaves other uses in the same note unmarked", () => {
    expect(neg("NO RAMP, ramp inside")).toEqual([true, false]);
  });
  it("does not mark a word that only looks like a negator", () => {
    for (const t of ["nothing ramp", "know ramp", "notable ramp", "snow"]) expect(neg(t), t).not.toContain(true);
  });
  it("marks nothing at the very start of a note", () => {
    expect(neg("ramp")).toEqual([false]);
  });
});

describe("topicMarkSegments", () => {
  it("cuts the note so the pieces join back to exactly the note", () => {
    const text = "Ramp at the side entrance. Ring the bell.";
    const segs = topicMarkSegments(text, scanTopics(text));
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.mention !== null).map((s) => s.text)).toEqual(["Ramp", "entrance", "Ring", "bell"]);
  });
  it("is one piece with no mention when nothing was found", () => {
    expect(topicMarkSegments("Open daily", [])).toEqual([{ text: "Open daily", mention: null }]);
  });
  it("gives nothing for empty text", () => {
    expect(topicMarkSegments("", [])).toEqual([]);
  });
  it("skips a mention that overlaps the one before it or runs past the text", () => {
    const mk = (start: number, end: number) => ({ topic: "door" as const, cue: "door", start, end, negated: false });
    const segs = topicMarkSegments("a door here", [mk(2, 6), mk(4, 8), mk(8, 50)]);
    expect(segs.map((s) => s.text).join("")).toBe("a door here");
    expect(segs.filter((s) => s.mention !== null)).toHaveLength(1);
  });
  it("sorts mentions that arrive out of order", () => {
    const text = "door ramp";
    const found = scanTopics(text);
    expect(topicMarkSegments(text, [...found].reverse()).filter((s) => s.mention).map((s) => s.text)).toEqual(["door", "ramp"]);
  });
});

describe("scanTopics: invariants on generated text", () => {
  const WORDS = ["door", "ramp", "no", "without", "Entrée", "salle", "de", "bain", "sous-sol", "the", "ascenseur", "steps", "—", "…", ".", ";", "ice", "x", "東京", "l’escalier", "\n", "  "];
  const make = (seed: number) => {
    const next = lcg(seed);
    return Array.from({ length: 4 + Math.floor(next() * 30) }, () => WORDS[Math.floor(next() * WORDS.length)]!).join(next() < 0.5 ? " " : "");
  };
  it("always finds ordered, separate pieces of the text whose folded form is the cue", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const text = make(seed);
      const found = scanTopics(text);
      let end = 0;
      for (const m of found) {
        expect(m.start, text).toBeGreaterThanOrEqual(end);
        expect(m.end).toBeGreaterThan(m.start);
        expect(foldText(text.slice(m.start, m.end)), JSON.stringify(text)).toBe(m.cue);
        end = m.end;
      }
    }
  });
  it("always cuts into pieces that join back to the text", () => {
    for (let seed = 200; seed < 350; seed++) {
      const text = make(seed);
      expect(topicMarkSegments(text, scanTopics(text)).map((s) => s.text).join("")).toBe(text);
    }
  });
  it("gives the same answer every time and never throws on odd text", () => {
    for (const text of ["\u0000", "\uD800", "á́́", "ǅ", "🦽 ramp 🦽", "﷽ door"]) {
      expect(scanTopics(text)).toEqual(scanTopics(text));
    }
  });
});
