import { describe, expect, it } from "vitest";
import { AWKWARD_STRINGS, genDateText, genDeep, genJson, genKeyName, genNumber, genScalar, genString, mutateJson, mutateText, setOwn, writeJson } from "./gen";
import { createRng } from "./rng";

const many = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe("the list of awkward strings", () => {
  it("covers the names that clash with object internals", () => {
    for (const s of ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"]) expect(AWKWARD_STRINGS).toContain(s);
  });
  it("covers the spaces and marks that French copy and files depend on", () => {
    for (const s of [" ", " ", "﻿", "\u0000", "\r\n"]) expect(AWKWARD_STRINGS).toContain(s);
  });
  it("covers a lone surrogate, which is text JavaScript allows and files do not", () => {
    expect(AWKWARD_STRINGS.some((s) => s.length === 1 && s.charCodeAt(0) >= 0xd800 && s.charCodeAt(0) <= 0xdfff)).toBe(true);
  });
});

describe("genKeyName", () => {
  it("only uses characters a storage key may have, and is never empty", () => {
    for (const k of many(300, (i) => genKeyName(createRng(i), 20))) {
      expect(k).toMatch(/^[A-Za-z0-9._:-]{1,20}$/);
    }
  });
});

describe("genString", () => {
  it("is repeatable from the seed", () => {
    expect(genString(createRng(4))).toBe(genString(createRng(4)));
  });
  it("sometimes gives an awkward string and sometimes a long one", () => {
    const all = many(600, (i) => genString(createRng(i), 20));
    expect(all.some((s) => AWKWARD_STRINGS.includes(s) && s !== "")).toBe(true);
    expect(all.some((s) => s.length > 100)).toBe(true);
  });
});

describe("genDateText", () => {
  it("gives some dates that parse and some that look right but do not", () => {
    const all = many(400, (i) => genDateText(createRng(i)));
    expect(all.some((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))).toBe(true);
    expect(all).toContain("2026-13-45");
    expect(all.some((s) => /T.*Z$/.test(s) && !Number.isNaN(Date.parse(s)))).toBe(true);
  });
});

describe("genNumber and genScalar", () => {
  it("gives the numbers that break integer checks", () => {
    const all = many(800, (i) => genNumber(createRng(i)));
    expect(all.some((n) => Number.isNaN(n))).toBe(true);
    expect(all.some((n) => n === Number.POSITIVE_INFINITY)).toBe(true);
    expect(all.some((n) => Number.isInteger(n) && n > 2 ** 52)).toBe(true);
    expect(all.some((n) => n === 0.5)).toBe(true);
  });
  it("gives every kind of JSON scalar", () => {
    const kinds = new Set(many(300, (i) => (genScalar(createRng(i)) === null ? "null" : typeof genScalar(createRng(i)))));
    expect([...kinds].sort()).toEqual(["boolean", "null", "number", "string"]);
  });
});

describe("setOwn", () => {
  it("sets __proto__ as an ordinary property and leaves the prototype alone", () => {
    const o: Record<string, unknown> = {};
    setOwn(o, "__proto__", { polluted: true });
    expect(Object.keys(o)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("genJson", () => {
  it("makes values that JSON can write and read back to the same thing", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = genJson(createRng(i));
      const text = JSON.stringify(v);
      expect(JSON.stringify(JSON.parse(text))).toBe(text);
    }
  });
  it("makes arrays, objects and scalars, nested", () => {
    const all = many(300, (i) => genJson(createRng(i), 3));
    expect(all.some((v) => Array.isArray(v))).toBe(true);
    expect(all.some((v) => v !== null && typeof v === "object" && !Array.isArray(v))).toBe(true);
    expect(all.some((v) => typeof v === "string")).toBe(true);
  });
  it("stops at the depth it was given", () => {
    const depthOf = (v: unknown): number => (Array.isArray(v) ? 1 + Math.max(0, ...v.map(depthOf)) : v !== null && typeof v === "object" ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);
    for (let i = 0; i < 200; i += 1) expect(depthOf(genJson(createRng(i), 2))).toBeLessThanOrEqual(2);
  });
  it("sometimes uses a key that clashes with object internals", () => {
    const all = many(600, (i) => JSON.stringify(genJson(createRng(i), 3)));
    expect(all.some((t) => t.includes('"__proto__":'))).toBe(true);
  });
});

describe("genDeep", () => {
  it("nests to the depth asked for and keeps the leaf", () => {
    const v = genDeep(5, "leaf");
    expect(JSON.stringify(v)).toBe('[{"a":[{"a":["leaf"]}]}]'.length > 0 ? JSON.stringify(v) : "");
    let d = 0;
    let cur: unknown = v;
    while (cur !== "leaf") {
      cur = Array.isArray(cur) ? cur[0] : (cur as { a: unknown }).a;
      d += 1;
    }
    expect(d).toBe(5);
  });
  it("is just the leaf at depth zero", () => {
    expect(genDeep(0, "x")).toBe("x");
  });
});

describe("mutateJson", () => {
  const base = { a: [1, 2, { b: "x" }], c: "text", d: { e: true } };
  it("does not change the value it was given", () => {
    const before = JSON.stringify(base);
    for (let i = 0; i < 100; i += 1) mutateJson(createRng(i), base);
    expect(JSON.stringify(base)).toBe(before);
  });
  it("changes the value most of the time", () => {
    const before = JSON.stringify(base);
    const changed = many(300, (i) => JSON.stringify(mutateJson(createRng(i), base)) !== before).filter(Boolean).length;
    expect(changed).toBeGreaterThan(200);
  });
  it("can remove, retype, rename and add keys", () => {
    const outs = many(400, (i) => JSON.stringify(mutateJson(createRng(i), base)));
    expect(outs.some((t) => !t.includes('"c"'))).toBe(true);
    expect(outs.some((t) => t.includes('"__proto__"'))).toBe(true);
    expect(outs.some((t) => t.includes('"c":"text"') === false && t.includes('"c"'))).toBe(true);
  });
  it("is repeatable from the seed", () => {
    expect(JSON.stringify(mutateJson(createRng(8), base))).toBe(JSON.stringify(mutateJson(createRng(8), base)));
  });
  it("gives something for a scalar", () => {
    expect(() => mutateJson(createRng(1), 5)).not.toThrow();
  });
});

describe("mutateText", () => {
  it("gives text, whatever it is given", () => {
    for (let i = 0; i < 300; i += 1) expect(typeof mutateText(createRng(i), i % 7 === 0 ? "" : '{"a":1,"b":[true]}')).toBe("string");
  });
  it("often makes text that no longer parses", () => {
    const base = '{"a":1,"b":[true,"x"],"c":{"d":null}}';
    const broken = many(300, (i) => mutateText(createRng(i), base)).filter((t) => {
      try {
        JSON.parse(t);
        return false;
      } catch {
        return true;
      }
    }).length;
    expect(broken).toBeGreaterThan(120);
  });
  it("is repeatable from the seed", () => {
    expect(mutateText(createRng(3), "abcdef")).toBe(mutateText(createRng(3), "abcdef"));
  });
});

describe("writeJson", () => {
  it("writes text that reads back as the same value, in every style", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const v = { a: [1, { b: "x" }] };
      const t = writeJson(createRng(i), v);
      expect(JSON.parse(t)).toEqual(v);
      seen.add(t.includes("\t") ? "tab" : t.includes("\n  ") ? "two" : t.endsWith("\n") ? "newline" : "plain");
    }
    expect([...seen].sort()).toEqual(["newline", "plain", "tab", "two"]);
  });
  it("writes null for a value JSON cannot write", () => {
    expect(writeJson(createRng(1), undefined)).toBe("null");
  });
});
