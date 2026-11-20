import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN, isUnknown, normalizedValue, isCalendarDate, validRoute, issue,
  evidenceKnown, evidenceFindings, evidenceIdentity, provenanceChanges,
  focusFindings, screenFindings, announcementChanges, transitionFindings,
  sameScreen, journeyFindings, blockingFindings, uniqueFindings,
  reportFindings, coverageMatrix, coverageFindings,
} from "./p20aa-journey-model.ts";
import {
  eligible, tabbable, targetFindings, targetListFindings, orderedTabStops,
  expectedTabTarget, arrowDirection, nextComposite,
  compositeFindings, compositeStrokeFindings, linearStrokeFindings,
  dialogFindings, dialogEscapeFindings, keyboardSummary,
} from "./p20aa-keyboard-policy.ts";
import {
  COPY, copy, observedOrUnknown, documentLanguage,
  frenchTypographyFindings, forbiddenClaims,
  statusCopyFindings, translationPairFindings, copyForOutcome,
  messageMatchesOutcome, makeStatusRecord, copyReport,
} from "./p20aa-language-contract.ts";

const evidence = (changes = {}) => ({
  id: "one", label: "Example", value: "Step-free entrance",
  source: "Example dataset", licence: "Example licence",
  retrievedOn: "2026-11-19", tier: "E", ...changes,
});
const focus = (changes = {}) => ({
  id: "search", role: "button", visible: true, insideModal: false,
  inInertRegion: false, width: 44, height: 44, ...changes,
});
const message = (changes = {}) => ({
  key: "status", text: "Results are ready.", locale: "en",
  politeness: "polite", busy: false, emittedAt: 100, ...changes,
});
const screen = (changes = {}) => ({
  route: "/journey", locale: "en", connection: "online", phase: "ready",
  title: "Journey", heading: "Journey", mainCount: 1,
  focus: focus(), evidence: [], messages: [], modalId: null,
  query: "", scrollY: 0, historyIndex: 0, actionTime: 100,
  ...changes,
});
const action = (changes = {}) => ({
  kind: "language", before: screen(), after: screen({ locale: "fr" }),
  ...changes,
});
const target = (changes = {}) => ({
  id: "first", role: "tab", label: "First", visible: true,
  disabled: false, inert: false, tabindex: 0,
  x: 0, y: 0, width: 44, height: 44, focusRing: true,
  selected: true, checked: null, expanded: null, controls: [], ...changes,
});
const composite = (changes = {}) => ({
  id: "tabs", kind: "tabs", orientation: "horizontal", wrap: true,
  activation: "automatic", current: "first", children: [
    target(), target({ id: "second", label: "Second", tabindex: -1, selected: false }),
  ], ...changes,
});
const stroke = (changes = {}) => ({
  key: "ArrowRight", before: "first", after: "second", prevented: true,
  at: 100, scrollBefore: 0, scrollAfter: 0, ...changes,
});
const dialog = (changes = {}) => ({
  id: "dialog", open: true, triggerId: "open", activeId: "close",
  descendants: ["close", "confirm"], backgroundFocusables: [], modal: true,
  ...changes,
});
const codes = (items) => items.map((item) => item.code);

