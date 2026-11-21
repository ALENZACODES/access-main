// Robustness audit for the reader of build settings, the model and the rules. Whatever text a file holds, reading it
// must not throw; findings and lines stay inside the file; a change of one setting gives the one finding for it; the
// comparison with the register is clean for a register built from the file it describes.

import { describe, expect, it } from "vitest";
import { genJson, genString, mutateText, writeJson } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { duplicateKeys, findCalls, getKey, identTokens, lineOf, parseLiteral, showNode, type JNode } from "./jsLit";
import { compareAccepted, compareAssets, compareSettings, flattenConfig } from "./pwaCompare";
import { configFile, GOOD_MANIFEST, GOOD_WORKBOX, options, withManifest, withRuntime, withWorkbox } from "./pwaFixture";
import { readPageHead } from "./pwaHtml";
import { parsePwaConfig } from "./pwaModel";
import type { PwaRegister } from "./pwaRegister";
import { auditPwa, type PwaCode } from "./pwaRules";

const GOOD = configFile();

describe("reading any text", () => {
  it("never throws for the literal reader, the model, the rules or the page head", () => {
    assertProperty({
      name: "readers on any text",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 300) : mutateText(rng, GOOD)),
      shrink: shrinkString,
      prop: (t) => {
        parseLiteral(t);
        identTokens(t);
        const c = parsePwaConfig("v.ts", t);
        auditPwa(c);
        flattenConfig(c);
        readPageHead(t);
      },
    });
  });

  it("never throws for JSON written where options are expected", () => {
    assertProperty({ name: "JSON as options", gen: (rng) => writeJson(rng, genJson(rng)), prop: (t) => void auditPwa(parsePwaConfig("v.ts", `VitePWA(${t});`)) });
  });

  it("gives lines inside the file for every finding and every problem", () => {
    assertProperty({
      name: "lines fit",
      gen: (rng) => mutateText(rng, GOOD),
      shrink: shrinkString,
      prop: (t) => {
        const n = t.split("\n").length;
        const c = parsePwaConfig("v.ts", t);
        for (const p of c.problems) expect(p.line).toBeGreaterThanOrEqual(1);
        for (const f of auditPwa(c)) {
          expect(f.line).toBeGreaterThanOrEqual(0);
          expect(f.line).toBeLessThanOrEqual(n + 1);
        }
      },
    });
  });

  it("gives the same line from lineOf as the reader gives for the call", () => {
    assertProperty({
      name: "call line",
      gen: (rng) => "\n".repeat(rng.int(0, 20)) + GOOD,
      prop: (t) => expect(findCalls(t, "VitePWA")[0]?.line).toBe(lineOf(t, t.indexOf("VitePWA(", t.indexOf("export")))),
    });
  });
});

describe("what is written is what is read", () => {
  it("reads back a string of any characters written as a JSON string", () => {
    assertProperty({
      name: "string round trip",
      gen: (rng) => genString(rng, 30).replace(/[\u2028\u2029]/g, ""),
      shrink: shrinkString,
      prop: (s) => {
        const n = parseLiteral(JSON.stringify(s)).node;
        expect(n.kind).toBe("str");
        expect(n.kind === "str" ? n.value : null).toBe(s);
      },
    });
  });

  it("reads back an object of plain keys and numbers, in order", () => {
    assertProperty({
      name: "object round trip",
      gen: (rng) => Array.from({ length: rng.int(0, 8) }, (_, i) => [`k${i}`, rng.int(0, 100000)] as const),
      prop: (pairs) => {
        const n = parseLiteral(`{ ${pairs.map(([k, v]) => `${k}: ${v}`).join(", ")} }`).node;
        expect(n.kind === "obj" ? n.entries.map((e) => [e.key, e.value.kind === "num" ? e.value.value : null]) : null).toEqual(pairs.map(([k, v]) => [k, v]));
      },
    });
  });

  it("reads a sum of whole numbers as the sum, however it is spaced", () => {
    assertProperty({
      name: "numeric",
      gen: (rng) => ({ a: rng.int(0, 999), b: rng.int(0, 999), c: rng.int(0, 999), sp: rng.pick(["", " ", "  ", "\n"]) }),
      prop: ({ a, b, c, sp }) => {
        const n = parseLiteral(`${a}${sp}*${sp}${b}${sp}+${sp}${c}`).node;
        expect(n.kind === "num" ? n.value : null).toBe(a * b + c);
      },
    });
  });

  it("ignores comments put before a value and after it", () => {
    assertProperty({
      name: "comments",
      gen: (rng) => ({ pre: rng.pick(["", "// a\n", "/* a */", "/* a\nb */ "]), post: rng.pick(["", " // a", " /* a */"]), v: rng.int(0, 500) }),
      prop: ({ pre, post, v }) => expect(parseLiteral(`{ a: ${pre}${v}${post}\n}`).node.kind === "obj" ? showNode(getKey(parseLiteral(`{ a: ${pre}${v}${post}\n}`).node, "a")) : "").toBe(String(v)),
    });
  });

  it("counts the keys that an object writes twice", () => {
    assertProperty({
      name: "duplicates",
      gen: (rng) => Array.from({ length: rng.int(0, 10) }, () => rng.pick(["a", "b", "c"])),
      prop: (keys) => {
        const text = `{ ${keys.map((k, i) => `${k}: ${i}`).join(", ")} }`;
        expect(duplicateKeys(parseLiteral(text).node)).toHaveLength(Math.max(0, keys.length - new Set(keys).size));
      },
    });
  });
});

