import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { HINT_KINDS, hintText, hintsFor, type NoteHint } from "./noteHints";
import { lintFrench } from "./typography";

const kinds = (note: string | null, l: "en" | "fr" = "en") => hintsFor(note, l).map((h) => h.kind);
const go = (n: number) => Array.from({ length: n }, () => "go").join(" ");

describe("hintsFor", () => {
  it("has none for no note, a blank note or a plain note", () => {
    expect(hintsFor(null, "en")).toEqual([]);
    expect(hintsFor("  ", "en")).toEqual([]);
    expect(hintsFor("Ramp at the side door. Ring the bell. Staff will help you in.", "en")).toEqual([]);
  });
  it("points at a long sentence with its start", () => {
    const h = hintsFor(`${go(40)}. Ring.`, "en");
    expect(h).toHaveLength(1);
    expect(h[0]!.kind).toBe("long-sentence");
    expect(h[0]!.excerpt.length).toBeLessThanOrEqual(80);
    expect(h[0]!.excerpt.endsWith("…")).toBe(true);
  });
  it("does not flag a sentence of exactly the limit", () => {
    expect(kinds(`${go(20)}.`)).not.toContain("long-sentence");
  });
  it("points at a long word once", () => {
    const h = hintsFor("The elevator is slow. The elevator is old. Ask staff.", "en").filter((x) => x.kind === "long-word");
    expect(h).toEqual([{ kind: "long-word", excerpt: "elevator" }]);
  });
  it("points at a word in capitals but not a short one", () => {
    expect(hintsFor("Use the SIDE door. Ring it. Wait for an OK from staff.", "en").filter((h) => h.kind === "all-caps")).toEqual([{ kind: "all-caps", excerpt: "SIDE" }]);
  });
  it("does not call a number or a name in mixed case capitals", () => {
    expect(kinds("Use the Main door at 2650 Quesnel Road. Ring the bell now.")).not.toContain("all-caps");
  });
  it("notes a note with no end mark, once it is long enough to matter", () => {
    expect(kinds("Open daily until late")).not.toContain("no-end-mark");
    expect(kinds("Ramp at the side door and ring the bell for help")).toContain("no-end-mark");
    expect(kinds("Ramp at the side door and ring the bell for help.")).not.toContain("no-end-mark");
    expect(kinds("Ramp at the side door and ring the bell for help.”")).not.toContain("no-end-mark");
  });
  it("notes a note that is mostly numbers", () => {
    expect(kinds("Doors 12 14 16 open 9 to 5")).toContain("many-numbers");
    expect(kinds("Ramp at the side door. Ring the bell. Open 9 to 5 daily.")).not.toContain("many-numbers");
  });
  it("notes a chain of semicolons", () => {
    expect(kinds("Ramp; bell; two steps; no lift.")).toContain("semicolon-chain");
    expect(kinds("Ramp; bell.")).not.toContain("semicolon-chain");
  });
  it("points at short forms a reader may not know, once each", () => {
    const h = hintsFor("Approx. 3 steps. TBC. Approx. again.", "en").filter((x) => x.kind === "short-forms");
    expect(h.map((x) => x.excerpt.toLowerCase().replace(/\.$/, ""))).toEqual(["approx", "tbc"]);
  });
  it("lists hints in the fixed order of kinds", () => {
    const note = `Use the SIDE door; ring; wait; go on. The elevator is slow. ${go(25)}`;
    const ks = kinds(note);
    const ranks = ks.map((k) => HINT_KINDS.indexOf(k));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ks).size).toBeGreaterThanOrEqual(4);
  });
  it("never changes the note it reads", () => {
    const note = "Use the SIDE door; ring; wait; go on.";
    const copy = String(note);
    hintsFor(note, "en");
    expect(note).toBe(copy);
  });
  it("works on French notes", () => {
    expect(kinds("Entrée par le côté. Sonnez la sonnette. Le personnel vous aide.", "fr")).toEqual([]);
    expect(kinds("Utilisez la PORTE latérale, sonnez, attendez le personnel pour de l’aide", "fr")).toEqual(expect.arrayContaining(["all-caps", "no-end-mark"]));
  });
});

describe("hintText", () => {
  const sample: NoteHint[] = HINT_KINDS.map((kind) => ({ kind, excerpt: kind === "long-word" ? "elevator" : "SIDE" }));
  it("says something for every kind in both languages", () => {
    for (const l of ["en", "fr"] as const) for (const h of sample) expect(hintText(h, l).length).toBeGreaterThan(10);
  });
  it("includes the excerpt where it has one", () => {
    expect(hintText({ kind: "long-word", excerpt: "elevator" }, "en")).toContain("elevator");
    expect(hintText({ kind: "all-caps", excerpt: "SIDE" }, "fr")).toContain("SIDE");
  });
  it("passes the copy lint, with French typography in French", () => {
    for (const h of sample) {
      expect(lintCopy(hintText(h, "en"), "en"), hintText(h, "en")).toEqual([]);
      expect(lintCopy(hintText(h, "fr"), "fr"), hintText(h, "fr")).toEqual([]);
      expect(lintFrench(hintText(h, "fr"))).toEqual([]);
    }
  });
  it("has one wording for each kind", () => {
    expect(new Set(sample.map((h) => hintText({ ...h, excerpt: "x" }, "en"))).size).toBe(HINT_KINDS.length);
  });
});
