// Robustness audit for the link reader and the App's link builders. Whatever text a link holds, reading it must
// not throw and must give either a description or a named problem; and a link the App builds must read back to
// the text it was built from.

import { describe, expect, it } from "vitest";
import { MAX_LINK_LENGTH, describeLink } from "../panel/handoffLink";
import { geoUri } from "../../states/geo";
import { MAX_MAILTO_LENGTH, mailtoHref } from "../../states/visitMessage";
import { genNumber, genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

/** Text with each lone surrogate replaced, because encodeURIComponent throws on one (see the last test). */
const wellFormed = (t: string): string => t.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");

const PROBLEMS = new Set(["empty", "too-long", "bad-character", "no-scheme", "unknown-scheme", "bad-encoding", "bad-address", "bad-number", "out-of-range", "bad-parameter"]);
const SCHEMES = ["mailto:", "tel:", "geo:", "sms:", "https:", "javascript:", ""];
const SAMPLES = ["mailto:a@example.org?subject=Hi&body=x", "tel:+14165550100;ext=2", "geo:43.65320,-79.38320;u=3", "sms:+14165550100?body=Hi"];

function anyLink(rng: Rng): string {
  const roll = rng.int(0, 2);
  if (roll === 0) return rng.pick(SCHEMES) + genString(rng, 60);
  if (roll === 1) return mutateText(rng, rng.pick(SAMPLES));
  return genString(rng, 80);
}

describe("reading any text", () => {
  it("never throws, and gives a description or a problem from the closed list", () => {
    assertProperty({
      name: "describeLink on any text",
      runs: 500,
      gen: anyLink,
      shrink: shrinkString,
      prop: (href) => {
        const r = describeLink(href);
        if (r.ok) expect(["mailto", "tel", "geo", "sms"]).toContain(r.link.kind);
        else expect(PROBLEMS.has(r.problem), r.problem).toBe(true);
      },
    });
  });
  it("is the same on a second reading", () => {
    assertProperty({ name: "describeLink is pure", gen: anyLink, shrink: shrinkString, prop: (href) => expect(describeLink(href)).toEqual(describeLink(href)) });
  });
  it("never reads a link longer than the limit", () => {
    assertProperty({
      name: "too long is refused",
      gen: (rng) => `mailto:?body=${"a".repeat(MAX_LINK_LENGTH + rng.int(0, 50))}`,
      prop: (href) => expect(describeLink(href)).toMatchObject({ ok: false, problem: "too-long" }),
    });
  });
  it("refuses any link that holds a space, a control character or a non-ASCII character", () => {
    assertProperty({
      name: "bad characters are refused",
      gen: (rng) => {
        const bad = rng.pick([" ", "\t", "\n", "\u0000", "é", " ", "😀", " "]);
        const at = rng.int(0, 12);
        const base = "mailto:a@example.org";
        return base.slice(0, at) + bad + base.slice(at);
      },
      prop: (href) => expect(describeLink(href)).toMatchObject({ ok: false, problem: "bad-character" }),
    });
  });
});

describe("links the App builds", () => {
  it("reads a map link back to the place, within half the last decimal place", () => {
    assertProperty({
      name: "geoUri round trip",
      runs: 400,
      gen: (rng) => ({ lat: Math.round((rng.next() * 180 - 90) * 1e7) / 1e7, lon: Math.round((rng.next() * 360 - 180) * 1e7) / 1e7 }),
      prop: ({ lat, lon }) => {
        const r = describeLink(geoUri({ lat, lon }));
        expect(r.ok).toBe(true);
        if (r.ok && r.link.kind === "geo") {
          expect(Math.abs(r.link.lat - lat)).toBeLessThanOrEqual(0.0000051);
          expect(Math.abs(r.link.lon - lon)).toBeLessThanOrEqual(0.0000051);
          expect(r.link.decimals).toBe(5);
        }
      },
    });
  });
  it("reads a map link for every number the generator makes, or refuses a point outside the range", () => {
    assertProperty({
      name: "geoUri on odd numbers",
      gen: (rng) => ({ lat: genNumber(rng), lon: genNumber(rng) }),
      prop: ({ lat, lon }) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const r = describeLink(geoUri({ lat, lon }));
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) expect(r.ok).toBe(true);
        else if (!r.ok) expect(["out-of-range", "bad-number"]).toContain(r.problem);
      },
    });
  });
  it("reads an email draft back to its subject, whatever characters it holds, or is not offered", () => {
    assertProperty({
      name: "mailtoHref round trip",
      runs: 400,
      gen: (rng) => ({ subject: wellFormed(genString(rng, 40)).split("").filter((ch) => ch.charCodeAt(0) > 31).join(""), body: wellFormed(genString(rng, 200)) }),
      shrink: (d) => [...shrinkString(d.body)].map((body) => ({ ...d, body })),
      prop: (d) => {
        const href = mailtoHref(d);
        if (href === null) {
          expect(`mailto:?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body.replace(/\n/g, "\r\n"))}`.length).toBeGreaterThan(MAX_MAILTO_LENGTH);
          return;
        }
        const r = describeLink(href);
        expect(r.ok, href).toBe(true);
        if (r.ok && r.link.kind === "mailto") {
          expect(r.link.to).toEqual([]);
          expect(r.link.subject).toBe(d.subject);
          expect(r.link.otherFields).toEqual([]);
          expect(r.link.bodyChars).toBe([...d.body.replace(/\n/g, "\r\n")].length);
        }
      },
    });
  });
  it("throws on text with a lone surrogate, which a place name from the data could hold (known; the link builder is outside this lane)", () => {
    expect(() => mailtoHref({ subject: "s", body: "a\ud800b" })).toThrow(URIError);
    expect(() => mailtoHref({ subject: "s", body: "a\ud83d\ude00b" })).not.toThrow();
  });
});
