import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIVE_POLITENESS, LIVE_ATOMIC, LIVE_RELEVANT, EVENT_TYPES, CHANNELS,
  announcementRegion, auditLiveRegions, auditAnnouncementEvents,
  auditAnnouncementTransition, auditStatusMessage, auditBilingualMessages,
  auditProgressState, auditErrorSummary, auditLanguageChange,
  auditOfflineAnnouncement, announcementSummary,
} from "./announcements.mjs";

const codes = (entries) => entries.map((item) => item.code);
const has = (entries, code) => assert.ok(codes(entries).includes(code), `Missing ${code}: ${JSON.stringify(codes(entries))}`);
const region = (changes = {}) => ({ id: "status", role: "status", live: "polite", atomic: "false", relevant: "additions text", hidden: false, busy: false, text: "Ready", lang: "en", ...changes });
const event = (changes = {}) => ({ type: "update", sequence: 1, regionId: "status", text: "Loading", live: "polite", language: "en", ...changes });
const before = () => ({ id: "status", text: "Loading", busy: true, live: "polite", language: "en" });
const after = (changes = {}) => ({ id: "status", text: "Complete", busy: false, live: "polite", language: "en", expectedChange: true, expectedComplete: true, localized: true, ...changes });
const message = (changes = {}) => ({ key: "saved", language: "en", text: "Saved", channel: "status", status: "SUPPORTED", confidence: "PRIMARY", claimedComplete: false, ...changes });
const progress = (changes = {}) => ({ min: 0, max: 100, value: 50, complete: false, indeterminate: false, label: "Download", live: true, announceCompletion: false, ...changes });
const errors = (changes = {}) => ({ summaryId: "error-summary", live: true, focusedSummary: true, errors: [{ fieldId: "email", message: "Required", describedBy: true, invalid: true }], ...changes });
const languageChange = (changes = {}) => ({ before: "en", after: "fr", expectedSwitch: true, documentLanguage: "fr", announcedLanguage: "fr", announcementExpected: true, focusPreserved: true, controlsNamed: true, sampleCopy: "«\u202FEntrée accessible\u202F»", ...changes });
const offline = (changes = {}) => ({ language: "en", cache: "PRESENT", claim: "READY", statusRegion: true, keyboardReachable: true, retryAvailable: false, retryNamed: true, downloadStarted: false, progressNamed: true, downloadFailed: false, failureAnnounced: true, sourceTier: "PRIMARY", contentDate: "2026-11-19", ...changes });

