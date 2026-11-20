import { describe, expect, it } from "vitest";
import type { AddressRow, CallRow } from "../panel/addressRegister";
import { compareAddresses, formatAddressComparison, scanCalls, scanHosts } from "./addressScan";

// Written in two parts so the repository's own plain-http check does not read the test data as a real address.
const PLAIN = ["http", "://"].join("");
const f = (path: string, text: string) => ({ path, text });
const row = (host: string, path: string): AddressRow => ({ host, kind: "link", path, holds: { en: "x", fr: "y" }, source: "s", recordedOn: "2026-11-20" });
const callRow = (path: string, calls: number): CallRow => ({ path, calls, destination: "same-site", holds: { en: "x", fr: "y" }, source: "s", recordedOn: "2026-11-20" });

describe("scanHosts", () => {
  it("finds the host of an https or http address, lower-cased, without port or path", () => {
    const h = scanHosts([f("apps/web/src/a.ts", `const a = "https://Docs.Example-Site.org:8443/x?y=1"; const b = "${PLAIN}plain.example-site.net/";`)]);
    expect(h.map((x) => x.host)).toEqual(["docs.example-site.org", "plain.example-site.net"]);
    expect(h[0]).toMatchObject({ path: "apps/web/src/a.ts", line: 1 });
  });
  it("reports the first line, and every file that names the host, sorted", () => {
    const h = scanHosts([f("apps/web/src/z.ts", '\n\nconst a = "https://a-site.org/";'), f("apps/web/src/b.ts", 'const a = "https://a-site.org/";')]);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ path: "apps/web/src/b.ts", line: 1, paths: ["apps/web/src/b.ts", "apps/web/src/z.ts"] });
  });
  it("skips comment lines", () => {
    expect(scanHosts([f("apps/web/src/a.ts", "// see https://a-site.org/\n/* https://b-site.org */\n * https://c-site.org")])).toEqual([]);
  });
  it("skips names reserved for examples and tests, loopback addresses and the markup namespace", () => {
    const text = ["https://a.example", "https://x.test", `${PLAIN}localhost:3000`, `${PLAIN}127.0.0.1/`, "https://site.invalid", "https://example.com", "https://box.local", `${PLAIN}www.w3.org/2000/svg`].map((u) => `const u = "${u}";`).join("\n");
    expect(scanHosts([f("apps/web/src/a.ts", text)])).toEqual([]);
  });
  it("skips test scripts, files outside the scan and the privacy folder's own code", () => {
    const text = 'const u = "https://a-site.org/";';
    expect(scanHosts([f("apps/web/src/a.node.mjs", text), f("apps/web/src/a.md", text), f("apps/web/src/privacy/panel/csp.ts", text), f("apps/web/src/a.test.ts", text)])).toEqual([]);
  });
  it("returns hosts sorted", () => {
    const h = scanHosts([f("apps/web/src/a.ts", 'const a = ["https://zeta-site.org", "https://alpha-site.org"];')]);
    expect(h.map((x) => x.host)).toEqual(["alpha-site.org", "zeta-site.org"]);
  });
});

