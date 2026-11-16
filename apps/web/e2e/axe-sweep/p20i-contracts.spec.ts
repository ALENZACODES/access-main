import { expect, test } from "@playwright/test";
import { containsForbiddenOrg, endorsedByForbiddenOrgSample, forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import {
  AXE_TAGS, LANGUAGES, WIDTHS, combineKnowledge, disclosureIssues, dialogIssues,
  documentIssues, effectiveRect, evidenceIssues, fieldIssues, focusIssues,
  formIssues, isCalendarDate, issueText, languageIssues, linkIssues,
  liveIssues, matrixIssues, matrixKeys, mediaIssues, normalizePath,
  rectValid, routesForMatrix, tableIssues, targetIssues,
  type Context, type Disclosure, type DialogItem, type DocumentSummary,
  type Evidence, type FocusStep, type FocusWalk, type FormItem,
  type LiveItem, type MediaItem, type NavigationLink, type Rect, type TableItem,
  type Target, type TextControl,
} from "./p20i-contracts";

const context: Context = { route: "/finders", locale: "en", width: 320 };
const box: Rect = { x: 10, y: 10, width: 48, height: 48 };
const normalTarget: Target = {
  id: "finders-kind", label: "Choose a category", rect: box,
  visible: true, disabled: false, kind: "choice", labelRect: null,
  labelInteractive: false,
};
const normalDocument: DocumentSummary = {
  lang: "en", title: "Finder", h1: ["Find a service"], mainCount: 1,
  mainText: "Find a service by category", horizontalOverflow: 0,
  loading: false, skipTargetExists: true,
};
const field: TextControl = {
  id: "q", kind: "text", label: "Search", ariaLabel: "", ariaLabelledby: "",
  title: "", placeholder: "Example", visible: true, disabled: false,
  describedBy: [], missingDescriptions: [], required: false, invalid: false,
  errorText: "",
};
const link: NavigationLink = {
  id: "result", href: "/places/item-1", text: "Open place", rect: box,
  visible: true, external: false, blank: false, rel: "", downloaded: false,
};
const focus = (identity: string, inMain = true): FocusStep => ({
  identity, name: identity === "skip" ? "Skip to main content" : "Search",
  visible: true, disabled: false, inMain, disconnected: false, hiddenByOverlay: false,
});
const focusWalk: FocusWalk = {
  forward: [focus("skip", false), focus("search"), focus("submit")],
  reverse: [focus("submit"), focus("search"), focus("skip", false)],
  firstSkip: true, reachedMain: true,
};
const media: MediaItem = {
  id: "photo", kind: "img", visible: true, decorative: false,
  alternate: "Entrance photo", controls: false, captioned: false,
};
const table: TableItem = {
  id: "sources", rows: 2, headers: 2, caption: "Data sources",
  layout: false, associationErrors: [],
};
const disclosure: Disclosure = {
  id: "expand", buttonName: "More details", expanded: "false",
  controlsId: "details", controlledExists: true,
};
const dialog: DialogItem = {
  id: "edit", name: "Edit note", modal: true, focusInside: true, visible: true,
};
const live: LiveItem = {
  id: "results", role: "status", live: "polite", busy: false,
  visible: true, text: "0 results",
};
const form: FormItem = {
  id: "search", method: "get", action: "/finders", fields: 1,
  submits: 1, visible: true,
};
const evidence: Evidence = {
  source: "synthetic fixture", licence: "CC0-1.0",
  date: "2026-11-16", status: "PASS",
};

const codes = (items: readonly { rule: string }[]): string[] => items.map((item) => item.rule);

test.describe("P20I target geometry", () => {
  test("48px native button passes", () => {
    expect(targetIssues([{ ...normalTarget, kind: "button" }], context)).toEqual([]);
  });
  test("48px search field passes", () => {
    expect(targetIssues([{ ...normalTarget, kind: "field" }], context)).toEqual([]);
  });
  test("44px is inclusive", () => {
    expect(targetIssues([{ ...normalTarget, rect: { ...box, width: 44, height: 44 } }], context)).toEqual([]);
  });
  test("43.99px width fails", () => {
    expect(codes(targetIssues([{ ...normalTarget, rect: { ...box, width: 43.99 } }], context))).toContain("target-44");
  });
  test("43.99px height fails", () => {
    expect(codes(targetIssues([{ ...normalTarget, rect: { ...box, height: 43.99 } }], context))).toContain("target-44");
  });
  test("zero width fails", () => {
    expect(codes(targetIssues([{ ...normalTarget, rect: { ...box, width: 0 } }], context))).toContain("target-44");
  });
  test("zero height fails", () => {
    expect(codes(targetIssues([{ ...normalTarget, rect: { ...box, height: 0 } }], context))).toContain("target-44");
  });
  test("negative width is malformed geometry", () => {
    expect(codes(targetIssues([{ ...normalTarget, rect: { ...box, width: -2 } }], context))).toContain("invalid-target-geometry");
  });
  test("infinite dimensions are rejected", () => {
    expect(rectValid({ ...box, width: Infinity })).toBe(false);
  });
  test("NaN coordinate is rejected", () => {
    expect(rectValid({ ...box, x: Number.NaN })).toBe(false);
  });
  test("negative x is a valid off-screen coordinate", () => {
    expect(rectValid({ ...box, x: -20 })).toBe(true);
  });
  test("radio uses clickable label geometry", () => {
    const radio = { ...normalTarget, rect: { ...box, width: 18, height: 18 }, labelRect: box, labelInteractive: true };
    expect(effectiveRect(radio)).toEqual(box);
    expect(targetIssues([radio], context)).toEqual([]);
  });
  test("radio without an interactive label fails", () => {
    const radio = { ...normalTarget, rect: { ...box, width: 18, height: 18 }, labelRect: box, labelInteractive: false };
    expect(codes(targetIssues([radio], context))).toContain("target-44");
  });
  test("short clickable label is not silently expanded", () => {
    const radio = { ...normalTarget, rect: { ...box, width: 18, height: 18 }, labelRect: { ...box, height: 40 }, labelInteractive: true };
    expect(codes(targetIssues([radio], context))).toContain("target-44");
  });
  test("non-choice controls cannot borrow an unrelated label", () => {
    const anchor = { ...normalTarget, kind: "link" as const, rect: { ...box, height: 20 }, labelRect: box, labelInteractive: false };
    expect(codes(targetIssues([anchor], context))).toContain("target-44");
  });
  test("visible inline anchor is not exempt", () => {
    const anchor = { ...normalTarget, kind: "link" as const, rect: { ...box, width: 36, height: 18 } };
    expect(codes(targetIssues([anchor], context))).toContain("target-44");
  });
  test("hidden target is not assessed", () => {
    expect(targetIssues([{ ...normalTarget, visible: false, rect: { ...box, height: 2 } }], context)).toEqual([]);
  });
  test("disabled target is not assessed", () => {
    expect(targetIssues([{ ...normalTarget, disabled: true, rect: { ...box, height: 2 } }], context)).toEqual([]);
  });
  test("unnamed visible control fails", () => {
    expect(codes(targetIssues([{ ...normalTarget, label: "" }], context))).toContain("target-name");
  });
  test("white space does not count as a control name", () => {
    expect(codes(targetIssues([{ ...normalTarget, label: "  " }], context))).toContain("target-name");
  });
  test("multiple failures are retained", () => {
    const items = [{ ...normalTarget, id: "a", rect: { ...box, height: 21 } }, { ...normalTarget, id: "b", rect: { ...box, width: 21 } }];
    expect(targetIssues(items, context)).toHaveLength(2);
  });
});

test.describe("P20I document structure", () => {
  test("ordinary document passes", () => expect(documentIssues(normalDocument, context)).toEqual([]));
  test("French language is checked against expected locale", () => {
    expect(documentIssues({ ...normalDocument, lang: "fr" }, { ...context, locale: "fr" })).toEqual([]);
  });
  test("French Canadian locale is accepted", () => {
    expect(documentIssues({ ...normalDocument, lang: "fr-CA" }, { ...context, locale: "fr" })).toEqual([]);
  });
  test("English Canadian locale is accepted", () => {
    expect(documentIssues({ ...normalDocument, lang: "en-CA" }, context)).toEqual([]);
  });
  test("wrong language fails", () => {
    expect(codes(documentIssues({ ...normalDocument, lang: "en" }, { ...context, locale: "fr" }))).toContain("document-language");
  });
  test("empty language fails", () => {
    expect(codes(documentIssues({ ...normalDocument, lang: "" }, context))).toContain("document-language");
  });
  test("missing document title fails", () => {
    expect(codes(documentIssues({ ...normalDocument, title: "" }, context))).toContain("document-title");
  });
  test("missing main region fails", () => {
    expect(codes(documentIssues({ ...normalDocument, mainCount: 0 }, context))).toContain("main-landmark");
  });
  test("duplicate main region fails", () => {
    expect(codes(documentIssues({ ...normalDocument, mainCount: 2 }, context))).toContain("main-landmark");
  });
  test("missing heading fails", () => {
    expect(codes(documentIssues({ ...normalDocument, h1: [] }, context))).toContain("page-heading");
  });
  test("duplicate heading fails", () => {
    expect(codes(documentIssues({ ...normalDocument, h1: ["One", "Two"] }, context))).toContain("page-heading");
  });
  test("blank heading fails", () => {
    expect(codes(documentIssues({ ...normalDocument, h1: [" "] }, context))).toContain("page-heading");
  });
  test("broken skip target fails", () => {
    expect(codes(documentIssues({ ...normalDocument, skipTargetExists: false }, context))).toContain("skip-destination");
  });
  test("mobile horizontal scrolling fails", () => {
    expect(codes(documentIssues({ ...normalDocument, horizontalOverflow: 2 }, context))).toContain("reflow");
  });
  test("sub-pixel overflow tolerance is retained", () => {
    expect(documentIssues({ ...normalDocument, horizontalOverflow: 0.5 }, context)).toEqual([]);
  });
  test("desktop horizontal overflow does not trigger the mobile gate", () => {
    expect(documentIssues({ ...normalDocument, horizontalOverflow: 2 }, { ...context, width: 1280 })).toEqual([]);
  });
  test("unsettled loading fails", () => {
    expect(codes(documentIssues({ ...normalDocument, loading: true }, context))).toContain("loading-incomplete");
  });
  test("empty main content fails", () => {
    expect(codes(documentIssues({ ...normalDocument, mainText: " " }, context))).toContain("empty-main");
  });
});

test.describe("P20I field accessible names and errors", () => {
  test("native label passes", () => expect(fieldIssues([field], context)).toEqual([]));
  test("aria-label passes", () => expect(fieldIssues([{ ...field, label: "", ariaLabel: "Search" }], context)).toEqual([]));
  test("aria-labelledby passes", () => expect(fieldIssues([{ ...field, label: "", ariaLabelledby: "Search" }], context)).toEqual([]));
  test("title passes as fallback", () => expect(fieldIssues([{ ...field, label: "", title: "Search" }], context)).toEqual([]));
  test("placeholder alone is not sufficient", () => {
    expect(codes(fieldIssues([{ ...field, label: "" }], context))).toContain("field-name");
  });
  test("unnamed textarea fails", () => {
    expect(codes(fieldIssues([{ ...field, kind: "textarea", label: "" }], context))).toContain("field-name");
  });
  test("unnamed select fails", () => {
    expect(codes(fieldIssues([{ ...field, kind: "select", label: "" }], context))).toContain("field-name");
  });
  test("hidden field does not fail", () => expect(fieldIssues([{ ...field, visible: false, label: "" }], context)).toEqual([]));
  test("disabled field with a label passes", () => expect(fieldIssues([{ ...field, disabled: true }], context)).toEqual([]));
  test("unresolved description fails", () => {
    expect(codes(fieldIssues([{ ...field, missingDescriptions: ["missing"] }], context))).toContain("field-description");
  });
  test("two missing descriptions appear in a finding", () => {
    expect(fieldIssues([{ ...field, missingDescriptions: ["first", "second"] }], context)[0]?.detail).toContain("second");
  });
  test("invalid field without described error fails", () => {
    expect(codes(fieldIssues([{ ...field, invalid: true }], context))).toContain("field-error");
  });
  test("invalid field with error text passes", () => {
    expect(fieldIssues([{ ...field, invalid: true, errorText: "Enter a value" }], context)).toEqual([]);
  });
  test("required unnamed field generates two diagnostics", () => {
    const failures = codes(fieldIssues([{ ...field, required: true, label: "" }], context));
    expect(failures).toContain("required-name");
    expect(failures).toContain("field-name");
  });
  test("required named field passes", () => expect(fieldIssues([{ ...field, required: true }], context)).toEqual([]));
});

test.describe("P20I link and protocol handling", () => {
  const base = "https://example.invalid";
  test("regular local link passes", () => expect(linkIssues([link], context, base)).toEqual([]));
  test("telephone protocol is allowed", () => expect(linkIssues([{ ...link, href: "tel:+15551234567" }], context, base)).toEqual([]));
  test("email protocol is allowed", () => expect(linkIssues([{ ...link, href: "mailto:test@example.invalid" }], context, base)).toEqual([]));
  test("fragment protocol is allowed", () => expect(linkIssues([{ ...link, href: "#main" }], context, base)).toEqual([]));
  test("https is allowed", () => expect(linkIssues([{ ...link, href: "https://example.invalid/path" }], context, base)).toEqual([]));
  test("http is allowed", () => expect(linkIssues([{ ...link, href: "http://example.invalid/path" }], context, base)).toEqual([]));
  test("javascript scheme fails", () => {
    expect(codes(linkIssues([{ ...link, href: "javascript:void(0)" }], context, base))).toContain("link-scheme");
  });
  test("data scheme fails", () => {
    expect(codes(linkIssues([{ ...link, href: "data:text/plain,hello" }], context, base))).toContain("link-scheme");
  });
  test("unnamed link fails", () => {
    expect(codes(linkIssues([{ ...link, text: "" }], context, base))).toContain("link-name");
  });
  test("inline text link below 44px fails", () => {
    expect(codes(linkIssues([{ ...link, rect: { ...box, height: 19 } }], context, base))).toContain("link-44");
  });
  test("new external window without noopener fails", () => {
    expect(codes(linkIssues([{ ...link, external: true, blank: true }], context, base))).toContain("external-window");
  });
  test("new external window with noopener passes", () => {
    expect(linkIssues([{ ...link, external: true, blank: true, rel: "noreferrer noopener" }], context, base)).toEqual([]);
  });
  test("unnecessary internal new tab fails", () => {
    expect(codes(linkIssues([{ ...link, blank: true }], context, base))).toContain("unneeded-new-tab");
  });
  test("download link can open separately", () => {
    expect(linkIssues([{ ...link, blank: true, downloaded: true }], context, base)).toEqual([]);
  });
  test("invisible link is not measured", () => {
    expect(linkIssues([{ ...link, visible: false, rect: { ...box, height: 1 } }], context, base)).toEqual([]);
  });
});

test.describe("P20I keyboard walk", () => {
  test("normal forward and backward walk passes", () => expect(focusIssues(focusWalk, context)).toEqual([]));
  test("empty walk fails", () => expect(codes(focusIssues({ ...focusWalk, forward: [] }, context))).toContain("no-keyboard-focus"));
  test("missing skip target fails", () => expect(codes(focusIssues({ ...focusWalk, firstSkip: false }, context))).toContain("skip-link-order"));
  test("main must be reached", () => expect(codes(focusIssues({ ...focusWalk, reachedMain: false }, context))).toContain("main-unreachable"));
  test("hidden focus stop fails", () => {
    const forward = [focus("skip", false), { ...focus("search"), visible: false }];
    expect(codes(focusIssues({ ...focusWalk, forward, reverse: [] }, context))).toContain("focus-not-operable");
  });
  test("disabled focus stop fails", () => {
    const forward = [focus("skip", false), { ...focus("search"), disabled: true }];
    expect(codes(focusIssues({ ...focusWalk, forward, reverse: [] }, context))).toContain("focus-not-operable");
  });
  test("focus under overlay fails", () => {
    const forward = [focus("skip", false), { ...focus("search"), hiddenByOverlay: true }];
    expect(codes(focusIssues({ ...focusWalk, forward, reverse: [] }, context))).toContain("focus-not-operable");
  });
  test("detached target fails", () => {
    const forward = [focus("skip", false), { ...focus("search"), disconnected: true }];
    expect(codes(focusIssues({ ...focusWalk, forward, reverse: [] }, context))).toContain("focus-not-operable");
  });
  test("duplicate DOM identity fails even with changed names", () => {
    const forward = [focus("skip", false), focus("one"), { ...focus("one"), name: "Different label" }];
    expect(codes(focusIssues({ ...focusWalk, forward, reverse: [] }, context))).toContain("focus-repeat");
  });
  test("identical visible names with distinct identities pass", () => {
    const forward = [focus("skip", false), { ...focus("a"), name: "Help" }, { ...focus("b"), name: "Help" }];
    expect(focusIssues({ ...focusWalk, forward, reverse: [] }, context)).toEqual([]);
  });
  test("reverse order mismatch fails", () => {
    expect(codes(focusIssues({ ...focusWalk, reverse: [focus("search"), focus("submit"), focus("skip", false)] }, context))).toContain("reverse-order");
  });
  test("empty reverse walk does not imply a result", () => {
    expect(focusIssues({ ...focusWalk, reverse: [] }, context)).toEqual([]);
  });
});

test.describe("P20I media alternative rules", () => {
  test("named image passes", () => expect(mediaIssues([media], context)).toEqual([]));
  test("unnamed image fails", () => expect(codes(mediaIssues([{ ...media, alternate: null }], context))).toContain("media-alternative"));
  test("decorative image is allowed", () => expect(mediaIssues([{ ...media, decorative: true, alternate: null }], context)).toEqual([]));
  test("hidden image is not assessed", () => expect(mediaIssues([{ ...media, visible: false, alternate: null }], context)).toEqual([]));
  test("unnamed SVG fails", () => expect(codes(mediaIssues([{ ...media, kind: "svg", alternate: "" }], context))).toContain("media-alternative"));
  test("unnamed canvas fails", () => expect(codes(mediaIssues([{ ...media, kind: "canvas", alternate: null }], context))).toContain("media-alternative"));
  test("named canvas passes", () => expect(mediaIssues([{ ...media, kind: "canvas", alternate: "Interactive map" }], context)).toEqual([]));
  test("uncaptioned video fails", () => expect(codes(mediaIssues([{ ...media, kind: "video", controls: true }], context))).toContain("video-captions"));
  test("captioned video with controls passes", () => expect(mediaIssues([{ ...media, kind: "video", controls: true, captioned: true }], context)).toEqual([]));
  test("video without controls fails", () => expect(codes(mediaIssues([{ ...media, kind: "video", controls: false, captioned: true }], context))).toContain("media-controls"));
  test("audio without controls fails", () => expect(codes(mediaIssues([{ ...media, kind: "audio" }], context))).toContain("media-controls"));
  test("audio with controls passes", () => expect(mediaIssues([{ ...media, kind: "audio", controls: true }], context)).toEqual([]));
});

test.describe("P20I tables, disclosures and dialogs", () => {
  test("associated table passes", () => expect(tableIssues([table], context)).toEqual([]));
  test("headerless table fails", () => expect(codes(tableIssues([{ ...table, headers: 0 }], context))).toContain("table-headers"));
  test("captionless table fails", () => expect(codes(tableIssues([{ ...table, caption: "" }], context))).toContain("table-caption"));
  test("unassociated data cell fails", () => expect(codes(tableIssues([{ ...table, associationErrors: ["row 1"] }], context))).toContain("table-association"));
  test("layout table is not treated as data", () => expect(tableIssues([{ ...table, layout: true, headers: 0, caption: "" }], context)).toEqual([]));
  test("empty table is not required to have headers", () => expect(tableIssues([{ ...table, rows: 0, headers: 0, caption: "" }], context)).toEqual([]));
  test("valid disclosure passes", () => expect(disclosureIssues([disclosure], context)).toEqual([]));
  test("unnamed disclosure fails", () => expect(codes(disclosureIssues([{ ...disclosure, buttonName: "" }], context))).toContain("disclosure-name"));
  test("invalid expanded state fails", () => expect(codes(disclosureIssues([{ ...disclosure, expanded: "unknown" }], context))).toContain("disclosure-expanded"));
  test("broken disclosure controls fails", () => expect(codes(disclosureIssues([{ ...disclosure, controlledExists: false }], context))).toContain("disclosure-controls"));
  test("native summary can lack aria-expanded", () => expect(disclosureIssues([{ ...disclosure, expanded: null }], context)).toEqual([]));
  test("named modal passes with focus inside", () => expect(dialogIssues([dialog], context)).toEqual([]));
  test("unnamed dialog fails", () => expect(codes(dialogIssues([{ ...dialog, name: "" }], context))).toContain("dialog-name"));
  test("modal without focus fails", () => expect(codes(dialogIssues([{ ...dialog, focusInside: false }], context))).toContain("dialog-focus"));
  test("nonmodal dialogue may leave focus outside", () => expect(dialogIssues([{ ...dialog, modal: false, focusInside: false }], context)).toEqual([]));
  test("hidden dialog is ignored", () => expect(dialogIssues([{ ...dialog, visible: false, name: "" }], context)).toEqual([]));
});

test.describe("P20I live regions and forms", () => {
  test("normal status passes", () => expect(liveIssues([live], context)).toEqual([]));
  test("unsupported live value fails", () => expect(codes(liveIssues([{ ...live, live: "immediate" }], context))).toContain("live-value"));
  test("busy region with text fails", () => expect(codes(liveIssues([{ ...live, busy: true }], context))).toContain("busy-announcement"));
  test("busy region without text is allowed", () => expect(liveIssues([{ ...live, busy: true, text: "" }], context)).toEqual([]));
  test("hidden alert fails", () => expect(codes(liveIssues([{ ...live, role: "alert", visible: false }], context))).toContain("hidden-alert"));
  test("normal form passes", () => expect(formIssues([form], context)).toEqual([]));
  test("form with fields and no submit fails", () => expect(codes(formIssues([{ ...form, submits: 0 }], context))).toContain("form-submit"));
  test("form without fields is permitted", () => expect(formIssues([{ ...form, fields: 0, submits: 0 }], context)).toEqual([]));
  test("hidden form is ignored", () => expect(formIssues([{ ...form, visible: false, submits: 0 }], context)).toEqual([]));
  test("script action is rejected", () => expect(codes(formIssues([{ ...form, action: "javascript:alert(1)" }], context))).toContain("form-action"));
});

test.describe("P20I evidence provenance and uncertainty", () => {
  test("open source evidence passes", () => expect(evidenceIssues([evidence], context)).toEqual([]));
  test("missing source fails", () => expect(codes(evidenceIssues([{ ...evidence, source: null }], context))).toContain("evidence-source"));
  test("blank source fails", () => expect(codes(evidenceIssues([{ ...evidence, source: " " }], context))).toContain("evidence-source"));
  test("missing licence fails", () => expect(codes(evidenceIssues([{ ...evidence, licence: null }], context))).toContain("evidence-licence"));
  test("unknown licence fails", () => expect(codes(evidenceIssues([{ ...evidence, licence: "custom" }], context))).toContain("evidence-licence"));
  test("missing date fails", () => expect(codes(evidenceIssues([{ ...evidence, date: null }], context))).toContain("evidence-date"));
  test("invalid date fails", () => expect(codes(evidenceIssues([{ ...evidence, date: "2026-02-30" }], context))).toContain("evidence-date"));
  test("unknown state is not promoted", () => expect(evidenceIssues([{ source: null, licence: null, date: null, status: "UNKNOWN" }], context)).toEqual([]));
  test("unknown-only state combines to unknown", () => expect(combineKnowledge(["UNKNOWN"])).toBe("UNKNOWN"));
  test("empty evidence combines to unknown", () => expect(combineKnowledge([])).toBe("UNKNOWN"));
  test("blocked fact prevails over unknown", () => expect(combineKnowledge(["BLOCKED", "UNKNOWN"])).toBe("BLOCKED"));
  test("unknown prevails over pass", () => expect(combineKnowledge(["PASS", "UNKNOWN"])).toBe("UNKNOWN"));
  test("complete pass remains pass", () => expect(combineKnowledge(["PASS", "PASS"])).toBe("PASS"));
  test("documented barrier remains blocked", () => expect(combineKnowledge(["PASS", "BLOCKED"])).toBe("BLOCKED"));
  test("valid leap day is accepted", () => expect(isCalendarDate("2024-02-29")).toBe(true));
  test("invalid leap day is rejected", () => expect(isCalendarDate("2025-02-29")).toBe(false));
  test("year zero is rejected", () => expect(isCalendarDate("0000-01-01")).toBe(false));
  test("extra precision is rejected", () => expect(isCalendarDate("2026-11-16T12:00:00Z")).toBe(false));
  test("all accepted open licences", () => {
    for (const licence of ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-Ontario-1.0"]) {
      expect(evidenceIssues([{ ...evidence, licence }], context)).toEqual([]);
    }
  });
});

test.describe("P20I route inventory and locale transitions", () => {
  test("root normalizes", () => expect(normalizePath("/")).toBe("/"));
  test("trailing slash normalizes", () => expect(normalizePath("/places/")).toBe("/places"));
  test("invalid external URL is rejected", () => expect(normalizePath("https://bad.invalid/places")).toBeNull());
  test("query route is rejected", () => expect(normalizePath("/places?lang=fr")).toBeNull());
  test("fragment route is rejected", () => expect(normalizePath("/places#top")).toBeNull());
  test("matrix includes four combinations", () => expect(matrixKeys(["/places"])).toHaveLength(4));
  test("matrix routes deduplicate", () => expect(matrixKeys(["/places", "/places/"])).toHaveLength(4));
  test("matrix reports absent French", () => {
    const observed = ["/places|en|320", "/places|en|1280"];
    expect(codes(matrixIssues(["/places"], observed))).toEqual(["matrix-missing", "matrix-missing"]);
  });
  test("unexpected route is reported", () => expect(codes(matrixIssues([], ["/other|en|320"]))).toContain("matrix-unexpected"));
  test("duplicate route observation fails", () => {
    const observed = matrixKeys(["/"]);
    expect(codes(matrixIssues(["/"], [...observed, observed[0]!]))).toContain("matrix-duplicate");
  });
  test("complete matrix passes", () => expect(matrixIssues(["/", "/help"], matrixKeys(["/", "/help"]))).toEqual([]));
  test("invalid route source throws", () => expect(() => routesForMatrix(["/", "https://bad.invalid"])).toThrow());
  test("French selection through button passes", () => {
    expect(languageIssues({ before: "en", after: "fr", beforeRoute: "/", afterRoute: "/", buttonUsed: true }, context)).toEqual([]);
  });
  test("language changes without button fail", () => {
    expect(codes(languageIssues({ before: "en", after: "fr", beforeRoute: "/", afterRoute: "/", buttonUsed: false }, context))).toContain("locale-control");
  });
  test("route change during language selection fails", () => {
    expect(codes(languageIssues({ before: "en", after: "fr", beforeRoute: "/", afterRoute: "/help", buttonUsed: true }, context))).toContain("locale-navigation");
  });
  test("language must actually change", () => {
    expect(codes(languageIssues({ before: "en", after: "en", beforeRoute: "/", afterRoute: "/", buttonUsed: true }, context))).toContain("locale-unchanged");
  });
  test("language destination must be the opposite locale", () => {
    expect(codes(languageIssues({ before: "fr", after: "es", beforeRoute: "/", afterRoute: "/", buttonUsed: true }, context))).toContain("locale-destination");
  });
  test("both locale and viewport dimensions remain mandatory", () => {
    expect(LANGUAGES).toEqual(["en", "fr"]);
    expect(WIDTHS).toEqual([320, 1280]);
  });
  test("axe uses WCAG 2.2 AA rules", () => {
    expect(AXE_TAGS).toContain("wcag22aa");
    expect(AXE_TAGS).toContain("wcag2aa");
  });
});

test.describe("P20I banned-name construction", () => {
  test("needles are supplied only by the shared helper", () => {
    const needles = forbiddenOrgNeedles();
    expect(needles.length).toBeGreaterThan(2);
    expect(needles.every((needle) => needle.trim().length > 0)).toBe(true);
  });
  test("English negative sample is caught", () => expect(containsForbiddenOrg(endorsedByForbiddenOrgSample("en"))).toBe(true));
  test("French negative sample is caught", () => expect(containsForbiddenOrg(endorsedByForbiddenOrgSample("fr"))).toBe(true));
  test("unbranded product label is allowed", () => expect(containsForbiddenOrg("the App")).toBe(false));
  test("issue formatter is deterministic and caps output", () => {
    const issues = [
      { rule: "one", location: "/", detail: "A" },
      { rule: "one", location: "/", detail: "A" },
      { rule: "two", location: "/", detail: "B" },
      { rule: "three", location: "/", detail: "C" },
    ];
    expect(issueText(issues, 2)).toContain("1 additional finding(s)");
  });
});
