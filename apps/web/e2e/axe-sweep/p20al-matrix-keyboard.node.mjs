import test from "node:test";
import assert from "node:assert/strict";
import {
  auditCells, cellKey, uniqueRoutes, routeInventoryFindings, matrixFindings,
  resultFindings, auditGate, partitionResults, sampleRoutes,
  missingLocales, missingWidths, selectCriticalCells, allowPartialAudit, matrixSummary,
} from "./p20al-matrix.ts";
import {
  eligibleTarget, tabbableTargets, targetProblems, nextTab, compositeNext,
  compositeProblems, strokeProblems, dialogProblems, dialogEscapeProblems, keyboardSummary,
} from "./p20al-keyboard.ts";
import {
  MESSAGES, FINDING_MESSAGES, localizedMessage, normalizeLanguage,
  frenchTypography, messageLibraryFindings, diagnosticFor, diagnosticReport,
  accessibleNamePattern, controlHasName, hasBilingualCoverage,
} from "./p20al-language.ts";
import { finding } from "./p20al-contract.ts";

const target = (change = {}) => ({
  key: "one", name: "First", role: "tab", visible: true, disabled: false,
  inert: false, tabIndex: 0, inDialog: false,
  rect: { x: 0, y: 0, width: 44, height: 44 }, ...change,
});
const second = (change = {}) => target({ key: "two", name: "Second", tabIndex: -1, ...change });
const composite = (change = {}) => ({ id: "tabs", orientation: "horizontal", wrap: true,
  activeId: "one", targets: [target(), second()], ...change });
const cell = (change = {}) => ({ route: "/journey", locale: "en", width: 320,
  network: "offline", phase: "recovery", ...change });
const result = (change = {}) => ({ cell: cell(), completed: true, errors: [], durationMs: 12,
  observedRoute: "/journey", observedLocale: "en", ...change });
const codes = (rows) => rows.map((row) => row.code);

