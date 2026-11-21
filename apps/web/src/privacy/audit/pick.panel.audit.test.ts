// CI audit: the files-you-choose section inside the live panel, before and after each download, in both languages and
// with lists of different shapes. Every state must pass the HTML audit and the copy rules, never show a file name from
// the code, never claim the list of kinds of file stops a person choosing another file, and never use the word verified.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { liveControllerDeps } from "../panel/liveController";
import { PICK_REGISTER, type PickRow } from "../panel/pickRegister";
import { renderPickHtml } from "../panel/pickSection";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 21, 12, 0, 0));
const LOCALES: readonly Locale[] = ["en", "fr"];

const sample = (over: Partial<PickRow>): PickRow => ({
  kind: "pick",
  path: "apps/web/src/a/B.tsx",
  uses: 1,
  reads: { en: "An example file", fr: "Un fichier d’exemple" },
  accepts: ["json"],
  limit: "before-read",
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

const LISTS: ReadonlyArray<{ name: string; rows: readonly PickRow[] }> = [
  { name: "the App's real list", rows: PICK_REGISTER },
  { name: "one row", rows: [sample({})] },
  { name: "a row with an unknown kind of file", rows: [sample({ accepts: ["UNKNOWN"] })] },
  { name: "rows with every limit", rows: [sample({ limit: "before-read" }), sample({ path: "apps/web/src/b.ts", limit: "after-read", checkedIn: "apps/web/src/c.ts" }), sample({ path: "apps/web/src/d.ts", limit: "mixed", uses: 2 }), sample({ path: "apps/web/src/e.ts", limit: "none-found" })] },
  { name: "rows with a reader", rows: [sample({}), sample({ kind: "reader", accepts: [], limit: "not-applicable" })] },
];

function build(rows: readonly PickRow[], locale: Locale, step: "none" | "csv" | "text") {
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps(), picks: rows });
  c.dispatch({ type: "set-locale", locale });
  if (step === "csv") c.dispatch({ type: "export-picks-csv" });
  if (step === "text") c.dispatch({ type: "export-picks-text" });
  return c;
}

describe("the files-you-choose section in the live panel", () => {
  for (const list of LISTS) {
    for (const locale of LOCALES) {
      for (const step of ["none", "csv", "text"] as const) {
        it(`${list.name}, ${locale}, ${step}: passes the audits`, () => {
          const html = build(list.rows, locale, step).html();
          expect(html).toContain("data-privacy-pick");
          const v = auditHtml(html);
          expect(v, formatViolations(v)).toEqual([]);
          for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
          expect(containsForbiddenOrg(html)).toBe(false);
          expect(html).not.toMatch(/verif|vérif/i);
        });

        it(`${list.name}, ${locale}, ${step}: shows no file name or code name`, () => {
          const html = build(list.rows, locale, step).html();
          const section = html.slice(html.indexOf("data-privacy-pick"));
          const own = section.slice(0, section.indexOf("</table>"));
          expect(own).not.toContain("apps/web");
          expect(own).not.toMatch(/\.tsx?\b/);
          expect(own).not.toMatch(/\b(?:FileReader|files\?|\.files|input\[type|accept=)/);
        });
      }
    }
  }

  it("says in both languages that the list of kinds of file only filters", () => {
    expect(renderPickHtml("en", PICK_REGISTER)).toContain("only filters what your browser shows");
    expect(renderPickHtml("fr", PICK_REGISTER)).toContain("ne fait que filtrer ce que montre votre navigateur");
  });

  it("never says the list of kinds stops anything, or that a file is safe or checked", () => {
    for (const locale of LOCALES) {
      const text = rawTexts(`<section lang="${locale}">${renderPickHtml(locale, PICK_REGISTER)}</section>`).join(" ");
      expect(text).not.toMatch(/\b(?:safe|secure|blocks?|prevents?|guarantees?)\b/i);
      expect(text).not.toMatch(/\b(?:sûr|sécuris|bloque|empêche|garantit)/i);
    }
  });

  it("reports the real counts and does not round them", () => {
    const html = renderPickHtml("en", PICK_REGISTER);
    expect(html).toContain("34 rows are listed, at 36 places in 33 files.");
    expect(html).toContain("29 check the size before reading, 2 only after reading and 2 have no check");
  });

  it("does not show a download button when there is nothing listed", () => {
    for (const locale of LOCALES) expect(build([], locale, "none").html()).not.toContain("export-picks");
  });

  it("keeps the section's heading and table in the same order in both languages", () => {
    const shape = (l: Locale) => renderPickHtml(l, PICK_REGISTER).replace(/>[^<]*</g, "><").replace(/ (?:id|aria-labelledby|data-label)="[^"]*"/g, "");
    expect(shape("en")).toBe(shape("fr"));
  });
});