describe("scanCalls", () => {
  const calls = (text: string, path = "apps/web/src/a.ts") => scanCalls([f(path, text)]);
  it("counts fetch, XMLHttpRequest, WebSocket, EventSource, importScripts and sendBeacon", () => {
    const text = ["await fetch(u);", "const x = new XMLHttpRequest();", "const w = new WebSocket(u);", "const e = new EventSource(u);", "importScripts(u);", "navigator.sendBeacon(u, d);"].join("\n");
    expect(calls(text)).toEqual([{ path: "apps/web/src/a.ts", calls: 6, lines: [1, 2, 3, 4, 5, 6] }]);
  });
  it("counts a dotted fetch once", () => {
    expect(calls("const r = await deps.fetch(u);")).toEqual([{ path: "apps/web/src/a.ts", calls: 1, lines: [1] }]);
    expect(calls("const r = self.fetch(req);")[0]?.calls).toBe(1);
  });
  it("counts two calls on one line as two", () => {
    expect(calls("const p = [fetch(a), fetch(b)];")).toEqual([{ path: "apps/web/src/a.ts", calls: 2, lines: [1] }]);
  });
  it("does not count a name that only ends in fetch, a property read or a string", () => {
    expect(calls("const prefetch = 1; prefetchAll(); const o = { fetch: 1 }; const s = 'refetch';")).toEqual([]);
  });
  it("skips comments and type declarations", () => {
    const text = ["// fetch(u)", " * fetch(u)", "interface Deps {", "  fetch: (url: string) => Promise<Response>;", "}", "declare const self: { fetch(req: unknown): Promise<unknown> };", "type F = typeof fetch;"].join("\n");
    expect(calls(text)).toEqual([]);
  });
  it("skips the network guard, test scripts and files outside the scan", () => {
    expect(calls("const r = fetch(u);", "apps/web/src/privacy/panel/egress.ts")).toEqual([]);
    expect(calls("const r = fetch(u);", "apps/web/src/a.node.mjs")).toEqual([]);
    expect(calls("fetch(u)", "apps/web/src/a.md")).toEqual([]);
    expect(calls("fetch(u)", "apps/web/src/a.test.ts")).toEqual([]);
  });
  it("lists files in path order", () => {
    const r = scanCalls([f("apps/web/src/z.ts", "fetch(u)"), f("apps/web/src/b.ts", "fetch(u)")]);
    expect(r.map((x) => x.path)).toEqual(["apps/web/src/b.ts", "apps/web/src/z.ts"]);
  });
});

describe("compareAddresses", () => {
  const hosts = scanHosts([f("apps/web/src/a.ts", 'const a = "https://a-site.org/";')]);
  const calls = scanCalls([f("apps/web/src/a.ts", "fetch(u);\nfetch(v);")]);
  it("is clean when the registers match", () => {
    const c = compareAddresses(hosts, calls, [row("a-site.org", "apps/web/src/a.ts")], [callRow("apps/web/src/a.ts", 2)]);
    expect(c).toEqual({ unlistedHosts: [], staleHosts: [], movedHosts: [], callDifferences: [] });
    expect(formatAddressComparison(c)).toBe("");
  });
  it("names an unlisted host with its file and line", () => {
    const c = compareAddresses(hosts, calls, [], [callRow("apps/web/src/a.ts", 2)]);
    expect(formatAddressComparison(c)).toBe("a-site.org: named in apps/web/src/a.ts:1 but has no row in addressRegister.ts");
  });
  it("names a stale host and a moved host", () => {
    const c = compareAddresses(hosts, calls, [row("a-site.org", "apps/web/src/other.ts"), row("gone-site.org", "apps/web/src/a.ts")], [callRow("apps/web/src/a.ts", 2)]);
    expect(formatAddressComparison(c).split("\n")).toEqual(["gone-site.org: in addressRegister.ts but not named in the source", "a-site.org: registered for apps/web/src/other.ts, found in apps/web/src/a.ts"]);
  });
  it("names a call count that differs, with the lines, and singular and plural", () => {
    const c = compareAddresses(hosts, calls, [row("a-site.org", "apps/web/src/a.ts")], [callRow("apps/web/src/a.ts", 1)]);
    expect(c.callDifferences).toEqual(["apps/web/src/a.ts: the register says 1 call, the source has 2 (line 1, 2)"]);
  });
  it("names a file with calls and no row, and a row with no calls", () => {
    const none = compareAddresses(hosts, calls, [row("a-site.org", "apps/web/src/a.ts")], []);
    expect(none.callDifferences).toEqual(["apps/web/src/a.ts: makes 2 network calls (line 1, 2) but has no row in addressRegister.ts"]);
    const stale = compareAddresses(hosts, [], [row("a-site.org", "apps/web/src/a.ts")], [callRow("apps/web/src/a.ts", 2)]);
    expect(stale.callDifferences).toEqual(["apps/web/src/a.ts: in addressRegister.ts but the source makes no network call there"]);
  });
});
