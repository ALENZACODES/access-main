import { describe, expect, it } from "vitest";
import { MAX_READ_CHARS, splitSentences, tokensOf } from "./noteSentences";

describe("splitSentences", () => {
  it("splits on full stops, question marks and exclamation marks", () => {
    expect(splitSentences("Ramp at the side. Ring the bell! Is it open? Yes.")).toEqual(["Ramp at the side.", "Ring the bell!", "Is it open?", "Yes."]);
  });
  it("keeps text with no end mark as one sentence", () => {
    expect(splitSentences("Open daily until late")).toEqual(["Open daily until late"]);
  });
  it("gives nothing for empty or blank text", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("  \n\t ")).toEqual([]);
  });
  it("does not split after a short form", () => {
    expect(splitSentences("Side door on King St. East. Ring the bell.")).toEqual(["Side door on King St. East.", "Ring the bell."]);
    expect(splitSentences("Entrée au 10 av. Principale. Sonnez.")).toEqual(["Entrée au 10 av. Principale.", "Sonnez."]);
  });
  it("does not split inside a number", () => {
    expect(splitSentences("The ramp is 1.5 m wide. Good.")).toEqual(["The ramp is 1.5 m wide.", "Good."]);
  });
  it("treats a run of dots as one end", () => {
    expect(splitSentences("Wait... then ring. Done.")).toEqual(["Wait...", "then ring.", "Done."]);
  });
  it("keeps a closing quote with its sentence", () => {
    expect(splitSentences("Sign says \"use side door.\" Ring it.")).toEqual(["Sign says \"use side door.\"", "Ring it."]);
  });
  it("collapses whitespace and newlines", () => {
    expect(splitSentences("One.\n\nTwo.   Three.")).toEqual(["One.", "Two.", "Three."]);
  });
  it("splits at a semicolon only when a full clause follows", () => {
    expect(splitSentences("Two steps; no ramp.")).toEqual(["Two steps; no ramp."]);
    expect(splitSentences("There are two steps at the door; the other entrance has a ramp and a bell.")).toHaveLength(2);
  });
  it("reads no further than the limit", () => {
    const long = "word ".repeat(MAX_READ_CHARS);
    expect(splitSentences(long).join(" ").length).toBeLessThanOrEqual(MAX_READ_CHARS);
  });
  it("does not lose any words in what it reads", () => {
    const text = "Ramp at the side. Ring the bell; staff will help you in. Two steps at 10 Main St. Open late";
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    expect(splitSentences(text).reduce((n, s) => n + words(s), 0)).toBe(words(text));
  });
  it("handles an ellipsis character", () => {
    expect(splitSentences("Maybe… ask first.")).toEqual(["Maybe…", "ask first."]);
  });
});

describe("tokensOf", () => {
  it("returns words and numbers in order", () => {
    expect(tokensOf("Two steps at 10 Main Street")).toEqual([
      { kind: "word", text: "Two" }, { kind: "word", text: "steps" }, { kind: "word", text: "at" }, { kind: "number", text: "10" }, { kind: "word", text: "Main" }, { kind: "word", text: "Street" },
    ]);
  });
  it("keeps an inner apostrophe or hyphen in a word", () => {
    expect(tokensOf("l’entrée sous-sol O'Neil").map((t) => t.text)).toEqual(["l’entrée", "sous-sol", "O'Neil"]);
  });
  it("keeps a decimal or a time as one number", () => {
    expect(tokensOf("1.5 m at 9:30")).toEqual([{ kind: "number", text: "1.5" }, { kind: "word", text: "m" }, { kind: "word", text: "at" }, { kind: "number", text: "9:30" }]);
  });
  it("ignores punctuation and symbols", () => {
    expect(tokensOf("— ! ? & #")).toEqual([]);
  });
  it("keeps accented words whole", () => {
    expect(tokensOf("Café Étoile")).toHaveLength(2);
    expect(tokensOf("Café")[0]!.text).toBe("Café");
  });
});
