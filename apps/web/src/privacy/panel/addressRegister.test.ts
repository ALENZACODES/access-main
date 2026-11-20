import { describe, expect, it } from "vitest";
import { ADDRESS_REGISTER, CALL_REGISTER, callTotal, checkAddressRegisters, type AddressRow, type CallRow } from "./addressRegister";

const addr = (over: Partial<AddressRow> = {}): AddressRow => ({ host: "example-host.org", kind: "link", path: "a/b.ts", holds: { en: "x", fr: "y" }, source: "s", recordedOn: "2026-11-20", ...over });
const call = (over: Partial<CallRow> = {}): CallRow => ({ path: "a/b.ts", calls: 1, destination: "same-site", holds: { en: "x", fr: "y" }, source: "s", recordedOn: "2026-11-20", ...over });

describe("the real registers", () => {
  it("have no problems", () => {
    expect(checkAddressRegisters(ADDRESS_REGISTER, CALL_REGISTER)).toEqual([]);
  });
  it("say UNKNOWN for a request whose address comes from data", () => {
    const unknown = CALL_REGISTER.filter((c) => c.destination === "UNKNOWN").map((c) => c.path);
    expect(unknown).toContain("apps/web/src/map/tileCache.ts");
  });
  it("never list an address as a link and as an identifier at once", () => {
    const hosts = ADDRESS_REGISTER.map((a) => a.host);
    expect(new Set(hosts).size).toBe(hosts.length);
  });
  it("count the requests in total", () => {
    expect(callTotal(CALL_REGISTER)).toBe(CALL_REGISTER.reduce((n, c) => n + c.calls, 0));
    expect(callTotal([])).toBe(0);
  });
});

describe("checkAddressRegisters", () => {
  it("accepts a clean pair", () => {
    expect(checkAddressRegisters([addr()], [call()])).toEqual([]);
  });
  it("flags a host listed twice", () => {
    expect(checkAddressRegisters([addr(), addr({ path: "c.ts" })], [])).toEqual(["example-host.org: listed twice"]);
  });
  it("flags a host that is not plain lower case or has no dot", () => {
    expect(checkAddressRegisters([addr({ host: "Example.org" })], [])).toEqual(["Example.org: not a plain lower-case host"]);
    expect(checkAddressRegisters([addr({ host: "localhost" })], [])).toEqual(["localhost: not a plain lower-case host"]);
    expect(checkAddressRegisters([addr({ host: "a.org/path" })], [])).toEqual(["a.org/path: not a plain lower-case host"]);
  });
  it("flags an empty path, a bad date, blank text and a blank source", () => {
    expect(checkAddressRegisters([addr({ path: " " })], [])).toEqual(["example-host.org: path is empty"]);
    expect(checkAddressRegisters([addr({ recordedOn: "20 Nov 2026" })], [])).toEqual(["example-host.org: recordedOn is not YYYY-MM-DD"]);
    expect(checkAddressRegisters([addr({ holds: { en: "x", fr: " " } })], [])).toEqual(["example-host.org: holds is empty in one language"]);
    expect(checkAddressRegisters([addr({ source: "" })], [])).toEqual(["example-host.org: source is empty"]);
  });
  it("flags a call path listed twice and counts that are not whole numbers of at least one", () => {
    expect(checkAddressRegisters([], [call(), call()])).toEqual(["a/b.ts: listed twice"]);
    expect(checkAddressRegisters([], [call({ calls: 0 })])).toEqual(["a/b.ts: calls must be a whole number of at least 1"]);
    expect(checkAddressRegisters([], [call({ calls: 1.5 })])).toEqual(["a/b.ts: calls must be a whole number of at least 1"]);
  });
  it("flags a call row with a bad date, blank text or a blank source", () => {
    expect(checkAddressRegisters([], [call({ recordedOn: "x" })])).toEqual(["a/b.ts: recordedOn is not YYYY-MM-DD"]);
    expect(checkAddressRegisters([], [call({ holds: { en: "", fr: "y" } })])).toEqual(["a/b.ts: holds is empty in one language"]);
    expect(checkAddressRegisters([], [call({ source: " " })])).toEqual(["a/b.ts: source is empty"]);
  });
});
