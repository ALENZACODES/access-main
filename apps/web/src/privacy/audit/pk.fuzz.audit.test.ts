// Robustness audit for the pack rules. Whatever a file holds, auditing must not throw and must give the same
// findings twice; adding one email address to a clean pack adds exactly one finding; a pack built from clean parts
// stays clean; a changed byte of the content is found by the hash.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { byteLength } from "./pkFiles";
import { auditPack } from "./pkRules";
import { checkText } from "./pkText";
import { checkUrl, parseUrl } from "./pkUrl";
import { genJson, genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { checkHelpNumber } from "./pkHelp";
import { summarise } from "./pkSummary";
import { parseJson, walkPack } from "./pkWalk";

const H = `${"http"}s://`;
const HOSTS = ["example.org"];
const word = (rng: Rng): string => rng.pick(["Alpha", "Beta Cafe", "Main Street", "Pharmacy", "Station", "Elevator", "Gate 4"]);

function cleanPack(rng: Rng): { manifest: Record<string, unknown>; content: Record<string, unknown>; text: string } {
  const n = rng.int(0, 6);
  const places = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: word(rng),
    category: rng.pick(["cafe", "pharmacy", "attraction"]),
    wheelchair: rng.pick(["yes", "no", "limited", "designated", "UNKNOWN"]),
    address: `${rng.int(1, 999)} ${word(rng)}`,
    lat: Number((43.6 + rng.int(0, 99) / 1000).toFixed(3)),
    lon: Number((-79.4 + rng.int(0, 99) / 1000).toFixed(3)),
    provenance: { source_name: "S1", licence: "ODbL-1.0", source_url: `${H}example.org/${i}` },
  }));
  const content = { schema_version: "v1", pack_id: "t", places, help_numbers: [], elevator_status: [], journeys: [] };
  const text = JSON.stringify(content);
  const manifest = {
    schema_version: "v1",
    pack_id: "t",
    built_at: "2026-11-14",
    size_bytes: byteLength(text),
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    source_dates: n === 0 ? [] : [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "2026-11-13" }],
    counts: { places: n, help_numbers: 0, elevator_status: 0, journeys: 0 },
  };
  return { manifest, content, text };
}

describe("the readers never fail", () => {
  it("auditPack does not throw on JSON of any shape, and says the same twice", () =>
    assertProperty({
      name: "no throw", gen: (rng) => ({ m: genJson(rng), c: genJson(rng) }), show: (v) => JSON.stringify(v),
      prop: ({ m, c }) => {
        const a = auditPack({ manifest: m, content: c, measured: null }, { hosts: HOSTS });
        expect(auditPack({ manifest: m, content: c, measured: null }, { hosts: HOSTS })).toEqual(a);
      },
    }));
  it("checkText and checkUrl do not throw on any text", () =>
    assertProperty({
      name: "text", gen: (rng) => (rng.bool() ? genString(rng, 60) : mutateText(rng, `${H}example.org/a?b=1`)), shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => {
        checkText({ path: "p", key: "name", text: s, lang: "fr" });
        checkText({ path: "p", key: "contact", text: s, lang: null });
        checkUrl(s, HOSTS);
        parseUrl(s);
      },
    }));
  it("walkPack lists every text of a value once", () =>
    assertProperty({
      name: "walk", gen: (rng) => JSON.stringify(genJson(rng)), shrink: shrinkString, show: (s) => s,
      prop: (s) => {
        const v = parseJson(s);
        const w = walkPack(v);
        expect(new Set(w.leaves.map((l) => l.path)).size).toBe(w.leaves.length);
      },
    }));
});

