// CI audit: the downloadable list of everything the App keeps on this device, built from the App's real
// lists, in both languages and both formats. Every item the App's registers name must be in it, in plain
// words, with no storage key, cache name or database name, no forbidden name, and the French spacing rules.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { DEVICE_REGISTER } from "../panel/deviceRegister";
import { FIXTURE } from "../panel/fixtures.test-util";
import { clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import type { ExportFile } from "../panel/localData";
import { createMemoryStorage } from "../panel/storage";
import { STORAGE_REGISTER, UNSCANNED } from "../panel/storageRegister";
import { auditHtml, formatViolations } from "./htmlAudit";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];

function build(locale: Locale, action: "export-kept-csv" | "export-kept-text"): { file: ExportFile; html: string } {
  clearLiveRefused();
  const c = createPrivacyController({
    storage: createMemoryStorage(),
    inventory: FIXTURE,
    now: () => NOW,
    ...liveControllerDeps(),
    device: { host: {}, cachePrefix: "app-shell-" },
  });
  c.dispatch({ type: "set-locale", locale });
  const s = c.dispatch({ type: action });
  if (s.lastExport === null) throw new Error("no file was prepared");
  return { file: s.lastExport, html: c.html() };
}

/** Reads a CSV back the way a spreadsheet would: quoted cells may hold the delimiter, quotes and new lines. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

const EXPECTED = STORAGE_REGISTER.length + DEVICE_REGISTER.length + UNSCANNED.length;

describe("the list of everything kept", () => {
  for (const locale of LOCALES) {
    const delimiter = locale === "fr" ? ";" : ",";

    it(`(${locale}) CSV reads back as a table with one row per item and seven columns throughout`, () => {
      const rows = parseCsv(build(locale, "export-kept-csv").file.text, delimiter);
      expect(rows).toHaveLength(1 + EXPECTED);
      for (const r of rows) expect(r, r.join("|")).toHaveLength(7);
    });

    it(`(${locale}) names every item the App's registers hold, in plain words`, () => {
      const text = build(locale, "export-kept-csv").file.text;
      for (const r of [...STORAGE_REGISTER, ...DEVICE_REGISTER, ...UNSCANNED]) expect(text, r.holds[locale]).toContain(r.holds[locale].replace(/"/g, '""'));
    });

    it(`(${locale}) shows no storage key, cache name or database name, and no forbidden name`, () => {
      for (const action of ["export-kept-csv", "export-kept-text"] as const) {
        const { text } = build(locale, action).file;
        for (const r of STORAGE_REGISTER) expect(text, r.key).not.toContain(r.key);
        for (const r of DEVICE_REGISTER) expect(text, r.name).not.toContain(r.name);
        expect(containsForbiddenOrg(text)).toBe(false);
      }
    });

    it(`(${locale}) passes the copy lint line by line`, () => {
      for (const action of ["export-kept-csv", "export-kept-text"] as const) {
        const { text } = build(locale, action).file;
        const lines = action === "export-kept-csv" ? parseCsv(text, delimiter).flat() : text.split("\n");
        for (const line of lines) {
          if (line.trim() !== "") expect(lintCopy(locale, line.trim()), line).toEqual([]);
        }
      }
    });

    it(`(${locale}) leaves the panel after the download passing the HTML audit, with the status said politely`, () => {
      const { html } = build(locale, "export-kept-text");
      const v = auditHtml(html);
      expect(v, formatViolations(v)).toEqual([]);
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain(locale === "fr" ? "Liste de tout ce que l’App conserve" : "List of everything the App keeps");
    });
  }

  it("says the offline storage button reaches the app-shell caches and nothing else, in the file", () => {
    const rows = parseCsv(build("en", "export-kept-csv").file.text, ",");
    const reachedBy = rows.slice(1).filter((r) => r[4] === "Yes").map((r) => r[0]);
    expect(reachedBy).toEqual(["Copies of App pages, kept so they open without a connection"]);
  });

  it("lists storage it could not read as not confirmed, never as none", () => {
    const rows = parseCsv(build("en", "export-kept-csv").file.text, ",");
    const unread = rows.slice(1).filter((r) => r[1] === "Not confirmed");
    expect(unread).toHaveLength(UNSCANNED.length);
    for (const r of unread) expect(r.slice(1, 5)).toEqual(Array(4).fill("Not confirmed"));
  });
});
