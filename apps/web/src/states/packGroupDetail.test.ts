import { describe, expect, it } from "vitest";
import { BUCKET_KEYS, type BucketKey, bucketOf } from "./packFingerprint";
import { DETAIL_TAG, MAX_DETAIL_CHARS, MAX_DETAIL_ENTRIES, compareDetail, detailEntries, makeDetailCode, parseDetailCode } from "./packGroupDetail";
import { place, varied } from "./placeFixtures";

const places = varied(71, 60);
const keys: BucketKey[] = ["3", "a", "c"];
const inKeys = places.filter((p) => keys.includes(bucketOf(p.id)));
const made = makeDetailCode(places, keys);
const code = made.ok ? made.code : "";

describe("detailEntries", () => {
  it("has one entry for each place in the groups, ordered by id", () => {
    const e = detailEntries(places, keys);
    expect(e.map((x) => x.id)).toEqual(inKeys.map((p) => p.id).sort());
    for (const x of e) expect(x.hash).toMatch(/^[0-9a-f]{8}$/);
  });
  it("does not depend on the order of the places", () => {
    expect(detailEntries([...places].reverse(), keys)).toEqual(detailEntries(places, keys));
  });
  it("changes only the entry of the place that changed", () => {
    const target = inKeys[0]!;
    const edited = places.map((p) => (p.id === target.id ? place(p.id, { name: "A new name" }) : p));
    const a = detailEntries(places, keys);
    const b = detailEntries(edited, keys);
    expect(b.filter((x, i) => x.hash !== a[i]!.hash).map((x) => x.id)).toEqual([target.id]);
  });
  it("is empty for no groups", () => {
    expect(detailEntries(places, [])).toEqual([]);
  });
});

describe("makeDetailCode", () => {
  it("is a head, rows of four entries and a check", () => {
    expect(made.ok).toBe(true);
    const lines = code.split("\n");
    expect(lines[0]).toBe(`${DETAIL_TAG} v1 g=3ac n=${inKeys.length}`);
    expect(lines.at(-1)).toMatch(/^k=[0-9a-f]{8}$/);
    for (const row of lines.slice(1, -1)) expect(row.split(" ").length).toBeLessThanOrEqual(4);
    expect(made.ok && made.entries).toBe(inKeys.length);
  });
  it("sorts and de-duplicates the groups", () => {
    const m = makeDetailCode(places, ["c", "3", "a", "3"]);
    expect(m.ok && m.code).toBe(code);
  });
  it("holds ids and hashes, and no name, address or note", () => {
    const named = [place("known-id", { name: "Hidden Café", address: "77 Secret Lane", wheelchair_description: "Private ramp note" })];
    const m = makeDetailCode(named, [bucketOf("known-id")]);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.code).toContain("known-id");
      for (const w of ["Hidden", "Café", "Secret", "Private"]) expect(m.code).not.toContain(w);
    }
  });
  it("refuses no groups", () => {
    expect(makeDetailCode(places, [])).toEqual({ ok: false, problem: "no-groups", entries: 0 });
  });
  it("refuses more places than it will list, and says how many", () => {
    const many = Array.from({ length: MAX_DETAIL_ENTRIES + 40 }, (_, i) => place(`id-${i}`, {}));
    const m = makeDetailCode(many, BUCKET_KEYS);
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.problem).toBe("too-many");
      expect(m.entries).toBe(MAX_DETAIL_ENTRIES + 40);
    }
  });
  it("makes a code for exactly the limit", () => {
    const exact = Array.from({ length: MAX_DETAIL_ENTRIES }, (_, i) => place(`id-${i}`, {}));
    const m = makeDetailCode(exact, BUCKET_KEYS);
    expect(m.ok).toBe(true);
    if (m.ok) expect(parseDetailCode(m.code).ok).toBe(true);
  });
  it("makes a code for groups with no places", () => {
    const m = makeDetailCode([], ["5"]);
    expect(m.ok && parseDetailCode(m.code).ok).toBe(true);
  });
});

