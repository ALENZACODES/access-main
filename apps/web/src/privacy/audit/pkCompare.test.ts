import { describe, expect, it } from "vitest";
import { compareAccepted, comparePacks, formatPkProblem, formatPkProblems, hostsOf, type PkRead } from "./pkCompare";
import type { PkAcceptRow, PkPackRow } from "./pkRegister";
import type { PkFinding } from "./pkRules";

const H = `${"http"}s://`;
const reg = (over: Partial<PkPackRow> = {}): PkPackRow => ({ id: "a", hosts: ["a.org", "b.org"], sources: [{ name: "S", licence: "L" }], ...over });
const read = (over: Partial<PkRead> = {}): PkRead => ({ id: "a", hosts: ["a.org", "b.org"], sources: [{ name: "S", licence: "L" }], findings: [], ...over });
const finding = (code: PkFinding["code"]): PkFinding => ({ code, file: "content", path: "p", detail: "d" });
const keys = (list: Array<{ code: string; key: string }>): string[] => list.map((p) => `${p.code} ${p.key}`);

describe("hostsOf", () => {
  it("gives each host once, in order, in lower case", () => expect(hostsOf([`${H}B.org/x`, `${H}a.org/`, `${H}b.org/y?z=1`])).toEqual(["a.org", "b.org"]));
  it("leaves out the user name and the port", () => expect(hostsOf([`${H}me:pw@a.org:8443/x`])).toEqual(["a.org"]));
  it("leaves out text that is not an address", () => expect(hostsOf(["nope", "/a/b", ""])).toEqual([]));
  it("reads any scheme", () => expect(hostsOf([`${"http"}://a.org/`, "ftp://b.org/"])).toEqual(["a.org", "b.org"]));
  it("is empty for nothing", () => expect(hostsOf([])).toEqual([]));
});

describe("comparePacks", () => {
  it("has no difference when what was read is what the register says", () => expect(comparePacks([read()], [reg()])).toEqual([]));
  it("finds a pack that is not in the register, and one that is not there", () => {
    expect(keys(comparePacks([read({ id: "z" })], [reg()]))).toEqual(["pack-added z", "pack-gone a"]);
  });
  it("finds a host the pack links to that the register does not list", () => expect(comparePacks([read({ hosts: ["a.org", "b.org", "c.org"] })], [reg()])).toEqual([{ code: "host-added", key: "a c.org", detail: "the pack links to a host the register does not list" }]));
  it("finds a host the register lists that the pack no longer uses", () => expect(keys(comparePacks([read({ hosts: ["a.org"] })], [reg()]))).toEqual(["host-gone a b.org"]));
  it("finds a source added, one gone, and a licence that changed", () => {
    expect(keys(comparePacks([read({ sources: [{ name: "S", licence: "L" }, { name: "T", licence: "M" }] })], [reg()]))).toEqual(["source-added a T"]);
    expect(keys(comparePacks([read({ sources: [] })], [reg()]))).toEqual(["source-gone a S"]);
    expect(comparePacks([read({ sources: [{ name: "S", licence: "UNKNOWN" }] })], [reg()])).toEqual([{ code: "source-licence-changed", key: "a S", detail: "register L; manifest UNKNOWN" }]);
  });
  it("finds a licence that was filled in where the register says UNKNOWN", () => expect(keys(comparePacks([read({ sources: [{ name: "S", licence: "CC0" }] })], [reg({ sources: [{ name: "S", licence: "UNKNOWN" }] })]))).toEqual(["source-licence-changed a S"]));
  it("gives problems in pack order", () => expect(keys(comparePacks([read({ id: "b" }), read({ id: "a", hosts: [] })], [reg()]))).toEqual(["host-gone a a.org", "host-gone a b.org", "pack-added b"]));
  it("has no difference for nothing on both sides", () => expect(comparePacks([], [])).toEqual([]));
});

describe("compareAccepted", () => {
  const rows: PkAcceptRow[] = [{ pack: "a", code: "pk-fr-apostrophe", count: 2, reason: "A real reason that is long enough." }];
  const two = read({ findings: [finding("pk-fr-apostrophe"), finding("pk-fr-apostrophe")] });
  it("has no difference when the findings are exactly the accepted ones", () => expect(compareAccepted([two], rows)).toEqual([]));
  it("has no difference for nothing on both sides", () => expect(compareAccepted([read()], [])).toEqual([]));
  it("finds a finding that is not accepted, and says it in the plural", () => {
    expect(compareAccepted([read({ findings: [finding("pk-text-email")] })], [])).toEqual([{ code: "finding-not-accepted", key: "a pk-text-email", detail: "1 finding not on the accepted list" }]);
    expect(compareAccepted([read({ findings: [finding("pk-text-email"), finding("pk-text-email")] })], [])[0]?.detail).toBe("2 findings not on the accepted list");
  });
  it("finds an accepted finding that is gone", () => expect(compareAccepted([read()], rows)).toEqual([{ code: "accepted-gone", key: "a pk-fr-apostrophe", detail: "accepted ×2; none found" }]));
  it("finds a count that changed, up or down", () => {
    expect(compareAccepted([read({ findings: [finding("pk-fr-apostrophe")] })], rows)).toEqual([{ code: "count-changed", key: "a pk-fr-apostrophe", detail: "accepted ×2, found ×1" }]);
    expect(compareAccepted([read({ findings: [finding("pk-fr-apostrophe"), finding("pk-fr-apostrophe"), finding("pk-fr-apostrophe")] })], rows)[0]?.detail).toBe("accepted ×2, found ×3");
  });
  it("finds a code that may not be accepted", () => expect(keys(compareAccepted([read({ findings: [finding("pk-text-email")] })], [{ ...rows[0]!, code: "pk-text-email", count: 1 }]))).toEqual(["unacceptable-code a pk-text-email"]));
  it("does not take a finding of another pack for the accepted one", () => expect(keys(compareAccepted([read({ id: "b", findings: [finding("pk-fr-apostrophe")] })], rows)).sort()).toEqual(["accepted-gone a pk-fr-apostrophe", "finding-not-accepted b pk-fr-apostrophe"]));
});

describe("formatting", () => {
  const p = { code: "host-added", key: "a c.org", detail: "d" } as const;
  it("writes a problem as one line", () => expect(formatPkProblem(p)).toBe("host-added a c.org: d"));
  it("writes problems one to a line, and none as nothing", () => {
    expect(formatPkProblems([p, p]).split("\n")).toHaveLength(2);
    expect(formatPkProblems([])).toBe("");
  });
});