// A route matrix must be driven by the current app inventory, not a fixed count.
test("matrix contains four phases per route-language-width-network combination", () => {
  const cells = auditCells(["/", "/journey"]);
  assert.equal(cells.length, 2 * 2 * 2 * 2 * 4);
  assert.equal(new Set(cells.map(cellKey)).size, cells.length);
});
test("matrix phase filters reduce the cross-product deterministically", () => {
  const cells = auditCells(["/"], ["entry"]);
  assert.equal(cells.length, 8);
  assert.ok(cells.every((entry) => entry.phase === "entry"));
});
test("matrix keys preserve locale, width, connectivity and phase", () => {
  assert.notEqual(cellKey(cell()), cellKey(cell({ locale: "fr" })));
  assert.notEqual(cellKey(cell()), cellKey(cell({ width: 1280 })));
  assert.notEqual(cellKey(cell()), cellKey(cell({ network: "online" })));
  assert.notEqual(cellKey(cell()), cellKey(cell({ phase: "history" })));
});
test("duplicate route strings remain visible to the inventory validator", () => {
  const findings = routeInventoryFindings(["/", "/"]);
  assert.ok(codes(findings).includes("inventory-route-duplicate"));
  assert.deepEqual(uniqueRoutes(["/", "/"]), ["/"]);
});
for (const [routes, expected] of [
  [["bad"], "inventory-route-invalid"],
  [["//host"], "inventory-route-invalid"],
  [[], "inventory-empty"],
  [["/"], "inventory-route-missing"],
]) {
  test(`route inventory diagnoses ${expected} on ${JSON.stringify(routes)}`, () => {
    assert.ok(codes(routeInventoryFindings(routes, ["/help"])).includes(expected));
  });
}
test("complete route inventory passes", () => {
  assert.deepEqual(routeInventoryFindings(["/", "/journey"], ["/"]), []);
});
test("matrix comparison rejects a missing cell", () => {
  const expected = auditCells(["/"]);
  assert.ok(codes(matrixFindings(expected, expected.slice(1))).includes("matrix-missing"));
});
test("matrix comparison rejects an unexpected cell", () => {
  const expected = auditCells(["/"]);
  assert.ok(codes(matrixFindings(expected, [...expected, cell()])).includes("matrix-unexpected"));
});
test("matrix comparison rejects duplicate execution", () => {
  const expected = auditCells(["/"]);
  assert.ok(codes(matrixFindings(expected, [...expected, expected[0]])).includes("matrix-duplicate"));
});
test("a complete result has no findings", () => {
  assert.deepEqual(resultFindings(result()), []);
});
for (const [change, expected] of [
  [{ completed: false }, "audit-not-completed"],
  [{ observedRoute: "/help" }, "audit-route-mismatch"],
  [{ observedLocale: "fr" }, "audit-locale-mismatch"],
  [{ durationMs: -1 }, "audit-time-invalid"],
  [{ durationMs: Infinity }, "audit-time-invalid"],
]) {
  test(`result diagnostics detect ${expected}`, () => {
    assert.ok(codes(resultFindings(result(change))).includes(expected));
  });
}
test("a gate does not treat missing cells as passing coverage", () => {
  const expected = auditCells(["/"]);
  const summary = auditGate(expected, []);
  assert.equal(summary.missing, expected.length);
  assert.equal(allowPartialAudit(summary), false);
});
test("a complete gate passes with a result for every cell", () => {
  const expected = auditCells(["/"]);
  const results = expected.map((item) => result({ cell: item, observedRoute: "/", observedLocale: item.locale }));
  const summary = auditGate(expected, results);
  assert.equal(summary.errors, 0);
  assert.equal(summary.missing, 0);
  assert.equal(summary.unknown, 0);
  assert.equal(allowPartialAudit(summary), true);
});
test("unknown observed route does not become coverage evidence", () => {
  const expected = [cell()];
  const summary = auditGate(expected, [result({ observedRoute: null })]);
  assert.equal(summary.unknown, 1);
  assert.equal(allowPartialAudit(summary), false);
});
test("gate summary reports expected, complete, missing and error totals", () => {
  const summary = auditGate([cell()], []);
  assert.match(matrixSummary(summary), /Missing: 1/);
  assert.match(matrixSummary(summary), /Expected: 1/);
});
test("route sample retains endpoints without hardcoded route counts", () => {
  const routes = ["/", "/a", "/b", "/c", "/d", "/e"];
  const sampled = sampleRoutes(routes, 3);
  assert.equal(sampled[0], "/");
  assert.equal(sampled[sampled.length - 1], "/e");
});
test("route sample of one includes first route", () => {
  assert.deepEqual(sampleRoutes(["/", "/help"], 1), ["/"]);
});
test("invalid sample limit is rejected", () => {
  assert.throws(() => sampleRoutes(["/"], 0), RangeError);
  assert.throws(() => sampleRoutes(["/"], 1.2), RangeError);
});
test("critical samples include both languages without a second full axe crawl", () => {
  const critical = selectCriticalCells(["/", "/help"]);
  assert.equal(critical.length, 8);
  assert.deepEqual(new Set(critical.map((entry) => entry.locale)), new Set(["en", "fr"]));
});
test("missing locale detection returns French when only English completed", () => {
  const expected = auditCells(["/"]);
  const results = expected.filter((entry) => entry.locale === "en")
    .map((entry) => result({ cell: entry, observedRoute: "/", observedLocale: "en" }));
  assert.deepEqual(missingLocales(expected, results), ["fr"]);
});
test("missing width detection returns 1280 when only 320 completed", () => {
  const expected = auditCells(["/"]);
  const results = expected.filter((entry) => entry.width === 320)
    .map((entry) => result({ cell: entry, observedRoute: "/", observedLocale: entry.locale }));
  assert.deepEqual(missingWidths(expected, results), [1280]);
});
test("result partition retains all tested entries", () => {
  const cells = [cell(), cell({ locale: "fr" })];
  const partitions = partitionResults(cells.map((entry) => result({ cell: entry, observedLocale: entry.locale })));
  assert.equal(partitions.en.length, 1);
  assert.equal(partitions.fr.length, 1);
});

