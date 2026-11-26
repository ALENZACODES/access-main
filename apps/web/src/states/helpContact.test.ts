import { describe, expect, it } from "vitest";
import { digitWords, kindName, readContact, spokenContact } from "./helpContact";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const say = (s: string, l: "en" | "fr" = "en") => spokenContact(readContact(s)!, l);

describe("readContact", () => {
  it("has no reading for text with no digit", () => {
    for (const s of ["", "none", "-", "()"]) expect(readContact(s), s).toBeNull();
  });
  it("groups the digits by the pack's separators", () => {
    expect(readContact("1-866-531-2600")).toEqual({ digits: "18665312600", groups: ["1", "866", "531", "2600"], kind: "toll-free" });
    expect(readContact("9-8-8")).toEqual({ digits: "988", groups: ["9", "8", "8"], kind: "short" });
    expect(readContact("911")).toEqual({ digits: "911", groups: ["911"], kind: "short" });
  });
  it("tells a short, toll-free and ten-digit number apart", () => {
    expect(readContact("211")?.kind).toBe("short");
    expect(readContact("1-800-268-9017")?.kind).toBe("toll-free");
    expect(readContact("416-555-0100")?.kind).toBe("ten-digit");
    expect(readContact("(416) 555 0100")?.kind).toBe("ten-digit");
  });
  it("calls every other length other", () => {
    for (const s of ["12", "1234", "41655501", "1-416-555-0100", "+44 20 7946 0958"]) expect(readContact(s)?.kind, s).toBe("other");
  });
  it("knows every toll-free prefix, and only those", () => {
    for (const p of ["800", "833", "844", "855", "866", "877", "888"]) expect(readContact(`1-${p}-555-0100`)?.kind, p).toBe("toll-free");
    for (const p of ["811", "822", "899", "900"]) expect(readContact(`1-${p}-555-0100`)?.kind, p).toBe("other");
  });
  it("does not take an eleven-digit number that does not start with one for toll free", () => {
    expect(readContact("2-866-531-2600")?.kind).toBe("other");
  });
  it("needs the leading one for toll free", () => {
    expect(readContact("866-531-2600")?.kind).toBe("ten-digit");
  });
});

describe("spokenContact", () => {
  it("says a three-digit number digit by digit", () => {
    expect(say("911")).toBe("nine one one");
    expect(say("211")).toBe("two one one");
    expect(say("811")).toBe("eight one one");
  });
  it("says single digits as one run", () => {
    expect(say("9-8-8")).toBe("nine eight eight");
    expect(say("9 8 8")).toBe("nine eight eight");
  });
  it("says a long number in groups, with a pause between", () => {
    expect(say("1-866-531-2600")).toBe("one, eight six six, five three one, two six zero zero");
    expect(say("1-800-268-9017")).toBe("one, eight zero zero, two six eight, nine zero one seven");
  });
  it("says zero as zero, in both languages", () => {
    expect(say("100")).toBe("one zero zero");
    expect(say("100", "fr")).toBe("un zéro zéro");
  });
  it("says it in French", () => {
    expect(say("911", "fr")).toBe("neuf un un");
    expect(say("9-8-8", "fr")).toBe("neuf huit huit");
    expect(say("1-866-531-2600", "fr")).toBe("un, huit six six, cinq trois un, deux six zéro zéro");
  });
  it("says a long run of single digits in groups, not as one run", () => {
    expect(say("1-2-3-4-5")).toBe("one, two, three, four, five");
    expect(say("1-2-3-4")).toBe("one two three four");
  });
  it("uses every digit exactly once and in order", () => {
    for (const s of ["1-866-531-2600", "9-8-8", "416 555 0100", "+1 (416) 555-0100"]) {
      const r = readContact(s)!;
      const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
      const back = spokenContact(r, "en").split(/[ ,]+/).filter(Boolean).map((w) => words.indexOf(w)).join("");
      expect(back, s).toBe(r.digits);
    }
  });
});

describe("digitWords", () => {
  it("reads each digit", () => {
    expect(digitWords("0123456789", "en")).toBe("zero one two three four five six seven eight nine");
    expect(digitWords("0123456789", "fr")).toBe("zéro un deux trois quatre cinq six sept huit neuf");
  });
  it("gives nothing for no digits and keeps a stray character", () => {
    expect(digitWords("", "en")).toBe("");
    expect(digitWords("1x", "en")).toBe("one x");
  });
});

describe("kindName", () => {
  it("names each kind in both languages, all different and clean", () => {
    for (const l of ["en", "fr"] as const) {
      const names = (["short", "toll-free", "ten-digit", "other"] as const).map((k) => kindName(k, l));
      expect(new Set(names).size).toBe(4);
      for (const n of names) {
        expect(lintCopy(n, l), n).toEqual([]);
        if (l === "fr") expect(lintFrench(n), n).toEqual([]);
      }
    }
  });
});
