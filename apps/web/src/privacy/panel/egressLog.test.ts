import { describe, expect, it } from "vitest";
import { createEgressPolicy, type BlockedRequest, type GuardHost } from "./egress";
import { EGRESS_TTL_DAYS, MAX_EGRESS_HOSTS, egressKey, installPersistentGuard, loadBlocked, recordBlocked } from "./egressLog";
import { putExpiring } from "./expiry";
import { createMemoryStorage } from "./storage";

const P = "app.";
const T0 = new Date("2026-11-15T20:00:00Z");
const day = (n: number): Date => new Date(T0.getTime() + n * 86_400_000);
const blocked = (host: string, at: Date = T0): BlockedRequest => ({ at: at.toISOString(), host, scheme: "https:", via: "fetch", reason: "not-listed" });

describe("recordBlocked and loadBlocked", () => {
  it("counts per host, most refused first, then by name", () => {
    const s = createMemoryStorage();
    for (const h of ["b.example.net", "a.example.net", "b.example.net", "c.example.net", "b.example.net", "a.example.net"]) {
      recordBlocked(s, P, blocked(h), T0);
    }
    const v = loadBlocked(s, P, T0);
    expect(v.hosts.map((h) => [h.host, h.count])).toEqual([["b.example.net", 3], ["a.example.net", 2], ["c.example.net", 1]]);
    expect(v.since).toBe(T0.toISOString());
  });
  it("stores only host, count and time", () => {
    const s = createMemoryStorage();
    recordBlocked(s, P, blocked("a.example.net"), T0);
    const raw = s.getItem(egressKey(P)) ?? "";
    expect(raw).toContain("a.example.net");
    expect(raw).not.toMatch(/https:|fetch|not-listed|\/\w+\?/);
  });
  it("names an unreadable address instead of storing an empty key", () => {
    const s = createMemoryStorage();
    recordBlocked(s, P, { ...blocked(""), reason: "invalid-url", scheme: "" }, T0);
    expect(loadBlocked(s, P, T0).hosts.map((h) => h.host)).toEqual(["(invalid address)"]);
  });
  it(`expires ${EGRESS_TTL_DAYS} days after the latest refusal, and each refusal restarts the clock`, () => {
    const s = createMemoryStorage();
    recordBlocked(s, P, blocked("a.example.net"), T0);
    expect(loadBlocked(s, P, day(EGRESS_TTL_DAYS - 1)).hosts).toHaveLength(1);
    expect(loadBlocked(s, P, day(EGRESS_TTL_DAYS + 1)).hosts).toEqual([]);
    recordBlocked(s, P, blocked("a.example.net", day(20)), day(20));
    expect(loadBlocked(s, P, day(EGRESS_TTL_DAYS + 1)).hosts).toHaveLength(1);
  });
  it(`keeps at most ${MAX_EGRESS_HOSTS} hosts, dropping the least recent`, () => {
    const s = createMemoryStorage();
    for (let i = 0; i < MAX_EGRESS_HOSTS + 5; i += 1) {
      const at = new Date(T0.getTime() + i * 1000);
      recordBlocked(s, P, blocked(`h${i}.example.net`, at), at);
    }
    const hosts = loadBlocked(s, P, day(1)).hosts.map((h) => h.host);
    expect(hosts).toHaveLength(MAX_EGRESS_HOSTS);
    expect(hosts).not.toContain("h0.example.net");
    expect(hosts).toContain(`h${MAX_EGRESS_HOSTS + 4}.example.net`);
  });
  it("starts over when the stored record is damaged", () => {
    const s = createMemoryStorage();
    recordBlocked(s, P, blocked("a.example.net"), T0);
    s.setItem(egressKey(P), "{not json");
    expect(loadBlocked(s, P, T0)).toEqual({ hosts: [] });
    expect(recordBlocked(s, P, blocked("b.example.net"), T0)).toBe(true);
    expect(loadBlocked(s, P, T0).hosts.map((h) => h.host)).toEqual(["b.example.net"]);
  });
  it.each([
    ["wrong counts", { since: "2026-11-15T00:00:00Z", hosts: { "a.example.net": { count: 0, lastAt: "2026-11-15T00:00:00Z" } } }],
    ["bad date", { since: "nope", hosts: {} }],
    ["not an object", { since: "2026-11-15T00:00:00Z", hosts: [] }],
  ])("ignores a record with %s", (_n, body) => {
    const s = createMemoryStorage();
    putExpiring(s, egressKey(P), JSON.stringify(body), T0, 5);
    expect(loadBlocked(s, P, T0).hosts).toEqual([]);
  });
  it("reads a well-formed record written the same way, so the damaged-record cases above are not vacuous", () => {
    const s = createMemoryStorage();
    const ok = { since: "2026-11-15T00:00:00Z", hosts: { "a.example.net": { count: 2, lastAt: "2026-11-15T00:00:00Z" } } };
    putExpiring(s, egressKey(P), JSON.stringify(ok), T0, 5);
    expect(loadBlocked(s, P, T0).hosts).toEqual([{ host: "a.example.net", count: 2, lastAt: "2026-11-15T00:00:00Z" }]);
  });
  it("does nothing without storage", () => {
    expect(recordBlocked(null, P, blocked("a.example.net"), T0)).toBe(false);
    expect(loadBlocked(null, P, T0)).toEqual({ hosts: [] });
  });
  it("reports a failed write", () => {
    const s = createMemoryStorage();
    s.setItem = () => {
      throw new Error("full");
    };
    expect(recordBlocked(s, P, blocked("a.example.net"), T0)).toBe(false);
  });
});

describe("installPersistentGuard", () => {
  it("records a refused request on this device, and stops recording after uninstall", async () => {
    const s = createMemoryStorage();
    const host: GuardHost = { fetch: () => Promise.resolve("ok") };
    const policy = createEgressPolicy({ selfOrigin: "https://app.example.ca" });
    const g = installPersistentGuard(host, policy, s, P, () => T0);
    await host.fetch?.("https://evil.example.net/x?y=1").catch(() => undefined);
    await host.fetch?.("/fine");
    expect(loadBlocked(s, P, T0).hosts).toEqual([{ host: "evil.example.net", count: 1, lastAt: T0.toISOString() }]);
    g.uninstall();
    await host.fetch?.("https://evil.example.net/again");
    expect(loadBlocked(s, P, T0).hosts[0]?.count).toBe(1);
  });
  it("still blocks when storage is unavailable", async () => {
    const host: GuardHost = { fetch: () => Promise.resolve("ok") };
    installPersistentGuard(host, createEgressPolicy({ selfOrigin: "https://app.example.ca" }), null, P);
    await expect(host.fetch?.("https://evil.example.net/")).rejects.toThrow(TypeError);
  });
});
