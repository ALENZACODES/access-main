import { expect, test } from "@playwright/test";
import { aggregateTimeline, transitionFindings as announcementTransition, type AnnouncementFrame, type LiveNode } from "./p20x-announcements";
import { formTransition, formStructure, type FormField, type FormSnapshot } from "./p20x-forms";
import { frameFindings, transitionFindings as evidenceTransition, type EvidenceFrame, type EvidenceItem } from "./p20x-provenance";

/** Connected examples check that independently useful contracts agree on state. */
const node = (text: string): LiveNode => ({
  key: "results", role: "status", ariaLive: null, ariaAtomic: "true", text, hidden: false, busy: false,
});
const announce = (locale: "en" | "fr", text: string, timestamp: number, resultCount: number): AnnouncementFrame => ({
  route: "/finders", locale, stage: "ready", query: "museum", resultCount, nodes: [node(text)],
  activeElement: "search", documentBusy: false,
  accessibleHeading: locale === "fr" ? "Résultats de recherche" : "Search results", timestamp,
});
const field = (value: string, locale: "en" | "fr"): FormField => ({
  id: "search", kind: "search", label: locale === "fr" ? "Chercher" : "Search", required: false,
  ariaRequired: null, ariaInvalid: "false", ariaDescribedBy: [], instructions: "", value,
  disabled: false, visible: true, focusable: true, minLength: null, maxLength: null,
  min: null, max: null, step: null, choices: [], selectedChoices: [], groupLabel: "",
  autocomplete: null, errorText: "", errorId: null,
});
const searchForm = (locale: "en" | "fr", value: string, status: string): FormSnapshot => ({
  route: "/finders", locale, formId: "finder-form", title: locale === "fr" ? "Recherche" : "Finder",
  state: "editing", fields: [field(value, locale)], referencedIds: [], focusedId: "search",
  summaryLinks: [], formError: "", lastAction: "search", disabledSubmit: false,
  roleStatus: status, roleAlert: "",
});
const record = (locale: "en" | "fr", sourceKnown: boolean): EvidenceItem => ({
  id: "place-1", title: locale === "fr" ? "Exemple" : "Example", locale,
  kind: "observation", source: sourceKnown ? { state: "KNOWN", value: "Municipal listing" } : { state: "UNKNOWN", value: null },
  licence: { state: "UNKNOWN", value: null }, date: { state: "UNKNOWN", value: null },
  tier: { state: "UNKNOWN", value: null }, links: [], isDemonstration: false,
  observedAt: null, retrievedAt: null, localOnly: true,
});
const evidence = (locale: "en" | "fr", sourceKnown: boolean, connectivity: "online" | "offline"): EvidenceFrame => ({
  route: "/finders", locale, connectivity, asOf: "2026-11-19",
  records: [record(locale, sourceKnown)], pending: false, sourceStatus: "Stored observation", visibleCount: 1,
});

for (const locale of ["en", "fr"] as const) {
  test(`search results, form labels and evidence are consistent in ${locale}`, () => {
    const text = locale === "fr" ? "1 résultat" : "1 result";
    const a = announce(locale, text, 10, 1);
    const f = searchForm(locale, "museum", text);
    const e = evidence(locale, false, "online");
    expect(a.resultCount).toBe(e.visibleCount);
    expect(formStructure(f)).toEqual([]);
    expect(frameFindings(e)).toEqual([]);
  });
  test(`unknown evidence is retained after an offline transition in ${locale}`, () => {
    const from = evidence(locale, false, "online");
    const to = evidence(locale, false, "offline");
    expect(evidenceTransition({ action: "disconnect", from, to })).toEqual([]);
    expect(to.records[0]?.source.state).toBe("UNKNOWN");
  });
  test(`changing an unknown source into a known one requires an actual value in ${locale}`, () => {
    const from = evidence(locale, false, "online");
    const invalid = record(locale, false);
    const to = evidence(locale, false, "offline");
    expect(frameFindings({ ...to, records: [invalid] })).toEqual([]);
    expect(to.records[0]?.source.value).toBeNull();
    expect(evidenceTransition({ action: "disconnect", from, to })).toEqual([]);
  });
  test(`resetting search clears the field in ${locale}`, () => {
    const before = searchForm(locale, "museum", "Ready");
    const after = searchForm(locale, "", "Cleared");
    expect(formTransition({ action: "reset", before, after })).toEqual([]);
  });
  test(`a changed result announcement is not duplicated in ${locale}`, () => {
    const first = announce(locale, locale === "fr" ? "Recherche en cours" : "Searching", 10, 0);
    const last = announce(locale, locale === "fr" ? "1 résultat" : "1 result", 20, 1);
    const result = announcementTransition({ event: "search", before: first, after: last, carriesResultCount: true });
    expect(result).toEqual([]);
  });
}

test("a localized workflow changes all three views to French", () => {
  const initial = announce("en", "1 result", 10, 1);
  const localized = announce("fr", "1 résultat", 20, 1);
  expect(announcementTransition({ event: "language", before: initial, after: localized, requestedLocale: "fr" })).toEqual([]);
  expect(formTransition({ action: "language", before: searchForm("en", "museum", "Ready"), after: searchForm("fr", "museum", "Prêt"), requestedLocale: "fr" })).toEqual([]);
  expect(evidenceTransition({ action: "language", from: evidence("en", false, "online"), to: evidence("fr", false, "online"), expectedLocale: "fr" })).toEqual([]);
});
test("a mismatch in one layer cannot be hidden by the other two", () => {
  const initial = announce("en", "1 result", 10, 1);
  const wrong = announce("en", "1 result", 20, 1);
  const findings = announcementTransition({ event: "language", before: initial, after: wrong, requestedLocale: "fr" });
  expect(findings.map((item) => item.rule)).toContain("language-not-applied");
  expect(formStructure(searchForm("en", "museum", "Ready"))).toEqual([]);
  expect(frameFindings(evidence("en", false, "online"))).toEqual([]);
});
test("timeline summary does not infer accessibility from counts", () => {
  const a = announce("en", "Searching", 10, 0);
  const b = announce("en", "1 result", 20, 1);
  const summary = aggregateTimeline({ route: "/finders", events: [{ event: "search", before: a, after: b }] });
  expect(summary.events).toBe(1);
  expect(summary.errors).toBe(0);
  expect(summary.warnings).toBe(0);
});
test("a locally saved observation does not imply a sourced public record", () => {
  const f = evidence("en", false, "offline");
  expect(f.records[0]?.source.state).toBe("UNKNOWN");
  expect(f.records[0]?.localOnly).toBe(true);
  expect(frameFindings(f)).toEqual([]);
});
