import { describe, expect, it } from "vitest";
import { MAX_LINK_LENGTH, describeLink, type LinkDescription, type LinkProblem } from "./handoffLink";

const ok = (href: string): LinkDescription => {
  const r = describeLink(href);
  if (!r.ok) throw new Error(`${href}: ${r.problem} ${r.detail ?? ""}`);
  return r.link;
};
const bad = (href: string): string => {
  const r = describeLink(href);
  return r.ok ? "ok" : r.detail === undefined ? r.problem : `${r.problem}:${r.detail}`;
};
const mail = (href: string) => ok(href) as Extract<LinkDescription, { kind: "mailto" }>;

describe("any link", () => {
  it("refuses an empty link, a link with no scheme and a scheme it does not read", () => {
    expect(bad("")).toBe("empty");
    expect(bad("example")).toBe("no-scheme");
    expect(bad("1tel:5551234")).toBe("no-scheme");
    expect(bad("https://example.org")).toBe("unknown-scheme:https");
    expect(bad("javascript:void(0)")).toBe("unknown-scheme:javascript");
  });
  it("refuses a link that is too long, at exactly one character over", () => {
    expect(bad(`mailto:?body=${"a".repeat(MAX_LINK_LENGTH - 13)}`)).toBe("ok");
    expect(bad(`mailto:?body=${"a".repeat(MAX_LINK_LENGTH - 12)}`)).toBe(`too-long:${MAX_LINK_LENGTH + 1}`);
  });
  it("refuses a space, a control character and a character outside ASCII, which must be written with a percent sign", () => {
    expect(bad("tel:555 1234")).toBe("bad-character");
    expect(bad("tel:5551234\n")).toBe("bad-character");
    expect(bad("mailto:?subject=é")).toBe("bad-character");
    expect(bad("mailto:?subject=%C3%A9")).toBe("ok");
  });
  it("reads the scheme in any case", () => {
    expect(ok("TEL:5551234").kind).toBe("tel");
    expect(ok("MailTo:?subject=x").kind).toBe("mailto");
  });
});

describe("mailto", () => {
  it("reads a draft with no address", () => {
    const m = mail("mailto:?subject=Hello%20there&body=Line%20one%0D%0ALine%20two");
    expect(m).toEqual({ kind: "mailto", to: [], cc: [], bcc: [], subject: "Hello there", bodyChars: 18, bodyLines: 2, otherFields: [] });
  });
  it("reads one or more addresses, before the question mark and in a to field", () => {
    expect(mail("mailto:a@example.org").to).toEqual(["a@example.org"]);
    expect(mail("mailto:a@example.org,b@example.org").to).toEqual(["a@example.org", "b@example.org"]);
    expect(mail("mailto:?to=a@example.org").to).toEqual(["a@example.org"]);
    expect(mail("mailto:a%40example.org").to).toEqual(["a@example.org"]);
  });
  it("keeps the cc and bcc addresses apart from the to addresses", () => {
    const m = mail("mailto:a@example.org?cc=b@example.org&bcc=c@example.org,d@example.org");
    expect([m.to, m.cc, m.bcc]).toEqual([["a@example.org"], ["b@example.org"], ["c@example.org", "d@example.org"]]);
  });
  it("lists a field it does not know once, and does not read its value", () => {
    expect(mail("mailto:?x-note=1&x-note=2&in-reply-to=abc").otherFields).toEqual(["x-note", "in-reply-to"]);
  });
  it("reads a field name in any case", () => {
    expect(mail("mailto:?SUBJECT=Hi&Body=x").subject).toBe("Hi");
    expect(mail("mailto:?SUBJECT=Hi&Body=x").bodyChars).toBe(1);
  });
  it("keeps a plus sign as a plus sign", () => {
    expect(mail("mailto:?subject=a+b").subject).toBe("a+b");
  });
  it("counts characters and not code units, and lines for each kind of line break", () => {
    expect(mail("mailto:?body=%F0%9F%99%82").bodyChars).toBe(1);
    expect(mail("mailto:?body=a%0Ab").bodyLines).toBe(2);
    expect(mail("mailto:?body=a%0D%0Ab%0Dc").bodyLines).toBe(3);
    expect(mail("mailto:?body=").bodyLines).toBe(0);
    expect(mail("mailto:").bodyLines).toBe(0);
  });
  it("refuses an address with no at sign, two at signs, a space or an angle bracket", () => {
    for (const a of ["nobody", "a@b@c", "a%20b@c", "%3Ca@b%3E", "@example.org", "a@"]) expect(bad(`mailto:${a}`), a).toMatch(/^bad-address/);
  });
  it("gives the bad address as the detail", () => {
    expect(bad("mailto:ok@example.org,nobody")).toBe("bad-address:nobody");
    expect(bad("mailto:?cc=nobody")).toBe("bad-address:nobody");
  });
  it("refuses a broken percent sign anywhere", () => {
    expect(bad("mailto:%E0%A4%A")).toBe("bad-encoding");
    expect(bad("mailto:?subject=%")).toBe("bad-encoding");
    expect(bad("mailto:?%ZZ=1")).toBe("bad-encoding");
  });
  it("ignores empty pieces", () => {
    expect(mail("mailto:?&&subject=x&").subject).toBe("x");
    expect(mail("mailto:,,a@example.org,").to).toEqual(["a@example.org"]);
  });
  it("reads a subject with no value as empty", () => {
    expect(mail("mailto:?subject").subject).toBe("");
  });
});

