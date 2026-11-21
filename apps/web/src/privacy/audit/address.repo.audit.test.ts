// CI audit: every web address and every network call in the App's source is in addressRegister.ts.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADDRESS_REGISTER, CALL_REGISTER, checkAddressRegisters } from "../panel/addressRegister";
import { compareAddresses, formatAddressComparison, scanCalls, scanHosts } from "./addressScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("addresses and network calls in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const hosts = scanHosts(files);
  const calls = scanCalls(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(hosts.map((h) => h.host)).toContain("creativecommons.org");
    expect(calls.map((c) => c.path)).toContain("apps/web/src/map/tileCache.ts");
  });

  it("matches the registers in both directions", () => {
    const c = compareAddresses(hosts, calls, ADDRESS_REGISTER, CALL_REGISTER);
    expect(c, `\n${formatAddressComparison(c)}\n`).toEqual({ unlistedHosts: [], staleHosts: [], movedHosts: [], callDifferences: [] });
  });

  it("has well-formed registers", () => {
    expect(checkAddressRegisters(ADDRESS_REGISTER, CALL_REGISTER)).toEqual([]);
  });

  it("points every row at a file that exists", () => {
    for (const a of ADDRESS_REGISTER) expect(existsSync(join(ROOT, a.path)), a.path).toBe(true);
    for (const c of CALL_REGISTER) expect(existsSync(join(ROOT, c.path)), c.path).toBe(true);
  });

  it("does not let an address that is fetched automatically hide among the links", () => {
    for (const a of ADDRESS_REGISTER) {
      if (a.kind !== "link") continue;
      const text = readFileSync(join(ROOT, a.path), "utf8");
      const near = text.split("\n").filter((l) => l.includes(a.host));
      expect(near.length, a.host).toBeGreaterThan(0);
      for (const l of near) expect(/\bfetch\s*\(/.test(l), `${a.path}: ${l.trim()}`).toBe(false);
    }
  });

  describe("would fail on a change, so it cannot pass by being blind", () => {
    const withFile = (path: string, text: string) => [...files, { path, text }];
    const cmp = (extra: { path: string; text: string }) => {
      const f = withFile(extra.path, extra.text);
      return compareAddresses(scanHosts(f), scanCalls(f), ADDRESS_REGISTER, CALL_REGISTER);
    };

    it("fails when a new feature names a new host", () => {
      const c = cmp({ path: "apps/web/src/x/y.ts", text: 'const u = "https://tracker.stats-host.net/pixel";' });
      expect(c.unlistedHosts.map((h) => h.host)).toEqual(["tracker.stats-host.net"]);
      expect(formatAddressComparison(c)).toContain("apps/web/src/x/y.ts:1");
    });

    it("fails when a new feature makes a network call in a new file", () => {
      const c = cmp({ path: "apps/web/src/x/y.ts", text: "const r = await fetch(url);" });
      expect(c.callDifferences).toEqual(["apps/web/src/x/y.ts: makes 1 network call (line 1) but has no row in addressRegister.ts"]);
    });

    it("fails when a file the register lists makes one more call", () => {
      const c = cmp({ path: "apps/web/src/map/tileCache.ts", text: `${readFileSync(join(ROOT, "apps/web/src/map/tileCache.ts"), "utf8")}\nconst extra = await fetch(u);` });
      expect(c.callDifferences.join("\n")).toContain("the register says 3 calls, the source has 4");
    });

    it("fails when a listed file stops making calls", () => {
      const c = compareAddresses(hosts, calls.filter((x) => !x.path.endsWith("standalone/main.ts")), ADDRESS_REGISTER, CALL_REGISTER);
      expect(c.callDifferences).toEqual(["apps/web/src/data-status/standalone/main.ts: in addressRegister.ts but the source makes no network call there"]);
    });

    it("fails when a listed host disappears from the source", () => {
      const c = compareAddresses(hosts.filter((h) => h.host !== "purl.org"), calls, ADDRESS_REGISTER, CALL_REGISTER);
      expect(c.staleHosts.map((a) => a.host)).toEqual(["purl.org"]);
    });

    it("fails when a row names the wrong file", () => {
      const rows = ADDRESS_REGISTER.map((a) => (a.host === "purl.org" ? { ...a, path: "apps/web/src/elsewhere.ts" } : a));
      expect(compareAddresses(hosts, calls, rows, CALL_REGISTER).movedHosts.map((m) => m.host)).toEqual(["purl.org"]);
    });
  });
});
