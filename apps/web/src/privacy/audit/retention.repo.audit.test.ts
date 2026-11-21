// CI audit: the retention register matches the source. Each limit is the number the named constant has, no limit-like
// constant sits unreviewed in a file that holds one of these stores, and every file that names a stored key or sets an
// expiry is one a row lists. The checks run on the real tree, and again on copies of it with one thing changed.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOT_RETENTION, RETENTION_REGISTER, validateRetention, type RetentionRow } from "../panel/retentionRegister";
import { STORAGE_REGISTER, UNSCANNED } from "../panel/storageRegister";
import { compareRetention, expiryCallers, formatRetentionComparison, isClean } from "./retentionScan";
import { loadFiles } from "./repoFiles";
import { scanStorageKeys } from "./storageKeys";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("the retention register against the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanStorageKeys(files);
  const compare = (f = files, rows: readonly RetentionRow[] = RETENTION_REGISTER, ex = NOT_RETENTION) => compareRetention(f, rows, ex, scanStorageKeys(f));

  it("reads the real tree, so it cannot pass by reading nothing", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(found.length).toBeGreaterThan(8);
    expect(expiryCallers(files)).toEqual(expect.arrayContaining(["apps/web/src/privacy/panel/activityLog.ts", "apps/web/src/privacy/panel/changes.ts", "apps/web/src/privacy/panel/egressLog.ts"]));
  });

  it("has no difference from the source", () => {
    const c = compare();
    expect(c, `\n${formatRetentionComparison(c)}\n`).toSatisfy(isClean);
  });

  it("is well formed and covers the storage register, the panel's own names and the store that cannot be read", () => {
    const own = RETENTION_REGISTER.map((r) => r.key).filter((k) => k.startsWith("access.") && !STORAGE_REGISTER.some((s) => s.key === k));
    expect(own.sort()).toEqual(["access.activity.v1", "access.consent.v1", "access.egress.v1", "access.prefs.v1", "access.seen.v1"]);
    const problems = validateRetention(RETENTION_REGISTER, { register: STORAGE_REGISTER, unscanned: UNSCANNED, ownKeys: own });
    expect(problems).toEqual([]);
  });

  it("lists files that exist", () => {
    for (const r of RETENTION_REGISTER) for (const p of r.files) expect(existsSync(join(ROOT, p)), `${r.key}: ${p}`).toBe(true);
  });

  it("has a row for every key the scan finds in the source that the storage register lists", () => {
    for (const f of found) {
      if (!STORAGE_REGISTER.some((s) => s.key === f.key)) continue;
      expect(RETENTION_REGISTER.some((r) => r.key === f.key), f.key).toBe(true);
    }
  });

  describe("would fail on a change, so it cannot pass by being blind", () => {
    const edit = (path: string, change: (t: string) => string) => files.map((f) => (f.path === path ? { ...f, text: change(f.text) } : f));
    const add = (path: string, text: string) => [...files, { path, text }];

    it("fails when a constant changes and the row does not", () => {
      const c = compare(edit("apps/web/src/states/shortlist.ts", (t) => t.replace("MAX_SHORTLIST = 12", "MAX_SHORTLIST = 20")));
      expect(c.wrong).toEqual([{ key: "app.pack-shortlist.v1", constant: "MAX_SHORTLIST", path: "apps/web/src/states/shortlist.ts", expected: 12, actual: 20 }]);
      expect(formatRetentionComparison(c)).toContain("the row says 12 for MAX_SHORTLIST but apps/web/src/states/shortlist.ts has 20");
    });

    it("fails when a panel constant changes", () => {
      const c = compare(edit("apps/web/src/privacy/panel/egressLog.ts", (t) => t.replace("EGRESS_TTL_DAYS = 30", "EGRESS_TTL_DAYS = 31")));
      expect(c.wrong.map((w) => w.constant)).toEqual(["EGRESS_TTL_DAYS"]);
    });

    it("fails when a limit constant is removed from the source", () => {
      const c = compare(edit("apps/web/src/data-status/history.ts", (t) => t.replace("export const MAX_HISTORY = 30;", "")));
      expect(c.wrong).toEqual([expect.objectContaining({ constant: "MAX_HISTORY", actual: null })]);
    });

    it("fails when a store gets a new limit that no row records", () => {
      const c = compare(edit("apps/web/src/states/preferences.ts", (t) => `${t}\nexport const MAX_STORED_DAYS = 90;\n`));
      expect(c.unclaimed.map((u) => `${u.name}=${u.value}`)).toEqual(["MAX_STORED_DAYS=90"]);
    });

    it("does not count a limit-like constant that is only a comment", () => {
      const c = compare(edit("apps/web/src/states/preferences.ts", (t) => `${t}\n// const MAX_STORED_DAYS = 90;\n`));
      expect(c.unclaimed).toEqual([]);
    });

    it("fails when a new file starts saving under a listed key", () => {
      const c = compare(add("apps/web/src/x/other.ts", 'localStorage.setItem("app.preferences.v1", "x");'));
      expect(c.newFiles).toEqual([{ key: "app.preferences.v1", path: "apps/web/src/x/other.ts" }]);
    });

    it("fails when a file a row lists is removed", () => {
      const c = compare(files.filter((f) => f.path !== "apps/web/src/i18n/index.ts"));
      expect(c.missingFiles.map((m) => m.key).sort()).toEqual(["access.language", "access.language.set"]);
    });

    it("fails when a new file gives a value an end date", () => {
      const c = compare(add("apps/web/src/x/ttl.ts", 'putExpiring(storage, "k", "v", now, 7);'));
      expect(c.unlistedExpiry).toEqual(["apps/web/src/x/ttl.ts"]);
    });

    it("fails when a row claims a limit the code does not have", () => {
      const rows = RETENTION_REGISTER.map((r) => (r.key === "app.preferences.v1" ? { ...r, limits: [{ kind: "count" as const, max: 5, unit: { en: "x", fr: "x" }, whenFull: "new-refused" as const, from: { path: "apps/web/src/states/preferences.ts", name: "MAX_NOPE" } }] } : r));
      expect(compare(files, rows).wrong).toEqual([expect.objectContaining({ key: "app.preferences.v1", actual: null })]);
    });

    it("fails when an exception names a constant that is gone, so the list cannot fill with dead entries", () => {
      const c = compare(files, RETENTION_REGISTER, [...NOT_RETENTION, { path: "apps/web/src/states/shortlist.ts", name: "MAX_GONE", why: "x" }]);
      expect(c.staleExceptions.map((e) => e.name)).toEqual(["MAX_GONE"]);
    });

    it("fails when a row would drop its exception and claim the constant instead", () => {
      const c = compare(files, RETENTION_REGISTER, [...NOT_RETENTION, { path: "apps/web/src/states/shortlist.ts", name: "MAX_SHORTLIST", why: "x" }]);
      expect(c.staleExceptions.map((e) => e.name)).toEqual(["MAX_SHORTLIST"]);
    });
  });
});