describe("one change makes one finding", () => {
  it("a clean pack has no findings", () =>
    assertProperty({
      name: "clean", gen: cleanPack, show: (p) => p.text,
      prop: (p) => expect(auditPack({ manifest: p.manifest, content: p.content, measured: { bytes: byteLength(p.text), sha256: p.manifest["sha256"] as string } }, { hosts: HOSTS })).toEqual([]),
    }));
  it("an email address added to one name adds exactly one finding", () =>
    assertProperty({
      name: "one email", gen: (rng) => ({ p: cleanPack(rng), at: rng.int(0, 5) }), show: (v) => v.p.text,
      prop: ({ p, at }) => {
        const places = p.content["places"] as Array<{ name: string }>;
        if (places.length === 0) return;
        const target = places[at % places.length];
        if (target) target.name = `${target.name} a.b@example.org`;
        const f = auditPack({ manifest: p.manifest, content: p.content, measured: null }, { hosts: HOSTS });
        expect(f.map((x) => x.code)).toEqual(["pk-text-email"]);
      },
    }));
  it("an address on another host adds exactly one finding", () =>
    assertProperty({
      name: "one host", gen: (rng) => cleanPack(rng), show: (p) => p.text,
      prop: (p) => {
        const places = p.content["places"] as Array<{ provenance: { source_url: string } }>;
        const first = places[0];
        if (!first) return;
        first.provenance.source_url = `${H}other.net/x`;
        expect(auditPack({ manifest: p.manifest, content: p.content, measured: null }, { hosts: HOSTS }).map((x) => x.code)).toEqual(["pk-url-host-not-listed"]);
      },
    }));
  it("a point moved out of the box adds exactly one finding", () =>
    assertProperty({
      name: "one point", gen: cleanPack, show: (p) => p.text,
      prop: (p) => {
        const first = (p.content["places"] as Array<{ lat: number }>)[0];
        if (!first) return;
        first.lat = 51.5;
        expect(auditPack({ manifest: p.manifest, content: p.content, measured: null }, { hosts: HOSTS }).map((x) => x.code)).toEqual(["pk-geo-outside"]);
      },
    }));
  it("a changed byte of the content is found by the hash", () =>
    assertProperty({
      name: "hash", gen: (rng) => ({ p: cleanPack(rng), swap: rng.pick(["a", "b", "c"]) }), show: (v) => v.p.text,
      prop: ({ p, swap }) => {
        const changed = `${p.text}${swap}`;
        const f = auditPack({ manifest: p.manifest, content: p.content, measured: { bytes: byteLength(changed), sha256: createHash("sha256").update(changed, "utf8").digest("hex") } }, { hosts: HOSTS });
        expect(f.map((x) => x.code).sort()).toEqual(["pk-sha-mismatch", "pk-size-mismatch"]);
      },
    }));
});

describe("help numbers and the summary", () => {
  it("checkHelpNumber does not throw on JSON of any shape, and gives each problem once", () =>
    assertProperty({
      name: "help", gen: (rng) => genJson(rng), show: (v) => JSON.stringify(v),
      prop: (v) => {
        const p = checkHelpNumber(v);
        expect(p.length).toBeLessThanOrEqual(4);
        expect(checkHelpNumber(v)).toEqual(p);
      },
    }));
  it("summarise does not throw, and its wheelchair counts add up to the places", () =>
    assertProperty({
      name: "summary", gen: (rng) => ({ places: Array.from({ length: rng.int(0, 8) }, () => ({ wheelchair: rng.pick(["yes", "no", "UNKNOWN", "limited", 3, null]) })) }), show: (v) => JSON.stringify(v),
      prop: (v) => {
        const s = summarise(v);
        expect(s.wheelchairYes + s.wheelchairNo + s.wheelchairUnknown + s.wheelchairOther).toBe(s.places);
      },
    }));
  it("summarise does not throw on JSON of any shape", () =>
    assertProperty({ name: "summary any", gen: (rng) => genJson(rng), show: (v) => JSON.stringify(v), prop: (v) => void summarise(v) }));
  it("a clean pack gives a summary that matches its manifest counts", () =>
    assertProperty({
      name: "counts", gen: cleanPack, show: (p) => p.text,
      prop: (p) => expect(summarise(p.content).places).toBe((p.manifest["counts"] as { places: number }).places),
    }));
});