describe("parseDetailCode", () => {
  it("reads back what makeDetailCode wrote", () => {
    const r = parseDetailCode(code);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detail.groups).toEqual(["3", "a", "c"]);
      expect(r.detail.entries).toEqual(detailEntries(places, keys));
    }
  });
  it("ignores letter case, extra spacing and line ends", () => {
    const r = parseDetailCode(`  ${code.replace(/\n/g, "\r\n\t ").replace(/PACKGRP/, "packgrp")}  `);
    expect(r.ok && r.detail.entries.length).toBe(inKeys.length);
  });
  it("reads a code pasted on one line", () => {
    expect(parseDetailCode(code.replace(/\n/g, " ")).ok).toBe(true);
  });
  it.each([
    ["empty", "", "empty"],
    ["blank", "  \n ", "empty"],
    ["not a code", "hello there", "not-a-code"],
    ["a device code", "PACKFP v1 n=1", "not-a-code"],
    ["another version", code.replace(" v1 ", " v2 "), "unsupported-version"],
    ["cut before the check", code.split("\n").slice(0, -1).join("\n"), "incomplete"],
  ])("refuses %s", (_what, text, problem) => {
    const r = parseDetailCode(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe(problem);
  });
  it("refuses text that is too long, before reading it", () => {
    expect(parseDetailCode(`${DETAIL_TAG} ${"x".repeat(MAX_DETAIL_CHARS)}`)).toEqual({ ok: false, problem: "too-long" });
  });
  it("reports a changed entry hash as a typo", () => {
    const first = inKeys[0] ? detailEntries(places, keys)[0]! : null;
    const edited = code.replace(`${first!.hash}=`, `${first!.hash === "00000000" ? "11111111" : "00000000"}=`);
    expect(parseDetailCode(edited)).toEqual({ ok: false, problem: "typo" });
  });
  it("refuses a code cut short at any point", () => {
    for (let n = 1; n < code.length; n += 1) expect(parseDetailCode(code.slice(0, n)).ok, `cut at ${n}`).toBe(false);
  });
  it("refuses a code with any one character changed, ignoring spacing and case", () => {
    const flat = code.replace(/\n/g, " ");
    for (let i = 0; i < flat.length; i += 1) {
      const ch = flat[i]!;
      if (ch === " " || ch === "=") continue;
      const swap = ch.toLowerCase() === "a" ? "b" : "a";
      expect(parseDetailCode(flat.slice(0, i) + swap + flat.slice(i + 1)).ok, `position ${i}`).toBe(false);
    }
  });
  it("refuses a repeated g, n or k", () => {
    for (const extra of ["g=3", "n=1", "k=00000000"]) expect(parseDetailCode(`${code} ${extra}`)).toMatchObject({ ok: false, problem: "malformed" });
  });
  it("refuses a word with no equals sign, or with a key that is not a hash", () => {
    expect(parseDetailCode(`${code} stray`)).toMatchObject({ ok: false, problem: "malformed", token: "stray" });
    expect(parseDetailCode(`${code} zzzzzzzz=id`)).toMatchObject({ ok: false, problem: "malformed" });
    expect(parseDetailCode(`${code} abc=id`)).toMatchObject({ ok: false, problem: "malformed" });
  });
  it("refuses groups that are not sorted, repeated or not hex", () => {
    for (const bad of ["ca", "33", "gz", ""]) {
      const r = parseDetailCode(code.replace("g=3ac", `g=${bad}`));
      expect(r.ok, bad).toBe(false);
    }
  });
  it("refuses a count that is not a number or is above the limit", () => {
    expect(parseDetailCode(code.replace(/n=\d+/, "n=abc"))).toMatchObject({ ok: false, problem: "malformed" });
    expect(parseDetailCode(code.replace(/n=\d+/, `n=${MAX_DETAIL_ENTRIES + 1}`))).toMatchObject({ ok: false, problem: "malformed" });
  });
});

describe("compareDetail", () => {
  const detailOf = (remote: typeof places) => {
    const m = makeDetailCode(remote, keys);
    const r = m.ok ? parseDetailCode(m.code) : null;
    if (!r || !r.ok) throw new Error("no code");
    return r.detail;
  };
  it("finds nothing when the places are the same", () => {
    const c = compareDetail(places, detailOf([...places].reverse()));
    expect(c).toEqual({ groups: keys, same: inKeys.length, onlyHere: [], onlyThere: [], changed: [] });
  });
  it("finds a place that is only on the other device", () => {
    const extraId = Array.from({ length: 200 }, (_, i) => `only-there-${i}`).find((id) => keys.includes(bucketOf(id)))!;
    const extra = place(extraId, {});
    const there = detailOf([...places, extra]);
    const c = compareDetail(places, there);
    expect(c.onlyThere).toEqual([extra.id]);
    expect(c.onlyHere).toEqual([]);
    expect(c.same).toBe(inKeys.length);
  });
  it("finds a place that is only on this device", () => {
    const gone = inKeys[1]!;
    const c = compareDetail(places, detailOf(places.filter((p) => p.id !== gone.id)));
    expect(c.onlyHere).toEqual([gone.id]);
    expect(c.same).toBe(inKeys.length - 1);
  });
  it("finds a place on both with different details", () => {
    const t = inKeys[2]!;
    const c = compareDetail(places, detailOf(places.map((p) => (p.id === t.id ? place(p.id, { wheelchair: "no", name: "z" }) : p))));
    expect(c.changed).toEqual([t.id]);
    expect(c.onlyHere).toEqual([]);
    expect(c.onlyThere).toEqual([]);
  });
  it("finds every kind at once, each list in id order", () => {
    const a = inKeys[0]!;
    const b = inKeys[1]!;
    const extra = ["x-1", "x-2", "x-3", "x-4", "x-5", "x-6"].map((id) => place(id, {})).filter((p) => keys.includes(bucketOf(p.id)));
    const remote = [...places.filter((p) => p.id !== a.id).map((p) => (p.id === b.id ? place(p.id, { name: "zz" }) : p)), ...extra];
    const c = compareDetail(places, detailOf(remote));
    expect(c.onlyHere).toEqual([a.id]);
    expect(c.changed).toEqual([b.id]);
    expect(c.onlyThere).toEqual(extra.map((p) => p.id).sort());
  });
  it("looks only at the groups the other code covers", () => {
    const outside = places.find((p) => !keys.includes(bucketOf(p.id)))!;
    const c = compareDetail(places.filter((p) => p.id !== outside.id), detailOf(places));
    expect(c.onlyThere).toEqual([]);
    expect(c.same).toBe(inKeys.length);
  });
  it("is the mirror image from the other side", () => {
    const remote = [...places.slice(4), place("mirror-1", {})];
    const there = detailOf(remote);
    const here = detailOf(places);
    const a = compareDetail(places, there);
    const b = compareDetail(remote, here);
    expect(a.onlyHere).toEqual(b.onlyThere);
    expect(a.onlyThere).toEqual(b.onlyHere);
    expect(a.changed).toEqual(b.changed);
  });
});
