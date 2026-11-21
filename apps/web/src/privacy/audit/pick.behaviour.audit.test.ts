// CI audit: the register says how each place that reads a chosen file limits its size. Here the source is read again and
// each claim that can be checked from the code is checked: a row marked as limited before reading compares the size
// within a few lines after the pick and before any read; a row marked as limited after reading names a file with a
// byte limit; each input has an accept list; nothing is sent near a pick; and a reader is only in the listed file.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PICK_REGISTER, picksOfKind, type PickAccept } from "../panel/pickRegister";
import { loadFiles } from "./repoFiles";
import { readLines, scanPicks, sizeCheckLines } from "./pickScan";
import { PICK_FOLDERS } from "./pick.repo.audit.test";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, [...PICK_FOLDERS]);
const byPath = new Map(files.map((f) => [f.path, f.text]));
const found = scanPicks(files);
const text = (path: string): string => byPath.get(path) ?? "";
const placesOf = (path: string, kind: "pick" | "reader"): number[] => found.find((f) => f.path === path && f.kind === kind)?.lines ?? [];

/** How many lines after a pick a size check may be and still count as "next to" it. */
const NEAR = 12;

const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource/;

/** Files where the pick passes the file to a function defined above it, and the size comparison is in that function. */
const CHECK_IN_CALLED_FUNCTION = new Set(["apps/web/src/recovery/RecoveryCaseJournal.tsx"]);

describe("a row limited before reading compares the size before any read", () => {
  const rows = picksOfKind(PICK_REGISTER, "pick").filter((r) => r.limit === "before-read");

  it("has rows to check", () => {
    expect(rows.length).toBeGreaterThan(25);
  });

  for (const r of rows) {
    it(`${r.path}: the first size comparison is before the first read`, () => {
      const t = text(r.path);
      const checks = sizeCheckLines(t);
      const reads = readLines(t);
      expect(checks.length, "no size comparison in the file").toBeGreaterThan(0);
      if (reads.length > 0) expect(checks[0] as number, `the read at line ${reads[0]} comes before the size check`).toBeLessThan(reads[0] as number);
    });

    if (CHECK_IN_CALLED_FUNCTION.has(r.path)) continue;
    it(`${r.path}: the size comparison is within ${NEAR} lines after each pick`, () => {
      const checks = sizeCheckLines(text(r.path));
      for (const p of placesOf(r.path, "pick")) {
        expect(checks.some((c) => c >= p && c <= p + NEAR), `no size comparison within ${NEAR} lines after the pick at line ${p}`).toBe(true);
      }
    });
  }

  it("names the files where the check is in a function the pick calls, and that function is above the pick", () => {
    for (const path of CHECK_IN_CALLED_FUNCTION) {
      const t = text(path);
      expect(sizeCheckLines(t)[0] as number).toBeLessThan(placesOf(path, "pick")[0] as number);
    }
  });
});

describe("a row limited after reading names a file with a byte limit", () => {
  const rows = PICK_REGISTER.filter((r) => r.limit === "after-read");

  it("lists the files whose limit is applied to the text", () => {
    expect(rows.map((r) => r.path).sort()).toEqual(["apps/web/src/offline/robust/dependencyPlannerPanel.ts", "apps/web/src/states/PackCompare.tsx"]);
  });

  for (const r of rows) {
    it(`${r.path} reads first, then the limit in ${r.checkedIn}`, () => {
      const t = text(r.path);
      expect(sizeCheckLines(t), "a before-read check exists, so the row would be wrong").toEqual([]);
      expect(readLines(t).length).toBeGreaterThan(0);
      expect(text(r.checkedIn as string)).toMatch(/\b(?:MAX|LIMIT)[A-Z_]*BYTES\b|\.length\s*>\s*\w*MAX|\bbytes\b/i);
    });
  }
});

describe("the one mixed file", () => {
  it("is the contribute page: photos are limited by count, the JSON file by size before it is read", () => {
    const rows = PICK_REGISTER.filter((r) => r.limit === "mixed");
    expect(rows.map((r) => r.path)).toEqual(["apps/web/src/contribute/ContributePage.tsx"]);
    const t = text("apps/web/src/contribute/ContributePage.tsx");
    expect(sizeCheckLines(t).length).toBe(1);
    expect(t).toMatch(/5\s*\*\s*1024\s*\*\s*1024/);
  });
});

/** Where the input itself is written, when it is not in the file that reads it. */
const ACCEPT_IN: Record<string, string> = { "apps/web/src/privacy/panel/mount.ts": "apps/web/src/privacy/panel/panelSections.ts" };

describe("every input has an accept list that matches the register", () => {
  const MENTIONS: Record<Exclude<PickAccept, "UNKNOWN">, RegExp> = {
    json: /\.json|application\/json/,
    csv: /\.csv|text\/csv/,
    geojson: /geo\+?json/i,
    image: /image\//,
  };

  for (const r of picksOfKind(PICK_REGISTER, "pick")) {
    it(`${r.path}`, () => {
      const t = text(ACCEPT_IN[r.path] ?? r.path);
      expect(r.accepts, "a pick with unknown kinds should be said, not guessed").not.toContain("UNKNOWN");
      expect(t, "an accept attribute").toMatch(/accept\b/);
      for (const a of r.accepts) if (a !== "UNKNOWN") expect(t, a).toMatch(MENTIONS[a]);
    });
  }
});

describe("nothing is sent by the code that reads a chosen file", () => {
  it("has no network call within twelve lines of any pick or reader", () => {
    const near: string[] = [];
    for (const f of found) {
      const lines = text(f.path).split("\n");
      for (const at of f.lines) {
        const slice = lines.slice(Math.max(0, at - 13), at + 12).join("\n");
        if (NETWORK.test(slice)) near.push(`${f.path}:${at}`);
      }
    }
    expect(near).toEqual([]);
  });

  it("has no network call at all in a file that reads a chosen file", () => {
    const withCalls = [...new Set(found.map((f) => f.path))].filter((p) => NETWORK.test(text(p)));
    expect(withCalls).toEqual([]);
  });
});

describe("a file reader is only where the register says", () => {
  it("is one place, in the one file", () => {
    expect(picksOfKind(PICK_REGISTER, "reader").map((r) => r.path)).toEqual(["apps/web/src/states/PackCompare.tsx"]);
  });

  it("is not used to read a file as a data address, which would be a longer-lived copy", () => {
    for (const r of picksOfKind(PICK_REGISTER, "reader")) expect(text(r.path)).not.toMatch(/readAsDataURL/);
  });
});

describe("a chosen file is not kept by the code that reads it", () => {
  it("does not write what it reads into storage in the same few lines", () => {
    const writes: string[] = [];
    for (const f of found.filter((x) => x.kind === "pick")) {
      const lines = text(f.path).split("\n");
      for (const at of f.lines) {
        if (/(?:local|session)Storage\.setItem/.test(lines.slice(at - 1, at + 3).join("\n"))) writes.push(`${f.path}:${at}`);
      }
    }
    expect(writes).toEqual([]);
  });
});
