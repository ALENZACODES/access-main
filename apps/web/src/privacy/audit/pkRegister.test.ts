import { describe, expect, it } from "vitest";
import { PK_ACCEPTABLE, PK_ACCEPTED, PK_REGISTER, assertPkRegister, validatePkRegister, type PkAcceptRow, type PkPackRow } from "./pkRegister";

const pack = (over: Partial<PkPackRow> = {}): PkPackRow => ({ id: "a", hosts: ["example.org"], sources: [{ name: "S", licence: "UNKNOWN" }], ...over });
const row: PkAcceptRow = { pack: "a", code: "pk-fr-apostrophe", count: 1, reason: "A real reason that is long enough to count." };
const msgs = (r: readonly PkPackRow[], a: readonly PkAcceptRow[] = []): string[] => validatePkRegister(r, a).map((p) => p.message);

describe("the real register", () => {
  it("is well formed", () => expect(validatePkRegister()).toEqual([]));
  it("does not throw when asserted", () => expect(() => assertPkRegister()).not.toThrow());
  it("lists the Toronto pack with https hosts only, as bare host names", () => {
    const t = PK_REGISTER.find((r) => r.id === "toronto");
    expect(t?.hosts.length).toBeGreaterThan(3);
    for (const h of t?.hosts ?? []) expect(h).toMatch(/^[a-z0-9.-]+$/);
  });
  it("keeps the licence UNKNOWN for the source whose licence is not known", () => expect(PK_REGISTER[0]?.sources.find((s) => s.name.includes("desk check"))?.licence).toBe("UNKNOWN"));
  it("accepts only codes that may be accepted, each with a real reason", () => {
    for (const a of PK_ACCEPTED) {
      expect(PK_ACCEPTABLE).toContain(a.code);
      expect(a.reason.length).toBeGreaterThan(40);
    }
  });
  it("never allows a leak, an address that is not https, a guessed licence or a wrong hash", () => {
    for (const never of ["pk-text-email", "pk-text-phone", "pk-text-id-number", "pk-url-not-https", "pk-url-credentials", "pk-url-tracking", "pk-url-ip-host", "pk-url-host-not-listed", "pk-licence-invented", "pk-sha-mismatch", "pk-size-mismatch", "pk-count-mismatch", "pk-geo-private-kind", "pk-geo-outside", "pk-text-wording", "pk-wheelchair-value"] as const) expect(PK_ACCEPTABLE).not.toContain(never);
  });
  it("does not say more in a reason than was read", () => {
    for (const a of PK_ACCEPTED) expect(a.reason).not.toMatch(/\b(verified|safe|secure|fixed|correct)\b/i);
  });
});

describe("validatePkRegister", () => {
  it("accepts a small valid register", () => expect(msgs([pack()])).toEqual([]));
  it("finds a pack listed twice, and packs out of order", () => {
    expect(msgs([pack(), pack()])).toContain("a pack is listed twice");
    expect(msgs([pack({ id: "b" }), pack({ id: "a" })])).toEqual(["the packs are not in sorted order"]);
  });
  it("finds a pack with no hosts", () => expect(msgs([pack({ hosts: [] })])).toEqual(["a lists no hosts"]));
  it("finds hosts out of order, a host twice, and a text that is not a host name", () => {
    expect(msgs([pack({ hosts: ["b.org", "a.org"] })])).toEqual(["a: the hosts are not in sorted order"]);
    expect(msgs([pack({ hosts: ["a.org", "a.org"] })])).toEqual(["a: a host is listed twice"]);
    expect(msgs([pack({ hosts: ["Example.org"] })])).toEqual(["a: Example.org is not a host name"]);
    expect(msgs([pack({ hosts: [".org"] })])).toEqual(["a: .org is not a host name"]);
    expect(msgs([pack({ hosts: ["a b"] })])).toEqual(["a: a b is not a host name"]);
  });
  it("finds a source listed twice, and a source with no name or licence", () => {
    expect(msgs([pack({ sources: [{ name: "S", licence: "x" }, { name: "S", licence: "y" }] })])).toEqual(["a: a source is listed twice"]);
    expect(msgs([pack({ sources: [{ name: "", licence: "x" }] })])).toEqual(["a: a source has no name or no licence"]);
    expect(msgs([pack({ sources: [{ name: "S", licence: "" }] })])).toEqual(["a: a source has no name or no licence"]);
  });
  it("accepts a valid accepted row", () => expect(msgs([pack()], [row])).toEqual([]));
  it("finds a row accepted twice, a code that may not be accepted, and a pack that is not listed", () => {
    expect(msgs([pack()], [row, row])).toEqual(["a accepts pk-fr-apostrophe twice"]);
    expect(msgs([pack()], [{ ...row, code: "pk-text-email" }])).toEqual(["pk-text-email may not be accepted (a)"]);
    expect(msgs([pack()], [{ ...row, pack: "z" }])).toEqual(["z is not a pack in the register"]);
  });
  it.each([[0], [-1], [1.5]])("finds a count of %d", (n) => expect(msgs([pack()], [{ ...row, count: n }])).toEqual([`a pk-fr-apostrophe has a count of ${n}`]));
  it("finds a reason that is too short", () => expect(msgs([pack()], [{ ...row, reason: "ok" }])).toEqual(["a pk-fr-apostrophe has no real reason"]));
  it("gives every problem, not only the first", () => expect(msgs([pack({ hosts: [] })], [{ ...row, count: 0, reason: "" }]).length).toBe(3));
});
