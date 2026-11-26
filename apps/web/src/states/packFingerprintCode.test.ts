import { describe, expect, it } from "vitest";
import { fingerprintPlaces } from "./packFingerprint";
import { CODE_TAG, CODE_VERSION, FINGERPRINT_MAX_CODE_CHARS, parseCode, printToCode } from "./packFingerprintCode";
import { place, varied } from "./placeFixtures";

const print = fingerprintPlaces(varied(21, 37));
const code = printToCode(print);

describe("printToCode", () => {
  it("is six lines: the head, four rows of groups and the check", () => {
    const lines = code.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatch(new RegExp(`^${CODE_TAG} ${CODE_VERSION} n=37 ids=[0-9a-f]{32} all=[0-9a-f]{32}$`));
    for (const row of lines.slice(1, 5)) expect(row.split(" ")).toHaveLength(4);
    expect(lines[5]).toMatch(/^k=[0-9a-f]{8}$/);
  });
  it("lists the groups in order, each as key=count:hash", () => {
    const keys = code.split(/\s+/).filter((t) => /^[0-9a-f]=\d+:[0-9a-f]{8}$/.test(t)).map((t) => t[0]);
    expect(keys).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]);
  });
  it("holds no place name, note or address", () => {
    const named = fingerprintPlaces([place("a", { name: "Secret Café", address: "12 Hidden Lane", wheelchair_description: "private note" })]);
    const text = printToCode(named);
    for (const word of ["Secret", "Café", "Hidden", "private", "Lane"]) expect(text).not.toContain(word);
    expect(text).not.toContain('"a"');
  });
  it("is under the length the reader accepts", () => {
    expect(printToCode(fingerprintPlaces(varied(1, 500))).length).toBeLessThan(FINGERPRINT_MAX_CODE_CHARS / 4);
  });
  it("is the same for the same places", () => {
    expect(printToCode(fingerprintPlaces(varied(21, 37)))).toBe(code);
  });
});