// Keyboard contracts examine actual targets, not assumed English labels.
test("eligible target is included in keyboard traversal", () => {
  assert.equal(eligibleTarget(target()), true);
});
for (const [change, eligible] of [
  [{ visible: false }, false], [{ disabled: true }, false],
  [{ inert: true }, false], [{ tabIndex: -2 }, false],
  [{ tabIndex: -1 }, true], [{ tabIndex: 0 }, true],
]) {
  test(`eligibility evaluates ${JSON.stringify(change)}`, () => {
    assert.equal(eligibleTarget(target(change)), eligible);
  });
}
test("tabbable list removes disabled, hidden and negative tabs", () => {
  const list = tabbableTargets([target(), second(), target({ key: "hidden", visible: false })]);
  assert.deepEqual(list.map((item) => item.key), ["one"]);
});
test("positive tab index is ordered before zero", () => {
  const list = tabbableTargets([target(), second({ tabIndex: 2 }), target({ key: "three", tabIndex: 1 })]);
  assert.deepEqual(list.map((item) => item.key), ["three", "two", "one"]);
});
for (const [change, expected] of [
  [{ name: "" }, "target-name-missing"],
  [{ inert: true }, "inert-tabbable"],
  [{ tabIndex: -2 }, "target-tabindex-invalid"],
  [{ tabIndex: 1 }, "target-positive-tabindex"],
  [{ rect: null }, "target-measurement-unknown"],
  [{ rect: { x: 0, y: 0, width: 43, height: 44 } }, "target-width"],
  [{ rect: { x: 0, y: 0, width: 44, height: 43 } }, "target-height"],
  [{ rect: { x: 0, y: 0, width: NaN, height: 44 } }, "target-measurement-invalid"],
]) {
  test(`target problem ${expected}`, () => {
    assert.ok(codes(targetProblems([target(change)], "/journey")).includes(expected));
  });
}
test("duplicate target identifiers are reported", () => {
  assert.ok(codes(targetProblems([target(), target()], "/journey")).includes("target-id-duplicate"));
});
test("no tabbable target stays UNKNOWN rather than inventing focus", () => {
  assert.equal(nextTab([], null, false), null);
});
test("tab from unknown position starts at first eligible target", () => {
  assert.equal(nextTab([target(), second({ tabIndex: 0 })], null, false), "one");
});
test("reverse tab from unknown position starts at last eligible target", () => {
  assert.equal(nextTab([target(), second({ tabIndex: 0 })], null, true), "two");
});
test("tab wraps after final eligible target", () => {
  assert.equal(nextTab([target(), second({ tabIndex: 0 })], "two", false), "one");
});
test("shift tab wraps before first eligible target", () => {
  assert.equal(nextTab([target(), second({ tabIndex: 0 })], "one", true), "two");
});
test("horizontal composite arrows wrap", () => {
  assert.equal(compositeNext(composite(), "ArrowRight"), "two");
  assert.equal(compositeNext(composite(), "ArrowLeft"), "two");
});
test("vertical composite uses vertical arrows", () => {
  const vertical = composite({ orientation: "vertical" });
  assert.equal(compositeNext(vertical, "ArrowDown"), "two");
  assert.equal(compositeNext(vertical, "ArrowRight"), "one");
});
test("non-wrapping composite stays at first item on previous", () => {
  assert.equal(compositeNext(composite({ wrap: false }), "ArrowLeft"), "one");
});
test("composite Home and End target the edges", () => {
  assert.equal(compositeNext(composite(), "Home"), "one");
  assert.equal(compositeNext(composite(), "End"), "two");
});
test("missing active composite entry starts at first option", () => {
  assert.equal(compositeNext(composite({ activeId: "missing" }), "ArrowRight"), "one");
});
test("empty composite returns no fabricated target", () => {
  assert.equal(compositeNext(composite({ targets: [] }), "ArrowRight"), null);
});
test("valid composite has exactly one roving target", () => {
  assert.deepEqual(compositeProblems(composite()), []);
});
test("wrong roving target reports mismatch", () => {
  assert.ok(codes(compositeProblems(composite({ targets: [target({ tabIndex: -1 }), second({ tabIndex: 0 })] }))).includes("composite-roving-mismatch"));
});
test("missing composite active item reports failure", () => {
  assert.ok(codes(compositeProblems(composite({ activeId: "missing" }))).includes("composite-active-invalid"));
});
test("two roving composite entries report count failure", () => {
  assert.ok(codes(compositeProblems(composite({ targets: [target(), second({ tabIndex: 0 })] }))).includes("composite-roving-count"));
});
test("working tab stroke follows observed order", () => {
  const stroke = { key: "Tab", before: "one", after: "two", scrollBefore: 0, scrollAfter: 0, defaultPrevented: false };
  assert.deepEqual(strokeProblems(stroke, [target(), second({ tabIndex: 0 })], "tabs"), []);
});
test("wrong tab destination reports order error", () => {
  const stroke = { key: "Tab", before: "one", after: "one", scrollBefore: 0, scrollAfter: 0, defaultPrevented: false };
  assert.ok(codes(strokeProblems(stroke, [target(), second({ tabIndex: 0 })], "tabs")).includes("tab-order"));
});
test("arrow that scrolls without preventDefault is reported", () => {
  const stroke = { key: "ArrowDown", before: "one", after: "two", scrollBefore: 0, scrollAfter: 20, defaultPrevented: false };
  assert.ok(codes(strokeProblems(stroke, [target(), second()], "tabs")).includes("arrow-scroll"));
});
test("unknown before and after targets are independently reported", () => {
  const stroke = { key: "Enter", before: "missing", after: "absent", scrollBefore: 0, scrollAfter: 0, defaultPrevented: null };
  const issues = codes(strokeProblems(stroke, [target()], "tabs"));
  assert.ok(issues.includes("stroke-before-unknown"));
  assert.ok(issues.includes("stroke-after-unknown"));
});
for (const [change, expected] of [
  [{ activeId: "outside" }, "dialog-focus-outside"],
  [{ backgroundFocusable: ["background"] }, "dialog-background-active"],
  [{ insideIds: [] }, "dialog-no-focus-target"],
]) {
  test(`dialog problem ${expected}`, () => {
    const dialog = { id: "modal", open: true, activeId: "close", launcher: "open", insideIds: ["close"], backgroundFocusable: [], ...change };
    assert.ok(codes(dialogProblems(dialog)).includes(expected));
  });
}
test("closed dialogs do not need contained focus", () => {
  assert.deepEqual(dialogProblems({ id: "modal", open: false, activeId: null, launcher: null, insideIds: [], backgroundFocusable: [] }), []);
});
test("Escape closes dialog and restores launcher focus", () => {
  const before = { id: "modal", open: true, activeId: "close", launcher: "open", insideIds: ["close"], backgroundFocusable: [] };
  assert.deepEqual(dialogEscapeProblems(before, { ...before, open: false }, "open"), []);
});
test("Escape leaving the dialog open is detected", () => {
  const before = { id: "modal", open: true, activeId: "close", launcher: "open", insideIds: ["close"], backgroundFocusable: [] };
  assert.ok(codes(dialogEscapeProblems(before, before, "close")).includes("dialog-escape-not-closed"));
});
test("Escape losing trigger focus is detected", () => {
  const before = { id: "modal", open: true, activeId: "close", launcher: "open", insideIds: ["close"], backgroundFocusable: [] };
  assert.ok(codes(dialogEscapeProblems(before, { ...before, open: false }, null)).includes("dialog-focus-not-restored"));
});
test("keyboard reporter rejects invalid limits", () => {
  assert.throws(() => keyboardSummary([], 0), RangeError);
  assert.throws(() => keyboardSummary([], 1.5), RangeError);
});