describe("the rules", () => {
  const CHANGES: Array<[PwaCode, (rng: Rng) => string]> = [
    ["auto-update", () => configFile(options({ registerType: '"autoUpdate"' }))],
    ["skip-waiting", () => withWorkbox("skipWaiting: false", "skipWaiting: true")],
    ["manifest-display", (rng) => withManifest('display: "standalone"', `display: "${rng.pick(["browser", "fullscreen", "minimal-ui"])}"`)],
    ["manifest-color", (rng) => withManifest('theme_color: "#083734"', `theme_color: "${rng.pick(["red", "#abc", "#12345g", "rgb(0,0,0)"])}"`)],
    ["manifest-lang", (rng) => withManifest('lang: "en"', `lang: "${rng.pick(["EN", "english", "en_CA"])}"`)],
    ["dev-enabled", () => configFile(options({ devOptions: "{ enabled: true }" }))],
    ["long-max-age", (rng) => withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxAgeSeconds: ${60 * 60 * 24 * (31 + rng.int(0, 400))} } } }]`)],
    ["many-entries", (rng) => withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxEntries: ${201 + rng.int(0, 5000)} } } }]`)],
    ["unbounded-cache", (rng) => withRuntime(`[{ urlPattern: /a/, handler: "${rng.pick(["NetworkFirst", "CacheFirst", "StaleWhileRevalidate"])}" }]`)],
    ["data-cached", (rng) => withRuntime(`[{ urlPattern: dataPath, handler: "${rng.pick(["NetworkFirst", "CacheFirst"])}", options: { expiration: { maxEntries: 3 } } }]`)],
  ];

  it("find exactly the one finding that a change of one setting makes", () => {
    assertProperty({
      name: "one change, one finding",
      gen: (rng) => ({ which: rng.int(0, CHANGES.length - 1), seed: rng.int(0, 1_000_000) }),
      prop: ({ which, seed }) => {
        const [code, make] = CHANGES[which] as [PwaCode, (rng: Rng) => string];
        const rng: Rng = { int: (lo: number, hi: number) => lo + ((seed * 2654435761) % (hi - lo + 1)), bool: () => seed % 2 === 0, pick: (xs: readonly unknown[]) => xs[seed % xs.length] } as unknown as Rng;
        expect(auditPwa(parsePwaConfig("v.ts", make(rng))).map((f) => f.code)).toEqual([code]);
      },
    });
  });

  it("find the same things when blank lines and comments are added between lines", () => {
    assertProperty({
      name: "noise does not change findings",
      gen: (rng) => ({ which: rng.int(0, CHANGES.length - 1), noise: rng.pick(["", "\n", "// note\n", "  /* note */\n", "\n\n// a\n\n"]) }),
      prop: ({ which, noise }) => {
        const rng = { int: (lo: number) => lo, bool: () => true, pick: <T,>(xs: readonly T[]) => xs[0] as T } as unknown as Rng;
        const text = (CHANGES[which] as [PwaCode, (r: Rng) => string])[1](rng);
        const noisy = text.split("\n").map((l) => (l.endsWith(",") || l.endsWith("{") || l.endsWith("[") ? `${l}\n${noise}` : l)).join("\n");
        expect(auditPwa(parsePwaConfig("v.ts", noisy)).map((f) => f.code)).toEqual(auditPwa(parsePwaConfig("v.ts", text)).map((f) => f.code));
      },
    });
  });

  it("find nothing in a file that has any number of rules that keep nothing", () => {
    assertProperty({
      name: "NetworkOnly rules",
      gen: (rng) => rng.int(0, 10),
      prop: (n) => expect(auditPwa(parsePwaConfig("v.ts", withRuntime(`[${Array.from({ length: n }, (_, i) => `{ urlPattern: /r${i}/, handler: "NetworkOnly" }`).join(", ")}]`)))).toEqual([]),
    });
  });

  it("give the same findings twice, in the order of their lines", () => {
    assertProperty({
      name: "order is stable",
      gen: (rng) => rng.int(0, CHANGES.length - 1),
      prop: (which) => {
        const rng = { int: (lo: number) => lo, bool: () => true, pick: <T,>(xs: readonly T[]) => xs[0] as T } as unknown as Rng;
        const c = parsePwaConfig("v.ts", (CHANGES[which] as [PwaCode, (r: Rng) => string])[1](rng));
        const f = auditPwa(c);
        expect(auditPwa(c)).toEqual(f);
        const lines = f.map((x) => x.line);
        expect(lines).toEqual([...lines].sort((a, b) => a - b));
      },
    });
  });
});