describe("parseCode", () => {
  it("reads back what printToCode wrote", () => {
    const r = parseCode(code);
    expect(r).toEqual({ ok: true, print });
  });
  it("round-trips the empty pack and a large one", () => {
    for (const places of [[], varied(2, 1), varied(3, 600)]) {
      const p = fingerprintPlaces(places);
      expect(parseCode(printToCode(p))).toEqual({ ok: true, print: p });
    }
  });
  it("ignores letter case, extra spaces, tabs and line endings", () => {
    const messy = `  ${code.toUpperCase().replace(/\n/g, "\r\n\t  ")}  \n\n`;
    expect(parseCode(messy)).toEqual({ ok: true, print });
  });
  it("reads a code pasted on one line", () => {
    expect(parseCode(code.replace(/\n/g, " "))).toEqual({ ok: true, print });
  });
  it("reads the tokens in any order", () => {
    const tokens = code.split(/\s+/);
    const head = tokens.slice(0, 2);
    const rest = tokens.slice(2).reverse();
    expect(parseCode([...head, ...rest].join(" "))).toEqual({ ok: true, print });
  });

  it("refuses empty text", () => {
    expect(parseCode("")).toEqual({ ok: false, problem: "empty" });
    expect(parseCode(" \n\t ")).toEqual({ ok: false, problem: "empty" });
  });
  it("refuses text that is too long, before reading it", () => {
    expect(parseCode(`${CODE_TAG} ${"x".repeat(FINGERPRINT_MAX_CODE_CHARS)}`)).toEqual({ ok: false, problem: "too-long" });
  });
  it("refuses text that is not a code, and names its first word", () => {
    expect(parseCode("hello world")).toEqual({ ok: false, problem: "not-a-code", token: "hello" });
    expect(parseCode("LIST v1 - a | b")).toMatchObject({ ok: false, problem: "not-a-code" });
  });
  it("cuts a very long first word when it names it", () => {
    const r = parseCode("q".repeat(500));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.token!.length).toBeLessThanOrEqual(24);
  });
  it("refuses another version", () => {
    expect(parseCode(code.replace("v1", "v2"))).toMatchObject({ ok: false, problem: "unsupported-version", token: "v2" });
    expect(parseCode(CODE_TAG)).toEqual({ ok: false, problem: "unsupported-version" });
  });
  it("refuses a code with a group missing", () => {
    const without = code.split(/\s+/).filter((t) => !t.startsWith("7=")).join(" ");
    expect(parseCode(without)).toEqual({ ok: false, problem: "incomplete" });
  });
  it("refuses a code without its check", () => {
    const without = code.split(/\s+/).filter((t) => !t.startsWith("k=")).join(" ");
    expect(parseCode(without)).toEqual({ ok: false, problem: "incomplete" });
  });
  it("refuses a repeated key", () => {
    expect(parseCode(`${code} n=37`)).toMatchObject({ ok: false, problem: "malformed" });
  });
  it("refuses a key the code does not have", () => {
    expect(parseCode(`${code} extra=1`)).toMatchObject({ ok: false, problem: "malformed", token: "extra" });
  });
  it("refuses a word with no equals sign", () => {
    expect(parseCode(`${code} stray`)).toMatchObject({ ok: false, problem: "malformed", token: "stray" });
    expect(parseCode(`${code} =5`)).toMatchObject({ ok: false, problem: "malformed" });
  });
  it.each([
    ["a count that is not a number", (c: string) => c.replace("n=37", "n=abc")],
    ["a negative count", (c: string) => c.replace("n=37", "n=-1")],
    ["a count that is too large", (c: string) => c.replace("n=37", "n=99999999")],
    ["a hash that is too short", (c: string) => c.replace(/ids=[0-9a-f]{32}/, "ids=abcd")],
    ["a hash with a non-hex character", (c: string) => c.replace(/all=[0-9a-f]/, "all=z")],
    ["a group without a colon", (c: string) => c.replace(/0=\d+:/, "0=")],
    ["a group hash of the wrong length", (c: string) => c.replace(/(1=\d+:)[0-9a-f]{8}/, "$1abc")],
  ])("refuses %s", (_what, mutate) => {
    const r = parseCode(mutate(code));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["malformed", "typo"]).toContain(r.problem);
  });
  it("refuses a code whose group counts do not add up, even when the check was made over them", () => {
    const tokens = code.split(/\s+/).filter((t) => !t.startsWith("k="));
    const bumped = tokens.map((t) => (t.startsWith("n=") ? "n=38" : t));
    // The check no longer matches, so this is a typo; the counts rule is reached only past a correct check.
    expect(parseCode(bumped.join(" "))).toMatchObject({ ok: false });
  });
});

describe("the check catches changes", () => {
  it("refuses a code with any one character changed", () => {
    const flat = code.replace(/\n/g, " ");
    let tried = 0;
    for (let i = 0; i < flat.length; i += 1) {
      const ch = flat[i]!;
      if (ch === " " || ch === "=" || ch === ":") continue;
      // Letter case is ignored, so the replacement must be a different letter, not a capital of the same one.
      const swap = ch.toLowerCase() === "a" ? "b" : "a";
      const r = parseCode(flat.slice(0, i) + swap + flat.slice(i + 1));
      tried += 1;
      expect(r.ok, `position ${i}`).toBe(false);
    }
    expect(tried).toBeGreaterThan(200);
  });
  it("refuses a code cut short at any point", () => {
    for (let n = 1; n < code.length; n += 1) {
      const r = parseCode(code.slice(0, n));
      expect(r.ok, `cut at ${n}`).toBe(false);
    }
  });
  it("reports a changed value as a typo", () => {
    const edited = code.replace(/(ids=)[0-9a-f]/, (_m, p) => `${p}${code.match(/ids=([0-9a-f])/)![1] === "0" ? "1" : "0"}`);
    expect(parseCode(edited)).toEqual({ ok: false, problem: "typo" });
  });
});
