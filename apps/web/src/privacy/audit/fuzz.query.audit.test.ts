// Robustness audit for the web-address register's scanner and the check of the current address. Whatever text a
// file holds, scanning must not throw; adding a call to a file must add exactly one place; a call that is only
// mentioned in a comment must add none. Whatever a page's address holds, checking it must not throw, must say the
// same thing twice, must never repeat a value, and must find a personal name whenever one has a value.

import { describe, expect, it } from "vitest";
import { MAX_ADDRESS_READ, addressFindingText, addressParams, checkAddress } from "../panel/queryLive";
import { PERSONAL_KINDS, QUERY_REGISTER, rowForName } from "../panel/queryRegister";
import { compareQueries, scanQueries } from "./queryScan";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PATH = "apps/web/src/fuzz/File.ts";
const CALLS = ['p.get("alpha")', "params.has('beta')", 'query.getAll("gamma")', 'sp.set("delta", 1)', "searchParams.append('eps', x)", 'new URLSearchParams(s).get("zeta")'];
const NAME_OF = (call: string): string => /["'](\w+)["']/.exec(call)?.[1] ?? "";
const ACCESS_OF = (call: string): string => (/\.(?:set|append)\(/.test(call) ? "build" : "read");

/** Source text that holds no call on a query: ordinary lines, awkward strings, and lines that only mention one. */
function quietSource(rng: Rng): string {
  const lines: string[] = [];
  for (let i = rng.int(0, 12); i > 0; i -= 1) {
    const roll = rng.int(0, 3);
    if (roll === 0) lines.push(`const v${i} = ${JSON.stringify(genString(rng, 20).replace(/\.(get|set|has|append|getAll)\(/g, "x"))};`);
    else if (roll === 1) lines.push(`// ${rng.pick(CALLS)} is how the page reads it`);
    else if (roll === 2) lines.push(` * ${rng.pick(CALLS)} is described here`);
    else lines.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return lines.join("\n");
}

describe("scanning any text", () => {
  it("never throws, and every place has a line of 1 or more", () => {
    assertProperty({
      name: "scanQueries on any text",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 200) : mutateText(rng, `${quietSource(rng)}\n${rng.pick(CALLS)}`)),
      shrink: shrinkString,
      prop: (text) => {
        for (const f of scanQueries([{ path: PATH, text }])) {
          expect(f.lines.length).toBeGreaterThan(0);
          for (const line of f.lines) expect(line).toBeGreaterThanOrEqual(1);
        }
      },
    });
  });
  it("never throws on a very long line of open brackets, which a pattern with nesting could be slow on", () => {
    const text = `new URLSearchParams(${"(".repeat(5000)}`;
    const start = Date.now();
    expect(() => scanQueries([{ path: PATH, text }])).not.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("adding to a file", () => {
  it("finds nothing in source that only mentions a call", () => {
    assertProperty({ name: "quiet source has no query name", gen: quietSource, shrink: shrinkString, prop: (text) => expect(scanQueries([{ path: PATH, text }])).toEqual([]) });
  });
  it("finds exactly one more place for each call added, on the line it was added", () => {
    assertProperty({
      name: "one call, one place",
      runs: 300,
      gen: (rng) => ({ text: quietSource(rng), call: rng.pick(CALLS) }),
      prop: ({ text, call }) => {
        const body = text === "" ? "" : `${text}\n`;
        const found = scanQueries([{ path: PATH, text: `${body}const x = ${call};` }]);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ name: NAME_OF(call), access: ACCESS_OF(call), lines: [body.split("\n").length] });
      },
    });
  });
  it("is clean against a row that says the same, and not against a row that says one more", () => {
    assertProperty({
      name: "count agrees with the row",
      gen: (rng) => ({ n: rng.int(1, 5), call: rng.pick(CALLS) }),
      prop: ({ n, call }) => {
        const text = Array.from({ length: n }, (_, i) => `const a${i} = ${call};`).join("\n");
        const found = scanQueries([{ path: PATH, text }]);
        const places = (count: number) => [{ path: PATH, reads: ACCESS_OF(call) === "read" ? count : 0, builds: ACCESS_OF(call) === "build" ? count : 0 }];
        const row = (count: number) => ({ name: NAME_OF(call), kind: "choice" as const, holds: { en: "a", fr: "a" }, places: places(count), limits: [], source: "s", recordedOn: "2026-11-21" });
        const clean = compareQueries(found, [row(n)]);
        expect(clean).toEqual({ unlisted: [], gone: [], wrongCount: [] });
        expect(compareQueries(found, [row(n + 1)]).wrongCount).toHaveLength(1);
      },
    });
  });
  it("does not count a call twice because the text around it changed", () => {
    assertProperty({
      name: "padding does not add places",
      gen: (rng) => ({ pad: quietSource(rng), call: rng.pick(CALLS) }),
      prop: ({ pad, call }) => {
        const bare = scanQueries([{ path: PATH, text: `const x = ${call};` }]);
        const padded = scanQueries([{ path: PATH, text: `${pad}\nconst x = ${call};\n${pad}` }]);
        expect(padded.map((f) => `${f.name} ${f.access} ${f.lines.length}`)).toEqual(bare.map((f) => `${f.name} ${f.access} ${f.lines.length}`));
      },
    });
  });
});

/** A query string made of listed names, unlisted names, awkward text and bad percent codes. */
function genAddress(rng: Rng): string {
  const names = ["near", "lat", "lon", "q", "need", "unk", "ids", "place", "licence", "stale_places", "stale_x", "utm", "", "a b", "%zz", "é", "__proto__", "constructor"];
  const parts: string[] = [];
  for (let i = rng.int(0, 8); i > 0; i -= 1) {
    const name = rng.pick(names);
    const value = rng.bool(0.3) ? "" : rng.bool(0.2) ? "x".repeat(rng.int(90, 400)) : genString(rng, 30);
    parts.push(rng.bool(0.8) ? `${encodeURIComponentSafe(name)}=${encodeURIComponentSafe(value)}` : name);
  }
  const base = parts.join(rng.pick(["&", "&&", ";", "&amp;"]));
  return rng.bool(0.5) ? `?${base}` : rng.bool(0.5) ? base : `${base}#${genString(rng, 10)}`;
}

function encodeURIComponentSafe(s: string): string {
  try {
    return encodeURIComponent(s);
  } catch {
    return s.replace(/[\ud800-\udfff]/g, "?");
  }
}

describe("checking any address", () => {
  it("never throws, and says the same thing twice", () => {
    assertProperty({
      name: "checkAddress on any address",
      runs: 400,
      gen: (rng) => (rng.bool(0.3) ? genString(rng, 120) : genAddress(rng)),
      shrink: shrinkString,
      prop: (search) => {
        const a = checkAddress(QUERY_REGISTER, search);
        expect(checkAddress(QUERY_REGISTER, search)).toEqual(a);
        expect(a.params).toBe(addressParams(search).length);
        expect(a.findings.length).toBeLessThanOrEqual(a.params * 2);
      },
    });
  });
  it("finds a personal name with a value, whatever else the address holds", () => {
    assertProperty({
      name: "a place or typed words are always found",
      runs: 300,
      gen: (rng) => ({ rest: genAddress(rng), name: rng.pick(["near", "lat", "lon", "q", "ids", "place"]), value: rng.pick(["1", "43.6,-79.3", "x y", "é"]) }),
      prop: ({ rest, name, value }) => {
        const search = `?${name}=${encodeURIComponent(value)}&${rest.replace(/^\?/, "").split("#")[0]}`;
        const found = checkAddress(QUERY_REGISTER, search).findings.filter((f) => f.code === "carries-personal" && f.name === name);
        expect(found).toHaveLength(1);
        expect(PERSONAL_KINDS.has(found[0]!.kind!)).toBe(true);
      },
    });
  });
  it("never repeats a value in what it says", () => {
    assertProperty({
      name: "findings hold names and numbers only",
      runs: 300,
      gen: (rng) => ({ value: `v${rng.int(100000, 999999)}${genKey(rng)}`, name: rng.pick(["near", "q", "zzz", "ids"]) }),
      prop: ({ value, name }) => {
        for (const f of checkAddress(QUERY_REGISTER, `?${name}=${value}`).findings) for (const l of ["en", "fr"] as const) expect(addressFindingText(l, f)).not.toContain(value);
      },
    });
  });
  it("reads no more than the limit, so a very long address costs the same", () => {
    assertProperty({
      name: "long addresses are cut",
      runs: 40,
      gen: (rng) => `?${"a=1&".repeat(rng.int(MAX_ADDRESS_READ / 4, MAX_ADDRESS_READ))}`,
      prop: (search) => {
        expect(addressParams(search).length).toBeLessThanOrEqual(Math.ceil(MAX_ADDRESS_READ / 4));
      },
    });
  });
  it("gives every name a row or reports it as unlisted, never both", () => {
    assertProperty({
      name: "listed or unlisted",
      runs: 300,
      gen: genAddress,
      prop: (search) => {
        const check = checkAddress(QUERY_REGISTER, search);
        for (const f of check.findings.filter((x) => x.code === "unlisted")) expect(rowForName(QUERY_REGISTER, f.name), f.name).toBeNull();
        for (const f of check.findings.filter((x) => x.code !== "unlisted")) expect(rowForName(QUERY_REGISTER, f.name), f.name).not.toBeNull();
      },
    });
  });
});

function genKey(rng: Rng): string {
  let out = "";
  for (let i = rng.int(0, 6); i > 0; i -= 1) out += "abcdefghij"[rng.int(0, 9)];
  return out;
}