describe("the comparison", () => {
  it("is clean for a register built from the settings read from the same file", () => {
    assertProperty({
      name: "register from file",
      gen: (rng) => ({ entries: rng.int(1, 300), age: rng.int(1, 100000), timeout: rng.int(1, 10), rules: rng.int(0, 4) }),
      prop: ({ entries, age, timeout, rules }) => {
        const text = withRuntime(`[${Array.from({ length: rules }, (_, i) => `{ urlPattern: /p${i}/, handler: "NetworkFirst", options: { cacheName: "c${i}", networkTimeoutSeconds: ${timeout}, expiration: { maxEntries: ${entries}, maxAgeSeconds: ${age} } } }`).join(", ")}]`);
        const c = parsePwaConfig("v.ts", text);
        const reg: PwaRegister = { path: "v.ts", settings: flattenConfig(c), note: "n." };
        expect(compareSettings(c, reg)).toEqual([]);
        const kept = auditPwa(c).filter((f) => f.code === "long-max-age" || f.code === "many-entries");
        expect(compareAccepted(kept, [])).toHaveLength(new Set(kept.map((f) => f.code)).size);
        expect(kept).toHaveLength(rules * ((entries > 200 ? 1 : 0) + (age > 2592000 ? 1 : 0)));
      },
    });
  });

  it("finds a changed value in a setting of the register, whichever setting it is", () => {
    const c = parsePwaConfig("v.ts", GOOD);
    const flat = flattenConfig(c);
    const keys = Object.keys(flat);
    assertProperty({
      name: "register changed",
      gen: (rng) => rng.int(0, keys.length - 1),
      prop: (i) => {
        const k = keys[i] as string;
        const reg: PwaRegister = { path: "v.ts", settings: { ...flat, [k]: `${flat[k]}!` }, note: "n." };
        const p = compareSettings(c, reg);
        expect(p).toHaveLength(1);
        expect(p[0]).toMatchObject({ code: "setting-changed", key: k });
      },
    });
  });

  it("finds a setting dropped from, or added to, the register", () => {
    const c = parsePwaConfig("v.ts", GOOD);
    const flat = flattenConfig(c);
    const keys = Object.keys(flat);
    assertProperty({
      name: "register dropped",
      gen: (rng) => rng.int(0, keys.length - 1),
      prop: (i) => {
        const k = keys[i] as string;
        const rest = Object.fromEntries(Object.entries(flat).filter(([x]) => x !== k));
        expect(compareSettings(c, { path: "v.ts", settings: rest, note: "n." }).map((p) => [p.code, p.key])).toEqual([["setting-added", k]]);
        expect(compareSettings(c, { path: "v.ts", settings: { ...flat, "zz.extra": "1" }, note: "n." }).map((p) => [p.code, p.key])).toEqual([["setting-gone", "zz.extra"]]);
      },
    });
  });

  it("finds no missing asset when every named file is given, and one for each that is not", () => {
    const c = parsePwaConfig("v.ts", GOOD);
    assertProperty({
      name: "assets",
      gen: (rng) => ({ drop: rng.int(0, 7) }),
      prop: ({ drop }) => {
        const names = ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"];
        const files = new Map<string, Uint8Array | null>(names.map((n, i) => [n, ((drop >> i) & 1) === 1 ? null : Uint8Array.of(1)]));
        const missing = compareAssets(c, files).filter((p) => p.code === "asset-missing");
        expect(missing.map((p) => p.key).sort()).toEqual(names.filter((_, i) => ((drop >> i) & 1) === 1).sort());
      },
    });
  });
});

describe("the helpers", () => {
  it("gives a node for every kind it can show", () => {
    const nodes: JNode[] = [parseLiteral('"a"').node, parseLiteral("1").node, parseLiteral("{}").node, parseLiteral("[]").node, parseLiteral("f()").node, parseLiteral("a").node];
    for (const n of nodes) expect(showNode(n).length).toBeGreaterThan(0);
  });
  it("keeps the good manifest and workbox text valid objects", () => {
    expect(parseLiteral(GOOD_MANIFEST).problems).toEqual([]);
    expect(parseLiteral(GOOD_WORKBOX).problems).toEqual([]);
  });
});
