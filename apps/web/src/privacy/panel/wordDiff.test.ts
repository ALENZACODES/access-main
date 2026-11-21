import { describe, expect, it } from "vitest";
import { diffWords, hasChange, sideOf, words } from "./wordDiff";

describe("words", () => {
  it("keeps the space after each word, so joining gives back the text", () => {
    const text = "Keep  the reports here. ";
    expect(words(text).join("")).toBe(text);
  });
  it("splits on spaces and keeps leading space as its own piece", () => {
    expect(words(" a b")).toEqual([" ", "a ", "b"]);
    expect(words("")).toEqual([]);
  });
});

describe("diffWords", () => {
  it("is one unchanged piece for equal texts", () => {
    expect(diffWords("a b c", "a b c")).toEqual([{ kind: "same", text: "a b c" }]);
  });
  it("is empty for two empty texts", () => {
    expect(diffWords("", "")).toEqual([]);
  });
  it("reports everything added to an empty text and everything removed to an empty one", () => {
    expect(diffWords("", "a b")).toEqual([{ kind: "added", text: "a b" }]);
    expect(diffWords("a b", "")).toEqual([{ kind: "removed", text: "a b" }]);
  });
  it("reports a replaced word as removed then added", () => {
    expect(diffWords("keep it here", "keep it there")).toEqual([
      { kind: "same", text: "keep it " },
      { kind: "removed", text: "here" },
      { kind: "added", text: "there" },
    ]);
  });
  it("reports a word added in the middle", () => {
    expect(diffWords("a c", "a b c")).toEqual([
      { kind: "same", text: "a " },
      { kind: "added", text: "b " },
      { kind: "same", text: "c" },
    ]);
  });
  it("reports a word removed at the start", () => {
    expect(diffWords("not sent anywhere", "sent anywhere")).toEqual([
      { kind: "removed", text: "not " },
      { kind: "same", text: "sent anywhere" },
    ]);
  });
  it("finds the longest shared run, not the first match", () => {
    const d = diffWords("a b c d e", "x b c d y");
    expect(d.filter((s) => s.kind === "same").map((s) => s.text)).toEqual(["b c d "]);
  });
  it("treats a change of final punctuation as a change of that word", () => {
    expect(hasChange("They stay here.", "They stay here!")).toBe(true);
  });
  it("does not treat a change of spacing as a change", () => {
    expect(hasChange("a  b", "a b")).toBe(false);
    expect(hasChange("a b ", "a b")).toBe(false);
  });
  it("keeps no-break spaces inside the text it returns", () => {
    const after = "Vraiment ? Oui";
    expect(diffWords("Vraiment ? Non", after).map((s) => s.text).join("")).toContain(" ");
  });
  it("is symmetric: swapping the texts swaps removed and added", () => {
    const a = "keep the reports on this device";
    const b = "keep reports on your device now";
    const swap = (k: string): string => (k === "removed" ? "added" : k === "added" ? "removed" : k);
    expect(diffWords(b, a).map((s) => `${swap(s.kind)}:${s.text.trim()}`).sort()).toEqual(diffWords(a, b).map((s) => `${s.kind}:${s.text.trim()}`).sort());
  });
});

describe("sideOf", () => {
  const before = "Keep the reports on this device. Nothing is sent.";
  const after = "Keep the reports on this device. They are not sent anywhere.";
  it("gives back the earlier text from the comparison", () => {
    expect(sideOf(diffWords(before, after), "before")).toBe(before);
  });
  it("gives back the later text from the comparison", () => {
    expect(sideOf(diffWords(before, after), "after")).toBe(after);
  });
  it("round-trips for texts with repeated words", () => {
    const a = "a a b a c a";
    const b = "a b a a c c a";
    const d = diffWords(a, b);
    expect(sideOf(d, "before")).toBe(a);
    expect(sideOf(d, "after")).toBe(b);
  });
});