test("politeness supports polite, assertive, and off", () => assert.deepEqual(LIVE_POLITENESS, ["off", "polite", "assertive"]));
test("atomic vocabulary is finite", () => assert.deepEqual(LIVE_ATOMIC, ["true", "false"]));
test("relevant vocabulary includes text", () => assert.ok(LIVE_RELEVANT.includes("text")));
test("events include focus restoration", () => assert.ok(EVENT_TYPES.includes("restore")));
test("channels include status and alert", () => assert.ok(CHANNELS.includes("status") && CHANNELS.includes("alert")));
test("clean region is accepted", () => assert.deepEqual(auditLiveRegions([region()]), []));
test("region normalisation keeps explicit ID", () => assert.equal(announcementRegion(region()).id, "status"));
test("invalid announcement region becomes null", () => assert.equal(announcementRegion(null), null));
test("region without ID becomes null", () => assert.equal(announcementRegion(region({ id: "" })), null));
test("region without role becomes null", () => assert.equal(announcementRegion(region({ role: "unknown" })), null));
test("region without politeness becomes null", () => assert.equal(announcementRegion(region({ live: "soon" })), null));
test("live regions require array", () => has(auditLiveRegions(null), "live.regions-array"));
const liveDefects = [
  ["invalid", [null], "live.invalid-region"],
  ["duplicate", [region(), region()], "live.duplicate-region"],
  ["hidden", [region({ hidden: true })], "live.hidden-region"],
  ["silent status", [region({ live: "off" })], "live.silent-status"],
  ["soft alert", [region({ role: "alert", live: "polite" })], "live.alert-politeness"],
  ["noisy progress", [region({ role: "progressbar", live: "assertive" })], "live.noisy-progress"],
  ["atomic", [region({ atomic: "maybe" })], "live.atomic"],
  ["relevant", [region({ relevant: "things" })], "live.relevant"],
  ["language", [region({ lang: "es" })], "live.language"],
  ["overlong", [region({ text: "A".repeat(1201) })], "live.overlong"],
  ["stuck busy", [region({ busy: true, text: "" })], "live.stuck-busy"],
];
for (const [name, regions, code] of liveDefects) {
  test(`live region ${name} reports ${code}`, () => has(auditLiveRegions(regions), code));
}
test("clean live-region event passes", () => assert.deepEqual(auditAnnouncementEvents([event()], { regionIds: ["status"] }), []));
test("announcement events require array", () => has(auditAnnouncementEvents(null), "announcements.array"));
const eventDefects = [
  ["invalid record", [null], "announcements.object"],
  ["wrong type", [event({ type: "unsupported" })], "announcements.event-type"],
  ["negative sequence", [event({ sequence: -1 })], "announcements.sequence"],
  ["duplicate sequence", [event(), event({ sequence: 1 })], "announcements.out-of-order"],
  ["missing region", [event({ regionId: "" })], "announcements.region-id"],
  ["unknown region", [event({ regionId: "missing" })], "announcements.missing-region"],
  ["empty update", [event({ text: "" })], "announcements.empty-update"],
  ["silent update", [event({ live: "off" })], "announcements.silent-update"],
  ["lost focus ID", [event({ type: "focus", focusTarget: null })], "announcements.focus-id"],
  ["error urgency", [event({ type: "error" })], "announcements.error-urgency"],
  ["external route", [event({ type: "navigate", external: true })], "announcements.external-navigation"],
  ["unsupported locale", [event({ language: "es" })], "announcements.language"],
];
for (const [name, events, code] of eventDefects) {
  test(`event ${name} reports ${code}`, () => has(auditAnnouncementEvents(events, { regionIds: ["status"] }), code));
}
test("clean announcement transition passes", () => assert.deepEqual(auditAnnouncementTransition(before(), after()), []));
const transitionDefects = [
  ["replaced ID", { id: "replacement" }, "transition.replaced-region"],
  ["hidden", { hidden: true }, "transition.hidden"],
  ["unchanged text", { text: "Loading" }, "transition.no-change"],
  ["still busy", { busy: true }, "transition.still-busy"],
  ["changed live", { live: "off" }, "transition.live-mode-changed"],
  ["unlocalized", { language: "fr", localized: false }, "transition.unlocalized"],
  ["empty update", { text: "" }, "transition.empty"],
  ["silent", { live: "off" }, "transition.not-announced"],
];
for (const [name, changes, code] of transitionDefects) {
  test(`transition ${name} reports ${code}`, () => has(auditAnnouncementTransition(before(), after(changes)), code));
}
test("transition requires objects", () => has(auditAnnouncementTransition(null, after()), "transition.object"));
test("complete English status message passes", () => assert.deepEqual(auditStatusMessage(message()), []));
test("complete French status message passes", () => assert.deepEqual(auditStatusMessage(message({ language: "fr", text: "«\u202FEnregistré\u202F»" })), []));
const messageDefects = [
  ["object", null, "message.object"],
  ["language", message({ language: "es" }), "message.language"],
  ["channel", message({ channel: "none" }), "message.channel"],
  ["copy", message({ text: "" }), "message.copy"],
  ["apostrophe", message({ language: "fr", text: "l'entrée" }), "fr.apostrophe"],
  ["colon", message({ language: "fr", text: "Note: texte" }), "fr.colon-space"],
  ["exclamation", message({ language: "fr", text: "Attention !" }), "fr.narrow-space"],
  ["unknown upgraded", message({ status: "UNKNOWN", confidence: "PRIMARY" }), "message.unknown-upgraded"],
  ["false completion", message({ status: "UNKNOWN", claimedComplete: true }), "message.false-completion"],
  ["generic error", message({ status: "error", channel: "generic" }), "message.error-channel"],
  ["progress range", message({ kind: "progress", value: 101 }), "message.progress-range"],
  ["count range", message({ kind: "count", value: -1 }), "message.count-range"],
];
for (const [name, input, code] of messageDefects) {
  test(`status message ${name} reports ${code}`, () => has(auditStatusMessage(input), code));
}
test("valid bilingual message pair passes", () => assert.deepEqual(auditBilingualMessages([message(), message({ language: "fr", text: "Enregistré" })]), []));
test("missing French message is detected", () => has(auditBilingualMessages([message()]), "messages.missing-translation"));
test("duplicate language is detected", () => has(auditBilingualMessages([message(), message()]), "messages.duplicate-language"));
test("messages require array", () => has(auditBilingualMessages(null), "messages.array"));
test("clean progress indicator passes", () => assert.deepEqual(auditProgressState(progress()), []));
const progressDefects = [
  ["object", null, "progress.object"],
  ["inverted range", progress({ min: 10, max: 0 }), "progress.invalid-range"],
  ["invalid value", progress({ value: NaN }), "progress.invalid-value"],
  ["out of range", progress({ value: 101 }), "progress.out-of-range"],
  ["complete without value", progress({ value: null, complete: true }), "progress.completion-without-value"],
  ["premature completion", progress({ complete: true }), "progress.premature-completion"],
  ["indeterminate with value", progress({ indeterminate: true }), "progress.indeterminate-value"],
  ["missing label", progress({ label: "" }), "progress.no-name"],
  ["silent completion", progress({ value: 100, complete: true, live: false, announceCompletion: true }), "progress.silent-completion"],
];
for (const [name, input, code] of progressDefects) {
  test(`progress ${name} reports ${code}`, () => has(auditProgressState(input), code));
}
test("clean error summary passes", () => assert.deepEqual(auditErrorSummary(errors()), []));
const errorDefects = [
  ["object", null, "errors.object"],
  ["error array", { errors: "bad" }, "errors.array"],
  ["no summary", errors({ summaryId: "" }), "errors.missing-summary"],
  ["silent", errors({ live: false }), "errors.silent"],
  ["not focused", errors({ focusedSummary: false }), "errors.focus"],
  ["invalid field", errors({ errors: [null] }), "errors.field-id"],
  ["duplicate field", errors({ errors: [...errors().errors, ...errors().errors] }), "errors.duplicate-field"],
  ["unnamed", errors({ errors: [{ ...errors().errors[0], message: "" }] }), "errors.unnamed"],
  ["unlinked", errors({ errors: [{ ...errors().errors[0], describedBy: false }] }), "errors.unlinked"],
  ["missing invalid state", errors({ errors: [{ ...errors().errors[0], invalid: false }] }), "errors.invalid-state"],
];
for (const [name, input, code] of errorDefects) {
  test(`error summary ${name} reports ${code}`, () => has(auditErrorSummary(input), code));
}
test("valid language change passes", () => assert.deepEqual(auditLanguageChange(languageChange()), []));
const languageDefects = [
  ["object", null, "language.object"],
  ["unsupported", languageChange({ after: "es" }), "language.unsupported"],
  ["no switch", languageChange({ after: "en" }), "language.no-switch"],
  ["document mismatch", languageChange({ documentLanguage: "en" }), "language.document-mismatch"],
  ["announcement mismatch", languageChange({ announcedLanguage: "en" }), "language.announcement-mismatch"],
  ["focus lost", languageChange({ focusPreserved: false }), "language.focus-lost"],
  ["unnamed control", languageChange({ controlsNamed: false }), "language.controls-unnamed"],
  ["French punctuation", languageChange({ sampleCopy: "Note: texte" }), "fr.colon-space"],
];
for (const [name, input, code] of languageDefects) {
  test(`language change ${name} reports ${code}`, () => has(auditLanguageChange(input), code));
}
test("valid offline announcement passes", () => assert.deepEqual(auditOfflineAnnouncement(offline()), []));
const offlineDefects = [
  ["object", null, "offline.object"],
  ["language", offline({ language: "es" }), "offline.language"],
  ["invalid cache", offline({ cache: "maybe" }), "offline.cache"],
  ["uncertain cache", offline({ cache: "UNKNOWN" }), "offline.unknown-upgraded"],
  ["absent cache", offline({ cache: "ABSENT" }), "offline.absent-ready"],
  ["missing region", offline({ statusRegion: false }), "offline.status-region"],
  ["unreachable", offline({ keyboardReachable: false }), "offline.keyboard"],
  ["unnamed retry", offline({ retryAvailable: true, retryNamed: false }), "offline.retry-name"],
  ["unnamed progress", offline({ downloadStarted: true, progressNamed: false }), "offline.progress-name"],
  ["silent failure", offline({ downloadFailed: true, failureAnnounced: false }), "offline.failure-announcement"],
  ["bad date", offline({ contentDate: "bad" }), "offline.content-date"],
  ["uncertain tier", offline({ sourceTier: "UNKNOWN" }), "offline.unknown-tier-ready"],
];
for (const [name, input, code] of offlineDefects) {
  test(`offline announcement ${name} reports ${code}`, () => has(auditOfflineAnnouncement(input), code));
}
test("unknown offline status is not falsely marked as ready", () => assert.deepEqual(auditOfflineAnnouncement(offline({ cache: "UNKNOWN", claim: "UNKNOWN", sourceTier: "UNKNOWN" })), []));
test("announcement summary counts categories", () => assert.deepEqual(announcementSummary([{ code: "a", severity: "error" }, { code: "b", severity: "review" }]), { error: 1, review: 1, codes: [["a", 1], ["b", 1]] }));
test("event audit does not mutate observations", () => { const events = [event()]; const original = JSON.parse(JSON.stringify(events)); auditAnnouncementEvents(events); assert.deepEqual(events, original); });