describe("mailto, harder cases", () => {
  it("reads a second question mark as part of a value, not as a new query", () => {
    expect(mail("mailto:?subject=a?b").subject).toBe("a?b");
    expect(mail("mailto:?body=what%3F").bodyChars).toBe(5);
  });
  it("reads percent signs in either case of hex digit the same way", () => {
    expect(mail("mailto:?subject=%c3%a9").subject).toBe("é");
    expect(mail("mailto:?subject=%C3%A9").subject).toBe("é");
  });
  it("lets the last subject win and adds up the text of every body", () => {
    expect(mail("mailto:?subject=a&subject=b").subject).toBe("b");
    const m = mail("mailto:?body=ab&body=c%0Ad");
    expect([m.bodyChars, m.bodyLines]).toEqual([5, 3]);
  });
  it("reads an equals sign in a value as part of the value", () => {
    expect(mail("mailto:?subject=a=b").subject).toBe("a=b");
  });
  it("reads a field with an empty name as another field", () => {
    expect(mail("mailto:?=x").otherFields).toEqual([""]);
  });
  it("accepts an address with a plus tag and a long domain", () => {
    expect(mail("mailto:a+tag@mail.example.org").to).toEqual(["a+tag@mail.example.org"]);
  });
});

describe("tel", () => {
  it("reads the digits, with the separators dropped", () => {
    expect(ok("tel:4165550100")).toEqual({ kind: "tel", digits: "4165550100", plus: false, extension: null });
    expect(ok("tel:+1-416-555-0100")).toEqual({ kind: "tel", digits: "14165550100", plus: true, extension: null });
    expect(ok("tel:(416).555.0100")).toMatchObject({ digits: "4165550100" });
  });
  it("reads an extension", () => {
    expect(ok("tel:4165550100;ext=22")).toMatchObject({ extension: "22" });
    expect(ok("tel:4165550100;postd=1-2")).toMatchObject({ extension: "12" });
  });
  it("refuses letters, a plus that is not first, too few digits and too many", () => {
    expect(bad("tel:416CALL")).toBe("bad-number:416CALL");
    expect(bad("tel:416+5550100")).toMatch(/^bad-number/);
    expect(bad("tel:12")).toBe("bad-number:2");
    expect(bad("tel:1234567890123456")).toBe("bad-number:16");
    expect(bad("tel:123456789012345")).toBe("ok");
    expect(bad("tel:123")).toBe("ok");
  });
  it("refuses a parameter it does not know", () => {
    expect(bad("tel:4165550100;isub=1")).toBe("bad-parameter:isub=1");
  });
  it("refuses a link with no number", () => {
    expect(bad("tel:")).toMatch(/^bad-number/);
  });
});

describe("geo", () => {
  it("reads a place and how many decimal places it is written to", () => {
    expect(ok("geo:43.65320,-79.38320")).toEqual({ kind: "geo", lat: 43.6532, lon: -79.3832, decimals: 5, altitude: null, uncertainty: null });
    expect(ok("geo:43,-79")).toMatchObject({ decimals: 0 });
    expect(ok("geo:43.5,-79.123456")).toMatchObject({ decimals: 6 });
  });
  it("reads an altitude and an uncertainty", () => {
    expect(ok("geo:1,2,300;u=35;crs=wgs84")).toMatchObject({ altitude: 300, uncertainty: 35 });
  });
  it("accepts the edges of the range and refuses a step past them", () => {
    expect(bad("geo:90,180")).toBe("ok");
    expect(bad("geo:-90,-180")).toBe("ok");
    expect(bad("geo:90.00001,0")).toBe("out-of-range:90.00001,0");
    expect(bad("geo:0,180.5")).toBe("out-of-range:0,180.5");
  });
  it("refuses a missing number, an extra one and text", () => {
    for (const c of ["geo:", "geo:1", "geo:1,2,3,4", "geo:a,b", "geo:1,", "geo:1.,2", "geo:+1,2"]) expect(bad(c), c).toMatch(/^bad-number/);
  });
  it("refuses a parameter it does not know", () => {
    expect(bad("geo:1,2;foo=bar")).toBe("bad-parameter:foo=bar");
  });
});

describe("sms", () => {
  it("reads the numbers and the length of the text", () => {
    expect(ok("sms:+14165550100,4165550101?body=Hi%20there")).toEqual({ kind: "sms", to: ["+14165550100", "4165550101"], bodyChars: 8 });
  });
  it("reads a link with no number", () => {
    expect(ok("sms:?body=x")).toEqual({ kind: "sms", to: [], bodyChars: 1 });
  });
  it("refuses a number that is not one, and a broken percent sign", () => {
    expect(bad("sms:abc")).toBe("bad-number:abc");
    expect(bad("sms:12")).toBe("bad-number:12");
    expect(bad("sms:5551234?body=%")).toBe("bad-encoding");
  });
});

describe("the problems", () => {
  it("are a closed list", () => {
    const seen = new Set<LinkProblem>();
    for (const h of ["", "x", "https:x", "mailto:%", "mailto:x", "tel:1", "geo:99,0", "tel:123;a", "é", "x".repeat(MAX_LINK_LENGTH + 1)]) {
      const r = describeLink(h);
      if (!r.ok) seen.add(r.problem);
    }
    expect([...seen].sort()).toEqual(["bad-address", "bad-character", "bad-encoding", "bad-number", "bad-parameter", "empty", "no-scheme", "out-of-range", "too-long", "unknown-scheme"]);
  });
});
