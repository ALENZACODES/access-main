import { describe, expect, it } from "vitest";
import { SHORTENERS, TRACKING_NAME, checkUrl, hostIsListed, hostSuffixes, isIpHost, parseUrl } from "./pkUrl";

const H = `${"http"}s://`;
const PLAIN = `${"http"}://`;
const codes = (u: string, listed: string[] = ["example.org"]): string[] => checkUrl(u, listed).map((p) => p.code);

describe("parseUrl", () => {
  it("reads the parts of an address", () => {
    expect(parseUrl(`${H}User:pw@Example.ORG:8443/a/b?x=1&y#top`)).toEqual({ scheme: "https", user: "User:pw", host: "example.org", port: "8443", path: "/a/b", queryNames: ["x", "y"], hash: "top" });
  });
  it("reads an address with an empty host, so a rule can name it", () => expect(parseUrl(`${H}`)?.host).toBe(""));
  it("reads an address with only a host", () => expect(parseUrl(`${H}example.org`)).toMatchObject({ host: "example.org", path: "", queryNames: [], port: "", user: "", hash: "" }));
  it("reads a query with no path", () => expect(parseUrl(`${H}example.org?a=1`)?.queryNames).toEqual(["a"]));
  it("reads an address in an upper-case scheme", () => expect(parseUrl(`HTTPS://example.org/`)?.scheme).toBe("https"));
  it("reads a host written as an IPv6 address in brackets", () => expect(parseUrl(`${H}[::1]:8080/x`)).toMatchObject({ host: "[::1]", port: "8080" }));
  it("decodes the names in the query, and keeps a name it cannot decode", () => expect(parseUrl(`${H}example.org/?%75tm_source=a&%E0%A4%A=1`)?.queryNames).toEqual(["utm_source", "%E0%A4%A"]));
  it.each([["example.org"], ["/a/b"], ["mailto:a@b.c"], ["https:/example.org"], [`${H}exa mple.org`], [" https://example.org"], [""], ["//example.org/x"]])("does not read %j as an address", (t) => expect(parseUrl(t)).toBeNull());
  it("reads other schemes too, so the rules can name them", () => expect(parseUrl("ftp://example.org/x")?.scheme).toBe("ftp"));
});

describe("hosts", () => {
  it("lists the suffixes of a host", () => expect(hostSuffixes("a.b.example.org")).toEqual(["a.b.example.org", "b.example.org", "example.org", "org"]));
  it("gives one suffix for a one-part host and none for an empty one", () => {
    expect(hostSuffixes("localhost")).toEqual(["localhost"]);
    expect(hostSuffixes("")).toEqual([]);
    expect(hostSuffixes("a..b")).toEqual(["a.b", "b"]);
  });
  it("says a host is listed when it, or a host above it, is in the list", () => {
    expect(hostIsListed("example.org", ["example.org"])).toBe(true);
    expect(hostIsListed("www.example.org", ["example.org"])).toBe(true);
    expect(hostIsListed("example.org", ["www.example.org"])).toBe(false);
    expect(hostIsListed("notexample.org", ["example.org"])).toBe(false);
    expect(hostIsListed("example.org.evil.net", ["example.org"])).toBe(false);
    expect(hostIsListed("x.y", [])).toBe(false);
  });
  it.each([["127.0.0.1", true], ["10.1.2.3", true], ["[::1]", true], ["0x7f000001", true], ["2130706433", true], ["example.org", false], ["a1.org", false], ["123.org", false], ["1.2.3", false]])("%s is a number host: %s", (h, yes) => expect(isIpHost(h)).toBe(yes));
});

describe("checkUrl", () => {
  it("accepts a plain https address on a listed host", () => expect(codes(`${H}example.org/a?b=1`)).toEqual([]));
  it("accepts a host under a listed one", () => expect(codes(`${H}www.example.org/a`)).toEqual([]));
  it("accepts the port 443 written out", () => expect(codes(`${H}example.org:443/`)).toEqual([]));
  it("finds text that is not an address", () => expect(checkUrl("hello", [])).toEqual([{ code: "pk-url-unreadable", detail: "not an address with a scheme and a host" }]));
  it("finds an address that is not https", () => {
    expect(checkUrl(`${PLAIN}example.org/`, ["example.org"])).toEqual([{ code: "pk-url-not-https", detail: "scheme http" }]);
    expect(codes("ftp://example.org/")).toEqual(["pk-url-not-https"]);
  });
  it("finds a user name or password in the address, and does not repeat it", () => expect(codes(`${H}me:secret@example.org/`)).toEqual(["pk-url-credentials"]));
  it("finds a number for a host, and a missing host", () => {
    expect(codes(`${H}192.168.0.1/x`)).toEqual(["pk-url-ip-host"]);
    expect(checkUrl(`${H}/x`, [])).toEqual([{ code: "pk-url-ip-host", detail: "no host" }]);
  });
  it("finds a shortener, even when it is listed", () => expect(codes(`${H}bit.ly/abc`, ["bit.ly"])).toEqual(["pk-url-shortener"]));
  it.each(SHORTENERS)("finds the shortener %s", (s) => expect(codes(`${H}${s}/x`, [s])).toEqual(["pk-url-shortener"]));
  it("finds a port that is not 443", () => expect(checkUrl(`${H}example.org:8443/`, ["example.org"])).toEqual([{ code: "pk-url-port", detail: "port 8443" }]));
  it("finds a tracking name in the query, with the names", () => expect(checkUrl(`${H}example.org/?utm_source=a&ok=1&fbclid=z`, ["example.org"])).toEqual([{ code: "pk-url-tracking", detail: "query utm_source, fbclid" }]));
  it.each(["utm_medium", "utm_campaign", "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "_ga", "_gl", "igshid", "yclid", "ref_src", "ref", "source", "UTM_SOURCE"])("takes %s for a tracking name", (n) => expect(TRACKING_NAME.test(n)).toBe(true));
  it.each(["q", "page", "lang", "id", "referrer_note", "utm", "sources"])("does not take %s for a tracking name", (n) => expect(TRACKING_NAME.test(n)).toBe(false));
  it("finds a host that is not listed", () => expect(checkUrl(`${H}other.net/`, ["example.org"])).toEqual([{ code: "pk-url-host-not-listed", detail: "host other.net" }]));
  it("does not take a host that only ends like a listed one for listed", () => expect(codes(`${H}badexample.org/`)).toEqual(["pk-url-host-not-listed"]));
  it("finds every problem of one address, in the same order each time", () => {
    expect(codes(`${PLAIN}u:p@bit.ly:81/?utm_x=1`, [])).toEqual(["pk-url-not-https", "pk-url-credentials", "pk-url-shortener", "pk-url-port", "pk-url-tracking", "pk-url-host-not-listed"]);
  });
  it("does not say a number host is not listed as well", () => expect(codes(`${H}10.0.0.1/`, [])).toEqual(["pk-url-ip-host"]));
});