// Localized diagnostics use meaning rather than a fixed English aria-label.
test("English and French copy key sets are complete", () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.fr).sort());
  assert.equal(hasBilingualCoverage(["offline", "ready", "unknown", "error", "search"]), true);
});
test("French messages respect apostrophes and typographic spaces", () => {
  assert.deepEqual(messageLibraryFindings(), []);
});
for (const [text, code] of [
  ["l'utilisateur", "fr-apostrophe"],
  ["Résumé: test", "fr-colon-nbsp"],
  ["Attention!", "fr-thin-space"],
  ["«texte»", "fr-left-quote"],
  ["«\u202ftexte»", "fr-right-quote"],
]) {
  test(`French typography detects ${code}`, () => {
    assert.ok(codes(frenchTypography(text)).includes(code));
  });
}
test("proper French punctuation is accepted", () => {
  assert.deepEqual(frenchTypography("L’utilisateur\u00a0: «\u202fun test\u202f»\u202f!"), []);
});
for (const [tag, expected] of [
  ["en", "en"], ["en-CA", "en"], ["fr", "fr"], ["fr-CA", "fr"],
  ["FR-ca", "fr"], ["es", null], ["und", null], ["french", null], [null, null],
]) {
  test(`language parser handles ${String(tag)}`, () => {
    assert.equal(normalizeLanguage(tag), expected);
  });
}
test("localized retry names differ by language", () => {
  assert.notEqual(localizedMessage("en", "retry"), localizedMessage("fr", "retry"));
  assert.equal(accessibleNamePattern("fr", "retry").test("Réessayer"), true);
  assert.equal(accessibleNamePattern("fr", "retry").test("Try again"), false);
});
test("UNKNOWN sentinel is identical in both language dictionaries", () => {
  assert.equal(localizedMessage("en", "unknown"), "UNKNOWN");
  assert.equal(localizedMessage("fr", "unknown"), "UNKNOWN");
});
test("missing ARIA label is not failure when visible text names a control", () => {
  assert.equal(controlHasName([null, null, "Rechercher"]), true);
  assert.equal(controlHasName([null, " ", ""]), false);
});
test("localized diagnostic names known failure codes", () => {
  const issue = finding("record-lost", "/journey", "r1");
  assert.notEqual(diagnosticFor("fr", issue).label, "UNKNOWN");
  assert.notEqual(diagnosticFor("en", issue).label, "UNKNOWN");
});
test("unexpected finding codes remain explicit UNKNOWN", () => {
  const issue = finding("some-future-code", "/journey", "r1");
  assert.equal(diagnosticFor("fr", issue).label, "UNKNOWN");
});
test("localized reports are bounded", () => {
  const issues = [finding("record-lost", "/a", "r1"), finding("record-lost", "/b", "r2")];
  assert.match(diagnosticReport("fr", issues, 1), /constats supplémentaires/);
  assert.match(diagnosticReport("en", issues, 1), /additional findings/);
});
test("finding labels exist in both languages for the same contract codes", () => {
  assert.deepEqual(Object.keys(FINDING_MESSAGES.en).sort(), Object.keys(FINDING_MESSAGES.fr).sort());
});
