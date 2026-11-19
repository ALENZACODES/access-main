import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { ROUTE_REPORTS_PURPOSE } from "./live";
import { groupRefused, refusedLines, renderRefusedHtml, REFUSED_STRINGS } from "./refusedSection";
import type { RefusedWrite } from "./consentGate";

const P = [ROUTE_REPORTS_PURPOSE];
const A: RefusedWrite = { key: "access.routeReports.v1", purposeId: "route-reports", reason: "no-choice" };
const B: RefusedWrite = { ...A, reason: "declined" };

describe("refused section", () => {
  it("groups by purpose and reason in first-seen order", () => {
    expect(groupRefused([A, B, A, A])).toEqual([
      { purposeId: "route-reports", reason: "no-choice", count: 3 },
      { purposeId: "route-reports", reason: "declined", count: 1 },
    ]);
    expect(groupRefused([])).toEqual([]);
  });
  it("renders nothing when nothing was refused", () => {
    expect(renderRefusedHtml("en", [], P)).toBe("");
    expect(renderRefusedHtml("fr", [], P)).toBe("");
  });
  it("names the feature and count in both languages and never shows a storage key", () => {
    for (const loc of ["en", "fr"] as const) {
      const html = renderRefusedHtml(loc, [A, A, B], P);
      expect(html).toContain(ROUTE_REPORTS_PURPOSE.label[loc]);
      expect(html).toContain("<li>");
      expect(html).not.toContain("access.routeReports");
      expect(html).toContain("data-privacy-refused");
    }
  });
  it("uses singular and plural wording", () => {
    expect(refusedLines("en", [A], P)[0]).toContain("1 save was");
    expect(refusedLines("en", [A, A], P)[0]).toContain("2 saves were");
    expect(refusedLines("fr", [A], P)[0]).toContain("1 enregistrement a été arrêté");
    expect(refusedLines("fr", [A, A], P)[0]).toContain("2 enregistrements ont été arrêtés");
  });
  it("falls back to a neutral name for an unlisted feature", () => {
    expect(refusedLines("en", [{ ...A, purposeId: "gone" }], P)[0]).toContain(REFUSED_STRINGS.en.unknownFeature);
  });
  it("escapes feature names", () => {
    const odd = [{ ...ROUTE_REPORTS_PURPOSE, label: { en: "<b>x</b>", fr: "<b>x</b>" } }];
    expect(renderRefusedHtml("en", [A], odd)).not.toContain("<b>x");
  });
  it("passes the copy lint with the typography rules", () => {
    for (const loc of ["en", "fr"] as const) {
      const s = REFUSED_STRINGS[loc];
      const texts = [s.heading, s.note, s.unknownFeature, s.reason["no-choice"], s.reason.declined, ...refusedLines(loc, [A, A, B], P), ...refusedLines(loc, [A], P)];
      for (const t of texts) expect(lintCopy(loc, t), t).toEqual([]);
    }
  });
});