test("UNKNOWN sentinel remains unresolved None", () => {
  assert.equal(isUnknown(null), true);
  assert.equal(normalizedValue(null), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved ''", () => {
  assert.equal(isUnknown(''), true);
  assert.equal(normalizedValue(''), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved ' '", () => {
  assert.equal(isUnknown(' '), true);
  assert.equal(normalizedValue(' '), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'UNKNOWN'", () => {
  assert.equal(isUnknown('UNKNOWN'), true);
  assert.equal(normalizedValue('UNKNOWN'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'unknown'", () => {
  assert.equal(isUnknown('unknown'), true);
  assert.equal(normalizedValue('unknown'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'Inconnu'", () => {
  assert.equal(isUnknown('Inconnu'), true);
  assert.equal(normalizedValue('Inconnu'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'Inconnue'", () => {
  assert.equal(isUnknown('Inconnue'), true);
  assert.equal(normalizedValue('Inconnue'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved '\u2014'", () => {
  assert.equal(isUnknown('—'), true);
  assert.equal(normalizedValue('—'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved '-'", () => {
  assert.equal(isUnknown('-'), true);
  assert.equal(normalizedValue('-'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'N/A'", () => {
  assert.equal(isUnknown('N/A'), true);
  assert.equal(normalizedValue('N/A'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'null'", () => {
  assert.equal(isUnknown('null'), true);
  assert.equal(normalizedValue('null'), UNKNOWN);
});

test("UNKNOWN sentinel remains unresolved 'undefined'", () => {
  assert.equal(isUnknown('undefined'), true);
  assert.equal(normalizedValue('undefined'), UNKNOWN);
});

test("Observed value is not erased known", () => {
  assert.equal(isUnknown('known'), false);
  assert.equal(normalizedValue('known'), 'known');
});

test("Observed value is not erased Inconnu mais mesur\u00e9", () => {
  assert.equal(isUnknown('Inconnu mais mesuré'), false);
  assert.equal(normalizedValue('Inconnu mais mesuré'), 'Inconnu mais mesuré');
});

test("Observed value is not erased Measured", () => {
  assert.equal(isUnknown('Measured'), false);
  assert.equal(normalizedValue('Measured'), 'Measured');
});

test("Observed value is not erased 0", () => {
  assert.equal(isUnknown('0'), false);
  assert.equal(normalizedValue('0'), '0');
});

test("Observed value is not erased False", () => {
  assert.equal(isUnknown('False'), false);
  assert.equal(normalizedValue('False'), 'False');
});

test("Observed value is not erased unknown values", () => {
  assert.equal(isUnknown('unknown values'), false);
  assert.equal(normalizedValue('unknown values'), 'unknown values');
});

test("Observed value is not erased none reported", () => {
  assert.equal(isUnknown('none reported'), false);
  assert.equal(normalizedValue('none reported'), 'none reported');
});

test("Observed value is not erased step-free", () => {
  assert.equal(isUnknown('step-free'), false);
  assert.equal(normalizedValue('step-free'), 'step-free');
});

test("Observed value is not erased source: unknown", () => {
  assert.equal(isUnknown('source: unknown'), false);
  assert.equal(normalizedValue('source: unknown'), 'source: unknown');
});

test("Calendar accepts 2026-11-19", () => {
  assert.equal(isCalendarDate("2026-11-19"), true);
});

test("Calendar accepts 2000-02-29", () => {
  assert.equal(isCalendarDate("2000-02-29"), true);
});

test("Calendar accepts 2024-02-29", () => {
  assert.equal(isCalendarDate("2024-02-29"), true);
});

test("Calendar accepts 2026-02-28", () => {
  assert.equal(isCalendarDate("2026-02-28"), true);
});

test("Calendar accepts 1999-12-31", () => {
  assert.equal(isCalendarDate("1999-12-31"), true);
});

test("Calendar accepts 2026-01-01", () => {
  assert.equal(isCalendarDate("2026-01-01"), true);
});

test("Calendar accepts 2026-04-30", () => {
  assert.equal(isCalendarDate("2026-04-30"), true);
});

test("Calendar accepts 2026-06-30", () => {
  assert.equal(isCalendarDate("2026-06-30"), true);
});

test("Calendar accepts 2026-09-30", () => {
  assert.equal(isCalendarDate("2026-09-30"), true);
});

test("Calendar accepts 2026-11-30", () => {
  assert.equal(isCalendarDate("2026-11-30"), true);
});

test("Calendar rejects '2026-02-29'", () => {
  assert.equal(isCalendarDate('2026-02-29'), false);
});

test("Calendar rejects '1900-02-29'", () => {
  assert.equal(isCalendarDate('1900-02-29'), false);
});

test("Calendar rejects '2026-11-31'", () => {
  assert.equal(isCalendarDate('2026-11-31'), false);
});

test("Calendar rejects '2026-04-31'", () => {
  assert.equal(isCalendarDate('2026-04-31'), false);
});

test("Calendar rejects '2026-00-01'", () => {
  assert.equal(isCalendarDate('2026-00-01'), false);
});

test("Calendar rejects '2026-13-01'", () => {
  assert.equal(isCalendarDate('2026-13-01'), false);
});

test("Calendar rejects '2026-01-00'", () => {
  assert.equal(isCalendarDate('2026-01-00'), false);
});

test("Calendar rejects '0000-01-01'", () => {
  assert.equal(isCalendarDate('0000-01-01'), false);
});

test("Calendar rejects '2026/11/19'", () => {
  assert.equal(isCalendarDate('2026/11/19'), false);
});

test("Calendar rejects '2026-1-1'", () => {
  assert.equal(isCalendarDate('2026-1-1'), false);
});

test("Calendar rejects 'yesterday'", () => {
  assert.equal(isCalendarDate('yesterday'), false);
});

test("Calendar rejects ''", () => {
  assert.equal(isCalendarDate(''), false);
});

test("Path accepts local route /", () => {
  assert.equal(validRoute('/'), true);
});

test("Path accepts local route /help", () => {
  assert.equal(validRoute('/help'), true);
});

test("Path accepts local route /journey", () => {
  assert.equal(validRoute('/journey'), true);
});

test("Path accepts local route /more/diary", () => {
  assert.equal(validRoute('/more/diary'), true);
});

test("Path accepts local route /settings/language", () => {
  assert.equal(validRoute('/settings/language'), true);
});

test("Path accepts local route /places/a-b", () => {
  assert.equal(validRoute('/places/a-b'), true);
});

test("Path accepts local route /a_b", () => {
  assert.equal(validRoute('/a_b'), true);
});

test("Path accepts local route /a%20b", () => {
  assert.equal(validRoute('/a%20b'), true);
});

test("Path rejects unsafe route ''", () => {
  assert.equal(validRoute(''), false);
});

test("Path rejects unsafe route 'help'", () => {
  assert.equal(validRoute('help'), false);
});

test("Path rejects unsafe route '//host'", () => {
  assert.equal(validRoute('//host'), false);
});

test("Path rejects unsafe route '/a/../b'", () => {
  assert.equal(validRoute('/a/../b'), false);
});

test("Path rejects unsafe route '/a/./b'", () => {
  assert.equal(validRoute('/a/./b'), false);
});

test("Path rejects unsafe route '/a?b=2'", () => {
  assert.equal(validRoute('/a?b=2'), false);
});

test("Path rejects unsafe route '/a#hash'", () => {
  assert.equal(validRoute('/a#hash'), false);
});

test("Path rejects unsafe route '/a\\\\b'", () => {
  assert.equal(validRoute('/a\\b'), false);
});

test("Path rejects unsafe route '/a:b'", () => {
  assert.equal(validRoute('/a:b'), false);
});

test("Path rejects unsafe route '/a*b'", () => {
  assert.equal(validRoute('/a*b'), false);
});

test("Path rejects unsafe route '/a\\x01b'", () => {
  assert.equal(validRoute('/a\x01b'), false);
});

test("Path rejects unsafe route '/a\\x7fb'", () => {
  assert.equal(validRoute('/a\x7fb'), false);
});

test("Evidence diagnoses missing id with ", () => {
  const input = evidence({ id: '' });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-id-empty"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing label with None", () => {
  const input = evidence({ label: null });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-label-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing value with None", () => {
  const input = evidence({ value: null });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-value-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing source with None", () => {
  const input = evidence({ source: null });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-source-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing licence with None", () => {
  const input = evidence({ licence: null });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-licence-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing retrievedOn with None", () => {
  const input = evidence({ retrievedOn: null });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-date-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing tier with None", () => {
  const input = evidence({ tier: null });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-tier-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing retrievedOn with 2026-02-30", () => {
  const input = evidence({ retrievedOn: '2026-02-30' });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-date-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing source with UNKNOWN", () => {
  const input = evidence({ source: 'UNKNOWN' });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-source-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing licence with Inconnu", () => {
  const input = evidence({ licence: 'Inconnu' });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-licence-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence diagnoses missing tier with \u2014", () => {
  const input = evidence({ tier: '—' });
  assert.ok(codes(evidenceFindings([input], 1)).includes("evidence-tier-unknown"));
  assert.equal(evidenceKnown(input), false);
});

test("Evidence detects duplicate identifiers", () => {
  assert.ok(codes(evidenceFindings([evidence(), evidence()], 3)).includes("evidence-id-duplicate"));
});

test("Evidence identity includes provenance, not translated label", () => {
  assert.equal(evidenceIdentity(evidence()), evidenceIdentity(evidence({ label: "Exemple" })));
});

test("Provenance preservation diagnoses source", () => {
  const after = evidence({ source: 'Different source' });
  assert.ok(codes(provenanceChanges([evidence()], [after], 2, true)).includes("evidence-provenance-drift"));
});

test("Provenance preservation diagnoses licence", () => {
  const after = evidence({ licence: 'Another licence' });
  assert.ok(codes(provenanceChanges([evidence()], [after], 2, true)).includes("evidence-provenance-drift"));
});

test("Provenance preservation diagnoses retrievedOn", () => {
  const after = evidence({ retrievedOn: '2026-11-18' });
  assert.ok(codes(provenanceChanges([evidence()], [after], 2, true)).includes("evidence-provenance-drift"));
});

test("Provenance preservation diagnoses tier", () => {
  const after = evidence({ tier: 'X' });
  assert.ok(codes(provenanceChanges([evidence()], [after], 2, true)).includes("evidence-provenance-drift"));
});

test("Preserving evidence detects lost record", () => {
  assert.ok(codes(provenanceChanges([evidence()], [], 2, true)).includes("evidence-lost"));
});

test("Replacing evidence during search is allowed", () => {
  assert.deepEqual(provenanceChanges([evidence()], [], 2, false), []);
});

test("Translated evidence label preserves metadata", () => {
  assert.deepEqual(provenanceChanges([evidence()], [evidence({ label: "Exemple" })], 2, true), []);
});

test("Focus diagnoses visible=false", () => {
  assert.ok(codes(focusFindings(focus({ visible: false }), 1)).includes("focus-invisible"));
});

test("Focus diagnoses inInertRegion=true", () => {
  assert.ok(codes(focusFindings(focus({ inInertRegion: true }), 1)).includes("focus-inert"));
});

test("Focus diagnoses width=43", () => {
  assert.ok(codes(focusFindings(focus({ width: 43 }), 1)).includes("target-width"));
});

test("Focus diagnoses height=43", () => {
  assert.ok(codes(focusFindings(focus({ height: 43 }), 1)).includes("target-height"));
});

test("Focus diagnoses width=Number.NaN", () => {
  assert.ok(codes(focusFindings(focus({ width: Number.NaN }), 1)).includes("target-width"));
});

test("Focus diagnoses height=Infinity", () => {
  assert.ok(codes(focusFindings(focus({ height: Infinity }), 1)).includes("target-height"));
});

test("Screen diagnoses route=//host", () => {
  assert.ok(codes(screenFindings(screen({ route: '//host' }), 5)).includes("route-invalid"));
});

test("Screen diagnoses title=", () => {
  assert.ok(codes(screenFindings(screen({ title: '' }), 5)).includes("document-title-missing"));
});

test("Screen diagnoses heading=", () => {
  assert.ok(codes(screenFindings(screen({ heading: '' }), 5)).includes("heading-missing"));
});

test("Screen diagnoses mainCount=0", () => {
  assert.ok(codes(screenFindings(screen({ mainCount: 0 }), 5)).includes("main-count"));
});

test("Screen diagnoses mainCount=2", () => {
  assert.ok(codes(screenFindings(screen({ mainCount: 2 }), 5)).includes("main-count"));
});

test("Screen diagnoses scrollY=-1", () => {
  assert.ok(codes(screenFindings(screen({ scrollY: -1 }), 5)).includes("scroll-invalid"));
});

test("Screen diagnoses historyIndex=-1", () => {
  assert.ok(codes(screenFindings(screen({ historyIndex: -1 }), 5)).includes("history-invalid"));
});

test("Screen diagnoses historyIndex=1.5", () => {
  assert.ok(codes(screenFindings(screen({ historyIndex: 1.5 }), 5)).includes("history-invalid"));
});

test("Screen diagnoses actionTime=-5", () => {
  assert.ok(codes(screenFindings(screen({ actionTime: -5 }), 5)).includes("time-invalid"));
});

test("Screen diagnoses phase=loading", () => {
  assert.ok(codes(screenFindings(screen({ phase: 'loading' }), 5)).includes("loading-not-busy"));
});

test("Screen diagnoses phase=empty", () => {
  assert.ok(codes(screenFindings(screen({ phase: 'empty' }), 5)).includes("outcome-silent"));
});

test("Screen diagnoses phase=error", () => {
  assert.ok(codes(screenFindings(screen({ phase: 'error' }), 5)).includes("outcome-silent"));
});

test("Modal screen requires focus inside", () => {
  const input = screen({ modalId: "dialog", focus: focus({ insideModal: false }) });
  assert.ok(codes(screenFindings(input, 2)).includes("modal-focus-escaped"));
});

test("Modal focus contained does not fail", () => {
  const input = screen({ modalId: "dialog", focus: focus({ insideModal: true }) });
  assert.equal(codes(screenFindings(input, 2)).includes("modal-focus-escaped"), false);
});

test("Announcement record diagnoses locale", () => {
  const input = screen({ messages: [message({ locale: 'fr' })] });
  assert.ok(codes(screenFindings(input, 1)).includes("message-language"));
});

test("Announcement record diagnoses text", () => {
  const input = screen({ messages: [message({ text: '' })] });
  assert.ok(codes(screenFindings(input, 1)).includes("message-empty"));
});

test("Announcement record diagnoses emittedAt", () => {
  const input = screen({ messages: [message({ emittedAt: Number.NaN })] });
  assert.ok(codes(screenFindings(input, 1)).includes("message-time-invalid"));
});

test("Announcement timestamp diagnoses 99", () => {
  const after = screen({ messages: [message({ emittedAt: 99 })] });
  assert.ok(codes(announcementChanges(screen(), after, 2)).includes("announcement-before-action"));
});

test("Announcement timestamp diagnoses 1601", () => {
  const after = screen({ messages: [message({ emittedAt: 1601 })] });
  assert.ok(codes(announcementChanges(screen(), after, 2)).includes("announcement-delayed"));
});

test("Change in phase without message update is stale", () => {
  const before = screen({ messages: [message()] });
  const after = screen({ phase: "empty", messages: [message()] });
  assert.ok(codes(announcementChanges(before, after, 2)).includes("announcement-stale"));
});

test("Transition detects language does not switch", () => {
  const change = action({ after: screen() });
  assert.ok(codes(transitionFindings(change, 1)).includes("language-not-switched"));
});

test("Transition detects language changes route", () => {
  const change = action({ after: screen({ locale: "fr", route: "/help" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("language-lost-route"));
});

test("Transition detects language loses query", () => {
  const change = action({ before: screen({ query: "access" }), after: screen({ locale: "fr", query: "" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("language-lost-query"));
});

test("Transition detects search navigates unexpectedly", () => {
  const change = action({ kind: "search", after: screen({ route: "/help" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("unexpected-route"));
});

test("Transition detects search changes locale unexpectedly", () => {
  const change = action({ kind: "search", after: screen({ locale: "fr" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("unexpected-locale"));
});

test("Transition detects navigate wrong destination", () => {
  const change = action({ kind: "navigate", target: "/help", after: screen({ route: "/places", historyIndex: 1 }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("navigation-wrong-target"));
});

test("Transition detects navigate does not record history", () => {
  const change = action({ kind: "navigate", after: screen({ route: "/places" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("navigate-history"));
});

test("Transition detects back does not decrement history", () => {
  const change = action({ kind: "back", before: screen({ historyIndex: 2 }), after: screen({ historyIndex: 2 }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("back-history"));
});

test("Transition detects forward does not advance history", () => {
  const change = action({ kind: "forward", after: screen() });
  assert.ok(codes(transitionFindings(change, 1)).includes("forward-history"));
});

test("Transition detects disconnect is not observed", () => {
  const change = action({ kind: "disconnect", after: screen() });
  assert.ok(codes(transitionFindings(change, 1)).includes("disconnect-not-observed"));
});

test("Transition detects reconnect stays unknown", () => {
  const change = action({ kind: "reconnect", after: screen({ connection: "unknown" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("reconnect-not-observed"));
});

test("Transition detects retry without prior failure", () => {
  const change = action({ kind: "retry", after: screen() });
  assert.ok(codes(transitionFindings(change, 1)).includes("retry-unavailable"));
});

test("Transition detects clear retains query", () => {
  const change = action({ kind: "clear", after: screen({ query: "still here" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("clear-query-remains"));
});

test("Transition detects search stays idle", () => {
  const change = action({ kind: "search", after: screen({ phase: "idle" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("search-not-started"));
});

test("Transition detects open has no modal", () => {
  const change = action({ kind: "open", after: screen() });
  assert.ok(codes(transitionFindings(change, 1)).includes("open-no-modal"));
});

test("Transition detects close leaves modal open", () => {
  const change = action({ kind: "close", after: screen({ modalId: "dialog" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("close-modal-remains"));
});

test("Transition detects escape leaves modal open", () => {
  const change = action({ kind: "escape", after: screen({ modalId: "dialog" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("close-modal-remains"));
});

test("Transition detects preserve focus loses focus", () => {
  const change = action({ preserveFocus: true, after: screen({ locale: "fr", focus: focus({ id: "elsewhere" }) }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("focus-not-preserved"));
});

test("Transition detects preserve scroll loses scroll", () => {
  const change = action({ preserveScroll: true, after: screen({ locale: "fr", scrollY: 100 }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("scroll-not-preserved"));
});

test("Transition detects announced transition has no announcement", () => {
  const change = action({ announce: true });
  assert.ok(codes(transitionFindings(change, 1)).includes("action-unannounced"));
});

test("Transition detects preserving evidence loses record", () => {
  const change = action({ preserveEvidence: true, before: screen({ evidence: [evidence()] }), after: screen({ locale: "fr" }) });
  assert.ok(codes(transitionFindings(change, 1)).includes("evidence-lost"));
});

test("Valid locale transition leaves no issue", () => {
  assert.deepEqual(transitionFindings(action(), 1), []);
});

test("Valid disconnect transition leaves no issue", () => {
  assert.deepEqual(transitionFindings(action({ kind: "disconnect", after: screen({ connection: "offline" }) }), 1), []);
});

test("Valid reconnect transition leaves no issue", () => {
  assert.deepEqual(transitionFindings(action({ kind: "reconnect", after: screen({ connection: "online" }) }), 1), []);
});

test("Valid navigation increments history", () => {
  assert.deepEqual(transitionFindings(action({ kind: "navigate", target: "/help", after: screen({ route: "/help", historyIndex: 1 }) }), 1), []);
});

test("Connected journey has no findings", () => {
  const first = action();
  assert.deepEqual(journeyFindings({ initial: first.before, actions: [first] }), []);
});

test("Disconnected journey is diagnosed", () => {
  const first = action({ before: screen({ route: "/help" }) });
  assert.ok(codes(journeyFindings({ initial: screen(), actions: [first] })).includes("chain-disconnected"));
});

test("Same screen ignores focus changes", () => {
  assert.equal(sameScreen(screen(), screen({ focus: focus({ id: "another" }) })), true);
});

test("Screen identity tracks route", () => {
  assert.equal(sameScreen(screen(), screen({ route: '/help' })), false);
});

test("Screen identity tracks locale", () => {
  assert.equal(sameScreen(screen(), screen({ locale: 'fr' })), false);
});

test("Screen identity tracks connection", () => {
  assert.equal(sameScreen(screen(), screen({ connection: 'offline' })), false);
});

test("Screen identity tracks phase", () => {
  assert.equal(sameScreen(screen(), screen({ phase: 'error' })), false);
});

test("Screen identity tracks query", () => {
  assert.equal(sameScreen(screen(), screen({ query: 'abc' })), false);
});

test("Screen identity tracks historyIndex", () => {
  assert.equal(sameScreen(screen(), screen({ historyIndex: 1 })), false);
});

test("Blocking filter excludes informational findings", () => {
  assert.deepEqual(blockingFindings([issue("a", 0, "/", "x", "information"), issue("b", 0, "/", "y")]).map((x) => x.code), ["b"]);
});

test("Duplicate findings collapse", () => {
  const f = issue("same", 1, "/", "x");
  assert.deepEqual(uniqueFindings([f, f]), [f]);
});

test("Report rejects nonpositive limit", () => {
  assert.throws(() => reportFindings([], 0), RangeError);
});

test("Report truncates distinct findings", () => {
  assert.match(reportFindings([issue("a", 0, "/", "x"), issue("b", 0, "/", "y")], 1), /additional findings/);
});

test("Coverage matrix enumerates four cells per route", () => {
  assert.equal(coverageMatrix(["/", "/help"]).length, 8);
});

test("Complete route matrix passes", () => {
  const paths = ["/", "/help"];
  assert.deepEqual(coverageFindings(paths, coverageMatrix(paths)), []);
});

test("Coverage diagnoses missing matrix cell 0", () => {
  const cells = coverageMatrix(["/"]);
  cells.splice(0, 1);
  assert.ok(codes(coverageFindings(["/"], cells)).includes("coverage-missing"));
});

test("Coverage diagnoses missing matrix cell 1", () => {
  const cells = coverageMatrix(["/"]);
  cells.splice(1, 1);
  assert.ok(codes(coverageFindings(["/"], cells)).includes("coverage-missing"));
});

test("Coverage diagnoses missing matrix cell 2", () => {
  const cells = coverageMatrix(["/"]);
  cells.splice(2, 1);
  assert.ok(codes(coverageFindings(["/"], cells)).includes("coverage-missing"));
});

test("Coverage diagnoses missing matrix cell 3", () => {
  const cells = coverageMatrix(["/"]);
  cells.splice(3, 1);
  assert.ok(codes(coverageFindings(["/"], cells)).includes("coverage-missing"));
});

test("Coverage finds duplicate matrix cells", () => {
  const cells = coverageMatrix(["/"]);
  assert.ok(codes(coverageFindings(["/"], [...cells, cells[0]])).includes("coverage-duplicate"));
});

test("Coverage finds unexpected route", () => {
  const cells = coverageMatrix(["/"]);
  assert.ok(codes(coverageFindings(["/"], [...cells, { route: "/unknown", locale: "en", width: 320 }])).includes("coverage-unexpected"));
});

test("Keyboard target detects id=''", () => {
  assert.ok(codes(targetFindings(target({ id: '' }))).includes("target-id"));
});

test("Keyboard target detects label=''", () => {
  assert.ok(codes(targetFindings(target({ label: '' }))).includes("target-name"));
});

test("Keyboard target detects tabindex=-2", () => {
  assert.ok(codes(targetFindings(target({ tabindex: -2 }))).includes("target-tabindex"));
});

test("Keyboard target detects tabindex=2", () => {
  assert.ok(codes(targetFindings(target({ tabindex: 2 }))).includes("positive-tabindex"));
});

test("Keyboard target detects width=43", () => {
  assert.ok(codes(targetFindings(target({ width: 43 }))).includes("target-width-small"));
});

test("Keyboard target detects height=43", () => {
  assert.ok(codes(targetFindings(target({ height: 43 }))).includes("target-height-small"));
});

test("Keyboard target detects focusRing=false", () => {
  assert.ok(codes(targetFindings(target({ focusRing: false }))).includes("focus-indicator-missing"));
});

test("Keyboard target detects x=Number.NaN", () => {
  assert.ok(codes(targetFindings(target({ x: Number.NaN }))).includes("target-coordinate"));
});

test("Keyboard target detects y=Number.NaN", () => {
  assert.ok(codes(targetFindings(target({ y: Number.NaN }))).includes("target-coordinate"));
});

test("Ineligible visible target cannot be tabbed", () => {
  assert.equal(eligible(target({ visible: false })), false);
  assert.equal(tabbable(target({ visible: false })), false);
});

test("Ineligible disabled target cannot be tabbed", () => {
  assert.equal(eligible(target({ disabled: true })), false);
  assert.equal(tabbable(target({ disabled: true })), false);
});

test("Ineligible inert target cannot be tabbed", () => {
  assert.equal(eligible(target({ inert: true })), false);
  assert.equal(tabbable(target({ inert: true })), false);
});

test("Tabbable target requires nonnegative tab index", () => {
  assert.equal(tabbable(target({ tabindex: -1 })), false);
});

test("Tabbable target includes zero tab index", () => {
  assert.equal(tabbable(target({ tabindex: 0 })), true);
});

test("Target list rejects duplicate identifiers", () => {
  assert.ok(codes(targetListFindings([target(), target()])).includes("duplicate-target-id"));
});

test("Target list rejects missing controls", () => {
  assert.ok(codes(targetListFindings([target({ controls: ["missing"] })])).includes("controls-missing"));
});

test("Target list accepts controls when referenced", () => {
  assert.deepEqual(targetListFindings([target({ controls: ["second"] }), target({ id: "second", tabindex: -1 })]), []);
});

test("Positive tabindex sorts before natural order", () => {
  assert.deepEqual(orderedTabStops([target(), target({ id: "priority", tabindex: 1 })]).map((x) => x.id), ["priority", "first"]);
});

test("Disabled targets excluded from tab stop list", () => {
  assert.deepEqual(orderedTabStops([target(), target({ id: "disabled", disabled: true })]).map((x) => x.id), ["first"]);
});

test("Tab target first back=False wrap=True", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, 'first', false, true), 'second');
});

test("Tab target second back=False wrap=True", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, 'second', false, true), 'first');
});

test("Tab target first back=True wrap=True", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, 'first', true, true), 'second');
});

test("Tab target second back=True wrap=True", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, 'second', true, true), 'first');
});

test("Tab target first back=True wrap=False", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, 'first', true, false), null);
});

test("Tab target second back=False wrap=False", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, 'second', false, false), null);
});

test("Tab target None back=False wrap=True", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, null, false, true), 'first');
});

test("Tab target None back=True wrap=True", () => {
  const items = [target(), target({ id: "second", tabindex: 0 })];
  assert.equal(expectedTabTarget(items, null, true, true), 'second');
});

test("Arrow policy ArrowRight in horizontal", () => {
  assert.equal(arrowDirection("ArrowRight", "horizontal"), 1);
});

test("Arrow policy ArrowLeft in horizontal", () => {
  assert.equal(arrowDirection("ArrowLeft", "horizontal"), -1);
});

test("Arrow policy ArrowDown in vertical", () => {
  assert.equal(arrowDirection("ArrowDown", "vertical"), 1);
});

test("Arrow policy ArrowUp in vertical", () => {
  assert.equal(arrowDirection("ArrowUp", "vertical"), -1);
});

test("Arrow policy ArrowDown in horizontal", () => {
  assert.equal(arrowDirection("ArrowDown", "horizontal"), 0);
});

test("Arrow policy ArrowRight in vertical", () => {
  assert.equal(arrowDirection("ArrowRight", "vertical"), 0);
});

test("Arrow policy Home in horizontal", () => {
  assert.equal(arrowDirection("Home", "horizontal"), 0);
});

test("Arrow policy End in vertical", () => {
  assert.equal(arrowDirection("End", "vertical"), 0);
});

test("Arrow policy ArrowDown in both", () => {
  assert.equal(arrowDirection("ArrowDown", "both"), 1);
});

test("Arrow policy ArrowRight in both", () => {
  assert.equal(arrowDirection("ArrowRight", "both"), 1);
});

test("Composite predicts ArrowRight from first", () => {
  assert.equal(nextComposite(composite(), "ArrowRight"), "second");
});

test("Composite predicts ArrowLeft from first", () => {
  assert.equal(nextComposite(composite(), "ArrowLeft"), "second");
});

test("Composite predicts Home from first", () => {
  assert.equal(nextComposite(composite(), "Home"), "first");
});

test("Composite predicts End from first", () => {
  assert.equal(nextComposite(composite(), "End"), "second");
});

test("Composite predicts ArrowDown from first", () => {
  assert.equal(nextComposite(composite(), "ArrowDown"), "first");
});

test("Composite predicts ArrowUp from first", () => {
  assert.equal(nextComposite(composite(), "ArrowUp"), "first");
});

test("Composite excludes disabled choices", () => {
  const c = composite({ children: [target(), target({ id: "second", disabled: true, tabindex: -1 })] });
  assert.equal(nextComposite(c, "ArrowRight"), "first");
});

test("Composite without eligible children has no destination", () => {
  const c = composite({ children: [target({ disabled: true })] });
  assert.equal(nextComposite(c, "ArrowRight"), null);
});

test("Composite invariant composite-id { id: \"\" }", () => {
  const c = composite({ id: "" });
  assert.ok(codes(compositeFindings(c)).includes("composite-id"));
});

test("Composite invariant composite-empty { children: [] }", () => {
  const c = composite({ children: [] });
  assert.ok(codes(compositeFindings(c)).includes("composite-empty"));
});

test("Composite invariant composite-duplicate-child { children: [target(), target({ id: \"first\" })] }", () => {
  const c = composite({ children: [target(), target({ id: "first" })] });
  assert.ok(codes(compositeFindings(c)).includes("composite-duplicate-child"));
});

test("Composite invariant composite-current-missing { current: \"absent\" }", () => {
  const c = composite({ current: "absent" });
  assert.ok(codes(compositeFindings(c)).includes("composite-current-missing"));
});

test("Composite invariant composite-roving-count { children: [target({ tabindex: -1 }), target({ id: \"second\", tabindex: -1 })] }", () => {
  const c = composite({ children: [target({ tabindex: -1 }), target({ id: "second", tabindex: -1 })] });
  assert.ok(codes(compositeFindings(c)).includes("composite-roving-count"));
});

test("Composite invariant composite-roving-current { children: [target({ tabindex: -1 }), target({ id: \"second\", tabindex: 0, selected: false })] }", () => {
  const c = composite({ children: [target({ tabindex: -1 }), target({ id: "second", tabindex: 0, selected: false })] });
  assert.ok(codes(compositeFindings(c)).includes("composite-roving-current"));
});

test("Composite invariant tabs-selection-count { children: [target({ selected: false }), target({ id: \"second\", tabindex: -1, selected: false })] }", () => {
  const c = composite({ children: [target({ selected: false }), target({ id: "second", tabindex: -1, selected: false })] });
  assert.ok(codes(compositeFindings(c)).includes("tabs-selection-count"));
});

test("Composite invariant composite-roving-current { current: \"second\", children: [target(), target({ id: \"second\", tabindex: -1, selected: false })] }", () => {
  const c = composite({ current: "second", children: [target(), target({ id: "second", tabindex: -1, selected: false })] });
  assert.ok(codes(compositeFindings(c)).includes("composite-roving-current"));
});

test("Composite stroke diagnoses composite-wrong-focus", () => {
  assert.ok(codes(compositeStrokeFindings(composite(), stroke({ after: "first" }))).includes("composite-wrong-focus"));
});

test("Composite stroke diagnoses composite-default-not-prevented", () => {
  assert.ok(codes(compositeStrokeFindings(composite(), stroke({ prevented: false }))).includes("composite-default-not-prevented"));
});

test("Composite stroke diagnoses composite-scrolled", () => {
  assert.ok(codes(compositeStrokeFindings(composite(), stroke({ scrollAfter: 10 }))).includes("composite-scrolled"));
});

test("Composite stroke diagnoses stroke-time-invalid", () => {
  assert.ok(codes(compositeStrokeFindings(composite(), stroke({ at: Number.NaN }))).includes("stroke-time-invalid"));
});

test("Cross-axis arrow must not change focus", () => {
  assert.ok(codes(compositeStrokeFindings(composite(), stroke({ key: "ArrowDown" }))).includes("composite-cross-axis"));
});

test("Valid composite arrow produces no findings", () => {
  assert.deepEqual(compositeStrokeFindings(composite(), stroke()), []);
});

test("Linear keyboard path diagnoses tab-order", () => {
  const stops = [target(), target({ id: "second", tabindex: 0 })];
  assert.ok(codes(linearStrokeFindings(stops, stroke({ after: "first", key: "Tab" }))).includes("tab-order"));
});

test("Linear keyboard path diagnoses tab-prevented", () => {
  const stops = [target(), target({ id: "second", tabindex: 0 })];
  assert.ok(codes(linearStrokeFindings(stops, stroke({ prevented: true, key: "Tab" }))).includes("tab-prevented"));
});

test("Dialog invariant diagnoses dialog-empty", () => {
  assert.ok(codes(dialogFindings(dialog({ descendants: [] }))).includes("dialog-empty"));
});

test("Dialog invariant diagnoses dialog-focus-outside", () => {
  assert.ok(codes(dialogFindings(dialog({ activeId: "outside" }))).includes("dialog-focus-outside"));
});

test("Dialog invariant diagnoses dialog-background-active", () => {
  assert.ok(codes(dialogFindings(dialog({ backgroundFocusables: ["outside"] }))).includes("dialog-background-active"));
});

test("Dialog invariant diagnoses dialog-trigger-missing", () => {
  assert.ok(codes(dialogFindings(dialog({ triggerId: "" }))).includes("dialog-trigger-missing"));
});

test("Closed dialog does not enforce modal constraints", () => {
  assert.deepEqual(dialogFindings(dialog({ open: false, descendants: [] })), []);
});

test("Escape closes and restores dialog focus", () => {
  assert.deepEqual(dialogEscapeFindings(dialog(), dialog({ open: false }), stroke({ key: "Escape", after: "open" })), []);
});

test("Escape detects dialog remaining open", () => {
  assert.ok(codes(dialogEscapeFindings(dialog(), dialog(), stroke({ key: "Escape", after: "open" }))).includes("escape-not-closed"));
});

test("Escape detects lost trigger focus", () => {
  assert.ok(codes(dialogEscapeFindings(dialog(), dialog({ open: false }), stroke({ key: "Escape", after: "outside" }))).includes("escape-focus-not-returned"));
});

test("Keyboard report rejects bad maximum", () => {
  assert.throws(() => keyboardSummary([], 0), RangeError);
});

test("Keyboard summary truncates unique rows", () => {
  const findings = [{ code: "a", target: "x", description: "first" }, { code: "b", target: "x", description: "second" }];
  assert.match(keyboardSummary(findings, 1), /additional findings/);
});

test("Copy dictionary exposes en loading", () => {
  assert.ok(copy("en", "loading").trim().length > 0);
  assert.equal(copy("en", "loading"), COPY.en.loading);
});

test("Copy dictionary exposes en ready", () => {
  assert.ok(copy("en", "ready").trim().length > 0);
  assert.equal(copy("en", "ready"), COPY.en.ready);
});

test("Copy dictionary exposes en empty", () => {
  assert.ok(copy("en", "empty").trim().length > 0);
  assert.equal(copy("en", "empty"), COPY.en.empty);
});

test("Copy dictionary exposes en error", () => {
  assert.ok(copy("en", "error").trim().length > 0);
  assert.equal(copy("en", "error"), COPY.en.error);
});

test("Copy dictionary exposes en offline", () => {
  assert.ok(copy("en", "offline").trim().length > 0);
  assert.equal(copy("en", "offline"), COPY.en.offline);
});

test("Copy dictionary exposes en unknown", () => {
  assert.ok(copy("en", "unknown").trim().length > 0);
  assert.equal(copy("en", "unknown"), COPY.en.unknown);
});

test("Copy dictionary exposes en retry", () => {
  assert.ok(copy("en", "retry").trim().length > 0);
  assert.equal(copy("en", "retry"), COPY.en.retry);
});

test("Copy dictionary exposes en clear", () => {
  assert.ok(copy("en", "clear").trim().length > 0);
  assert.equal(copy("en", "clear"), COPY.en.clear);
});

test("Copy dictionary exposes en back", () => {
  assert.ok(copy("en", "back").trim().length > 0);
  assert.equal(copy("en", "back"), COPY.en.back);
});

test("Copy dictionary exposes en close", () => {
  assert.ok(copy("en", "close").trim().length > 0);
  assert.equal(copy("en", "close"), COPY.en.close);
});

test("Copy dictionary exposes en search", () => {
  assert.ok(copy("en", "search").trim().length > 0);
  assert.equal(copy("en", "search"), COPY.en.search);
});

test("Copy dictionary exposes en details", () => {
  assert.ok(copy("en", "details").trim().length > 0);
  assert.equal(copy("en", "details"), COPY.en.details);
});

test("Copy dictionary exposes en source", () => {
  assert.ok(copy("en", "source").trim().length > 0);
  assert.equal(copy("en", "source"), COPY.en.source);
});

test("Copy dictionary exposes en licence", () => {
  assert.ok(copy("en", "licence").trim().length > 0);
  assert.equal(copy("en", "licence"), COPY.en.licence);
});

test("Copy dictionary exposes en retrievedOn", () => {
  assert.ok(copy("en", "retrievedOn").trim().length > 0);
  assert.equal(copy("en", "retrievedOn"), COPY.en.retrievedOn);
});

test("Copy dictionary exposes en tier", () => {
  assert.ok(copy("en", "tier").trim().length > 0);
  assert.equal(copy("en", "tier"), COPY.en.tier);
});

test("Copy dictionary exposes fr loading", () => {
  assert.ok(copy("fr", "loading").trim().length > 0);
  assert.equal(copy("fr", "loading"), COPY.fr.loading);
});

test("Copy dictionary exposes fr ready", () => {
  assert.ok(copy("fr", "ready").trim().length > 0);
  assert.equal(copy("fr", "ready"), COPY.fr.ready);
});

test("Copy dictionary exposes fr empty", () => {
  assert.ok(copy("fr", "empty").trim().length > 0);
  assert.equal(copy("fr", "empty"), COPY.fr.empty);
});

test("Copy dictionary exposes fr error", () => {
  assert.ok(copy("fr", "error").trim().length > 0);
  assert.equal(copy("fr", "error"), COPY.fr.error);
});

test("Copy dictionary exposes fr offline", () => {
  assert.ok(copy("fr", "offline").trim().length > 0);
  assert.equal(copy("fr", "offline"), COPY.fr.offline);
});

test("Copy dictionary exposes fr unknown", () => {
  assert.ok(copy("fr", "unknown").trim().length > 0);
  assert.equal(copy("fr", "unknown"), COPY.fr.unknown);
});

test("Copy dictionary exposes fr retry", () => {
  assert.ok(copy("fr", "retry").trim().length > 0);
  assert.equal(copy("fr", "retry"), COPY.fr.retry);
});

test("Copy dictionary exposes fr clear", () => {
  assert.ok(copy("fr", "clear").trim().length > 0);
  assert.equal(copy("fr", "clear"), COPY.fr.clear);
});

test("Copy dictionary exposes fr back", () => {
  assert.ok(copy("fr", "back").trim().length > 0);
  assert.equal(copy("fr", "back"), COPY.fr.back);
});

test("Copy dictionary exposes fr close", () => {
  assert.ok(copy("fr", "close").trim().length > 0);
  assert.equal(copy("fr", "close"), COPY.fr.close);
});

test("Copy dictionary exposes fr search", () => {
  assert.ok(copy("fr", "search").trim().length > 0);
  assert.equal(copy("fr", "search"), COPY.fr.search);
});

test("Copy dictionary exposes fr details", () => {
  assert.ok(copy("fr", "details").trim().length > 0);
  assert.equal(copy("fr", "details"), COPY.fr.details);
});

test("Copy dictionary exposes fr source", () => {
  assert.ok(copy("fr", "source").trim().length > 0);
  assert.equal(copy("fr", "source"), COPY.fr.source);
});

test("Copy dictionary exposes fr licence", () => {
  assert.ok(copy("fr", "licence").trim().length > 0);
  assert.equal(copy("fr", "licence"), COPY.fr.licence);
});

test("Copy dictionary exposes fr retrievedOn", () => {
  assert.ok(copy("fr", "retrievedOn").trim().length > 0);
  assert.equal(copy("fr", "retrievedOn"), COPY.fr.retrievedOn);
});

test("Copy dictionary exposes fr tier", () => {
  assert.ok(copy("fr", "tier").trim().length > 0);
  assert.equal(copy("fr", "tier"), COPY.fr.tier);
});

test("Document language normalizes None", () => {
  assert.equal(documentLanguage(null), null);
});

test("Document language normalizes ", () => {
  assert.equal(documentLanguage(''), null);
});

test("Document language normalizes fr", () => {
  assert.equal(documentLanguage('fr'), 'fr');
});

test("Document language normalizes fr-CA", () => {
  assert.equal(documentLanguage('fr-CA'), 'fr');
});

test("Document language normalizes fr-FR", () => {
  assert.equal(documentLanguage('fr-FR'), 'fr');
});

test("Document language normalizes en", () => {
  assert.equal(documentLanguage('en'), 'en');
});

test("Document language normalizes en-US", () => {
  assert.equal(documentLanguage('en-US'), 'en');
});

test("Document language normalizes en-CA", () => {
  assert.equal(documentLanguage('en-CA'), 'en');
});

test("Document language normalizes de", () => {
  assert.equal(documentLanguage('de'), null);
});

test("Document language normalizes und", () => {
  assert.equal(documentLanguage('und'), null);
});

test("Document language normalizes fran\u00e7ais", () => {
  assert.equal(documentLanguage('français'), null);
});

test("French punctuation diagnoses \"l'accessibilit\u00e9\"", () => {
  assert.ok(codes(frenchTypographyFindings("l'accessibilité")).includes("fr-straight-apostrophe"));
});

test("French punctuation diagnoses 'Important:'", () => {
  assert.ok(codes(frenchTypographyFindings('Important:')).includes("fr-colon-space"));
});

test("French punctuation diagnoses 'Important :'", () => {
  assert.ok(codes(frenchTypographyFindings('Important :')).includes("fr-colon-space-kind"));
});

test("French punctuation diagnoses 'Attention!'", () => {
  assert.ok(codes(frenchTypographyFindings('Attention!')).includes("fr-thin-space"));
});

test("French punctuation diagnoses 'Vraiment?'", () => {
  assert.ok(codes(frenchTypographyFindings('Vraiment?')).includes("fr-thin-space"));
});

test("French punctuation diagnoses 'Oui;'", () => {
  assert.ok(codes(frenchTypographyFindings('Oui;')).includes("fr-thin-space"));
});

test("French punctuation diagnoses '\u00abBonjour'", () => {
  assert.ok(codes(frenchTypographyFindings('«Bonjour')).includes("fr-opening-guillemet"));
});

test("French punctuation diagnoses 'Bonjour\u00bb'", () => {
  assert.ok(codes(frenchTypographyFindings('Bonjour»')).includes("fr-closing-guillemet"));
});

test("French punctuation accepts 'D\u00e9tails d\u2019une page'", () => {
  assert.deepEqual(frenchTypographyFindings('Détails d’une page'), []);
});

test("French punctuation accepts 'Attention\\u202f!'", () => {
  assert.deepEqual(frenchTypographyFindings('Attention\u202f!'), []);
});

test("French punctuation accepts 'Vraiment\\u202f?'", () => {
  assert.deepEqual(frenchTypographyFindings('Vraiment\u202f?'), []);
});

test("French punctuation accepts 'Note\\xa0: oui'", () => {
  assert.deepEqual(frenchTypographyFindings('Note\xa0: oui'), []);
});

test("French punctuation accepts '\u00ab\\u202fBonjour\\u202f\u00bb'", () => {
  assert.deepEqual(frenchTypographyFindings('«\u202fBonjour\u202f»'), []);
});

test("French punctuation accepts 'Une recherche sans r\u00e9sultat.'", () => {
  assert.deepEqual(frenchTypographyFindings('Une recherche sans résultat.'), []);
});

test("Copy disallows unsupported wording verified", () => {
  assert.equal(forbiddenClaims("This is verified.").length, 1);
});

test("Copy disallows unsupported wording real-time", () => {
  assert.equal(forbiddenClaims("This is real-time.").length, 1);
});

test("Copy disallows unsupported wording partnership", () => {
  assert.equal(forbiddenClaims("This is partnership.").length, 1);
});

test("Copy disallows unsupported wording guarantee", () => {
  assert.equal(forbiddenClaims("This is guarantee.").length, 1);
});

test("Known source missing is reported", () => {
  assert.ok(codes(statusCopyFindings(makeStatusRecord("fr", "source"))).includes("source-unavailable"));
});

test("Known licence missing is reported", () => {
  assert.ok(codes(statusCopyFindings(makeStatusRecord("en", "licence"))).includes("licence-unavailable"));
});

test("Known date missing is reported", () => {
  assert.ok(codes(statusCopyFindings(makeStatusRecord("fr", "retrievedOn"))).includes("retrieval-date-unavailable"));
});

test("Known tier missing is reported", () => {
  assert.ok(codes(statusCopyFindings(makeStatusRecord("en", "tier"))).includes("tier-unavailable"));
});

test("UNKNOWN locale text stays explicit", () => {
  assert.deepEqual(statusCopyFindings(makeStatusRecord("fr", "unknown")), []);
});

test("Missing value never becomes a positive claim", () => {
  assert.equal(observedOrUnknown(null), "UNKNOWN");
});

test("Translation pairs reject duplicate keys", () => {
  const pair = { key: "retry", en: "Retry", fr: "Réessayer", required: true };
  assert.ok(codes(translationPairFindings([pair, pair])).includes("translation-key-duplicate"));
});

test("Translation pairs reject blank English copy", () => {
  assert.ok(codes(translationPairFindings([{ key: "retry", en: "", fr: "Réessayer", required: true }])).includes("translation-en-empty"));
});

test("Translation pairs reject blank French copy", () => {
  assert.ok(codes(translationPairFindings([{ key: "retry", en: "Retry", fr: "", required: true }])).includes("translation-fr-empty"));
});

test("Identical translations receive review finding", () => {
  assert.ok(codes(translationPairFindings([{ key: "test", en: "Test", fr: "Test", required: true }])).includes("translation-identical"));
});

test("Supported bilingual pair has no issues", () => {
  assert.deepEqual(translationPairFindings([{ key: "retry", en: "Try again", fr: "Réessayer", required: true }]), []);
});

test("Status outcome maps to selected language", () => {
  assert.equal(copyForOutcome("fr", "offline"), COPY.fr.offline);
});

test("Exact translated outcome can be matched", () => {
  assert.equal(messageMatchesOutcome("en", "empty", COPY.en.empty), true);
});

test("Wrong-language outcome fails matching", () => {
  assert.equal(messageMatchesOutcome("fr", "empty", COPY.en.empty), false);
});

test("Copy report rejects nonpositive maximum", () => {
  assert.throws(() => copyReport([], 0), RangeError);
});

test("Copy report truncates distinct findings", () => {
  const rows = [{ code: "a", field: "x", detail: "one" }, { code: "b", field: "x", detail: "two" }];
  assert.match(copyReport(rows, 1), /additional findings/);
});

