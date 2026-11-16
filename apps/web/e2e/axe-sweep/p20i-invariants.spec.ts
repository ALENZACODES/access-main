import { expect, test } from "@playwright/test";
import {
  combineKnowledge, evidenceIssues, issueText, linkIssues, matrixIssues,
  matrixKeys, mediaIssues, targetIssues,
  type Context, type Evidence, type MediaItem, type NavigationLink, type Target,
} from "./p20i-contracts";
import { detailIdFromHref, resultStatusFromText } from "./p20i-journeys";

const context = (locale: "en" | "fr", width: 320 | 1280): Context => ({
  route: "/places", locale, width,
});
const target = (width: number, height: number): Target => ({
  id: "control", label: "Open", visible: true, disabled: false, kind: "button",
  rect: { x: 0, y: 0, width, height }, labelRect: null, labelInteractive: false,
});
const evidence = (status: "PASS" | "BLOCKED" | "UNKNOWN"): Evidence => ({
  source: "Fixture", licence: "CC0-1.0", date: "2026-11-16", status,
});
const link = (width: number, height: number): NavigationLink => ({
  id: "link", href: "/places/1", text: "Open", visible: true,
  external: false, blank: false, rel: "", downloaded: false,
  rect: { x: 0, y: 0, width, height },
});
const image = (name: string | null, decorative: boolean): MediaItem => ({
  id: "img", kind: "img", visible: true, decorative,
  alternate: name, captioned: false, controls: false,
});

for (const locale of ["en", "fr"] as const) {
  for (const width of [320, 1280] as const) {
    test.describe(`P20I cross-dimension invariants ${locale} ${width}`, () => {
      const ctx = context(locale, width);
      test("44x44 button is permitted", () => expect(targetIssues([target(44, 44)], ctx)).toEqual([]));
      test("43x44 button is rejected", () => expect(targetIssues([target(43, 44)], ctx).map((value) => value.rule)).toContain("target-44"));
      test("44x43 button is rejected", () => expect(targetIssues([target(44, 43)], ctx).map((value) => value.rule)).toContain("target-44"));
      test("48x48 finder button is permitted", () => expect(targetIssues([target(48, 48)], ctx)).toEqual([]));
      test("inline link is never exempt", () => expect(linkIssues([link(30, 19)], ctx, "https://example.invalid").map((value) => value.rule)).toContain("link-44"));
      test("full-sized link is permitted", () => expect(linkIssues([link(48, 48)], ctx, "https://example.invalid")).toEqual([]));
      test("nondecorative image requires a name", () => expect(mediaIssues([image(null, false)], ctx).map((value) => value.rule)).toContain("media-alternative"));
      test("decorative image may have empty name", () => expect(mediaIssues([image(null, true)], ctx)).toEqual([]));
      test("sourced pass remains usable as evidence", () => expect(evidenceIssues([evidence("PASS")], ctx)).toEqual([]));
      test("an unknown evidence state stays UNKNOWN", () => expect(combineKnowledge([evidence("UNKNOWN").status])).toBe("UNKNOWN"));
      test("incomplete evidence cannot become a positive assertion", () => {
        const item = { ...evidence("PASS"), source: null };
        expect(evidenceIssues([item], ctx).map((value) => value.rule)).toContain("evidence-source");
      });
      test("a documented barrier remains blocked", () => expect(combineKnowledge(["BLOCKED", "PASS"])).toBe("BLOCKED"));
      test("a missing observation is not a pass", () => expect(combineKnowledge([])).toBe("UNKNOWN"));
      test("a single missing route dimension is detected", () => {
        const full = matrixKeys(["/places"]);
        const current = `/places|${locale}|${width}`;
        expect(matrixIssues(["/places"], full.filter((item) => item !== current)).some((value) => value.location === current)).toBe(true);
      });
      test("a real local detail ID can be discovered", () => expect(detailIdFromHref("/places/record-1", "https://example.invalid")).toBe("record-1"));
      test("reported problems carry dimensions", () => {
        const findings = targetIssues([target(12, 12)], ctx);
        expect(issueText(findings)).toContain(`${locale}, ${width}px`);
      });
      test("localized result count must be recognized exactly", () => {
        expect(resultStatusFromText(locale === "en" ? "3 results" : "3 résultats", locale)).toBe("COUNT");
        expect(resultStatusFromText(locale === "en" ? "unknown" : "inconnu", locale)).toBe("UNKNOWN");
      });
    });
  }
}
